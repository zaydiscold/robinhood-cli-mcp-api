import { execFileSync } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the repo root from this compiled module: dist/ -> cli/ -> repo root.
function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

// Auto-load the repo .env so every consumer (CLI, MCP server, scripts) gets auth
// with no shell sourcing. Explicit env vars always win — only unset keys are filled.
// Runs once at module load; a missing/garbled file is non-fatal.
function loadRepoEnv(): void {
  try {
    const path = join(repoRoot(), ".env");
    if (!existsSync(path)) return;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // explicit env vars still work
  }
}
loadRepoEnv();

export type RouteRisk = "read" | "sensitive-read" | "write-safe" | "write-mutate" | "write-or-sensitive" | "destructive";

export interface BrokerageRoute {
  url: string;
  host: string;
  categories: string[];
  risk: RouteRisk;
  methods?: string[];
  source?: string;
  seenOn?: string[];
  queryKeys?: string[];
  operationId?: string;
  summary?: string;
}

export interface BrowserRoute extends BrokerageRoute {
  source: string;
  seenOn: string[];
  queryKeys: string[];
  requestTypes: string[];
}

export interface CryptoRoute {
  path: string;
  methods: string[];
  summary?: string;
  operationIds: string[];
}

export interface ApiMapSummary {
  generatedAt: string;
  unified: {
    routes: number;
    openapiPaths: number;
    openapiOperations: number;
    byRisk: Record<string, number>;
    byCategory: Record<string, number>;
    hosts: Record<string, number>;
  };
  crypto: {
    title: string;
    server: string;
    paths: number;
    operations: number;
  };
  brokerage: {
    routes: number;
    browserRoutes: number;
    openapiPaths: number;
    openapiOperations: number;
    byRisk: Record<string, number>;
    byCategory: Record<string, number>;
    hosts: Record<string, number>;
  };
}

export interface PlannedBrokerageRequest {
  url: string;
  method: string;
  risk: RouteRisk;
  host: string;
  categories: string[];
  missingParams: string[];
  warnings: string[];
  command: string;
  mode: "execute" | "dry_run";
  mutatesAccount: boolean;
  requiresAuth: boolean;
  body?: unknown;
}

export interface PlannedCryptoRequest {
  url: string;
  path: string;
  method: string;
  risk: RouteRisk;
  categories: string[];
  missingParams: string[];
  warnings: string[];
  command: string;
  mode: "execute" | "dry_run";
  mutatesAccount: boolean;
  requiresAuth: true;
  body?: string;
}

export interface ExecuteBrokerageOptions {
  dryRun?: boolean;
  token?: string;
  cookie?: string;
  csrfToken?: string;
  body?: unknown;
  fullBody?: boolean;
  maxBodyBytes?: number;
  fetchImpl?: typeof fetch;
  /** Set false to disable the on-401 browser-free token refresh + retry (default on). */
  autoRefresh?: boolean;
}

