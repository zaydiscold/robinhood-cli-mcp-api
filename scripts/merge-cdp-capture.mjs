import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSanitizedCapture,
  canonicalOperationKey,
  capturePolicy,
  mergeSchemas,
  normalizePath,
} from "./lib/cdp-capture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const captureArg = process.argv[2];
if (!captureArg) {
  console.error("usage: pnpm merge:cdp <path-to-sanitized-cdp-capture.json>");
  process.exit(1);
}
const capturePath = resolve(captureArg);
const captureDate =
  capturePath.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10);
const routesPath = process.env.ROBINHOOD_ROUTES_PATH
  ? resolve(process.env.ROBINHOOD_ROUTES_PATH)
  : resolve(root, "api-map/brokerage-routes.json");
const browserRoutesPath = process.env.ROBINHOOD_BROWSER_ROUTES_PATH
  ? resolve(process.env.ROBINHOOD_BROWSER_ROUTES_PATH)
  : resolve(root, `api-map/browser-cdp-routes-${captureDate}.json`);

const capture = assertSanitizedCapture(JSON.parse(await readFile(capturePath, "utf8")));
let existingRoutes = JSON.parse(await readFile(routesPath, "utf8"));

function routeUrl(origin, pathname, queryKeys = []) {
  const base = `${origin}${normalizePath(pathname)}`;
  const query = [...new Set(queryKeys)]
    .sort()
    .map((key) => {
      const token = String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
      return `${encodeURIComponent(key)}={${token}}`;
    })
    .join("&");
  return query ? `${base}?${query}` : base;
}

function categoriesFor(pathname) {
  const categories = new Set();
  if (
    /\/(accounts?|ceres|portfolios|positions|margin|user|inbox|pathfinder|wonka|devices|questionnaire|social|subscription)\b/.test(
      pathname,
    )
  )
    categories.add("account");
  if (/\/(ach|wire|asset_transfers|acats|banking|crypto-transfers)\b/.test(pathname))
    categories.add("money-movement");
  if (
    /\/(orders?|combo\/orders|equity_trading|recurring_schedules|recurring_tradability|wormhole)\b/.test(
      pathname,
    )
  )
    categories.add("orders");
  if (/\/(options|options-product)\b/.test(pathname)) categories.add("options");
  if (/\/(futures|arsenal)\b/.test(pathname)) categories.add("futures");
  if (/\/(documents|dividends|cash_journal|corp_actions|pluto|yoda)\b/.test(pathname))
    categories.add("history-documents");
  if (
    /\/(marketdata|markets|instruments|quotes|fundamentals|ratings|hedgefunds|insiders|forex|beacon|indexes)\b/.test(
      pathname,
    )
  )
    categories.add("marketdata");
  if (/\/discovery\/lists\b/.test(pathname)) categories.add("watchlists");
  if (/\/(goku|kaizen|hippo|observability|elegibility|eligibility)\b/.test(pathname))
    categories.add("telemetry-config");
  if (/\/(midlands\/notification|app-comms)\b/.test(pathname)) categories.add("notifications");
  if (/\/(identi|identity|mfa|security)\b/.test(pathname)) categories.add("security");
  if (categories.size === 0) categories.add("unknown");
  return [...categories].sort();
}

function riskFor(entry, categories) {
  const pathname = entry.url.path;
  const methods = new Set(entry.methods);
  if ([...methods].some((method) => method !== "GET")) {
    if (/\/(cancel|unlink|delete|disable|deactivate)\b/.test(pathname)) return "destructive";
    if (
      /^\/(goku|kaizen|hippo|observability)\//.test(pathname) ||
      /^\/app-comms\/receipt\/seen\//.test(pathname)
    )
      return "write-safe";
    return "write-mutate";
  }
  if (
    categories.includes("marketdata") &&
    !categories.includes("account") &&
    !categories.includes("orders") &&
    !categories.includes("watchlists")
  ) {
    return "read";
  }
  if (/^\/(hippo|kaizen|observability)\//.test(pathname)) return "read";
  return "sensitive-read";
}

function fieldSummary(responseBodySchemas) {
  const queue = Object.values(responseBodySchemas ?? {});
  while (queue.length) {
    const schema = queue.shift();
    if (!schema || typeof schema !== "object") continue;
    if (Array.isArray(schema.anyOf)) queue.push(...schema.anyOf);
    if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
      return { fields: Object.keys(schema.properties).sort(), fieldsShape: "object" };
    }
    if (schema.type === "array" && schema.items) {
      if (
        schema.items.type === "object" &&
        schema.items.properties &&
        typeof schema.items.properties === "object"
      ) {
        return { fields: Object.keys(schema.items.properties).sort(), fieldsShape: "list" };
      }
      queue.push(schema.items);
    }
  }
  return { fields: [], fieldsShape: undefined };
}

