const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://api.robinhood.com",
  "https://bonfire.robinhood.com",
  "https://cashier.robinhood.com",
  "https://dora.robinhood.com",
  "https://identi.robinhood.com",
  "https://minerva.robinhood.com",
  "https://nummus.robinhood.com",
  "https://phoenix.robinhood.com",
  "https://trading.robinhood.com",
]);

const BODY_LIMIT_BYTES = 2_000_000;
const MAX_SCHEMA_DEPTH = 6;
const MAX_PROPERTIES = 200;
const MAX_ARRAY_SAMPLES = 5;

export function normalizePath(pathname) {
  let value = pathname.replace(/\/{2,}/g, "/");
  value = value.replace(/:([a-zA-Z][a-zA-Z0-9_-]*)/g, "{$1}");
  value = value.replace(
    /^\/markets\/[^/]+\/hours\/\d{4}-\d{2}-\d{2}\/?$/,
    "/markets/{market}/hours/{date}/",
  );
  value = value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{uuid}");
  value = value.replace(/\/[0-9]{5,}(?=\/|$)/g, "/{id}");
  value = value.replace(/\/RH[A-Za-z0-9_-]{8,}(?=\/|$)/g, "/{id}");
  value = value.replace(/\/[A-Za-z0-9_-]{32,}(?=\/|$)/g, "/{id}");
  return value;
}