export interface ExecuteCryptoOptions {
  dryRun?: boolean;
  apiKey?: string;
  privateKeyBase64?: string;
  timestamp?: string | number;
  body?: string;
  fullBody?: boolean;
  maxBodyBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface ExecuteBrokerageResult {
  ok: boolean;
  status: number;
  statusText: string;
  method: string;
  url: string;
  risk: RouteRisk;
  mutatesAccount: boolean;
  requiresAuth: boolean;
  contentType: string | null;
  body: string;
  truncated: boolean;
}

export interface ExecuteCryptoResult {
  ok: boolean;
  status: number;
  statusText: string;
  method: string;
  url: string;
  path: string;
  risk: RouteRisk;
  mutatesAccount: boolean;
  requiresAuth: true;
  contentType: string | null;
  body: string;
  truncated: boolean;
}

export function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function repoRootFromCli(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (fileExists(join(current, "api-map/brokerage-routes.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Could not locate repo root with api-map/brokerage-routes.json");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadBrokerageRoutes(root = repoRootFromCli()): BrokerageRoute[] {
  return readJson<BrokerageRoute[]>(join(root, "api-map/brokerage-routes.json"));
}

export function loadRobinhoodRoutes(root = repoRootFromCli()): BrokerageRoute[] {
  return readJson<BrokerageRoute[]>(join(root, "api-map/robinhood-routes.json"));
}

export function loadBrowserRoutes(root = repoRootFromCli()): BrowserRoute[] {
  const apiMapDir = join(root, "api-map");
  const latest = readdirSync(apiMapDir)
    .filter((file) => /^browser-cdp-routes-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse()[0];
  if (!latest) return [];
  return readJson<BrowserRoute[]>(join(apiMapDir, latest));
}

export function loadCryptoSpec(root = repoRootFromCli()): any {
  return readJson(join(root, "api-map/openapi/robinhood-crypto.openapi.json"));
}

export function loadBrokerageOpenApi(root = repoRootFromCli()): any {
  return readJson(join(root, "api-map/openapi/robinhood-brokerage.openapi.json"));
}

export function loadUnifiedOpenApi(root = repoRootFromCli()): any {
  return readJson(join(root, "api-map/openapi/robinhood-unified.openapi.json"));
}

export function listCryptoRoutes(root = repoRootFromCli()): CryptoRoute[] {
  const spec = loadCryptoSpec(root);
  return Object.entries<Record<string, any>>(spec.paths ?? {}).map(([path, item]) => {
    const methods = Object.keys(item).filter((key) => ["get", "post", "put", "patch", "delete"].includes(key));
    return {
      path,
      methods,
      summary: methods.map((method) => item[method]?.summary).filter(Boolean)[0],
      operationIds: methods.map((method) => item[method]?.operationId).filter(Boolean)
    };
  });
}

export function filterBrokerageRoutes(
  routes: BrokerageRoute[],
  filters: { risk?: string; category?: string; host?: string; query?: string }
): BrokerageRoute[] {
  const query = filters.query?.toLowerCase();
  return routes.filter((route) => {
    if (!route?.url) return false;
    if (filters.risk && route.risk !== filters.risk) return false;
    if (filters.category && !route.categories?.includes(filters.category)) return false;
    if (filters.host && route.host !== filters.host) return false;
    if (query && !route.url.toLowerCase().includes(query)) return false;
    return true;
  });
}

export const filterRobinhoodRoutes = filterBrokerageRoutes;

export function parseParamAssignments(values: string[] = []): Record<string, string> {
  const params: Record<string, string> = {};
  for (const value of values) {
    const index = value.indexOf("=");
    if (index <= 0) {
      throw new Error(`Invalid --param value "${value}". Use name=value, for example --param 0=abc123`);
    }
    params[value.slice(0, index)] = value.slice(index + 1);
  }
  return params;
}

export function planBrokerageRequest(input: {
  route: BrokerageRoute;
  method?: string;
  params?: Record<string, string>;
  body?: unknown;
  dryRun?: boolean;
}): PlannedBrokerageRequest {
  const params = input.params ?? {};
  const missingParams: string[] = [];
  const url = input.route.url.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === "") {
      missingParams.push(name);
      return `{${name}}`;
    }
    return encodeURIComponent(value);
  });
  const method = (input.method ?? inferBrokerageMethod(input.route)).toUpperCase();
  const warnings = riskWarnings(input.route.risk);
  const mutatesAccount = riskMutatesAccount(input.route.risk);
  return {
    url,
    method,
    risk: input.route.risk,
    host: input.route.host,
    categories: input.route.categories,
    missingParams,
    warnings,
    command: `curl -sS -X ${method} ${JSON.stringify(url)} -H "Authorization: Bearer $ROBINHOOD_BROKERAGE_TOKEN"`,
    mode: input.dryRun ? "dry_run" : "execute",
    mutatesAccount,
    requiresAuth: input.route.risk !== "read" || input.route.host === "api.robinhood.com",
    body: input.body
  };
}

export function planCryptoRequest(input: {
  route: BrokerageRoute;
  method?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
  dryRun?: boolean;
}): PlannedCryptoRequest {
  if (input.route.source !== "official-crypto-openapi" || input.route.host !== "trading.robinhood.com") {
    throw new Error("Crypto execution only supports Robinhood's official Crypto Trading API routes.");
  }
  const params = input.params ?? {};
  const missingParams: string[] = [];
  const url = input.route.url.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === "") {
      missingParams.push(name);
      return `{${name}}`;
    }
    return encodeURIComponent(value);
  });
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    parsed.searchParams.set(key, value);
  }
  const method = (input.method ?? inferBrokerageMethod(input.route)).toUpperCase();
  if (input.route.methods?.length && !input.route.methods.map((routeMethod) => routeMethod.toUpperCase()).includes(method)) {
    throw new Error(`${input.route.url} does not support ${method} in the official Crypto API map.`);
  }
  const path = `${parsed.pathname}${parsed.search}`;
  const warnings = riskWarnings(input.route.risk);
  const mutatesAccount = riskMutatesAccount(input.route.risk);
  return {
    url: parsed.toString(),
    path,
    method,
    risk: input.route.risk,
    categories: input.route.categories,
    missingParams,
    warnings,
    command: `curl -sS -X ${method} ${JSON.stringify(parsed.toString())} -H "x-api-key: $ROBINHOOD_CRYPTO_API_KEY" -H "x-timestamp: <unix-seconds>" -H "x-signature: <ed25519-signature>"`,
    mode: input.dryRun ? "dry_run" : "execute",
    mutatesAccount,
    requiresAuth: true,
    body: input.body
  };
}

