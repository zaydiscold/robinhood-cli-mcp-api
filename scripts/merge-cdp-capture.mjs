import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const captureArg = process.argv[2];
if (!captureArg) {
  console.error("usage: pnpm merge:cdp <path-to-sanitized-cdp-capture.json>");
  process.exit(1);
}
const capturePath = resolve(captureArg);
const captureDate = capturePath.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10);
const routesPath = resolve(root, "api-map/brokerage-routes.json");
const browserRoutesPath = resolve(root, `api-map/browser-cdp-routes-${captureDate}.json`);

const capture = JSON.parse(await readFile(capturePath, "utf8"));
const existingRoutes = JSON.parse(await readFile(routesPath, "utf8"));

function normalizePath(pathname) {
  let value = pathname.replace(/:([a-zA-Z][a-zA-Z0-9_-]*)/g, "{$1}");
  value = value.replace(/^\/markets\/[^/]+\/hours\/\d{4}-\d{2}-\d{2}\/?$/, "/markets/{market}/hours/{date}/");
  value = value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{uuid}");
  value = value.replace(/\/[0-9]{5,}(?=\/|$)/g, "/{id}");
  value = value.replace(/\/RH[A-Za-z0-9_-]{8,}(?=\/|$)/g, "/{id}");
  value = value.replace(/\/[A-Za-z0-9_-]{32,}(?=\/|$)/g, "/{id}");
  return value;
}

function routeUrl(origin, pathname) {
  return `${origin}${normalizePath(pathname)}`;
}

function canonicalUrl(url) {
  const parsed = new URL(url);
  const path = decodeURIComponent(parsed.pathname)
    .replace(/\{[^}]*\}/g, "{param}")
    .replace(/\/+$/, "/");
  return `${parsed.origin}${path}`;
}

function categoriesFor(pathname) {
  const categories = new Set();
  if (/\/(accounts?|ceres|portfolios|positions|margin|user|inbox|pathfinder|wonka|devices)\b/.test(pathname)) categories.add("account");
  if (/\/(ach|wire|asset_transfers|acats|banking|crypto-transfers)\b/.test(pathname)) categories.add("money-movement");
  if (/\/(orders?|combo\/orders|equity_trading|recurring_schedules|recurring_tradability)\b/.test(pathname)) categories.add("orders");
  if (/\/options\b/.test(pathname)) categories.add("options");
  if (/\/(documents|dividends|cash_journal|corp_actions|pluto|yoda)\b/.test(pathname)) categories.add("history-documents");
  if (/\/(marketdata|markets|instruments|quotes|fundamentals|ratings|hedgefunds|insiders|forex)\b/.test(pathname)) categories.add("marketdata");
  if (/\/discovery\/lists\b/.test(pathname)) categories.add("watchlists");
  if (/\/(goku|kaizen|hippo|elegibility|eligibility)\b/.test(pathname)) categories.add("telemetry-config");
  if (/\/midlands\/notification/.test(pathname)) categories.add("notifications");
  if (/\/(identi|identity|mfa|security)\b/.test(pathname)) categories.add("security");
  if (categories.size === 0) categories.add("unknown");
  return [...categories].sort();
}

function riskFor(entry, categories) {
  const pathname = entry.url.path;
  const methods = new Set(entry.methods);
  if ([...methods].some((method) => method !== "GET")) {
    if (/\/(cancel|unlink|delete|disable|deactivate)\b/.test(pathname)) return "destructive";
    if (/^\/(goku|kaizen|hippo)\//.test(pathname)) return "write-safe";
    return "write-mutate";
  }
  if (categories.includes("marketdata") && !categories.includes("account") && !categories.includes("orders") && !categories.includes("watchlists")) {
    return "read";
  }
  if (/^\/(hippo|kaizen)\//.test(pathname)) return "read";
  return "sensitive-read";
}

const grouped = new Map();
const allowedOrigins = new Set([
  "https://api.robinhood.com",
  "https://bonfire.robinhood.com",
  "https://cashier.robinhood.com",
  "https://dora.robinhood.com",
  "https://identi.robinhood.com",
  "https://minerva.robinhood.com",
  "https://nummus.robinhood.com",
  "https://phoenix.robinhood.com"
]);
for (const item of capture.routeIndex ?? []) {
  if (!allowedOrigins.has(item?.url?.origin)) continue;
  if (item.method === "OPTIONS" || item.method === "RESOURCE") continue;
  if (item.type && !String(item.type).includes("XHR") && !String(item.type).includes("Fetch")) continue;
  const key = `${item.url.origin}${item.url.path}`;
  const group =
    grouped.get(key) ??
    {
      methodSet: new Set(),
      typeSet: new Set(),
      queryKeySet: new Set(),
      seenOnSet: new Set(),
      url: item.url
    };
  group.methodSet.add(item.method);
  if (item.type) group.typeSet.add(item.type);
  for (const queryKey of item.url.queryKeys ?? []) group.queryKeySet.add(queryKey);
  for (const label of item.seenOn ?? []) group.seenOnSet.add(label);
  grouped.set(key, group);
}

const browserRoutes = [...grouped.values()]
  .map((group) => {
    const methods = [...group.methodSet].sort();
    const queryKeys = [...group.queryKeySet].sort();
    const seenOn = [...group.seenOnSet].sort();
    const categories = categoriesFor(group.url.path);
    return {
      url: routeUrl(group.url.origin, group.url.path),
      host: new URL(group.url.origin).hostname,
      categories,
      risk: riskFor({ url: group.url, methods }, categories),
      methods,
      source: `cdp-${captureDate}-stock-account-sanitized`,
      seenOn,
      queryKeys,
      requestTypes: [...group.typeSet].sort()
    };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

const byCanonical = new Map(existingRoutes.map((route) => [canonicalUrl(route.url), route]));
for (const route of browserRoutes) {
  const key = canonicalUrl(route.url);
  const existing = byCanonical.get(key);
  if (existing) {
    existing.methods = [...new Set([...(existing.methods ?? []), ...route.methods])].sort();
    existing.source = existing.source ? `${existing.source}; ${route.source}` : route.source;
    existing.seenOn = [...new Set([...(existing.seenOn ?? []), ...route.seenOn])].sort();
    existing.queryKeys = [...new Set([...(existing.queryKeys ?? []), ...route.queryKeys])].sort();
    existing.categories = [...new Set([...(existing.categories ?? []), ...route.categories])].sort();
    continue;
  }
  existingRoutes.push(route);
  byCanonical.set(key, route);
}

existingRoutes.sort((a, b) => a.host.localeCompare(b.host) || a.url.localeCompare(b.url));

await mkdir(dirname(browserRoutesPath), { recursive: true });
await writeFile(browserRoutesPath, `${JSON.stringify(browserRoutes, null, 2)}\n`);
await writeFile(routesPath, `${JSON.stringify(existingRoutes, null, 2)}\n`);

console.error(`capture=${capturePath}`);
console.error(`browser routes=${browserRoutes.length}`);
console.error(`merged routes=${existingRoutes.length}`);