const grouped = new Map();
const allowedOrigins = new Set(capturePolicy.allowedOrigins);
for (const item of capture.routeIndex ?? []) {
  if (!allowedOrigins.has(item?.url?.origin)) continue;
  if (item.method === "OPTIONS" || item.method === "RESOURCE") continue;
  const requestType = String(item.type ?? "").toUpperCase();
  if (requestType && !requestType.includes("XHR") && !requestType.includes("FETCH")) continue;
  const normalizedPath = normalizePath(item.url.path);
  const queryKeys = [...new Set(item.url.queryKeys ?? [])].sort();
  const key = canonicalOperationKey(item.method, routeUrl(item.url.origin, normalizedPath, queryKeys));
  const group = grouped.get(key) ?? {
    methodSet: new Set(),
    typeSet: new Set(),
    queryKeySet: new Set(),
    seenOnSet: new Set(),
    statusCodeSet: new Set(),
    requestContentTypeSet: new Set(),
    responseContentTypeSet: new Set(),
    requestBodySchema: undefined,
    responseBodySchemas: {},
    requiresAuth: false,
    observationCount: 0,
    url: { ...item.url, path: normalizedPath, queryKeys },
  };
  group.methodSet.add(item.method);
  if (item.type) group.typeSet.add(item.type);
  for (const queryKey of item.url.queryKeys ?? []) group.queryKeySet.add(queryKey);
  for (const label of item.seenOn ?? []) group.seenOnSet.add(label);
  if (item.status) group.statusCodeSet.add(Number(item.status));
  if (item.requestContentType) group.requestContentTypeSet.add(item.requestContentType);
  if (item.responseContentType) group.responseContentTypeSet.add(item.responseContentType);
  group.requestBodySchema = mergeSchemas(group.requestBodySchema, item.requestBodySchema);
  if (item.responseBodySchema) {
    const statusKey = String(item.status ?? "default");
    group.responseBodySchemas[statusKey] = mergeSchemas(
      group.responseBodySchemas[statusKey],
      item.responseBodySchema,
    );
  }
  group.requiresAuth ||= item.requiresAuth === true;
  group.observationCount += 1;
  grouped.set(key, group);
}

const browserRoutes = [...grouped.values()]
  .map((group) => {
    const methods = [...group.methodSet].sort();
    const queryKeys = [...group.queryKeySet].sort();
    const seenOn = [...group.seenOnSet].sort();
    const categories = categoriesFor(group.url.path);
    const fieldEvidence = fieldSummary(group.responseBodySchemas);
    return {
      url: routeUrl(group.url.origin, group.url.path, queryKeys),
      host: new URL(group.url.origin).hostname,
      categories,
      risk: riskFor({ url: group.url, methods }, categories),
      methods,
      source: `cdp-${captureDate}-authenticated-sanitized-v${capture.schemaVersion ?? 1}`,
      seenOn,
      queryKeys,
      requestTypes: [...group.typeSet].sort(),
      statusCodes: [...group.statusCodeSet].filter(Number.isInteger).sort((a, b) => a - b),
      requestContentTypes: [...group.requestContentTypeSet].sort(),
      responseContentTypes: [...group.responseContentTypeSet].sort(),
      requestBodySchema: group.requestBodySchema,
      responseBodySchemas: group.responseBodySchemas,
      fields: fieldEvidence.fields,
      fieldsSource: fieldEvidence.fields.length ? "verified" : "undocumented",
      fieldsShape: fieldEvidence.fieldsShape,
      requiresAuth: group.requiresAuth,
      observationCount: group.observationCount,
      verificationStatus: "captured",
      provenance: {
        captureId: capture.captureId,
        capturedAt: capture.capturedAt,
        sanitized: capture.sanitized === true,
        schemaVersion: capture.schemaVersion ?? 1,
      },
    };
  })
  .sort((a, b) => a.url.localeCompare(b.url) || a.methods[0].localeCompare(b.methods[0]));