export function inferBrokerageMethod(route: BrokerageRoute): string {
  if (route.methods?.length) return route.methods[0] ?? "GET";
  if (route.risk === "destructive" || route.risk === "write-or-sensitive" || route.risk === "write-mutate" || route.risk === "write-safe") return "POST";
  return "GET";
}

export function riskMutatesAccount(risk: RouteRisk): boolean {
  return risk === "write-mutate" || risk === "write-or-sensitive" || risk === "destructive";
}

export function riskIsWrite(risk: RouteRisk): boolean {
  return risk === "write-safe" || riskMutatesAccount(risk);
}

export interface LiveWriteGate {
  /** True only when a real write is permitted to leave the machine. */
  allowed: boolean;
  /** True when the request was forced into dry-run because the gate was not satisfied. */
  forcedDryRun: boolean;
  /** Human-readable reason, present when forcedDryRun is true. */
  reason?: string;
}

/**
 * Writes never go live unless the caller both passes --live-write AND sets the
 * ROBINHOOD_ALLOW_LIVE_WRITE=1 environment gate. Reads and explicit --dry-run
 * runs are always allowed. This keeps the CLI from ever placing a real order on
 * its own: a write requires two deliberate, separate opt-ins.
 */
export function resolveLiveWriteGate(input: {
  risk: RouteRisk;
  dryRun: boolean;
  liveWrite: boolean;
  env?: NodeJS.ProcessEnv;
}): LiveWriteGate {
  const env = input.env ?? process.env;
  if (input.dryRun || !riskIsWrite(input.risk)) {
    return { allowed: true, forcedDryRun: false };
  }
  const envAllows = env.ROBINHOOD_ALLOW_LIVE_WRITE === "1";
  if (input.liveWrite && envAllows) {
    return { allowed: true, forcedDryRun: false };
  }
  if (!input.liveWrite && !envAllows) {
    return {
      allowed: false,
      forcedDryRun: true,
      reason: "Live write blocked: pass --live-write and set ROBINHOOD_ALLOW_LIVE_WRITE=1 to send. Forced to dry-run."
    };
  }
  if (!input.liveWrite) {
    return {
      allowed: false,
      forcedDryRun: true,
      reason: "Live write blocked: ROBINHOOD_ALLOW_LIVE_WRITE=1 is set but --live-write was not passed. Forced to dry-run."
    };
  }
  return {
    allowed: false,
    forcedDryRun: true,
    reason: "Live write blocked: --live-write was passed but ROBINHOOD_ALLOW_LIVE_WRITE=1 is not set. Forced to dry-run."
  };
}

export function riskWriteWarning(risk: RouteRisk, url: string): string | undefined {
  if (risk === "write-safe") return `[WRITES TO LIVE ROBINHOOD] ${url} sends a live non-account-state write such as telemetry or preference acknowledgement.`;
  if (risk === "write-mutate" || risk === "write-or-sensitive") return `[WRITES TO LIVE ROBINHOOD] ${url} may modify your Robinhood account.`;
  if (risk === "destructive") return `[WRITES TO LIVE ROBINHOOD] ${url} can cancel, unlink, disable, or destroy account state.`;
  return undefined;
}