export function canonicalOperationKey(method, url) {
  const parsed = new URL(url);
  const path = decodeURIComponent(parsed.pathname)
    .replace(/\{[^}]*\}/g, "{param}")
    .replace(/\/+$/, "/");
  const query = [...parsed.searchParams.entries()]
    .map(([key, value]) => [key, decodeURIComponent(value).replace(/\{[^}]*\}/g, "{param}")])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${String(method).toUpperCase()} ${parsed.origin}${path}${query ? `?${query}` : ""}`;
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return match ? String(match[1]).split(";")[0].trim().toLowerCase() : undefined;
}

function hasAuth(headers) {
  if (!headers || typeof headers !== "object") return false;
  return Object.keys(headers).some((key) =>
    ["authorization", "cookie", "x-robinhood-authorization"].includes(key.toLowerCase()),
  );
}

function parseBody(value, contentType) {
  if (
    value === undefined ||
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "object"
  )
    return value;
  if (typeof value !== "string" || Buffer.byteLength(value) > BODY_LIMIT_BYTES) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (contentType?.includes("json") || /^[\[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (contentType === "application/x-www-form-urlencoded") {
    return Object.fromEntries([...new URLSearchParams(trimmed).keys()].map((key) => [key, ""]));
  }
  return undefined;
}

function schemaKey(schema) {
  return JSON.stringify(schema, Object.keys(schema ?? {}).sort());
}

function safeLabel(value) {
  if (value === undefined || value === null) return undefined;
  const label = String(value)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "id")
    .replace(/\b\d{5,}\b/g, "id")
    .replace(/\bRH[A-Za-z0-9_-]{8,}\b/g, "id")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "id")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return label || undefined;
}

function safeContentType(value) {
  if (!value) return undefined;
  const contentType = String(value).split(";")[0].trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(contentType) ? contentType : undefined;
}

function safePropertyName(key) {
  if (/[@\s]/.test(key)) return "{dynamic_key}";
  if (/^[0-9]{5,}$/.test(key)) return "{dynamic_key}";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))
    return "{dynamic_key}";
  if (/^RH[A-Za-z0-9_-]{8,}$/.test(key) || /^[A-Za-z0-9_-]{32,}$/.test(key)) return "{dynamic_key}";
  return key.slice(0, 120);
}

function safeTimestamp(value) {
  const parsed = new Date(value ?? Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function safeDecodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function mergeSchemas(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (JSON.stringify(left) === JSON.stringify(right)) return left;
  if (left.type === "object" && right.type === "object") {
    const properties = { ...(left.properties ?? {}) };
    for (const [key, schema] of Object.entries(right.properties ?? {})) {
      properties[key] = mergeSchemas(properties[key], schema);
    }
    return { type: "object", properties, additionalProperties: true };
  }
  if (left.type === "array" && right.type === "array") {
    return { type: "array", items: mergeSchemas(left.items, right.items) ?? {} };
  }
  const variants = [...(left.anyOf ?? [left]), ...(right.anyOf ?? [right])];
  const unique = [...new Map(variants.map((schema) => [schemaKey(schema), schema])).values()];
  return unique.length === 1 ? unique[0] : { anyOf: unique };
}

export function schemaFromValue(value, depth = 0) {
  if (depth >= MAX_SCHEMA_DEPTH) return {};
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_SAMPLES)
      .reduce((schema, item) => mergeSchemas(schema, schemaFromValue(item, depth + 1)), undefined);
    return { type: "array", items: items ?? {} };
  }
  if (typeof value === "object") {
    const properties = {};
    for (const key of Object.keys(value).sort().slice(0, MAX_PROPERTIES)) {
      const safeKey = safePropertyName(key);
      properties[safeKey] = mergeSchemas(
        properties[safeKey],
        schemaFromValue(value[key], depth + 1),
      );
    }
    return { type: "object", properties, additionalProperties: true };
  }
  if (typeof value === "number")
    return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  return { type: "string" };
}

function surfaceLabels(item, defaultSurface) {
  return [
    ...new Set(
      [...(item.seenOn ?? []), item.surface, item.label, defaultSurface]
        .map(safeLabel)
        .filter(Boolean),
    ),
  ].sort();
}

export function sanitizeRequest(item, options = {}) {
  const rawUrl = typeof item.url === "string" ? item.url : (item.url?.full ?? item.url?.href);
  if (!rawUrl) return undefined;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  if (!allowedOrigins.has(parsed.origin)) return undefined;
  const method = String(item.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") return undefined;
  const type = String(item.resourceType ?? item.type ?? "").toUpperCase();
  if (type && !type.includes("XHR") && !type.includes("FETCH")) return undefined;
  const requestContentType = safeContentType(
    headerValue(item.requestHeaders, "content-type") ?? item.requestContentType,
  );
  const responseContentType = safeContentType(
    headerValue(item.responseHeaders, "content-type") ?? item.responseContentType,
  );
  const requestValue = parseBody(item.requestBody ?? item.postData, requestContentType);
  const responseValue = parseBody(item.responseBody, responseContentType);
  const status = Number(item.status ?? item.responseStatus);
  return {
    method,
    type: type || "XHR",
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
    url: {
      origin: parsed.origin,
      path: normalizePath(safeDecodePath(parsed.pathname)),
      queryKeys: [...new Set([...parsed.searchParams.keys()])].sort(),
    },
    seenOn: surfaceLabels(item, options.defaultSurface),
    requiresAuth: item.requiresAuth === true || hasAuth(item.requestHeaders),
    requestContentType,
    responseContentType,
    requestBodySchema: requestValue === undefined ? undefined : schemaFromValue(requestValue),
    responseBodySchema: responseValue === undefined ? undefined : schemaFromValue(responseValue),
  };
}

export function sanitizeCapture(capture, options = {}) {
  const requests = capture.requests ?? capture.networkRequests ?? capture.entries ?? [];
  if (!Array.isArray(requests))
    throw new Error("Capture must contain a requests, networkRequests, or entries array.");
  const routeIndex = requests.map((item) => sanitizeRequest(item, options)).filter(Boolean);
  return {
    schemaVersion: 2,
    sanitized: true,
    capturedAt: safeTimestamp(capture.capturedAt),
    captureId: safeLabel(capture.captureId ?? options.captureId),
    surfaces: [
      ...new Set(
        [...(capture.surfaces ?? []), options.defaultSurface].map(safeLabel).filter(Boolean),
      ),
    ].sort(),
    routeIndex,
  };
}

export function assertSanitizedCapture(capture) {
  if (!capture || typeof capture !== "object" || !Array.isArray(capture.routeIndex)) {
    throw new Error("Sanitized capture must contain a routeIndex array.");
  }
  if (capture.schemaVersion >= 2 && capture.sanitized !== true) {
    throw new Error("Schema v2+ capture must declare sanitized=true.");
  }
  const forbidden = new Set([
    "headers",
    "requestHeaders",
    "responseHeaders",
    "requestBody",
    "responseBody",
    "postData",
    "cookies",
  ]);
  for (const [index, item] of capture.routeIndex.entries()) {
    for (const key of Object.keys(item ?? {})) {
      if (forbidden.has(key))
        throw new Error(`Sanitized route ${index} contains forbidden raw field ${key}.`);
    }
    if (!item?.url?.origin || !item?.url?.path || !Array.isArray(item?.url?.queryKeys)) {
      throw new Error(`Sanitized route ${index} has an invalid url shape.`);
    }
  }
  return capture;
}

export const capturePolicy = {
  allowedOrigins: [...DEFAULT_ALLOWED_ORIGINS].sort(),
  bodyLimitBytes: BODY_LIMIT_BYTES,
  maxSchemaDepth: MAX_SCHEMA_DEPTH,
  maxProperties: MAX_PROPERTIES,
  maxArraySamples: MAX_ARRAY_SAMPLES,
};