function mergeRouteEvidence(existing, route) {
  const previousSources = new Set(
    String(existing.source ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const alreadyMerged = previousSources.has(route.source);
  const incomingCount = route.observationCount ?? 0;
  existing.methods = [...new Set([...(existing.methods ?? []), ...(route.methods ?? [])])].sort();
  if (route.source) previousSources.add(route.source);
  existing.source = [...previousSources].sort().join("; ");
  existing.seenOn = [...new Set([...(existing.seenOn ?? []), ...(route.seenOn ?? [])])].sort();
  existing.queryKeys = [
    ...new Set([...(existing.queryKeys ?? []), ...(route.queryKeys ?? [])]),
  ].sort();
  existing.categories = [
    ...new Set([...(existing.categories ?? []), ...(route.categories ?? [])]),
  ].sort();
  if (existing.categories.length > 1) {
    existing.categories = existing.categories.filter((category) => category !== "unknown");
  }
  existing.requestTypes = [
    ...new Set([...(existing.requestTypes ?? []), ...(route.requestTypes ?? [])]),
  ].sort();
  existing.statusCodes = [
    ...new Set([...(existing.statusCodes ?? []), ...(route.statusCodes ?? [])]),
  ].sort((a, b) => a - b);
  existing.requestContentTypes = [
    ...new Set([...(existing.requestContentTypes ?? []), ...(route.requestContentTypes ?? [])]),
  ].sort();
  existing.responseContentTypes = [
    ...new Set([...(existing.responseContentTypes ?? []), ...(route.responseContentTypes ?? [])]),
  ].sort();
  existing.requestBodySchema = mergeSchemas(existing.requestBodySchema, route.requestBodySchema);
  existing.responseBodySchemas ??= {};
  for (const [status, schema] of Object.entries(route.responseBodySchemas ?? {})) {
    existing.responseBodySchemas[status] = mergeSchemas(
      existing.responseBodySchemas[status],
      schema,
    );
  }
  existing.requiresAuth = existing.requiresAuth === true || route.requiresAuth === true;
  if (route.fieldsSource === "verified" && existing.fieldsSource !== "verified") {
    existing.fields = route.fields;
    existing.fieldsSource = route.fieldsSource;
    existing.fieldsShape = route.fieldsShape;
  } else {
    existing.fields ??= [];
    existing.fieldsSource ??= "undocumented";
  }
  if (alreadyMerged && route.verificationStatus === "captured") existing.risk = route.risk;
  if (existing.verificationStatus !== "live_verified" && route.verificationStatus) {
    existing.verificationStatus = route.verificationStatus;
  }
  existing.observationCount = alreadyMerged
    ? Math.max(existing.observationCount ?? 0, incomingCount)
    : (existing.observationCount ?? 0) + incomingCount;
  if (route.provenance) existing.provenance = route.provenance;
}

const byOperation = new Map();
for (const existing of existingRoutes) {
  const methods = existing.methods?.length ? existing.methods : ["GET"];
  if (methods.length !== 1) continue;
  byOperation.set(canonicalOperationKey(methods[0], existing.url), existing);
}
for (const route of browserRoutes) {
  const key = canonicalOperationKey(route.methods[0], route.url);
  const existing = byOperation.get(key);
  if (existing) {
    mergeRouteEvidence(existing, route);
    continue;
  }
  existingRoutes.push(route);
  byOperation.set(key, route);
}

const dedupedRoutes = [];
const exactOperations = new Map();
for (const route of existingRoutes) {
  if (route.methods?.length !== 1) {
    dedupedRoutes.push(route);
    continue;
  }
  const key = canonicalOperationKey(route.methods[0], route.url);
  const existing = exactOperations.get(key);
  if (existing) mergeRouteEvidence(existing, route);
  else {
    exactOperations.set(key, route);
    dedupedRoutes.push(route);
  }
}
existingRoutes = dedupedRoutes;

existingRoutes.sort((a, b) => a.host.localeCompare(b.host) || a.url.localeCompare(b.url));

await mkdir(dirname(browserRoutesPath), { recursive: true });
await writeFile(browserRoutesPath, `${JSON.stringify(browserRoutes, null, 2)}\n`);
await writeFile(routesPath, `${JSON.stringify(existingRoutes, null, 2)}\n`);

console.error(`capture=${capturePath}`);
console.error(`browser routes=${browserRoutes.length}`);
console.error(`merged routes=${existingRoutes.length}`);

// Zayd Khan // cold // www.zayd.wtf