export function riskWarnings(risk: RouteRisk): string[] {
  switch (risk) {
    case "destructive":
      return ["Destructive route. Dry-run by default; a live write needs --live-write plus ROBINHOOD_ALLOW_LIVE_WRITE=1."];
    case "write-mutate":
      return ["Write route. Dry-run by default; a live write needs --live-write plus ROBINHOOD_ALLOW_LIVE_WRITE=1."];
    case "write-safe":
      return ["Non-account-state write route such as telemetry or acknowledgement. Dry-run by default; a live write needs --live-write plus ROBINHOOD_ALLOW_LIVE_WRITE=1."];
    case "write-or-sensitive":
      return ["Potential write or highly sensitive route. Dry-run by default; a live write needs --live-write plus ROBINHOOD_ALLOW_LIVE_WRITE=1."];
    case "sensitive-read":
      return ["Sensitive read route. Redact account identifiers, positions, documents, and tax data in shared artifacts."];
    default:
      return [];
  }
}

function authFromEnv(options: ExecuteBrokerageOptions) {
  return {
    token: options.token ?? process.env.ROBINHOOD_BROKERAGE_TOKEN,
    cookie: options.cookie ?? process.env.ROBINHOOD_COOKIE,
    csrfToken: options.csrfToken ?? process.env.ROBINHOOD_CSRF_TOKEN
  };
}

function stringifyBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

function cryptoAuthFromEnv(options: ExecuteCryptoOptions) {
  return {
    apiKey: options.apiKey ?? process.env.ROBINHOOD_CRYPTO_API_KEY ?? process.env.ROBINHOOD_API_KEY,
    privateKeyBase64:
      options.privateKeyBase64 ?? process.env.ROBINHOOD_CRYPTO_PRIVATE_KEY_B64 ?? process.env.ROBINHOOD_PRIVATE_KEY_B64
  };
}

// Browser-free token self-heal: on a 401, re-read the freshest access_token from
// Chrome's on-disk localStorage (via scripts/refresh-auth.sh) and return it so the
// request can be retried once. Returns undefined if the refresh produced nothing.
// Runs in the CLI's own (TCC-permitted) context, so no daemon / Full Disk Access
// grant is needed. See scripts/refresh-auth.sh for the disk-read rationale.
function tryRefreshBrokerageToken(): string | undefined {
  try {
    const root = repoRoot();
    const script = join(root, "scripts", "refresh-auth.sh");
    const envPath = join(root, ".env");
    if (!existsSync(script)) return undefined;
    execFileSync("/bin/bash", [script], { stdio: "ignore", timeout: 30000 });
    if (!existsSync(envPath)) return undefined;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (t.startsWith("ROBINHOOD_BROKERAGE_TOKEN=")) {
        const val = t.slice("ROBINHOOD_BROKERAGE_TOKEN=".length).trim();
        return val || undefined;
      }
    }
  } catch {
    // refresh unavailable (no Chrome auth, not on this machine, etc.) — caller keeps the 401
  }
  return undefined;
}

export async function executeBrokerageRequest(
  plan: PlannedBrokerageRequest,
  options: ExecuteBrokerageOptions = {}
): Promise<ExecuteBrokerageResult> {
  if (options.dryRun || plan.mode === "dry_run") {
    return {
      ok: true,
      status: 0,
      statusText: "DRY_RUN",
      method: plan.method,
      url: plan.url,
      risk: plan.risk,
      mutatesAccount: plan.mutatesAccount,
      requiresAuth: plan.requiresAuth,
      contentType: "application/json",
      body: JSON.stringify(plan, null, 2),
      truncated: false
    };
  }

  const warning = riskWriteWarning(plan.risk, plan.url);
  if (warning) {
    console.error(warning);
  }

  let { token } = authFromEnv(options);
  const { cookie, csrfToken } = authFromEnv(options);
  // Cold start: no token at all — try a browser-free disk refresh before giving up,
  // so a fresh MCP/CLI process self-arms without any manual setup.
  if (
    plan.requiresAuth &&
    !token &&
    !cookie &&
    options.fetchImpl === undefined &&
    options.autoRefresh !== false
  ) {
    const fresh = tryRefreshBrokerageToken();
    if (fresh) {
      token = fresh;
      process.env.ROBINHOOD_BROKERAGE_TOKEN = fresh;
    }
  }
  if (plan.requiresAuth && !token && !cookie) {
    throw new Error("Missing auth: set ROBINHOOD_BROKERAGE_TOKEN or ROBINHOOD_COOKIE outside the repo.");
  }

  const body = options.body ?? plan.body;
  const serializedBody = stringifyBody(body);
  const fetchImpl = options.fetchImpl ?? fetch;

  const send = (authToken?: string) => {
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      "user-agent": "robinhood-cli/0.1"
    };
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    if (cookie) headers.cookie = cookie;
    if (csrfToken) headers["x-csrftoken"] = csrfToken;
    if (serializedBody !== undefined) headers["content-type"] = "application/json";
    return fetchImpl(plan.url, {
      method: plan.method,
      headers,
      body: plan.method === "GET" ? undefined : serializedBody
    });
  };

  let response = await send(token);

  // A 401 means the token expired and the request was rejected (never executed),
  // so retrying after a refresh is safe even for writes. Only self-heal real token
  // auth — skip for cookie-only or injected test fetch impls.
  if (
    response.status === 401 &&
    token &&
    options.fetchImpl === undefined &&
    options.autoRefresh !== false
  ) {
    const fresh = tryRefreshBrokerageToken();
    if (fresh && fresh !== token) {
      process.env.ROBINHOOD_BROKERAGE_TOKEN = fresh;
      response = await send(fresh);
    }
  }

  const text = await response.text();
  const max = options.fullBody ? Number.POSITIVE_INFINITY : options.maxBodyBytes ?? 4000;
  const truncated = text.length > max;
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    method: plan.method,
    url: plan.url,
    risk: plan.risk,
    mutatesAccount: plan.mutatesAccount,
    requiresAuth: plan.requiresAuth,
    contentType: response.headers.get("content-type"),
    body: truncated ? text.slice(0, max) : text,
    truncated
  };
}

export async function executeCryptoRequest(
  plan: PlannedCryptoRequest,
  options: ExecuteCryptoOptions = {}
): Promise<ExecuteCryptoResult> {
  const body = options.body ?? plan.body ?? "";
  if (options.dryRun || plan.mode === "dry_run") {
    return {
      ok: true,
      status: 0,
      statusText: "DRY_RUN",
      method: plan.method,
      url: plan.url,
      path: plan.path,
      risk: plan.risk,
      mutatesAccount: plan.mutatesAccount,
      requiresAuth: true,
      contentType: "application/json",
      body: JSON.stringify(
        {
          ...plan,
          body,
          authHeaders: ["x-api-key", "x-timestamp", "x-signature"]
        },
        null,
        2
      ),
      truncated: false
    };
  }

  const warning = riskWriteWarning(plan.risk, plan.url);
  if (warning) {
    console.error(warning);
  }

  const { apiKey, privateKeyBase64 } = cryptoAuthFromEnv(options);
  if (!apiKey || !privateKeyBase64) {
    throw new Error(
      "Missing auth: set ROBINHOOD_CRYPTO_API_KEY and ROBINHOOD_CRYPTO_PRIVATE_KEY_B64 outside the repo."
    );
  }

  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signed = signCryptoRequest({
    apiKey,
    privateKeyBase64,
    timestamp,
    path: plan.path,
    method: plan.method,
    body
  });
  const headers: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "user-agent": "robinhood-cli/0.1",
    "x-api-key": signed["x-api-key"],
    "x-timestamp": signed["x-timestamp"],
    "x-signature": signed["x-signature"]
  };
  if (body !== "") headers["content-type"] = "application/json";

  const response = await (options.fetchImpl ?? fetch)(plan.url, {
    method: plan.method,
    headers,
    body: plan.method === "GET" ? undefined : body
  });

  const text = await response.text();
  const max = options.fullBody ? Number.POSITIVE_INFINITY : options.maxBodyBytes ?? 4000;
  const truncated = text.length > max;
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    method: plan.method,
    url: plan.url,
    path: plan.path,
    risk: plan.risk,
    mutatesAccount: plan.mutatesAccount,
    requiresAuth: true,
    contentType: response.headers.get("content-type"),
    body: truncated ? text.slice(0, max) : text,
    truncated
  };
}

export function summarizeApiMap(root = repoRootFromCli()): ApiMapSummary {
  const spec = loadCryptoSpec(root);
  const brokerageSpec = loadBrokerageOpenApi(root);
  const unifiedSpec = loadUnifiedOpenApi(root);
  const unifiedRoutes = loadRobinhoodRoutes(root);
  const routes = loadBrokerageRoutes(root);
  const browserRoutes = loadBrowserRoutes(root);
  const cryptoRoutes = listCryptoRoutes(root);
  const unifiedByRisk: Record<string, number> = {};
  const unifiedByCategory: Record<string, number> = {};
  const unifiedHosts: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const hosts: Record<string, number> = {};

  // Route entries use one of two schema dialects: { categories: [...] } or the
  // older { category: "..." }. Read either so summary never crashes on a mixed map.
  const categoriesOf = (route: { categories?: string[]; category?: string }): string[] => {
    if (Array.isArray(route.categories) && route.categories.length) return route.categories;
    if (typeof route.category === "string" && route.category) return [route.category];
    return ["uncategorized"];
  };

  for (const route of unifiedRoutes) {
    unifiedByRisk[route.risk] = (unifiedByRisk[route.risk] ?? 0) + 1;
    unifiedHosts[route.host] = (unifiedHosts[route.host] ?? 0) + 1;
    for (const category of categoriesOf(route)) {
      unifiedByCategory[category] = (unifiedByCategory[category] ?? 0) + 1;
    }
  }

  for (const route of routes) {
    byRisk[route.risk] = (byRisk[route.risk] ?? 0) + 1;
    hosts[route.host] = (hosts[route.host] ?? 0) + 1;
    for (const category of categoriesOf(route)) {
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    unified: {
      routes: unifiedRoutes.length,
      openapiPaths: Object.keys(unifiedSpec.paths ?? {}).length,
      openapiOperations: Object.values<Record<string, unknown>>(unifiedSpec.paths ?? {}).reduce(
        (total, item) => total + Object.keys(item).filter((key) => ["get", "post", "put", "patch", "delete"].includes(key)).length,
        0
      ),
      byRisk: unifiedByRisk,
      byCategory: unifiedByCategory,
      hosts: unifiedHosts
    },
    crypto: {
      title: spec.info?.title ?? "Robinhood Crypto Trading API",
      server: spec.servers?.[0]?.url ?? "https://trading.robinhood.com/",
      paths: Object.keys(spec.paths ?? {}).length,
      operations: cryptoRoutes.reduce((total, route) => total + route.methods.length, 0)
    },
    brokerage: {
      routes: routes.length,
      browserRoutes: browserRoutes.length,
      openapiPaths: Object.keys(brokerageSpec.paths ?? {}).length,
      openapiOperations: Object.values<Record<string, unknown>>(brokerageSpec.paths ?? {}).reduce(
        (total, item) => total + Object.keys(item).filter((key) => ["get", "post", "put", "patch", "delete"].includes(key)).length,
        0
      ),
      byRisk,
      byCategory,
      hosts
    }
  };
}

export function privateKeyFromBase64Seed(privateKeyBase64: string): ReturnType<typeof createPrivateKey> {
  const raw = Buffer.from(privateKeyBase64, "base64");
  const seed = raw.length === 64 ? raw.subarray(0, 32) : raw;
  if (seed.length !== 32) {
    throw new Error(`Expected a 32-byte Ed25519 seed or 64-byte expanded key, got ${raw.length} bytes`);
  }
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return createPrivateKey({
    key: Buffer.concat([prefix, seed]),
    format: "der",
    type: "pkcs8"
  });
}

export function signCryptoRequest(input: {
  apiKey: string;
  privateKeyBase64: string;
  timestamp: string | number;
  path: string;
  method: string;
  body?: string;
}): { "x-api-key": string; "x-timestamp": string; "x-signature": string; signedMessage: string } {
  const timestamp = String(input.timestamp);
  const method = input.method.toUpperCase();
  const body = input.body ?? "";
  const signedMessage = `${input.apiKey}${timestamp}${input.path}${method}${body}`;
  const privateKey = privateKeyFromBase64Seed(input.privateKeyBase64);
  const signature = sign(null, Buffer.from(signedMessage, "utf8"), privateKey).toString("base64");
  return {
    "x-api-key": input.apiKey,
    "x-timestamp": timestamp,
    "x-signature": signature,
    signedMessage
  };
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printTable(rows: Array<Record<string, unknown>>, columns: string[]): void {
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)));
  process.stdout.write(`${columns.map((column, i) => column.padEnd(widths[i] ?? column.length)).join("  ")}\n`);
  process.stdout.write(`${widths.map((width) => "-".repeat(width)).join("  ")}\n`);
  for (const row of rows) {
    process.stdout.write(`${columns.map((column, i) => String(row[column] ?? "").padEnd(widths[i] ?? column.length)).join("  ")}\n`);
  }
}
