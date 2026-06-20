import { execFileSync } from "node:child_process";
import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

// Walk up from a start dir to a repo marker. Robust across build layouts (cli/dist,
// mcp/dist, bundled, symlinked): a fixed ../.. silently resolves to the WRONG directory
// if the emit depth ever changes.
//
// CRITICAL: the default markers must exist ONLY at the true repo root. We deliberately do
// NOT include api-map/brokerage-routes.json here — `pnpm build` COPIES it into cli/dist, so
// a compiled module living in cli/dist would match it and (wrongly) treat cli/dist as the
// repo root, breaking .env / data-file loading for the long-running MCP — the exact failure
// this resolver exists to prevent. repoRootFromCli() passes that marker EXPLICITLY because it
// WANTS the dir holding the route data (cli/dist in production), so the two resolvers
// correctly resolve to different directories.
const REPO_MARKERS = ["pnpm-workspace.yaml", ".git"];
export function ascendToRepoRoot(
  markers: string[] = REPO_MARKERS,
  startDir: string = dirname(fileURLToPath(import.meta.url))
): string | undefined {
  let current = startDir;
  for (let i = 0; i < 12; i += 1) {
    if (markers.some((m) => existsSync(join(current, m)))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

// Resolve the repo root (where .env and the operator-memory files live). Lenient: falls
// back to the legacy fixed depth only if no marker is found (e.g. installed as a dep with
// no .git / workspace file), so resolution never gets worse than before.
function repoRoot(): string {
  return ascendToRepoRoot() ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  /** Response keys an agent reads off this endpoint (for lists, the item keys). See scripts/harvest-response-fields.mjs. */
  fields?: string[];
  /** Provenance of `fields`: "verified" (from a captured body), "inferred" (documented shape), or "undocumented" (stub). */
  fieldsSource?: "verified" | "inferred" | "undocumented";
  /** Whether the response is a single object or a list (item keys reported in `fields`). */
  fieldsShape?: "object" | "list";
}

export interface BrowserRoute extends BrokerageRoute {
  source: string;
  seenOn: string[];
  queryKeys: string[];
  requestTypes: string[];
}

export type AccountContextBehavior = "propagates" | "mixed" | "ignored" | "not-applicable" | "stale-route";

export interface AccountContextWorkflow {
  id: string;
  title: string;
  surface: string;
  webRoute: string;
  behavior: AccountContextBehavior;
  confidence: string;
  risk: RouteRisk;
  safeToAutomate: boolean;
  observedOn: string;
  observedBy: string;
  apiRouteFamilies: string[];
  cliGuidance: string;
}

export interface BuiltWorkflowUrl {
  workflow: AccountContextWorkflow;
  url: string;
  missingParams: string[];
  warnings: string[];
}

export interface OptionStrategyLegTemplate {
  id: string;
  action: "buy" | "sell";
  optionType: "call" | "put" | "stock";
  strikeRole: string;
  positionEffect: "open" | "close";
  ratioQuantity: number;
  optionPlaceholder?: string;
  notes?: string;
}

export interface OptionsStrategyWorkflow {
  id: string;
  title: string;
  category: string;
  marketView: string;
  volatilityView: string;
  aggressiveness: "conservative" | "moderate" | "aggressive";
  definedRisk: boolean;
  requiresMargin: boolean;
  requiresUnderlying: boolean;
  payoff: {
    maxProfit: string;
    maxLoss: string;
    breakevens: string[];
  };
  greekProfile: {
    delta: string;
    gamma: string;
    theta: string;
    vega: string;
    rho: string;
  };
  legs: OptionStrategyLegTemplate[];
  lookupSteps: string[];
  orderTemplate: unknown;
  riskNotes: string[];
  cliGuidance: string;
  sources: string[];
}

export interface OptionsStrategyOrderPlan {
  workflow: OptionsStrategyWorkflow;
  lookupSteps: string[];
  order: unknown;
  reviewContract: OptionsQuantReviewContract;
  missingParams: string[];
  warnings: string[];
  mode: "dry_run";
  risk: "write-mutate";
}

export type OptionsStrategyPricingMode = "natural" | "mid" | "safe-sell-probe" | "safe-buy-probe";

export interface OptionsStrategyPricingLegInput {
  id: string;
  action: "buy" | "sell";
  ratioQuantity?: number;
  bid?: number | string | null;
  ask?: number | string | null;
  mark?: number | string | null;
  last?: number | string | null;
  delta?: number | string | null;
  gamma?: number | string | null;
  theta?: number | string | null;
  vega?: number | string | null;
  rho?: number | string | null;
}

export interface OptionsStrategyPricingLegSummary {
  id: string;
  action: "buy" | "sell";
  ratioQuantity: number;
  bid: number;
  ask: number;
  mark: number;
  last: number;
  naturalUnitPrice: number;
  midUnitPrice: number;
  signedNaturalContribution: number;
  signedMidContribution: number;
  bidAskWidth: number;
  quoteSource: "bid_ask" | "mark" | "last" | "missing";
}

export interface OptionsStrategyPricingSummary {
  mode: OptionsStrategyPricingMode;
  direction: "credit" | "debit";
  naturalNet: number;
  midNet: number;
  naturalPrice: number;
  midPrice: number;
  limitPrice: number;
  farLimitOffset: number;
  legs: OptionsStrategyPricingLegSummary[];
  netGreeks: {
    contractMultiplier: 100;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  warnings: string[];
}

export type OptionContractType = "call" | "put";
export type OptionTradeSide = "buy" | "sell";
export type OptionPositionEffect = "open" | "close";

export interface OptionsContractNavigationInput {
  accountNumber?: string;
  symbol?: string;
  expiration?: string;
  optionType?: OptionContractType;
  side?: OptionTradeSide;
  strike?: string;
  positionEffect?: OptionPositionEffect;
  chainId?: string;
  equityInstrumentId?: string;
  optionInstrumentId?: string;
  optionPositionId?: string;
  aggregatePositionId?: string;
  optionOrderId?: string;
  source?: string;
}

export interface OptionsContractNavigationPlan {
  mode: "dry_run";
  risk: "write-mutate";
  selector: {
    accountNumber?: string;
    symbol?: string;
    expiration?: string;
    optionType?: OptionContractType;
    side?: OptionTradeSide;
    strike?: string;
    positionEffect: OptionPositionEffect;
    chainId?: string;
    equityInstrumentId?: string;
    optionInstrumentId?: string;
    optionPositionId?: string;
    aggregatePositionId?: string;
    optionOrderId?: string;
    source: string;
  };
  webNavigation: Array<{
    id: string;
    url: string;
    confidence: "observed" | "candidate";
    purpose: string;
  }>;
  queryParamCandidates: Record<string, string[]>;
  apiResolutionSteps: Array<{
    id: string;
    method: "GET" | "POST";
    url: string;
    purpose: string;
    required: boolean;
  }>;
  exactMatchChecklist: string[];
  orderHandoff: {
    endpoint: "https://api.robinhood.com/options/orders/";
    strategyQuoteUrl: string;
    orderTemplate: unknown;
    requiredOrderParams: string[];
  };
  missingParams: string[];
  warnings: string[];
  evidence: Array<{
    source: string;
    finding: string;
  }>;
}

export interface OptionsContractLinkBundleInput extends OptionsContractNavigationInput {
  underlyingInstrumentId?: string;
  optionInstrumentUrl?: string;
  occSymbol?: string;
  quote?: {
    bid?: number | string | null;
    ask?: number | string | null;
    mark?: number | string | null;
    last?: number | string | null;
    delta?: number | string | null;
    gamma?: number | string | null;
    theta?: number | string | null;
    vega?: number | string | null;
    rho?: number | string | null;
    impliedVolatility?: number | string | null;
    volume?: number | string | null;
    openInterest?: number | string | null;
  };
  strategyQuoteUrl?: string;
  strategyQuote?: unknown;
  farLimitOffset?: number;
}

export interface OptionsContractLinkBundle {
  mode: "dry_run";
  risk: "write-mutate";
  exactUiSelectionProven: false;
  exactApiResolutionProven: boolean;
  selector: OptionsContractNavigationPlan["selector"] & {
    underlyingInstrumentId?: string;
    optionInstrumentUrl?: string;
    occSymbol?: string;
  };
  resolvedContract?: {
    chainId?: string;
    underlyingInstrumentId?: string;
    optionInstrumentId?: string;
    optionInstrumentUrl?: string;
    occSymbol?: string;
  };
  links: {
    accountScopedWebShell: string;
    appChainById?: string;
    webChainById?: string;
    browserAccountSwitcherChain?: string;
    webContractPageDesktop?: string;
    webContractPageDesktopAccountPinned?: string;
    appContractById?: string;
    candidateExactWebQueries: Array<{
      id: string;
      url: string;
      confidence: "candidate";
    }>;
  };
  webhookHandoff: {
    recommendedFlow: string[];
    copyPastePrimary: string;
    payload: Record<string, unknown>;
  };
  quote?: OptionsContractLinkBundleInput["quote"] & {
    naturalPrice?: number;
    midPrice?: number;
    bidAskWidth?: number;
  };
  pricingControls: {
    naturalPrice?: number;
    midPrice?: number;
    safeSellProbeLimit?: number;
    safeBuyProbeLimit?: number;
    farLimitOffset: number;
    rule: string;
  };
  strategyQuoteUrl?: string;
  strategyQuote?: unknown;
  navigationPlan: OptionsContractNavigationPlan;
  warnings: string[];
  evidence: Array<{
    source: string;
    finding: string;
  }>;
}

export interface OptionsQuantReviewContract {
  intent: "open" | "close" | "roll" | "analyze";
  requiredFields: string[];
  requiredChecks: string[];
  greekMath: {
    contractMultiplier: 100;
    netDelta: string;
    netGamma: string;
    netTheta: string;
    netVega: string;
    netRho: string;
    unitRules: string[];
  };
  scenarioRows: Array<{
    id: string;
    purpose: string;
    formulaOrCheck: string;
  }>;
  variantResolution: Array<{
    phrase: string;
    conservativeOrModeratePath: string;
    aggressivePath: string;
    rule: string;
  }>;
  hardBlockers: string[];
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
  /** Override the .env path the on-401 disk re-read consults (tests inject a temp file). */
  envPath?: string;
  /** Set false to disable the in-engine 429 rate-limit retry (default on for real fetch). */
  autoRetry?: boolean;
  /** Max 429 retries (default 3). Each sleeps the server-directed cooldown before retrying. */
  maxRateLimitRetries?: number;
  /** Injected sleep (ms) — tests pass a no-op so retries don't actually wait. */
  sleepImpl?: (ms: number) => Promise<void>;
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
  const root = ascendToRepoRoot(["api-map/brokerage-routes.json"]);
  if (!root) throw new Error("Could not locate repo root with api-map/brokerage-routes.json");
  return root;
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

function loadLatestApiMapJson<T>(prefix: string, root = repoRootFromCli()): T[] {
  const apiMapDir = join(root, "api-map");
  const latest = readdirSync(apiMapDir)
    .filter((file) => file.startsWith(prefix) && /^.+-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse()[0];
  if (!latest) return [];
  return readJson<T[]>(join(apiMapDir, latest));
}

export function loadAccountContextWorkflows(root = repoRootFromCli()): AccountContextWorkflow[] {
  return loadLatestApiMapJson<AccountContextWorkflow>("account-context-browser-workflows-", root);
}

export function loadOptionsStrategyWorkflows(root = repoRootFromCli()): OptionsStrategyWorkflow[] {
  return loadLatestApiMapJson<OptionsStrategyWorkflow>("options-strategy-workflows-", root);
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

// ── Token canonicalization ──────────────────────────────────────────────────────────────────────
// Account-identifying URL tokens were historically inconsistent across the captured route map
// ({num}, {account}, {account_number} all meant "an account number"). The map is now standardized on
// {account_number}. These aliases keep EVERY caller working through the transition — internal callers,
// doc examples, and external scripts that still pass a legacy token — because both route MATCHING and
// param SUBSTITUTION run through canonicalToken. That's the guarantee behind the rename: nothing breaks.
const ACCOUNT_TOKEN_ALIASES: Record<string, string> = {
  num: "account_number",
  n: "account_number",
  account: "account_number",
  acct: "account_number",
  account_number: "account_number"
};
export function canonicalToken(name: string): string {
  return ACCOUNT_TOKEN_ALIASES[name] ?? name;
}
/** Rewrite every {token} in a URL to its canonical name, so legacy and current tokens compare equal. */
export function normalizeUrlTokens(url: string): string {
  return url.replace(/\{([^}]+)\}/g, (_m, name: string) => `{${canonicalToken(name)}}`);
}
/** Resolve a param value by its exact name OR by any alias that canonicalizes to the same token. */
export function resolveParamValue(params: Record<string, string | undefined>, name: string): string | undefined {
  const direct = params[name];
  if (direct !== undefined && direct !== "") return direct;
  const canon = canonicalToken(name);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (canonicalToken(key) === canon) return value;
  }
  return undefined;
}

export function filterBrokerageRoutes(
  routes: BrokerageRoute[],
  filters: { risk?: string; category?: string; host?: string; query?: string }
): BrokerageRoute[] {
  const query = filters.query?.toLowerCase();
  // A templated query (contains a {token}) is matched token-insensitively so a legacy {num} query still
  // finds the canonical {account_number} route. A plain text query (no braces) is unaffected.
  const queryHasToken = query?.includes("{") ?? false;
  const normQuery = queryHasToken ? normalizeUrlTokens(query!) : query;
  return routes.filter((route) => {
    if (!route?.url) return false;
    if (filters.risk && route.risk !== filters.risk) return false;
    if (filters.category && !route.categories?.includes(filters.category)) return false;
    if (filters.host && route.host !== filters.host) return false;
    if (query) {
      const haystack = queryHasToken ? normalizeUrlTokens(route.url.toLowerCase()) : route.url.toLowerCase();
      if (!haystack.includes(normQuery!)) return false;
    }
    return true;
  });
}

export const filterRobinhoodRoutes = filterBrokerageRoutes;

// ── Endpoint directory ──────────────────────────────────────────────────────────────────────────
// A by-domain index that points an agent from intent → the right route + the first-class command that
// drives it. Built from the live route map (so it never drifts) + the harvested `fields` slot. Shared by
// the CLI (`api-map directory`) and the MCP (`robinhood_api_map_directory`) per the alignment invariant.

export const ENDPOINT_DOMAINS = [
  "accounts", "portfolio", "marketdata", "orders", "options", "settings",
  "money-movement", "sentiment", "ipo", "crypto", "other"
] as const;
export type EndpointDomain = (typeof ENDPOINT_DOMAINS)[number];

/** Classify a route into one agent-facing domain by URL shape. Order = most-specific-first. */
export function domainForRoute(route: BrokerageRoute): EndpointDomain {
  const u = route.url.toLowerCase();
  if (/\b(ipo_access|ipo)\b/.test(u)) return "ipo";
  if (u.includes("trading.robinhood.com") || u.includes("nummus") || /\bcrypto\b/.test(u)) return "crypto";
  if (u.includes("midlands/news") || u.includes("midlands/ratings") || u.includes("midlands/tags") ||
      u.includes("midlands/movers") || u.includes("midlands/search") || u.includes("earnings")) return "sentiment";
  if (u.includes("ach") || u.includes("cashier") || u.includes("acats") || u.includes("transfers") ||
      route.categories?.includes("money-movement")) return "money-movement";
  if (u.includes("options/")) return "options";
  if (u.includes("/orders/") || u.endsWith("/orders")) return "orders";
  if (u.includes("marketdata") || u.includes("/quotes") || u.includes("/instruments/") || u.endsWith("/instruments")) return "marketdata";
  if (u.includes("portfolios") || u.includes("positions")) return "portfolio";
  if (u.includes("drip") || u.includes("option_settings") || u.includes("/margin/") || u.includes("sweep") ||
      u.includes("recurring") || u.includes("subscription") || u.includes("settings")) return "settings";
  if (u.includes("/accounts/") || u.includes("transfer/accounts") || u.includes("/user")) return "accounts";
  return "other";
}

// Map a route to the first-class CLI command that drives it (read side). Substring → command label.
const COMMAND_HINTS: Array<{ match: string; command: string }> = [
  { match: "transfer/accounts", command: "accounts" },
  { match: "marketdata/quotes", command: "quote" },
  { match: "options/aggregate_positions", command: "options positions" },
  { match: "options/instruments", command: "options enumerate / options chain" },
  { match: "options/chains", command: "options chain / options expirations" },
  { match: "marketdata/options", command: "options strategy-quote" },
  { match: "options/orders", command: "history (read) / brokerage execute (write)" },
  { match: "positions/", command: "positions" },
  { match: "portfolios", command: "portfolio" },
  { match: "discovery/lists", command: "watchlist" },
  { match: "recurring", command: "recurring" },
  { match: "midlands/news", command: "brokerage execute (sentiment read)" },
  { match: "/orders/", command: "history (read) / brokerage execute (write)" },
  { match: "/accounts/", command: "accounts" }
];
function commandForRoute(route: BrokerageRoute): string | undefined {
  return COMMAND_HINTS.find((h) => route.url.includes(h.match))?.command;
}

export interface EndpointDirectoryEntry {
  url: string;
  methods: string[];
  risk: RouteRisk;
  command?: string;
  fieldCount: number;
  fieldsSource: BrokerageRoute["fieldsSource"];
  fields?: string[];
}
export interface EndpointDirectory {
  generatedFrom: string;
  totalRoutes: number;
  fieldsCoverage: { verified: number; inferred: number; undocumented: number };
  domains: Array<{ domain: EndpointDomain; routeCount: number; entries: EndpointDirectoryEntry[] }>;
}

/**
 * Build the by-domain endpoint directory from the route map. `opts.domain` filters to one domain;
 * `opts.query` filters by URL substring; `opts.withFields` includes the full field list per entry
 * (off by default to keep output compact).
 */
export function buildEndpointDirectory(
  opts: { domain?: EndpointDomain; query?: string; withFields?: boolean } = {},
  routes: BrokerageRoute[] = loadBrokerageRoutes()
): EndpointDirectory {
  const q = opts.query?.toLowerCase();
  const coverage = { verified: 0, inferred: 0, undocumented: 0 };
  const byDomain = new Map<EndpointDomain, EndpointDirectoryEntry[]>();
  for (const route of routes) {
    if (!route?.url) continue;
    const src = route.fieldsSource ?? "undocumented";
    if (src === "verified") coverage.verified++;
    else if (src === "inferred") coverage.inferred++;
    else coverage.undocumented++;
    const domain = domainForRoute(route);
    if (opts.domain && domain !== opts.domain) continue;
    if (q && !route.url.toLowerCase().includes(q)) continue;
    const entry: EndpointDirectoryEntry = {
      url: route.url,
      methods: route.methods?.length ? route.methods : ["GET"],
      risk: route.risk,
      command: commandForRoute(route),
      fieldCount: route.fields?.length ?? 0,
      fieldsSource: src,
      ...(opts.withFields ? { fields: route.fields ?? [] } : {})
    };
    const list = byDomain.get(domain) ?? [];
    list.push(entry);
    byDomain.set(domain, list);
  }
  const domains = ENDPOINT_DOMAINS
    .filter((d) => byDomain.has(d))
    .map((domain) => {
      const entries = byDomain.get(domain)!.sort((a, b) => a.url.localeCompare(b.url));
      return { domain, routeCount: entries.length, entries };
    });
  return {
    generatedFrom: "api-map/brokerage-routes.json",
    totalRoutes: routes.length,
    fieldsCoverage: coverage,
    domains
  };
}

// ── Recipe index (T4) ───────────────────────────────────────────────────────────────────────────
// Intent → the ONE command to run. Data-driven from api-map/recipes.json; surfaced by `recipes` (CLI) +
// `robinhood_recipes` (MCP). The agent's intent-routing table, kept beside the route map.
export interface Recipe {
  id: string;
  intent: string;
  triggers: string[];
  command: string;
  mcpTool: string;
  risk: string;
  notes?: string;
}
export function loadRecipes(root = repoRootFromCli()): Recipe[] {
  const doc = readJson<{ recipes?: Recipe[] }>(join(root, "api-map/recipes.json"));
  return doc.recipes ?? [];
}
/** Filter recipes by a free-text query across intent, triggers, command, tool, and notes. */
export function filterRecipes(recipes: Recipe[], query?: string): Recipe[] {
  if (!query) return recipes;
  const q = query.toLowerCase();
  return recipes.filter((r) =>
    [r.id, r.intent, r.command, r.mcpTool, r.notes ?? "", ...r.triggers].join("\n").toLowerCase().includes(q)
  );
}

export function filterAccountContextWorkflows(
  workflows: AccountContextWorkflow[],
  filters: { behavior?: AccountContextBehavior; surface?: string; query?: string }
): AccountContextWorkflow[] {
  const query = filters.query?.toLowerCase();
  return workflows.filter((workflow) => {
    if (filters.behavior && workflow.behavior !== filters.behavior) return false;
    if (filters.surface && workflow.surface !== filters.surface) return false;
    if (
      query &&
      ![
        workflow.id,
        workflow.title,
        workflow.surface,
        workflow.webRoute,
        workflow.behavior,
        workflow.cliGuidance,
        ...workflow.apiRouteFamilies
      ]
        .join("\n")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    return true;
  });
}

export function filterOptionsStrategyWorkflows(
  workflows: OptionsStrategyWorkflow[],
  filters: { category?: string; aggressiveness?: string; definedRisk?: boolean; query?: string }
): OptionsStrategyWorkflow[] {
  const query = filters.query?.toLowerCase();
  const ambiguousCoveredShortPut = Boolean(query?.includes("covered") && query.includes("short") && query.includes("put"));
  return workflows.filter((workflow) => {
    if (filters.category && workflow.category !== filters.category) return false;
    if (filters.aggressiveness && workflow.aggressiveness !== filters.aggressiveness) return false;
    if (filters.definedRisk !== undefined && workflow.definedRisk !== filters.definedRisk) return false;
    if (ambiguousCoveredShortPut && ["cash-secured-short-put", "covered-put"].includes(workflow.id)) return true;
    if (
      query &&
      ![
        workflow.id,
        workflow.title,
        workflow.category,
        workflow.marketView,
        workflow.volatilityView,
        workflow.cliGuidance,
        ...workflow.riskNotes,
        ...workflow.lookupSteps
      ]
        .join("\n")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    return true;
  });
}

function fillTemplateString(
  template: string,
  params: Record<string, string | undefined>,
  missing: Set<string>,
  options: { encode?: boolean } = { encode: true }
): string {
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === "") {
      missing.add(name);
      return `{${name}}`;
    }
    return options.encode === false ? value : encodeURIComponent(value);
  });
}

function fillTemplateValue(value: unknown, params: Record<string, string | undefined>, missing: Set<string>): unknown {
  if (typeof value === "string") return fillTemplateString(value, params, missing, { encode: false });
  if (Array.isArray(value)) return value.map((item) => fillTemplateValue(item, params, missing));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillTemplateValue(item, params, missing)]));
  }
  return value;
}

export function buildAccountContextUrl(
  workflow: AccountContextWorkflow,
  params: Record<string, string | undefined>
): BuiltWorkflowUrl {
  const missing = new Set<string>();
  const url = fillTemplateString(workflow.webRoute, params, missing);
  const warnings = riskWarnings(workflow.risk);
  if (workflow.behavior === "mixed") {
    warnings.push("Mixed account-context behavior observed: URL may preserve account_number while some API calls use page/default context.");
  } else if (workflow.behavior === "ignored") {
    warnings.push("Observed page ignored the supplied account_number query; use explicit API account fields instead.");
  } else if (workflow.behavior === "stale-route") {
    warnings.push("Observed as a stale/404 web route; do not automate from this URL.");
  }
  if (!workflow.safeToAutomate) warnings.push("Not safe to automate blindly. Keep this as read-first research or an approval-gated planner.");
  return {
    workflow,
    url,
    missingParams: [...missing],
    warnings
  };
}

export function buildOptionsStrategyOrderPlan(
  workflow: OptionsStrategyWorkflow,
  params: Record<string, string | undefined> = {}
): OptionsStrategyOrderPlan {
  const missing = new Set<string>();
  const order = fillTemplateValue(workflow.orderTemplate, params, missing);
  const lookupSteps = workflow.lookupSteps.map((step) => fillTemplateString(step, params, missing));
  const warnings = [
    "Dry-run plan only. Options orders require explicit account, current option instrument URLs, limit price, quantity, and Robinhood live-write gates before sending.",
    ...riskWarnings("write-mutate"),
    ...workflow.riskNotes
  ];
  if (workflow.aggressiveness === "aggressive") {
    warnings.push("Aggressive options posture: verify max loss, collateral/margin, assignment risk, liquidity, and expiration behavior before any live order.");
  }
  return {
    workflow,
    lookupSteps,
    order,
    reviewContract: buildOptionsQuantReviewContract(workflow),
    missingParams: [...missing],
    warnings,
    mode: "dry_run",
    risk: "write-mutate"
  };
}

function requireKnownValue<T extends string>(value: string | undefined, allowed: readonly T[], label: string): T | undefined {
  if (value === undefined || value === "") return undefined;
  const normalized = value.toLowerCase() as T;
  if (!allowed.includes(normalized)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return normalized;
}

function webUrl(path: string, query: Record<string, string | undefined> = {}): string {
  const url = new URL(path, "https://robinhood.com");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

function unescapeTemplatePlaceholders(value: string): string {
  return value.replace(/%7B/g, "{").replace(/%7D/g, "}");
}

function apiUrl(path: string, query: Record<string, string | undefined> = {}): string {
  const url = new URL(path, "https://api.robinhood.com");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  return unescapeTemplatePlaceholders(url.toString());
}

export function buildOptionsContractNavigationPlan(input: OptionsContractNavigationInput): OptionsContractNavigationPlan {
  const optionType = requireKnownValue(input.optionType, ["call", "put"], "option type");
  const side = requireKnownValue(input.side, ["buy", "sell"], "side");
  const positionEffect = requireKnownValue(input.positionEffect ?? "open", ["open", "close"], "position effect") ?? "open";
  const symbol = input.symbol?.trim().toUpperCase();
  const strike = input.strike?.trim();
  const expiration = input.expiration?.trim();
  const source = input.source?.trim() || "robinhood-cli-contract-plan";
  const missing = new Set<string>();
  for (const [key, value] of Object.entries({
    account_number: input.accountNumber,
    symbol,
    expiration,
    type: optionType,
    side,
    strike
  })) {
    if (!value) missing.add(key);
  }

  const chainPath = `/options/chains/${encodeURIComponent(symbol || "{symbol}")}`;
  const contractQuery = {
    account_number: input.accountNumber,
    expiration,
    expiration_date: expiration,
    expiration_dates: expiration,
    type: optionType,
    option_type: optionType,
    side,
    action: side,
    strike,
    strike_price: strike,
    position_effect: positionEffect,
    source
  };
  const optionInstrumentToken = input.optionInstrumentId || "{option_instrument_id}";
  const chainIdToken = input.chainId || "{chain_id}";
  const accountChainUrl = webUrl(chainPath, { account_number: input.accountNumber });
  const candidateContractUrl = webUrl(chainPath, contractQuery);
  const fragment = new URLSearchParams(
    Object.fromEntries(Object.entries(contractQuery).filter((entry): entry is [string, string] => Boolean(entry[1])))
  ).toString();
  const strategyQuoteType = side === "sell" ? "short" : "long";
  const strategyQuoteUrl = apiUrl("/marketdata/options/strategy/quotes/", {
    ids: optionInstrumentToken,
    ratios: "1",
    types: strategyQuoteType,
    include_all_sessions: "true"
  });
  const direction = side === "buy" ? "debit" : "credit";

  const webNavigation: OptionsContractNavigationPlan["webNavigation"] = [
    {
      id: "options-chain-account-shell",
      url: accountChainUrl,
      confidence: input.accountNumber ? "observed" : "candidate",
      purpose: "Open the Robinhood web options-chain shell with explicit account context."
    },
    {
      id: "options-chain-contract-query-candidate",
      url: candidateContractUrl,
      confidence: "candidate",
      purpose:
        "Probe whether web state accepts expiration/type/side/strike query params. The browser pass has not proven these keys."
    },
    {
      id: "options-chain-contract-fragment-candidate",
      url: `${accountChainUrl}#${fragment}`,
      confidence: "candidate",
      purpose: "Probe a fragment-state variant without changing the server-visible query string."
    }
  ];

  const apiResolutionSteps: OptionsContractNavigationPlan["apiResolutionSteps"] = [
    {
      id: "resolve-equity-instrument",
      method: "GET",
      url: apiUrl("/instruments/", { symbol }),
      purpose: "Resolve the equity instrument UUID if it was not supplied.",
      required: !input.equityInstrumentId
    },
    {
      id: "resolve-chain-by-symbol",
      method: "GET",
      url: apiUrl("/options/chains/", {
        account_number: input.accountNumber,
        underlying_symbol: symbol
      }),
      purpose: "Get chain ids available to the selected account and symbol.",
      required: !input.chainId
    },
    {
      id: "resolve-chain-by-equity-instrument",
      method: "GET",
      url: apiUrl("/options/chains/", {
        account_number: input.accountNumber,
        equity_instrument_id: input.equityInstrumentId || "{equity_instrument_id}"
      }),
      purpose: "Fallback chain lookup when symbol routing is ambiguous or for index/edge cases.",
      required: Boolean(input.equityInstrumentId) && !input.chainId
    },
    {
      id: "resolve-contracts-for-expiration-type",
      method: "GET",
      url: apiUrl("/options/instruments/", {
        account_number: input.accountNumber,
        chain_id: chainIdToken,
        expiration_dates: expiration,
        state: "active",
        type: optionType
      }),
      purpose: "Enumerate contracts for the selected expiration and call/put side; filter by exact strike_price.",
      required: !input.optionInstrumentId
    },
    {
      id: "quote-single-contract",
      method: "GET",
      url: apiUrl("/marketdata/options/", {
        ids: optionInstrumentToken,
        include_all_sessions: "true"
      }),
      purpose: "Fetch mark/bid/ask/greeks for the exact option instrument id.",
      required: true
    },
    {
      id: "quote-single-leg-strategy",
      method: "GET",
      url: strategyQuoteUrl,
      purpose: "Ask Robinhood for package pricing using the same ids/ratios/types shape used by spreads.",
      required: false
    },
    {
      id: "check-chain-collateral",
      method: "GET",
      url: apiUrl(`/options/chains/${encodeURIComponent(chainIdToken)}/collateral/`, {
        account_number: input.accountNumber
      }),
      purpose: "Check collateral/margin context before short or uncovered strategies.",
      required: side === "sell" || positionEffect === "close"
    },
    {
      id: "handoff-order-endpoint",
      method: "POST",
      url: "https://api.robinhood.com/options/orders/",
      purpose: "Dry-run handoff only; live send still requires exact approval and the ROBINHOOD_ALLOW_LIVE_WRITE=1 write switch.",
      required: true
    }
  ];

  return {
    mode: "dry_run",
    risk: "write-mutate",
    selector: {
      accountNumber: input.accountNumber,
      symbol,
      expiration,
      optionType,
      side,
      strike,
      positionEffect,
      chainId: input.chainId,
      equityInstrumentId: input.equityInstrumentId,
      optionInstrumentId: input.optionInstrumentId,
      optionPositionId: input.optionPositionId,
      aggregatePositionId: input.aggregatePositionId,
      optionOrderId: input.optionOrderId,
      source
    },
    webNavigation,
    queryParamCandidates: {
      account: ["account_number"],
      expiration: ["expiration", "expiration_date", "expiration_dates"],
      optionType: ["type", "option_type"],
      side: ["side", "action"],
      strike: ["strike", "strike_price"],
      positionEffect: ["position_effect"],
      source: ["source"]
    },
    apiResolutionSteps,
    exactMatchChecklist: [
      "account_number matches the intended Robinhood account in the selector and API response context",
      "symbol resolves to the intended equity_instrument_id",
      "chain_id belongs to the selected account and underlying",
      "expiration_dates equals the requested expiration",
      "type equals call or put exactly",
      "strike_price equals the requested strike after decimal normalization",
      "option instrument state is active/tradable for open orders, or position exists for close orders",
      "side and position_effect are explicit; do not infer buy-to-open, sell-to-open, buy-to-close, or sell-to-close",
      "marketdata/options quote id equals the selected option instrument id",
      "for any spread or strategy, every leg repeats the same account/chain/expiration verification"
    ],
    orderHandoff: {
      endpoint: "https://api.robinhood.com/options/orders/",
      strategyQuoteUrl,
      orderTemplate: {
        account: input.accountNumber ? `https://api.robinhood.com/accounts/${input.accountNumber}/` : "https://api.robinhood.com/accounts/{account_number}/",
        direction,
        legs: [
          {
            side,
            option: `https://api.robinhood.com/options/instruments/${optionInstrumentToken}/`,
            position_effect: positionEffect,
            ratio_quantity: 1
          }
        ],
        type: "limit",
        time_in_force: "{time_in_force}",
        trigger: "immediate",
        price: "{limit_price}",
        quantity: "{quantity}",
        ref_id: "{ref_id}"
      },
      requiredOrderParams: ["option_instrument_id", "limit_price", "quantity", "time_in_force", "ref_id"]
    },
    missingParams: [...missing],
    warnings: [
      "Dry-run planner only. This command opens nothing and sends no Robinhood order.",
      "Only account_number on the web options-chain shell is browser-observed. Expiration, strike, side, and type query keys are candidate probe keys, not proven URL state.",
      "For exact contracts, prefer API resolution: chains -> instruments filtered by expiration/type/strike -> marketdata/options -> strategy quote -> dry-run order body.",
      "Live options orders remain blocked unless exact user approval and ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional) are present.",
      ...riskWarnings("write-mutate")
    ],
    evidence: [
      {
        source: "api-map/account-context-browser-workflows-2026-06-02.json",
        finding: "The options-chain web shell accepted account_number as mixed account-context routing; exact contract fields were not encoded in the location bar."
      }
    ]
  };
}

export function buildOptionsContractLinkBundle(input: OptionsContractLinkBundleInput): OptionsContractLinkBundle {
  const navigationPlan = buildOptionsContractNavigationPlan(input);
  const selector = navigationPlan.selector;
  const source = selector.source || "robinhood-cli-contract-links";
  const chainId = selector.chainId;
  const optionInstrumentId = selector.optionInstrumentId;
  const optionInstrumentUrl =
    input.optionInstrumentUrl ??
    (optionInstrumentId ? `https://api.robinhood.com/options/instruments/${optionInstrumentId}/` : undefined);
  const farLimitOffset = input.farLimitOffset ?? 200;
  const accountScopedWebShell =
    navigationPlan.webNavigation.find((link) => link.id === "options-chain-account-shell")?.url ??
    webUrl(`/options/chains/${encodeURIComponent(selector.symbol || "{symbol}")}`, { account_number: selector.accountNumber });

  const quote = input.quote;
  const bid = finitePrice(quote?.bid);
  const ask = finitePrice(quote?.ask);
  const mark = finitePrice(quote?.mark);
  const last = finitePrice(quote?.last);
  const hasBidAsk = Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid && ask > 0;
  const naturalPrice =
    selector.side === "sell" ? firstFinite(bid, mark, last, ask) : firstFinite(ask, mark, last, bid);
  const midPrice = hasBidAsk ? (bid + ask) / 2 : firstFinite(mark, last, selector.side === "sell" ? bid : ask);
  const bidAskWidth = Number.isFinite(bid) && Number.isFinite(ask) ? ask - bid : Number.NaN;
  const normalizedQuote = quote
    ? {
        ...quote,
        naturalPrice: roundOptionMoney(naturalPrice),
        midPrice: roundOptionMoney(midPrice),
        bidAskWidth: roundOptionMoney(bidAskWidth)
      }
    : undefined;

  const appChainById = chainId
    ? `robinhood://option_chain?chain_id=${encodeURIComponent(chainId)}&source=${encodeURIComponent(source)}`
    : undefined;
  const webChainById = chainId
    ? `https://robinhood.com/option_chain?chain_id=${encodeURIComponent(chainId)}&source=${encodeURIComponent(source)}`
    : undefined;
  const browserAccountSwitcherChain = chainId
    ? `https://bonfire.robinhood.com/account_switcher/option_chain/${encodeURIComponent(chainId)}`
    : undefined;
  // VERIFIED 2026-06-03 (on-device): this DESKTOP web URL opens a working order ticket for the
  // exact contract (keyed only by the option_instrument_id — no expiration/strike/side in the URL).
  // Mobile Safari 404s (no app handoff). This is the closest thing to an exact-contract deep link.
  const webContractPageDesktop = optionInstrumentId
    ? `https://robinhood.com/options/instruments/${encodeURIComponent(optionInstrumentId)}/`
    : undefined;
  const webContractPageDesktopAccountPinned = optionInstrumentId && selector.accountNumber
    ? `https://robinhood.com/options/instruments/${encodeURIComponent(optionInstrumentId)}/?account_number=${encodeURIComponent(selector.accountNumber)}`
    : undefined;
  // Recognized app route but server/version-gated as of 2026-06-03 ("update app" on latest build).
  const appContractById = optionInstrumentId
    ? `robinhood://option?option_id=${encodeURIComponent(optionInstrumentId)}`
    : undefined;
  const candidateExactWebQueries = navigationPlan.webNavigation
    .filter((link) => link.confidence === "candidate")
    .map((link) => ({ id: link.id, url: link.url, confidence: "candidate" as const }));
  const exactApiResolutionProven = Boolean(
    selector.accountNumber &&
      selector.symbol &&
      selector.expiration &&
      selector.optionType &&
      selector.side &&
      selector.strike &&
      chainId &&
      optionInstrumentId
  );

  const warnings = [
    "Verified 2026-06-03 (on-device): the DESKTOP web contract page links.webContractPageDesktop (options/instruments/{option_instrument_id}/) opens a working order ticket for the exact contract. Mobile Safari 404s (no app handoff). The app scheme robinhood://option?option_id= is a recognized route but server/version-gated ('update app' on latest). The app option_chain deep link reads chain_id only (opens nearest-expiry ATM). No single URL preselects side+account across all platforms.",
    "This bundle is for dry-run navigation and webhook R&D. It does not send an order.",
    "Use the exact API contract id as the source of truth; use links only as navigation handoffs.",
    ...navigationPlan.warnings
  ];
  if (appChainById) {
    warnings.push("The app-scheme chain link is chain-id scoped, not proven exact-contract scoped.");
  }
  if (!exactApiResolutionProven) {
    warnings.push("Exact API resolution is incomplete until chain_id and option_instrument_id are present.");
  }
  if (normalizedQuote && Number.isFinite(normalizedQuote.bidAskWidth) && normalizedQuote.bidAskWidth > 1) {
    warnings.push(`Bid/ask width is wide (${normalizedQuote.bidAskWidth.toFixed(2)}); do not tighten pricing without a fresh quote.`);
  }

  return {
    mode: "dry_run",
    risk: "write-mutate",
    exactUiSelectionProven: false,
    exactApiResolutionProven,
    selector: {
      ...selector,
      underlyingInstrumentId: input.underlyingInstrumentId,
      optionInstrumentUrl,
      occSymbol: input.occSymbol
    },
    resolvedContract: {
      chainId,
      underlyingInstrumentId: input.underlyingInstrumentId,
      optionInstrumentId,
      optionInstrumentUrl,
      occSymbol: input.occSymbol
    },
    links: {
      accountScopedWebShell,
      appChainById,
      webChainById,
      browserAccountSwitcherChain,
      webContractPageDesktop,
      webContractPageDesktopAccountPinned,
      appContractById,
      candidateExactWebQueries
    },
    webhookHandoff: {
      recommendedFlow: [
        "Resolve symbol, account, expiration, option type, and strike through the API.",
        "Verify the returned option_instrument_id, OCC symbol, bid/ask/mark/Greeks, and expiration.",
        "Open the account-scoped web shell or chain-id app handoff for user navigation.",
        "If ordering is desired, build a dry-run options/orders body from the exact option_instrument_id; do not trust URL state as the order source."
      ],
      copyPastePrimary: appChainById ?? accountScopedWebShell,
      payload: {
        accountNumber: selector.accountNumber,
        symbol: selector.symbol,
        expiration: selector.expiration,
        optionType: selector.optionType,
        side: selector.side,
        strike: selector.strike,
        chainId,
        optionInstrumentId,
        optionInstrumentUrl,
        occSymbol: input.occSymbol,
        accountScopedWebShell,
        appChainById,
        webChainById
      }
    },
    quote: normalizedQuote,
    pricingControls: {
      naturalPrice: Number.isFinite(naturalPrice) ? roundOptionMoney(naturalPrice) : undefined,
      midPrice: Number.isFinite(midPrice) ? roundOptionMoney(midPrice) : undefined,
      safeSellProbeLimit: Number.isFinite(naturalPrice) ? roundOptionMoney(naturalPrice + farLimitOffset) : undefined,
      safeBuyProbeLimit: Number.isFinite(naturalPrice) ? roundOptionMoney(Math.max(0.01, naturalPrice - farLimitOffset)) : undefined,
      farLimitOffset,
      rule: "For sell/credit dry-run probes, use natural sell credit plus the far offset; for buy/debit probes, use max(0.01, natural debit minus the far offset)."
    },
    strategyQuoteUrl: input.strategyQuoteUrl,
    strategyQuote: input.strategyQuote,
    navigationPlan,
    warnings,
    evidence: [
      ...navigationPlan.evidence,
      {
        source: "app-link-route-research",
        finding:
          "External option-chain navigation accepts chain_id and source. Exact strike/expiration/side fields remain API-resolved, not proven external URL params."
      },
      {
        source: "api-map/browser-cdp-routes-2026-06-02.json",
        finding:
          "Browser-captured routes include account-context options chain APIs and an account_switcher/option_chain/{chain_uuid} surface useful for navigation research."
      }
    ]
  };
}

export function buildOptionsQuantReviewContract(workflow: OptionsStrategyWorkflow): OptionsQuantReviewContract {
  const intent = workflow.category === "position-management" ? "close" : "open";
  const requiredChecks = [
    "account context matches the selected account_number",
    "all option instrument ids resolve from the selected chain, expiration, type, and strike",
    "all legs have explicit side, position_effect, ratio_quantity, and quantity",
    "limit price is set; do not use market orders for strategy plans",
    "individual leg quotes are current; package quote is current for spreads/straddles/condors",
    "max profit, max loss, and breakevens are computed from the actual debit_or_credit",
    "net Greeks are summed over signed legs with the 100-share multiplier and unit labels",
    "liquidity is reviewed: bid/ask width, volume/open interest if available, and stale quote flags",
    "expiration risks are reviewed: 0DTE/near-expiration, assignment/exercise, and dividend events",
    "writes are dry-run unless exact approval and ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional) are present"
  ];
  if (workflow.requiresUnderlying) {
    requiredChecks.push("coverage is verified in the same account before treating the strategy as covered");
  }
  if (workflow.requiresMargin || workflow.aggressiveness === "aggressive") {
    requiredChecks.push("margin/collateral eligibility is explicitly verified; do not infer naked exposure");
  }
  if (!workflow.definedRisk) {
    requiredChecks.push("undefined or stock-like loss shape is explicitly acknowledged by strategy id and warning");
  }
  return {
    intent,
    requiredFields: [
      "account_number",
      "symbol",
      "chain_id",
      "expiration",
      "every leg option instrument id",
      "every strike",
      "side",
      "position_effect",
      "ratio_quantity",
      "quantity",
      "limit_price",
      "time_in_force",
      "ref_id"
    ],
    requiredChecks,
    greekMath: {
      contractMultiplier: 100,
      netDelta: "sum(side * delta * ratio_quantity * contracts * 100)",
      netGamma: "sum(side * gamma * ratio_quantity * contracts * 100)",
      netTheta: "sum(side * theta * ratio_quantity * contracts * 100)",
      netVega: "sum(side * vega * ratio_quantity * contracts * 100)",
      netRho: "sum(side * rho * ratio_quantity * contracts * 100)",
      unitRules: [
        "state whether Robinhood returned theta per day or model theta was converted from per-year",
        "state whether vega is broker-normalized per volatility point or model vega divided by 100",
        "state whether rho is broker-normalized per rate point or model rho divided by 100",
        "report local sensitivity separately from expiration payoff and max-loss math"
      ]
    },
    scenarioRows: [
      {
        id: "spot-plus-minus-1pct",
        purpose: "directional delta/gamma sanity check",
        formulaOrCheck: "approx_pnl = net_delta*dS + 0.5*net_gamma*dS^2"
      },
      {
        id: "iv-plus-minus-5vol",
        purpose: "long-vol versus short-vol check",
        formulaOrCheck: "approx_pnl contribution = net_vega*dIV"
      },
      {
        id: "one-calendar-day",
        purpose: "theta decay/accrual check",
        formulaOrCheck: "approx_pnl contribution = net_theta*1"
      },
      {
        id: "breakevens-at-expiration",
        purpose: "payoff graph consistency",
        formulaOrCheck: "expiration payoff equals zero at every listed breakeven"
      },
      {
        id: "max-loss-boundary",
        purpose: "defined-risk proof or undefined-risk flag",
        formulaOrCheck: "computed max_loss matches strategy payoff; undefined risk remains blocked without exact confirmation"
      }
    ],
    variantResolution: [
      {
        phrase: "sell a call",
        conservativeOrModeratePath: "sell-to-close-long-option, covered-call, or call-credit-spread",
        aggressivePath: "naked-short-call",
        rule: "ask which structure; never infer naked short-call exposure"
      },
      {
        phrase: "sell a put",
        conservativeOrModeratePath: "cash-secured-short-put or put-credit-spread",
        aggressivePath: "naked-short-put",
        rule: "verify cash collateral before calling it cash-secured"
      },
      {
        phrase: "covered short put",
        conservativeOrModeratePath: "cash-secured-short-put in common retail wording",
        aggressivePath: "covered-put, meaning short stock plus short put",
        rule: "show both candidates and require the user to choose the actual structure"
      },
      {
        phrase: "straddle or strangle",
        conservativeOrModeratePath: "long debit structure",
        aggressivePath: "short undefined-risk structure",
        rule: "ask long or short before planning legs"
      }
    ],
    hardBlockers: [
      "missing account_number",
      "missing option instrument id for any leg",
      "unclear open vs close position_effect",
      "aggressive/naked/undefined-risk strategy not explicitly requested by id",
      "coverage or collateral claim not verified in the same account",
      "strategy quote stale or missing for a multi-leg order",
      "missing limit_price, quantity, time_in_force, or ref_id",
      "any live write attempted without ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional)"
    ]
  };
}

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
  /** Arbitrary ?key=value query params appended AFTER route matching (parity with planCryptoRequest).
   *  The route map matches on the path, so query params are applied here — this is what lets a caller
   *  read e.g. discovery/lists/items/?list_id=... through `brokerage execute` instead of a one-off script. */
  query?: Record<string, string>;
  body?: unknown;
  dryRun?: boolean;
}): PlannedBrokerageRequest {
  const params = input.params ?? {};
  const missingParams: string[] = [];
  let url = input.route.url.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    // Alias-aware: a route's {account_number} token is satisfied by a legacy --param account=/num= and
    // vice-versa, so the standardized map and pre-rename callers both resolve.
    const value = resolveParamValue(params, name);
    if (value === undefined || value === "") {
      missingParams.push(name);
      return `{${name}}`;
    }
    return encodeURIComponent(value);
  });
  if (input.query && Object.keys(input.query).length > 0) {
    const parsed = new URL(url);
    for (const [k, v] of Object.entries(input.query)) parsed.searchParams.set(k, v);
    url = parsed.toString();
  }
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

export class AmbiguousRouteError extends Error {
  code = "AMBIGUOUS_ROUTE";
  candidates: string[];
  constructor(query: string, candidates: string[]) {
    super(
      `Ambiguous route: "${query}" matches ${candidates.length} different routes ` +
        `(${candidates.slice(0, 8).join(", ")}${candidates.length > 8 ? ", …" : ""}). ` +
        `Pass a more specific/exact URL — refusing to guess which one to act on.`
    );
    this.name = "AmbiguousRouteError";
    this.candidates = candidates;
  }
}

// ── Self-describing resolution + fail-loud hints (T3) ─────────────────────────────────────────────
// The route map should never fail silently. A miss returns a did-you-mean; a missing param names the
// exact token + an example; and `describeRoute` turns any URL into a self-documenting card (what it
// needs, what it returns — using the harvested `fields` — and which first-class command drives it).

/** The {placeholder} tokens a route URL requires, deduped, in order of appearance. */
export function routeTokens(url: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of url.matchAll(/\{([^}]+)\}/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

/** Length of the longest shared prefix between two strings. */
function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Closest routes to a query that didn't resolve — the did-you-mean behind fail-loud errors. Matches
 *  exact substrings first, then falls back to bidirectional containment / shared-prefix so a typo like
 *  "portfoliosss" still surfaces "portfolios/". */
export function suggestRoutes(query: string, routes: BrokerageRoute[] = loadBrokerageRoutes(), limit = 5): string[] {
  const nq = normalizeUrlTokens(query.toLowerCase()).replace(/^https?:\/\//, "");
  const qSegs = nq.split(/[/?&={}]+/).filter((s) => s.length > 2);
  const scored = routes
    .map((route) => {
      const ru = normalizeUrlTokens(route.url.toLowerCase()).replace(/^https?:\/\//, "");
      const rSegs = ru.split(/[/?&={}]+/).filter((s) => s.length > 2);
      let score = 0;
      for (const q of qSegs) {
        if (ru.includes(q)) { score += q.length; continue; } // exact substring — strongest
        let best = 0;
        for (const r of rSegs) {
          if (q.includes(r) || r.includes(q)) best = Math.max(best, Math.min(q.length, r.length));
          else { const p = sharedPrefix(q, r); if (p >= 4) best = Math.max(best, p); } // typo-tolerant
        }
        score += best;
      }
      return { url: route.url, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const uniq: string[] = [];
  for (const s of scored) {
    if (!uniq.includes(s.url)) uniq.push(s.url);
    if (uniq.length >= limit) break;
  }
  return uniq;
}

export interface RouteDescription {
  query: string;
  resolved: boolean;
  ambiguous?: string[];
  suggestions?: string[];
  url?: string;
  methods?: string[];
  risk?: RouteRisk;
  command?: string;
  requiredTokens?: string[];
  queryKeys?: string[];
  fields?: string[];
  fieldsSource?: BrokerageRoute["fieldsSource"];
  fieldsShape?: BrokerageRoute["fieldsShape"];
  warnings?: string[];
}

/** A self-describing view of a route: what it needs, what it returns, and the command that drives it. */
export function describeRoute(
  query: string,
  method?: string,
  routes: BrokerageRoute[] = loadBrokerageRoutes()
): RouteDescription {
  const matches = filterBrokerageRoutes(routes, { query });
  if (matches.length === 0) return { query, resolved: false, suggestions: suggestRoutes(query, routes) };
  let route: BrokerageRoute | undefined;
  try {
    route = selectRouteByQueryAndMethod(matches, query, method);
  } catch (e: any) {
    if (e instanceof AmbiguousRouteError) return { query, resolved: false, ambiguous: e.candidates };
    throw e;
  }
  if (!route) return { query, resolved: false, suggestions: suggestRoutes(query, routes) };
  return {
    query,
    resolved: true,
    url: route.url,
    methods: route.methods?.length ? route.methods : ["GET"],
    risk: route.risk,
    command: commandForRoute(route),
    requiredTokens: routeTokens(route.url),
    queryKeys: route.queryKeys ?? [],
    fields: route.fields ?? [],
    fieldsSource: route.fieldsSource,
    fieldsShape: route.fieldsShape,
    warnings: riskWarnings(route.risk)
  };
}

/** Fail-loud, actionable message for missing params on a resolved route. */
export function missingParamHint(url: string, missing: string[]): string {
  const tokens = routeTokens(url).map((t) => `{${t}}`).join(", ") || "none";
  const example = missing[0] ? ` Example: --param ${missing[0]}=<value>.` : "";
  return `Missing params for ${url}: ${missing.join(", ")}. Route tokens: ${tokens}.${example} (Legacy account aliases num=/account= are also accepted.)`;
}

/** Fail-loud "no match" message with did-you-mean candidates. */
export function noMatchHint(query: string, routes: BrokerageRoute[] = loadBrokerageRoutes()): string {
  const suggestions = suggestRoutes(query, routes);
  const tail = suggestions.length
    ? ` Did you mean: ${suggestions.join(" | ")}`
    : " No similar routes found — run `api-map directory` to browse by domain.";
  return `No brokerage route matched: ${query}.${tail}`;
}

/**
 * Resolve a single route from a match list, preferring an exact URL match and then the
 * method. Shared by the CLI and the MCP server so the two can never diverge on write safety
 * (they once did — the MCP copy silently degraded forced writes to GET while the CLI failed
 * closed; that divergence is exactly why this lives in one place now).
 *
 * Two ways this refuses to guess rather than pick the wrong route:
 *  - FAIL CLOSED on write verbs: a forced POST/PATCH/PUT/DELETE with no matching write route
 *    returns undefined, never silently degrades to the GET route at the wrong risk class.
 *    (Legacy entries without `methods` keep the permissive fallback so reads don't break.)
 *  - FAIL LOUD on ambiguity: a substring query like "orders/" matches many distinct routes
 *    across hosts/risk classes (read, write-mutate, destructive). Returning the first by JSON
 *    order is a silent mis-route — the documented #1 money-loss risk. If, after method
 *    filtering, the eligible set spans more than one distinct URL, throw AmbiguousRouteError
 *    with the candidate list instead of guessing pool[0].
 */
export function selectRouteByQueryAndMethod<T extends { url: string; methods?: string[] }>(
  matches: T[],
  query: string,
  method?: string
): T | undefined {
  const candidates = matches.filter((candidate) => candidate.url === query);
  const pool = candidates.length > 0 ? candidates : matches;
  let eligible = pool;
  if (method) {
    const requested = method.toUpperCase();
    const exact = pool.filter((candidate) => candidate.methods?.map((item) => item.toUpperCase()).includes(requested));
    if (exact.length > 0) {
      eligible = exact;
    } else {
      const isWrite = requested !== "GET" && requested !== "HEAD";
      if (isWrite && pool.some((candidate) => candidate.methods?.length)) return undefined;
      eligible = pool;
    }
  }
  if (eligible.length === 0) return undefined;
  const distinctUrls = [...new Set(eligible.map((candidate) => candidate.url))];
  if (distinctUrls.length > 1) throw new AmbiguousRouteError(query, distinctUrls);
  return eligible[0];
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
 * Live-write gate — single master switch.
 *
 * Writes go live ONLY when `ROBINHOOD_ALLOW_LIVE_WRITE=1` is present in the
 * environment. That one switch is the toggle: set it (locally it lives in `.env`
 * / the MCP server registration) and writes execute by default — no per-call
 * `--live-write` / `liveWrite:true` flag is required. With the switch unset (the
 * published / fresh-clone default) every write is forced to dry-run, so the tool
 * can never place a real order out of the box.
 *
 * `--dry-run` / `dryRun:true` always forces a preview, even when the switch is on
 * — the per-call escape hatch to inspect an exact live call without sending it.
 *
 * The legacy `liveWrite` field is still accepted (so existing callers/scripts keep
 * compiling and reading clearly) but is no longer required and no longer the gate:
 * the env switch is the single source of truth. Previously this required BOTH the
 * env var AND a per-call flag; the per-call flag is now optional.
 */
// ── Account lock: restrict live writes to an explicit allow-list (defense-in-depth) ──
// ROBINHOOD_ALLOWED_ACCOUNT="123,456" → only those accounts can be written live; any other is
// forced to dry-run even when the master switch is on (mirrors the official RH MCP's dedicated-
// account isolation). Unset / empty → no restriction (behavior unchanged).
export function parseAllowedAccounts(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ROBINHOOD_ALLOWED_ACCOUNT ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
export function isAccountAllowed(accountNumber: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const allow = parseAllowedAccounts(env);
  return allow.length === 0 || allow.includes(String(accountNumber).trim());
}

// Best-effort extraction of the target account from a write request body/params, so the
// account-lock engages even on generic writes (brokerage execute, options orders, settings)
// where the account isn't passed explicitly. Recognizes params (account_number/account/num) and
// body.account (the /accounts/{num}/ URL) or body.account_number. undefined when none is found —
// the lock then can't apply (e.g. account-less cancels), which is documented as a known gap.
export function accountFromWriteRequest(body?: unknown, params?: Record<string, string>): string | undefined {
  const p = params ?? {};
  for (const k of ["account_number", "account", "num"]) {
    const v = p[k];
    if (v != null && /^[0-9]+$/.test(String(v).trim())) return String(v).trim();
  }
  const b = body as any;
  if (b && typeof b === "object") {
    if (typeof b.account === "string") {
      const m = b.account.match(/\/accounts\/([^/]+)\//);
      if (m && m[1]) return String(m[1]).trim();
    }
    if (b.account_number != null) return String(b.account_number).trim();
  }
  return undefined;
}

// ── Notional caps: optional per-order and per-session dollar ceilings for LIVE sends ──
// ROBINHOOD_MAX_ORDER_DOLLARS / ROBINHOOD_MAX_SESSION_DOLLARS (both default-disabled). A live order
// whose notional exceeds the per-order cap, or would push cumulative session spend past the session
// cap, throws NotionalCapError unless overridden. Dry-runs/previews are never blocked.
let sessionNotionalSpent = 0;
export function getSessionNotionalSpent(): number { return sessionNotionalSpent; }
export function resetSessionNotionalSpent(): void { sessionNotionalSpent = 0; }
export class NotionalCapError extends Error {
  constructor(message: string) { super(message); this.name = "NotionalCapError"; }
}
export function checkNotionalCaps(notionalDollars: number, opts: { override?: boolean; env?: NodeJS.ProcessEnv } = {}): void {
  if (opts.override) return;
  const env = opts.env ?? process.env;
  const perOrder = Number(env.ROBINHOOD_MAX_ORDER_DOLLARS);
  if (Number.isFinite(perOrder) && perOrder > 0 && notionalDollars > perOrder) {
    throw new NotionalCapError(`Order notional $${notionalDollars.toFixed(2)} exceeds ROBINHOOD_MAX_ORDER_DOLLARS=$${perOrder.toFixed(2)}. Raise the cap or pass overrideCap to bypass.`);
  }
  const perSession = Number(env.ROBINHOOD_MAX_SESSION_DOLLARS);
  if (Number.isFinite(perSession) && perSession > 0 && sessionNotionalSpent + notionalDollars > perSession) {
    throw new NotionalCapError(`This order ($${notionalDollars.toFixed(2)}) would push session spend to $${(sessionNotionalSpent + notionalDollars).toFixed(2)}, over ROBINHOOD_MAX_SESSION_DOLLARS=$${perSession.toFixed(2)}. Raise the cap or pass overrideCap to bypass.`);
  }
}
export function recordSessionNotional(notionalDollars: number): void {
  if (Number.isFinite(notionalDollars) && notionalDollars > 0) sessionNotionalSpent += notionalDollars;
}

export function resolveLiveWriteGate(input: {
  risk: RouteRisk;
  dryRun: boolean;
  /** Legacy/optional: retained for back-compat. The env switch is the real gate. */
  liveWrite?: boolean;
  /** HTTP method — when it's a write verb, the gate engages even if `risk` is mis-classified as read. */
  method?: string;
  /** Target account — when set and ROBINHOOD_ALLOWED_ACCOUNT excludes it, the live write is forced to dry-run. */
  accountNumber?: string;
  env?: NodeJS.ProcessEnv;
}): LiveWriteGate {
  const env = input.env ?? process.env;
  // VERB FLOOR: a write verb (anything but GET/HEAD) is treated as a write regardless of the route's
  // hand-classified risk. This closes the hole where a route mis-labeled "read" but called with POST
  // would skip the gate entirely. risk-based write-detection still applies for legacy method-less routes.
  const m = input.method?.toUpperCase();
  const methodIsWrite = m !== undefined && m !== "GET" && m !== "HEAD";
  const isWrite = riskIsWrite(input.risk) || methodIsWrite;
  // Explicit per-call preview, or a plain read: never sends.
  if (input.dryRun || !isWrite) {
    return { allowed: true, forcedDryRun: false };
  }
  // ACCOUNT LOCK: a live write to an account NOT on ROBINHOOD_ALLOWED_ACCOUNT is forced to dry-run
  // even with the master switch on — defense-in-depth account isolation. Unset list → no restriction.
  if (input.accountNumber !== undefined && !isAccountAllowed(input.accountNumber, env)) {
    return {
      allowed: false,
      forcedDryRun: true,
      reason: `Account ${input.accountNumber} is not in ROBINHOOD_ALLOWED_ACCOUNT (${parseAllowedAccounts(env).join(", ") || "empty"}) — forced to dry-run even with the live switch on. Add it to the allow-list to write live to it.`
    };
  }
  // Single master switch: ROBINHOOD_ALLOW_LIVE_WRITE=1 turns live writes ON by default,
  // with no per-call flag required. Pass --dry-run / dryRun:true to preview instead.
  if (env.ROBINHOOD_ALLOW_LIVE_WRITE === "1") {
    return { allowed: true, forcedDryRun: false };
  }
  // Switch off → writes are forced to dry-run (the safe default for the published tool).
  return {
    allowed: false,
    forcedDryRun: true,
    reason:
      "Live writes are OFF — forced to dry-run. Turn them on by setting ROBINHOOD_ALLOW_LIVE_WRITE=1 in the environment (locally it lives in .env / the MCP registration). Pass --dry-run / dryRun:true to preview a single call even when live writes are on."
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
      return ["Destructive route. Dry-run by default; a live write needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional)."];
    case "write-mutate":
      return ["Write route. Dry-run by default; a live write needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional)."];
    case "write-safe":
      return ["Non-account-state write route such as telemetry or acknowledgement. Dry-run by default; a live write needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional)."];
    case "write-or-sensitive":
      return ["Potential write or highly sensitive route. Dry-run by default; a live write needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional)."];
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
export function resolveBash(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  // Explicit, absolute override (validated) — never PATH-resolve on a token-handling path.
  const override = env.ROBINHOOD_BASH_PATH;
  if (override) {
    if (!isAbsolute(override)) throw new Error(`ROBINHOOD_BASH_PATH must be an ABSOLUTE path (got: ${override}) — never PATH-resolve bash on a token-handling path.`);
    if (existsSync(override)) return override;
    throw new Error(`ROBINHOOD_BASH_PATH is set but not found: ${override}`);
  }
  if (platform === "win32") {
    // git-bash on Windows: try the standard Git install path first,
    // then fall back to the MSYS2 /bin/bash (resolvable when running inside bash).
    const candidates = [
      "C:/Program Files/Git/usr/bin/bash.exe",
      "C:/Program Files/Git/bin/bash.exe",
      "/bin/bash",
      "/usr/bin/bash",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    // SECURITY: never fall back to a bare "bash" (PATH-resolved) on this token-handling path —
    // an attacker who can prepend a dir to PATH could plant a bash.exe that exfiltrates the
    // brokerage token being written. Fail loud instead.
    throw new Error(
      "Cannot locate a trusted bash (Git for Windows not found at the standard paths). " +
      "Install Git for Windows, or set ROBINHOOD_BASH_PATH to an absolute bash.exe path."
    );
  }
  return "/bin/bash";
}

// Read the brokerage token straight from the on-disk .env (NOT process.env). A long-
// running server (the MCP) loads .env once at import; if the file is refreshed out-of-band
// — a peer sync, a separate `auth:refresh`, another process — only a disk re-read sees it.
// Optional path for testability; defaults to the repo .env.
export function tokenFromEnvFile(envPath: string = join(repoRoot(), ".env")): string | undefined {
  try {
    if (!existsSync(envPath)) return undefined;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (t.startsWith("ROBINHOOD_BROKERAGE_TOKEN=")) {
        const val = t.slice("ROBINHOOD_BROKERAGE_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
        return val || undefined;
      }
    }
  } catch {
    // unreadable file is non-fatal
  }
  return undefined;
}

// Obtain a brokerage token fresher than `current`, cheapest path first:
//   1) re-read the .env file — catches an out-of-band refresh on a long-running process
//      and works on a headless box with no logged-in Chrome (the systematic-staleness fix);
//   2) mint one from THIS machine's logged-in Chrome via refresh-auth.sh, then re-read.
// Returns undefined when nothing fresher exists (caller keeps the 401 + surfaces the hint).
// scrape:false (tests / injected-fetch paths) skips the Chrome subprocess but still re-reads disk.
export function refreshBrokerageToken(
  current?: string,
  opts: { scrape?: boolean; envPath?: string } = {}
): string | undefined {
  const envPath = opts.envPath ?? join(repoRoot(), ".env");
  const onDisk = tokenFromEnvFile(envPath);
  if (onDisk && onDisk !== current) return onDisk;
  if (opts.scrape === false) return undefined;
  try {
    const script = join(repoRoot(), "scripts", "refresh-auth.sh");
    if (!existsSync(script)) return undefined;
    execFileSync(resolveBash(), [script], { stdio: "ignore", timeout: 30000 });
    const minted = tokenFromEnvFile(envPath);
    if (minted && minted !== current) return minted;
  } catch {
    // refresh unavailable on this machine (no logged-in Chrome, no bash/python) —
    // caller keeps the 401 and surfaces the honest hint.
  }
  return undefined;
}

export type RobinhoodErrorKind =
  | "rate_limited"
  | "overnight_buying_power"
  | "insufficient_buying_power"
  | "below_min_tick"
  | "otc_market_order"
  | "app_version_gate"
  | "unauthorized"
  | "not_found"
  | "bad_request"
  | "ok"
  | "unknown";

export interface RobinhoodErrorClassification {
  kind: RobinhoodErrorKind;
  status: number;
  detail: string;
  retryable: boolean;
  /** Server-directed cooldown in ms for rate limits (parsed from body / Retry-After), else undefined. */
  retryAfterMs?: number;
  /** One-line operator-facing remedy. */
  hint?: string;
}

/**
 * Map a Robinhood HTTP response (status + body text + headers) to a single error taxonomy.
 * Centralizes the patterns that were scattered across scripts/call-sites (429 burst limit,
 * overnight-BP, min-tick, OTC reject, app-version gate) so retry/recovery/messaging is uniform
 * and testable. Pure — no I/O. Use for both human messaging and programmatic retry decisions.
 */
export function classifyRobinhoodError(status: number, bodyText: string, headers?: Headers): RobinhoodErrorClassification {
  if (status >= 200 && status < 300) return { kind: "ok", status, detail: "", retryable: false };
  const body = (bodyText || "").toString();
  const lower = body.toLowerCase();
  const detail = (() => {
    try {
      const j = JSON.parse(body);
      return String(j.detail ?? (Array.isArray(j.non_field_errors) ? j.non_field_errors.join("; ") : "") ?? j.reject_reason ?? "").trim() || body.slice(0, 200);
    } catch {
      return body.slice(0, 200);
    }
  })();
  if (status === 429 || lower.includes("too many requests") || lower.includes("rate limit")) {
    const retryHeader = Number(headers?.get?.("retry-after"));
    const m = /(\d+)\s*second/.exec(body);
    const secs = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : m ? parseInt(m[1], 10) : 30;
    return { kind: "rate_limited", status, detail, retryable: true, retryAfterMs: Math.min(120, secs + 2) * 1000, hint: `Rate-limited; wait ${secs}s and retry the SAME ref_id (nothing was placed).` };
  }
  if (lower.includes("overnight buying power")) return { kind: "overnight_buying_power", status, detail, retryable: false, hint: "GTC option opens are gated by OVERNIGHT buying power, not regular BP. Use a day order or fund the account." };
  if (lower.includes("buying power") || lower.includes("not enough") || lower.includes("only purchase 0")) return { kind: "insufficient_buying_power", status, detail, retryable: false, hint: "Insufficient buying power for this order size." };
  if (lower.includes("min tick") || lower.includes("does not satisfy")) return { kind: "below_min_tick", status, detail, retryable: false, hint: "Price below the chain cutoff must use below_tick (read options/chains/{id} min_ticks; often $0.05)." };
  if (lower.includes("market order") && (lower.includes("otc") || lower.includes("not eligible"))) return { kind: "otc_market_order", status, detail, retryable: false, hint: "OTC names reject market/fractional orders — use whole shares + a marketable limit." };
  if (lower.includes("app version") || lower.includes("important stock trading updates")) return { kind: "app_version_gate", status, detail, retryable: false, hint: "Equity orders need order_form_version:7 + the web headers (the engine sends these). If Robinhood rotated the web build, set ROBINHOOD_WEB_APP_VERSION to the current x-robinhood-web-app-version header (grab it from any logged-in robinhood.com request) and retry." };
  if (status === 401 || status === 403) return { kind: "unauthorized", status, detail, retryable: status === 401, hint: status === 401 ? "401 — brokerage token rejected. `pnpm auth:refresh` reads a logged-in robinhood.com Chrome session ON THIS machine and rewrites .env; if this box has no Robinhood login, sync a fresh .env onto it. The engine re-reads .env on a 401, so an updated file is picked up without a restart." : "Forbidden (entitlement/permission)." };
  if (status === 404) return { kind: "not_found", status, detail, retryable: false };
  if (status === 400) return { kind: "bad_request", status, detail, retryable: false };
  return { kind: "unknown", status, detail, retryable: false };
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
    options.autoRefresh !== false
  ) {
    const fresh = refreshBrokerageToken(undefined, { scrape: options.fetchImpl === undefined, envPath: options.envPath });
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
    // Present as the Robinhood WEB app. The legacy mobile identity ("robinhood-cli/0.1")
    // trips the equity-order client-version gate ("Your app version is missing important
    // stock trading updates. You can still place orders on the web."). These web headers
    // (captured live 2026-06-03) clear that gate. Versions rotate — override via env.
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      "user-agent": process.env.ROBINHOOD_USER_AGENT ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      origin: "https://robinhood.com",
      referer: "https://robinhood.com/",
      "x-robinhood-api-version": process.env.ROBINHOOD_API_VERSION ?? "1.431.4",
      // Fallback rotates with Robinhood's web builds — refresh via `pnpm version:refresh`
      // (CDP-scrapes the login page; no auth needed) or set ROBINHOOD_WEB_APP_VERSION.
      "x-robinhood-web-app-version": process.env.ROBINHOOD_WEB_APP_VERSION ?? "2026.24.3589+55c48b8f7a1c",
      "x-hyper-ex": "enabled"
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

  let currentToken = token;
  let response = await send(currentToken);

  // A 401 means the token expired and the request was rejected (never executed),
  // so retrying after a refresh is safe even for writes. Only self-heal real token
  // auth — skip for cookie-only or injected test fetch impls.
  if (
    response.status === 401 &&
    token &&
    options.autoRefresh !== false
  ) {
    // Re-read the .env file first — an out-of-band refresh / peer sync may have written a
    // fresh token that this long-running process never loaded — then fall back to a local
    // Chrome scrape. The disk re-read runs even with an injected fetch; the scrape does not.
    const fresh = refreshBrokerageToken(token, { scrape: options.fetchImpl === undefined, envPath: options.envPath });
    if (fresh && fresh !== token) {
      process.env.ROBINHOOD_BROKERAGE_TOKEN = fresh;
      currentToken = fresh;
      response = await send(fresh);
    }
  }

  let text = await response.text();

  // In-engine 429 retry. Robinhood burst-limits orders (~9 fractional, then 429 ~48s). A 429 means
  // the request was rejected before execution, so retrying the SAME request (same body/ref_id) after
  // the server-directed cooldown is idempotent and safe even for writes. Bounded; skipped for injected
  // test fetch impls and when autoRetry:false. Uses classifyRobinhoodError to read the cooldown.
  if (options.autoRetry !== false) {
    const sleep = options.sleepImpl ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const maxRetries = options.maxRateLimitRetries ?? 3;
    let attempts = 0;
    while (response.status === 429 && attempts < maxRetries) {
      attempts++;
      const cls = classifyRobinhoodError(429, text, response.headers);
      await sleep(cls.retryAfterMs ?? 32000);
      response = await send(currentToken);
      text = await response.text();
    }
  }
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

/**
 * GET a mapped brokerage route and return parsed JSON. Resolves the route (GET), substitutes path
 * params, applies extra query params, and throws on non-200. Shared by the CLI and the MCP server so
 * the live-read layer can't diverge (it was duplicated in both before). Reads only — no write gate.
 */
export async function brokerageGetJson(
  url: string,
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  options: ExecuteBrokerageOptions = {}
): Promise<any> {
  const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: url });
  const route = selectRouteByQueryAndMethod(matches, url, "GET");
  if (!route) throw new Error(`${noMatchHint(url)} (rebuild the map after edits — AGENTS.md §3.)`);
  const plan = planBrokerageRequest({ route, method: "GET", params, dryRun: false });
  if (plan.missingParams.length > 0) {
    throw new Error(missingParamHint(url, plan.missingParams));
  }
  if (Object.keys(query).length > 0) {
    const parsed = new URL(plan.url);
    for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value);
    plan.url = parsed.toString();
  }
  const result = await executeBrokerageRequest(plan, { dryRun: false, fullBody: true, ...options });
  if (result.status !== 200) throw new Error(`${result.status} ${result.statusText} for ${plan.url}`);
  return JSON.parse(result.body || "{}");
}

/**
 * Paginated read: follows Robinhood's `next` cursor and returns ALL `results` across pages.
 *
 * Robinhood list endpoints (notably `options/instruments/`) page at ~100 rows and expose a
 * `next` URL carrying a `cursor` param. Reading only page 1 silently truncates wide chains —
 * e.g. a SPY LEAPS chain returns the lowest ~100 strikes and DROPS every at/above-the-money
 * strike, which breaks both enumeration and single-strike/leg resolution. We can't re-feed the
 * raw `next` URL to brokerageGetJson (it builds the request from the route template, not the
 * passed URL), so we extract the `cursor` and re-issue the same route+params with `+cursor`.
 */
export async function brokerageGetAllResults(
  url: string,
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  options: ExecuteBrokerageOptions & { maxPages?: number } = {}
): Promise<any[]> {
  const maxPages = options.maxPages ?? 50;
  const all: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const pageQuery = cursor ? { ...query, cursor } : query;
    const data = await brokerageGetJson(url, params, pageQuery, options);
    if (Array.isArray(data?.results)) all.push(...data.results);
    const next: string | undefined = data?.next ?? undefined;
    if (!next) return all;
    try {
      cursor = new URL(next).searchParams.get("cursor") ?? undefined;
    } catch {
      cursor = undefined;
    }
    if (!cursor) return all; // unparseable/missing cursor — stop rather than loop forever
  }
  return all; // hit maxPages guard; return what we have (caller decides if that's suspicious)
}

/** Non-throwing brokerageGetJson — returns {ok:false,error} instead of throwing. */
export async function tryBrokerageGetJson(
  url: string,
  params: Record<string, string> = {},
  query: Record<string, string> = {}
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await brokerageGetJson(url, params, query) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

// ───────────────────── Shared account-graph + marketdata helpers (CLI + MCP) ─────────────────────
// Hoisted out of the CLI so the order engine AND the MCP surface share ONE implementation (the parity
// invariant — a helper that lives in only one front-end is exactly how the owned-account guard ended
// up protecting CLI buys but not the placeEquityOrder both surfaces call). Every fetcher takes an
// injectable getJson so it's unit-testable without network. Zayd Khan // cold // www.zayd.wtf

export interface OwnedAccounts {
  numbers: Set<string>;
  labels: Map<string, string>;
}

let _ownedAccountsCache: OwnedAccounts | null = null;

/** Test-only: clear the process-global owned-accounts cache between cases. */
export function __resetOwnedAccountsCache(): void {
  _ownedAccountsCache = null;
}

/**
 * Resolve the COMPLETE set of trading accounts the token owns (transfer/accounts/ — the full graph;
 * the bare accounts/ under-reports). Cached per-process. Returns null when the lookup itself fails,
 * so a transient/offline read WARNS rather than wedging every write.
 */
export async function loadOwnedAccounts(
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<OwnedAccounts | null> {
  if (_ownedAccountsCache) return _ownedAccountsCache;
  const getJson = deps.getJson ?? brokerageGetJson;
  try {
    const graph = await getJson("https://bonfire.robinhood.com/transfer/accounts/");
    const rows: any[] = Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : [];
    const numbers = new Set<string>();
    const labels = new Map<string, string>();
    for (const a of rows) {
      if (a?.type !== "rhs" && a?.type !== "ira_roth") continue; // trading accounts only
      if (!a.account_number) continue;
      numbers.add(String(a.account_number));
      labels.set(String(a.account_number), a.account_name || a.display_title || "");
    }
    if (numbers.size === 0) return null;
    _ownedAccountsCache = { numbers, labels };
    return _ownedAccountsCache;
  } catch {
    return null;
  }
}

/**
 * Refuse a write to an account the token doesn't own — the #1 money-loss defense (a typo'd or
 * hallucinated account number otherwise templates straight into a live order body). Throws on a
 * CONFIRMED-unowned account; WARNS (returns undefined) when the ownership lookup itself failed, so an
 * offline / mid-refresh read can't block every write. Returns the account label on success.
 */
export async function assertAccountOwned(
  accountNumber: string | undefined,
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<string | undefined> {
  if (!accountNumber) return undefined; // account-less call (e.g. panic across all accounts) — nothing to validate
  const owned = await loadOwnedAccounts(deps);
  if (!owned) {
    process.stderr.write(
      `⚠️  Could not verify account ${accountNumber} against your owned accounts (lookup failed). Proceeding — double-check the number.\n`
    );
    return undefined;
  }
  if (!owned.numbers.has(String(accountNumber))) {
    throw new Error(
      `Account ${accountNumber} is not one of your trading accounts (${[...owned.numbers].map((nm) => "…" + nm.slice(-4)).join(", ")}). ` +
        `Refusing to act on an unowned/typo'd account.`
    );
  }
  return owned.labels.get(String(accountNumber)) || "";
}

/** Fetch equity marketdata quotes for many instrument ids, chunked (≤40/req) to keep URLs bounded. */
export async function fetchQuotes(
  instrumentIds: string[],
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<Map<string, any>> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const quotes = new Map<string, any>();
  const chunkSize = 40;
  for (let i = 0; i < instrumentIds.length; i += chunkSize) {
    const data = await getJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", {
      ids: instrumentIds.slice(i, i + chunkSize).join(",")
    });
    for (const row of data.results ?? []) {
      if (row?.instrument_id) quotes.set(row.instrument_id, row);
    }
  }
  return quotes;
}

/** Fetch option marketdata for many option instrument ids, chunked (≤40/req). */
export async function fetchOptionMarks(
  ids: string[],
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<Map<string, any>> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const marks = new Map<string, any>();
  const chunkSize = 40;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const data = await getJson("https://api.robinhood.com/marketdata/options/?ids={ids}", {
      ids: ids.slice(i, i + chunkSize).join(",")
    });
    for (const row of data.results ?? []) {
      if (row?.instrument_id) marks.set(row.instrument_id, row);
    }
  }
  return marks;
}

export interface PortfolioPnlOptions {
  by?: "underlying" | "account" | "position";
  window?: "day" | "after-hours" | "both";
  accountNumber?: string;
  top?: number;
}

/**
 * Composed portfolio P&L across all owned accounts — the SHARED engine for the CLI `portfolio`
 * command and the MCP `robinhood_portfolio` tool (single source per the alignment invariant; the CLI
 * just renders this object, MCP returns it as JSON). Metrics agents get wrong, pinned here:
 *   after-hours Δ = extended_hours_equity − equity        (NOT − previous_close; that's the full day)
 *   day Δ         = equity − adjusted_equity_previous_close (equity_previous_close is "0" per-account)
 * Per-position $ drivers: equity day = qty×(last − adjusted_previous_close), AH = qty×(ext − last);
 * option day = (adjusted_mark − previous_close)×100×qty, AH = 0 (options don't print after-hours —
 * mark−last is mid-drift; the account-level extended_hours_equity already captures real index-option AH).
 * Returns a unit-explicit object; never throws on a per-account read failure (degrades + flags).
 */
export async function computePortfolioPnl(
  opts: PortfolioPnlOptions = {},
  deps: { getJson?: typeof brokerageGetJson; getAll?: typeof brokerageGetAllResults } = {}
): Promise<any> {
  // Injectable fetchers default to the real engine (prod), overridable for tests (golden fixtures).
  const getJson = deps.getJson ?? brokerageGetJson;
  const getAll = deps.getAll ?? brokerageGetAllResults;
  const n = (v: unknown) => Number(v);
  const window = opts.window ?? "both";
  // 1. Accounts — transfer/accounts/ is the COMPLETE graph; trading accounts only.
  const graph = await getJson("https://bonfire.robinhood.com/transfer/accounts/");
  const rows: any[] = Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : [];
  const rhLabels = new Map<string, string>();
  let accts: string[] = [];
  for (const a of rows) {
    if (a?.type !== "rhs" && a?.type !== "ira_roth") continue;
    if (!a.account_number) continue;
    accts.push(String(a.account_number));
    rhLabels.set(String(a.account_number), a.account_name || a.display_title || "");
  }
  if (opts.accountNumber) {
    if (!accts.includes(String(opts.accountNumber)))
      throw new Error(`Account ${opts.accountNumber} is not one of your trading accounts (${accts.map((x) => "…" + x.slice(-4)).join(", ")}).`);
    accts = [String(opts.accountNumber)];
  }
  // Optional gitignored nickname overlay (local/accounts.local.json).
  const localLabels = new Map<string, string>();
  for (const rel of ["local/accounts.local.json", "accounts.local.json"]) {
    try {
      const obj = JSON.parse(readFileSync(join(repoRoot(), rel), "utf8"));
      for (const [k, v] of Object.entries(obj)) localLabels.set(String(k), String(v));
      break;
    } catch { /* try next */ }
  }
  const labelFor = (acct: string) => {
    const l4 = acct.slice(-4);
    return localLabels.get(acct) || localLabels.get("…" + l4) || localLabels.get(l4) || rhLabels.get(acct) || `…${l4}`;
  };

  // 2. Per-account top-line + raw positions + buying power, in parallel; a failure degrades to a warning.
  const perAccount = await Promise.all(accts.map(async (acct) => {
    const a: any = { acct, label: labelFor(acct), equity: Number.NaN, day: Number.NaN, afterHours: Number.NaN, buyingPower: Number.NaN, equityPositions: [], optionPositions: [], warnings: [] as string[] };
    try {
      const p = await getJson("https://api.robinhood.com/portfolios/{account_number}/", { account_number: acct });
      const equity = n(p.equity), ext = n(p.extended_hours_equity);
      const adjPrev = n(p.adjusted_equity_previous_close), rawPrev = n(p.equity_previous_close);
      const prevClose = Number.isFinite(adjPrev) && adjPrev !== 0 ? adjPrev : (Number.isFinite(rawPrev) && rawPrev !== 0 ? rawPrev : Number.NaN);
      a.equity = equity;
      a.afterHours = Number.isFinite(ext) && Number.isFinite(equity) ? ext - equity : Number.NaN;
      a.day = Number.isFinite(equity) && Number.isFinite(prevClose) ? equity - prevClose : Number.NaN;
    } catch (e: any) { a.warnings.push(`portfolio read failed (${acct}): ${(e as Error).message.slice(0, 50)}`); }
    try {
      const bp = await getJson("https://api.robinhood.com/accounts/{num}/buying_power_breakdown", { num: acct });
      a.buyingPower = n(bp.buying_power);
    } catch { /* buying power is best-effort; degrade silently */ }
    try {
      const eq = await getAll("https://api.robinhood.com/positions/", {}, { nonzero: "true", account_number: acct });
      a.equityPositions = eq.filter((x: any) => n(x.quantity) > 0).map((x: any) => ({ symbol: x.symbol, iid: x.instrument_id, qty: n(x.quantity) }));
    } catch { a.warnings.push(`equity positions read failed (${acct})`); }
    try {
      const od = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
      a.optionPositions = od.filter((x: any) => n(x.quantity) > 0).map((x: any) => ({ symbol: x.symbol, name: `${x.symbol} ${x.detail_display_name ?? x.strategy ?? ""}`.trim(), oid: x.legs?.[0]?.option_id, qty: n(x.quantity), underlyingType: x.underlying_type ?? null }));
    } catch { a.warnings.push(`option positions read failed (${acct})`); }
    return a;
  }));

  // 3. Batch quotes + option marks across all accounts (one ticker quoted once).
  const allEqIds = [...new Set(perAccount.flatMap((a) => a.equityPositions.map((p: any) => p.iid).filter(Boolean)))];
  const allOptIds = [...new Set(perAccount.flatMap((a) => a.optionPositions.map((p: any) => p.oid).filter(Boolean)))];
  const fetchMap = async (url: string, ids: string[]) => {
    const map = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 40) {
      const data = await getJson(url, { ids: ids.slice(i, i + 40).join(",") });
      for (const r of data.results ?? []) if (r?.instrument_id) map.set(r.instrument_id, r);
    }
    return map;
  };
  // The batch quote/marks fetch must NOT take down the whole command — the account top-line is fully
  // computable from portfolios/{num}/ alone. Degrade per-name drivers to a warning on any failure.
  const globalWarnings: string[] = [];
  let quotes = new Map<string, any>(), marks = new Map<string, any>();
  try { if (allEqIds.length) quotes = await fetchMap("https://api.robinhood.com/marketdata/quotes/?ids={ids}", allEqIds); }
  catch (e: any) { globalWarnings.push(`equity quotes batch failed — per-name drivers degraded; account top-line is authoritative (${(e as Error).message.slice(0, 50)})`); }
  try { if (allOptIds.length) marks = await fetchMap("https://api.robinhood.com/marketdata/options/?ids={ids}", allOptIds); }
  catch (e: any) { globalWarnings.push(`option marks batch failed — option drivers degraded (${(e as Error).message.slice(0, 50)})`); }

  // 3b. WINDOW COHERENCE (the pre-open $0-options bug). Between a session close and the next open,
  // marketdata/options/ rolls previous_close_price to the JUST-COMPLETED session while equity quotes
  // (and the portfolios/ top-line) still measure that session's move. Result: every option attributes
  // exactly $0 and the whole options bleed lands in "residual". Detect the mismatch from the feeds'
  // own previous_close_date stamps (no clock/TZ guessing, holiday-proof) and re-anchor option "previous"
  // to the close BEFORE the last completed session via batch daily historicals.
  const eqPrevDates = [...new Set([...quotes.values()].map((q: any) => q?.previous_close_date).filter(Boolean).map(String))].sort();
  const optPrevDates = [...new Set([...marks.values()].map((m: any) => m?.previous_close_date).filter(Boolean).map(String))].sort();
  const eqPrevDate = eqPrevDates.at(-1) ?? null;
  const optPrevDate = optPrevDates.at(-1) ?? null;
  const betweenSessions = Boolean(eqPrevDate && optPrevDate && optPrevDate > eqPrevDate);
  const optPrevOverride = new Map<string, number>();
  if (betweenSessions && allOptIds.length) {
    try {
      for (let i = 0; i < allOptIds.length; i += 40) {
        const data = await getJson("https://api.robinhood.com/marketdata/options/historicals/?ids={ids}&interval={interval}&span={span}",
          { ids: allOptIds.slice(i, i + 40).join(","), interval: "day", span: "week" });
        for (const r of data.results ?? []) {
          // Batch historicals results carry `id` + `instrument` URL, NOT `instrument_id` (live-verified 2026-06-11).
          const key = r?.instrument_id ?? r?.id ?? String(r?.instrument ?? "").split("/").filter(Boolean).pop();
          if (!key) continue;
          const dps = (r.data_points ?? r.historicals ?? []).filter((d: any) => String(d.begins_at).slice(0, 10) <= String(eqPrevDate));
          const close = dps.length ? Number(dps[dps.length - 1].close_price) : Number.NaN;
          if (Number.isFinite(close)) optPrevOverride.set(String(key), close);
        }
      }
      if (!optPrevOverride.size)
        globalWarnings.push("option historicals re-anchor returned no usable closes — option day drivers may read $0 between sessions");
    } catch (e: any) {
      globalWarnings.push(`option historicals re-anchor failed — option day drivers may read $0 between sessions (${(e as Error).message.slice(0, 60)})`);
    }
  }
  const dayWindow = betweenSessions
    ? { phase: "between-sessions", sessionDate: optPrevDate, note: `Market not in regular session — 'day' figures are the LAST COMPLETED session (${optPrevDate}); option drivers re-anchored to the ${eqPrevDate} close so they attribute that session instead of $0.` }
    : { phase: "session", sessionDate: eqPrevDate ? `after ${eqPrevDate} close` : null, note: null };

  // 4. Per-position dollar drivers.
  const drivers: any[] = [];
  for (const a of perAccount) {
    for (const p of a.equityPositions) {
      const q = quotes.get(p.iid) ?? {};
      const last = n(q.last_trade_price);
      const ext = q.last_extended_hours_trade_price != null ? n(q.last_extended_hours_trade_price) : Number.NaN;
      const prev = n(q.adjusted_previous_close ?? q.previous_close);
      drivers.push({ acct: a.acct, label: a.label, kind: "equity", symbol: p.symbol, name: p.symbol, qty: p.qty,
        value: Number.isFinite(last) ? p.qty * last : Number.NaN,
        dayUsd: Number.isFinite(last) && Number.isFinite(prev) ? p.qty * (last - prev) : Number.NaN,
        ahUsd: Number.isFinite(ext) && Number.isFinite(last) ? p.qty * (ext - last) : Number.NaN });
    }
    for (const p of a.optionPositions) {
      const m = marks.get(p.oid) ?? {};
      const mark = n(m.adjusted_mark_price ?? m.mark_price);
      // Between sessions, re-anchored prev (close before the last completed session) keeps the option
      // measuring the SAME window as the account top-line; in-session, previous_close_price is correct.
      const prev = optPrevOverride.get(p.oid) ?? n(m.previous_close_price);
      drivers.push({ acct: a.acct, label: a.label, kind: "option", symbol: p.symbol, name: p.name, qty: p.qty,
        value: Number.isFinite(mark) ? mark * 100 * p.qty : Number.NaN,
        dayUsd: Number.isFinite(mark) && Number.isFinite(prev) ? (mark - prev) * 100 * p.qty : Number.NaN,
        ahUsd: 0 }); // per-name option AH not attributed; account-level extended_hours_equity captures it
      if (p.underlyingType === "index" && !globalWarnings.some((w) => w.startsWith("index options held")))
        globalWarnings.push(`index options held (${p.symbol}): index options DO trade extended sessions — per-name AH is not attributed here, but the account-level after-hours number includes it`);
    }
  }

  // 5. Totals, reconciliation, rollups.
  const sum = (xs: number[]) => xs.filter((x) => Number.isFinite(x)).reduce((s, x) => s + x, 0);
  const totals = { equity: sum(perAccount.map((a) => a.equity)), day: sum(perAccount.map((a) => a.day)), afterHours: sum(perAccount.map((a) => a.afterHours)) };
  const failedReads = perAccount.filter((a) => !Number.isFinite(a.equity)).length;
  const driverDaySum = drivers.reduce((s, d) => s + (Number.isFinite(d.dayUsd) ? d.dayUsd : 0), 0);
  const residual = Number.isFinite(totals.day) ? totals.day - driverDaySum : Number.NaN;
  // Distinguish legitimate unattributed flow (cash/dividends) from failed pricing: count positions we
  // couldn't price, so an operator can tell a $X dividend residual from a "$X of positions weren't priced".
  const mispricedPositions = drivers.filter((d) => !Number.isFinite(d.dayUsd)).length;
  // After-hours is meaningful only in an extended session; intraday/closed it's ~0. Flag so callers don't
  // read a regular-session "$0 after-hours / no AH losers" as a failed or flat session.
  const afterHoursActive = perAccount.some((a) => Number.isFinite(a.afterHours) && Math.abs(a.afterHours) > 0.005);

  const byU = new Map<string, any>();
  for (const d of drivers) {
    const u = byU.get(d.symbol) ?? { symbol: d.symbol, value: 0, dayUsd: 0, ahUsd: 0, accts: new Set<string>(), kinds: new Set<string>() };
    u.value += Number.isFinite(d.value) ? d.value : 0;
    u.dayUsd += Number.isFinite(d.dayUsd) ? d.dayUsd : 0;
    u.ahUsd += Number.isFinite(d.ahUsd) ? d.ahUsd : 0;
    u.accts.add(d.acct); u.kinds.add(d.kind);
    byU.set(d.symbol, u);
  }
  const sortVal = (x: any) => window === "after-hours" ? (Number.isFinite(x.ahUsd) ? x.ahUsd : 0)
    : window === "day" ? (Number.isFinite(x.dayUsd) ? x.dayUsd : 0)
    : (Number.isFinite(x.dayUsd) ? x.dayUsd : 0) + (Number.isFinite(x.ahUsd) ? x.ahUsd : 0);
  const rank = (xs: any[]) => xs.slice().sort((x, y) => sortVal(x) - sortVal(y));
  const top = opts.top && opts.top > 0 ? opts.top : undefined;
  // Rank on the RAW driver objects (dayUsd/ahUsd) BEFORE mapping to output field names — sortVal reads
  // dayUsd/ahUsd, so ranking the mapped objects (dayChangeUsd/...) silently compared 0 vs 0 and left
  // the "ranked" tables in insertion order. (Live-caught 2026-06-11.)
  const byUnderlying = rank([...byU.values()]).map((u) => ({ symbol: u.symbol, marketValueUsd: u.value, dayChangeUsd: u.dayUsd, afterHoursChangeUsd: u.ahUsd, accounts: [...u.accts], kinds: [...u.kinds] }));
  const byPosition = rank(drivers).map((d) => ({ accountNumber: d.acct, label: d.label, kind: d.kind, symbol: d.symbol, name: d.name, qty: d.qty, marketValueUsd: d.value, dayChangeUsd: d.dayUsd, afterHoursChangeUsd: d.ahUsd }));

  return {
    window, complete: failedReads === 0 && globalWarnings.length === 0, afterHoursActive, dayWindow,
    totals: { equityUsd: totals.equity, dayChangeUsd: totals.day, afterHoursChangeUsd: totals.afterHours },
    reconciliation: { driverDayChangeUsd: driverDaySum, totalsDayChangeUsd: totals.day, residualUsd: residual, mispricedPositions,
      note: "residual = cash/dividends/transfers/option-vs-equity timing (NOT failed pricing — see mispricedPositions); after-hours is EQUITY-only (options don't print after-hours)" },
    accounts: perAccount.map((a) => ({ accountNumber: a.acct, label: a.label, equityUsd: a.equity, dayChangeUsd: a.day, afterHoursChangeUsd: a.afterHours, buyingPower: a.buyingPower, partial: !Number.isFinite(a.equity), warnings: a.warnings })),
    byUnderlying: top ? byUnderlying.slice(0, top) : byUnderlying,
    byPosition: top ? byPosition.slice(0, top) : byPosition,
    warnings: globalWarnings
  };
}

/**
 * Options order-flow context (T5): the pre-trade reads an agent needs BEFORE building an options order —
 * options buying power (the real gate on opens), the per-trade fee schedule, and collateral requirements.
 * Each read degrades to a warning so one failure never blanks the others. Shared by CLI + MCP. READS only;
 * the order/orders/review PREVIEW is a POST and stays behind the gated write path (brokerage execute)
 * until a live pass confirms it is non-mutating.
 */
export interface OptionsOrderFlow {
  accountNumber?: string;
  buyingPower?: any;
  fees?: any;
  collateral?: any;
  warnings: string[];
}
export async function readOptionsOrderFlow(
  opts: { accountNumber?: string; chainId?: string } = {},
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<OptionsOrderFlow> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const out: OptionsOrderFlow = { accountNumber: opts.accountNumber, warnings: [] };
  if (opts.accountNumber) {
    try {
      out.buyingPower = await getJson("https://bonfire.robinhood.com/accounts/{account_number}/options_buying_power", { account_number: opts.accountNumber });
    } catch (e: any) { out.warnings.push(`options buying power read failed: ${(e as Error).message.slice(0, 60)}`); }
  } else {
    out.warnings.push("no --account given: options buying power is per-account and was skipped.");
  }
  try {
    out.fees = await getJson("https://api.robinhood.com/options/fees/");
  } catch (e: any) { out.warnings.push(`options fees read failed: ${(e as Error).message.slice(0, 60)}`); }
  try {
    out.collateral = opts.chainId
      ? await getJson("https://api.robinhood.com/options/chains/{id}/collateral/", { id: opts.chainId })
      : await getJson("https://api.robinhood.com/options/orders/collateral/");
  } catch (e: any) { out.warnings.push(`options collateral read failed: ${(e as Error).message.slice(0, 60)}`); }
  return out;
}

/**
 * Generic env-gated brokerage write, shared by the CLI and the MCP server. Pass the EXACT templated
 * URL (with {placeholders}) so the resolver matches one route and the ambiguity guard can't fire. The
 * gate engages on write verbs even if a route's risk is mis-classified (verb floor). Dry-run by default;
 * a live send needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; liveWrite:true optional). Hoisted here so the write path
 * (the dangerous one to duplicate) is single-source across both surfaces.
 */
// N4 — gross premium of an options ORDER PLACEMENT (price × 100 × contracts), or 0 if this isn't a
// single options placement POST. Used to extend the notional caps to options (equity is capped in
// placeEquityOrder). Deliberately matches only `…/options/orders/` (placement), never the
// `…/options/orders/{id}/cancel/` route. Multi-leg net debit/credit isn't modeled — this caps the
// gross premium, which is the right "don't fire a huge order" backstop.
export function optionsOrderNotional(url: string, method: string, body: unknown): number {
  if (method.toUpperCase() !== "POST" || !/\/options\/orders\/$/.test(url.split("?")[0])) return 0;
  const b = body as any;
  const p = Number(b?.price);
  const q = Number(b?.quantity);
  return Number.isFinite(p) && Number.isFinite(q) && p > 0 && q > 0 ? p * 100 * q : 0;
}

export async function gatedBrokerageWrite(opts: {
  url: string;
  method: string;
  params?: Record<string, string>;
  body?: unknown;
  dryRun?: boolean;
  liveWrite?: boolean;
  /** Human context for the universal write log (e.g. "options order: GOOGL call debit spread"). */
  logContext?: string;
  /** Set by callers that write their OWN richer log entry (placeEquityOrder) to avoid double-logging. */
  skipTradeLog?: boolean;
  /** Target account for the account-lock check (ROBINHOOD_ALLOWED_ACCOUNT). */
  accountNumber?: string;
}): Promise<{ status: number | string; dryRun: boolean; reason?: string; body?: string }> {
  const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: opts.url });
  const route = selectRouteByQueryAndMethod(matches, opts.url, opts.method);
  if (!route) {
    const suggestions = suggestRoutes(opts.url);
    const tail = suggestions.length ? ` Closest mapped routes: ${suggestions.join(" | ")}.` : "";
    throw new Error(`No ${opts.method ?? "matching"} route for ${opts.url} — a forced write with no matching write route fails closed (never degrades to a read).${tail} Check the map / rebuild (AGENTS.md §3).`);
  }
  const gate = resolveLiveWriteGate({ risk: route.risk, method: opts.method, dryRun: Boolean(opts.dryRun), liveWrite: Boolean(opts.liveWrite), accountNumber: opts.accountNumber ?? accountFromWriteRequest(opts.body, opts.params) });
  const effectiveDryRun = Boolean(opts.dryRun) || gate.forcedDryRun;
  // N4 — notional cap for options order placements (equity is capped in placeEquityOrder). Only a
  // genuine live placement is checked; dry-runs and cancels yield 0. Throws NotionalCapError if over.
  const optNotional = effectiveDryRun ? 0 : optionsOrderNotional(opts.url, opts.method, opts.body);
  if (optNotional > 0) checkNotionalCaps(optNotional);
  const plan = planBrokerageRequest({ route, method: opts.method, params: opts.params ?? {}, body: opts.body, dryRun: effectiveDryRun });
  const result = await executeBrokerageRequest(plan, { dryRun: effectiveDryRun, body: opts.body, fullBody: true });
  if (optNotional > 0 && Number(result.status) >= 200 && Number(result.status) < 300) recordSessionNotional(optNotional);
  // UNIVERSAL WRITE LOG (added 2026-06-11): every LIVE write that leaves this engine — options
  // orders, cancels, settings, recurring, raw `brokerage execute` writes, from BOTH the CLI and the
  // MCP — gets a machine log entry. Equity buy/sell skip here (skipTradeLog) because
  // placeEquityOrder writes its own richer entry. Before this, only equity orders auto-logged and
  // every options trade depended on manual discipline (which decays). Best-effort, never throws.
  if (!effectiveDryRun && !opts.skipTradeLog) {
    const bodyStr = typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? "");
    await logTrade({
      when: new Date().toISOString(),
      kind: "live-write",
      context: opts.logContext ?? null,
      method: opts.method,
      route: route.url,
      params: opts.params ?? {},
      status: result.status,
      requestBody: opts.body ?? null,
      responseHead: bodyStr ? bodyStr.slice(0, 500) : null
    });
  }
  return { status: result.status, dryRun: effectiveDryRun, reason: gate.reason, body: result.body };
}

/** Append a trade to the local trading log (JSONL, one line per order). Best-effort. */
export async function logTrade(entry: Record<string, unknown>) {
  try {
    const { appendFileSync, existsSync, mkdirSync } = await import("fs");
    const { join } = await import("path");
    const logDir = join(repoRoot(), "local");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, "trading-log.jsonl"), JSON.stringify(entry) + "\n");
  } catch { /* best-effort */ }
}

// ───────────────────────── Watchlist writes (shared CLI + MCP) ─────────────────────────
// Robinhood custom watchlists ("Lists") are USER-level, NOT account-scoped — one set of lists per
// login, shown across every account. The write surface is discovery/lists/* (captured + verified live
// 2026-06-14 — the REAL endpoint is discovery/lists/items/, NOT the midlands/lists/items/ the route map
// once assumed):
//   add/remove items : POST   discovery/lists/items/   body { "<list_id>": [ {object_id, object_type, operation} ] }
//   create a list    : POST   discovery/lists/         body { display_name, icon_emoji? }  (201)
//   delete a list    : DELETE discovery/lists/{id}/    (204)
// object_id is the instrument UUID (resolved from a ticker via instruments/?symbol=), never the symbol.
// operation: "create" = add, "delete" = remove. Both ride the same items endpoint. As with every write
// here, these go through gatedBrokerageWrite — dry-run unless the ROBINHOOD_ALLOW_LIVE_WRITE=1 switch is set (liveWrite optional).

export const DISCOVERY_LISTS_URL = "https://api.robinhood.com/discovery/lists/";
export const DISCOVERY_LISTS_ITEMS_URL = "https://api.robinhood.com/discovery/lists/items/";

/** Resolve an equity ticker to its Robinhood instrument UUID (instruments/?symbol=). */
export async function resolveInstrumentId(
  symbol: string,
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<string> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const sym = symbol.trim().toUpperCase();
  const inst = (await getJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: sym })).results?.[0];
  if (!inst?.id) throw new Error(`Symbol ${sym} not found (instruments/?symbol= returned no match).`);
  return inst.id as string;
}

export interface WatchlistRef {
  id: string;
  display_name: string;
  allowed_object_types: string[];
}

/** Resolve a custom watchlist by id or (case-insensitive) display_name. Reads owner_type=custom only. */
export async function resolveWatchlist(
  nameOrId: string,
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<WatchlistRef> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const data = await getJson(DISCOVERY_LISTS_URL, {}, { owner_type: "custom" });
  const lists: any[] = Array.isArray(data?.results) ? data.results : [];
  const q = nameOrId.trim();
  const match =
    lists.find((l) => l.id === q) ??
    lists.find((l) => String(l.display_name ?? "").toLowerCase() === q.toLowerCase());
  if (!match) {
    const names = lists.map((l) => l.display_name).filter(Boolean).join(", ") || "(none)";
    throw new Error(`No custom watchlist matches "${nameOrId}". Existing custom lists: ${names}.`);
  }
  return { id: match.id, display_name: match.display_name, allowed_object_types: match.allowed_object_types ?? [] };
}

export interface WatchlistMutateInput {
  /** List name or id. */
  list: string;
  symbols: string[];
  /** "create" = add, "delete" = remove. */
  operation: "create" | "delete";
  /** Robinhood object type; defaults to "instrument" (equities). */
  objectType?: string;
  dryRun?: boolean;
  liveWrite?: boolean;
}

export interface WatchlistMutateDeps {
  getJson?: typeof brokerageGetJson;
  write?: typeof gatedBrokerageWrite;
  resolveInstrument?: (symbol: string) => Promise<string>;
}

/**
 * Add or remove tickers in a custom watchlist. Resolves the list (by name/id) and each ticker (to an
 * instrument UUID), builds the list-keyed batch body, and sends it through the env-gated write path.
 */
export async function watchlistMutateItems(input: WatchlistMutateInput, deps: WatchlistMutateDeps = {}) {
  const getJson = deps.getJson ?? brokerageGetJson;
  const write = deps.write ?? gatedBrokerageWrite;
  const objectType = input.objectType ?? "instrument";
  const resolveInstrument = deps.resolveInstrument ?? ((s: string) => resolveInstrumentId(s, { getJson }));
  const symbols = input.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) throw new Error("No symbols given.");
  const wl = await resolveWatchlist(input.list, { getJson });

  const resolved: { symbol: string; object_id: string }[] = [];
  for (const sym of symbols) {
    const object_id = objectType === "instrument" ? await resolveInstrument(sym) : sym;
    resolved.push({ symbol: sym, object_id });
  }
  const body = {
    [wl.id]: resolved.map((r) => ({ object_id: r.object_id, object_type: objectType, operation: input.operation }))
  };
  const verb = input.operation === "create" ? "add" : "remove";
  const result = await write({
    url: DISCOVERY_LISTS_ITEMS_URL,
    method: "POST",
    body,
    dryRun: input.dryRun,
    liveWrite: input.liveWrite,
    logContext: `watchlist ${verb}: ${symbols.join(",")} ${verb === "add" ? "->" : "<-"} ${wl.display_name}`
  });
  return { list: wl, operation: input.operation, items: resolved, body, result };
}

/** Create a new custom watchlist (POST discovery/lists/). Env-gated. */
export async function createWatchlist(
  input: { displayName: string; iconEmoji?: string; dryRun?: boolean; liveWrite?: boolean },
  deps: { write?: typeof gatedBrokerageWrite } = {}
) {
  const write = deps.write ?? gatedBrokerageWrite;
  const body: Record<string, unknown> = { display_name: input.displayName };
  if (input.iconEmoji) body.icon_emoji = input.iconEmoji;
  const result = await write({
    url: DISCOVERY_LISTS_URL,
    method: "POST",
    body,
    dryRun: input.dryRun,
    liveWrite: input.liveWrite,
    logContext: `watchlist create: ${input.displayName}`
  });
  return { displayName: input.displayName, body, result };
}

/** Delete a custom watchlist by id (DELETE discovery/lists/{id}/). Env-gated; irreversible. */
export async function deleteWatchlist(
  input: { id: string; dryRun?: boolean; liveWrite?: boolean },
  deps: { write?: typeof gatedBrokerageWrite } = {}
) {
  const write = deps.write ?? gatedBrokerageWrite;
  const result = await write({
    url: "https://api.robinhood.com/discovery/lists/{id}/",
    method: "DELETE",
    params: { id: input.id },
    dryRun: input.dryRun,
    liveWrite: input.liveWrite,
    logContext: `watchlist delete: ${input.id}`
  });
  return { id: input.id, result };
}

export interface WatchlistItem {
  symbol: string | null;
  name: string | null;
  object_type: string;
  object_id: string | null;
  us_tradability: string | null;
  state: string | null;
  /** True only for an active, US-tradable EQUITY instrument — i.e. something a $X basket buy can hit.
   *  Futures/index/currency_pair entries (allowed on a list) are NOT equity-buyable and resolve false. */
  tradable: boolean;
  price: number | null;
}

/**
 * Read a custom watchlist's ITEMS resolved to tickers. The list-metadata read (`watchlist list`) returns
 * sizes only; the items live at discovery/lists/items/?list_id=&owner_type=custom and come back already
 * carrying symbol + tradability + a live price. This is the read half of "operate on a watchlist" — no
 * one-off script required. Reads are live and free (no gate).
 */
export async function getWatchlistItems(
  nameOrId: string,
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<{ list: WatchlistRef; items: WatchlistItem[] }> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const wl = await resolveWatchlist(nameOrId, { getJson });
  const data = await getJson(DISCOVERY_LISTS_ITEMS_URL, {}, { list_id: wl.id, owner_type: "custom" });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const items: WatchlistItem[] = results.map((r) => {
    const object_type = String(r.object_type ?? "instrument");
    return {
      symbol: r.symbol ?? r?.item?.symbol ?? null,
      name: r.name ?? null,
      object_type,
      object_id: r.object_id ?? r.id ?? null,
      us_tradability: r.us_tradability ?? null,
      state: r.state ?? null,
      tradable: object_type === "instrument" && r.us_tradability === "tradable" && r.state === "active" && Boolean(r.symbol),
      price: r.price != null && Number.isFinite(Number(r.price)) ? Number(r.price) : null
    };
  });
  return { list: wl, items };
}

export interface WatchlistBasketBuyInput {
  /** List name or id. */
  list: string;
  /** Dollars per ticker (Robinhood minimum is $1.00). */
  amount: number;
  accountNumber: string;
  dryRun?: boolean;
  liveWrite?: boolean;
  /** Skip per-order dedup AND the after-hours fractional pre-flight guard. */
  force?: boolean;
  /** Cap the number of tickers attempted (after tradability + BP filtering). */
  limit?: number;
  /** Pace between LIVE sends to respect Robinhood's fractional burst limit (~9 then 429). Default 2500ms. */
  delayMs?: number;
}

export interface WatchlistBasketLeg {
  symbol: string;
  status: "placed" | "queued" | "dry-run" | "skipped" | "failed" | "blocked";
  reason?: string;
  shares?: number;
  estimatedTotal?: number;
  orderId?: string | null;
  evidenceConfirmed?: boolean | null;
  sessionWarning?: string;
}

export interface WatchlistBasketBuyResult {
  list: WatchlistRef;
  account: string;
  amountPerTicker: number;
  buyingPower?: number;
  dryRun: boolean;
  counts: { items: number; tradable: number; attempted: number; placed: number; skipped: number; failed: number; blocked: number };
  legs: WatchlistBasketLeg[];
}

/**
 * Buy $amount of EACH tradable item in a custom watchlist — the "operate on a watchlist" execution half.
 * Thin loop over the shared `placeEquityOrder` engine, so every per-ticker order inherits the OTC/
 * fractional guard, dedup, ref_id idempotency, the after-hours pre-flight guard, trade-log + evidence,
 * AND the double write-gate (dry-run unless liveWrite + ROBINHOOD_ALLOW_LIVE_WRITE=1). BP-aware: reads
 * the account's buying power and only attempts what fits ($amount each), so an underfunded basket places
 * the affordable prefix and reports the rest as skipped rather than hammering doomed orders.
 */
export async function buyWatchlistBasket(
  input: WatchlistBasketBuyInput,
  deps: { getJson?: typeof brokerageGetJson; placeOrder?: typeof placeEquityOrder; sleep?: (ms: number) => Promise<void> } = {}
): Promise<WatchlistBasketBuyResult> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const placeOrder = deps.placeOrder ?? placeEquityOrder;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive dollar value (Robinhood minimum is $1.00).");
  const delayMs = input.delayMs ?? 2500;
  const liveWrite = !input.dryRun && !!input.liveWrite;

  const { list, items } = await getWatchlistItems(input.list, { getJson });
  const tradable = items.filter((i) => i.tradable && i.symbol);
  const legs: WatchlistBasketLeg[] = [];

  // Non-equity / non-tradable members are skipped loudly (futures/index/currency_pair, halted, etc.).
  for (const i of items.filter((x) => !x.tradable)) {
    legs.push({ symbol: i.symbol ?? i.object_id ?? "?", status: "skipped", reason: `not equity-buyable (object_type=${i.object_type}, us_tradability=${i.us_tradability ?? "?"}, state=${i.state ?? "?"})` });
  }

  // BP-aware sizing: read buying power once and only attempt what fits.
  let buyingPower: number | undefined;
  try {
    const bp = await getJson("https://api.robinhood.com/accounts/{num}/buying_power_breakdown", { num: input.accountNumber });
    const v = Number(bp?.buying_power);
    if (Number.isFinite(v)) buyingPower = v;
  } catch { /* best-effort: if BP read fails, attempt all and let per-order rejection report */ }

  let candidates = tradable;
  if (input.limit && input.limit > 0) candidates = candidates.slice(0, input.limit);
  let affordable = candidates;
  if (buyingPower !== undefined) {
    const maxN = Math.floor(buyingPower / amount);
    if (candidates.length > maxN) {
      affordable = candidates.slice(0, maxN);
      for (const i of candidates.slice(maxN)) {
        legs.push({ symbol: i.symbol as string, status: "skipped", reason: `insufficient buying power — basket of ${candidates.length}×$${amount.toFixed(2)}=$${(candidates.length * amount).toFixed(2)} exceeds BP $${buyingPower.toFixed(2)}; placed the first ${maxN}` });
      }
    }
  }

  let placed = 0;
  for (let idx = 0; idx < affordable.length; idx++) {
    const sym = affordable[idx].symbol as string;
    let res: EquityOrderResult;
    try {
      res = await placeOrder({ symbol: sym, accountNumber: input.accountNumber, side: "buy", amount, liveWrite, force: input.force });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const nonBuyable = /fractional|otc/i.test(msg);
      legs.push({ symbol: sym, status: nonBuyable ? "skipped" : "failed", reason: msg });
      continue;
    }
    if (res.preflightBlocked) {
      legs.push({ symbol: sym, status: "blocked", reason: res.sessionWarning, sessionWarning: res.sessionWarning });
    } else if (res.dryRun) {
      legs.push({ symbol: sym, status: "dry-run", shares: res.shares, estimatedTotal: res.estimatedTotal, sessionWarning: res.sessionWarning });
    } else if (res.evidence?.confirmed === true) {
      legs.push({ symbol: sym, status: "placed", shares: res.shares, estimatedTotal: res.estimatedTotal, orderId: res.orderId, evidenceConfirmed: true, sessionWarning: res.sessionWarning });
      placed++;
    } else {
      legs.push({ symbol: sym, status: "failed", reason: res.evidence?.warning ?? res.sessionWarning ?? `live send returned ${res.httpStatus} — unconfirmed`, orderId: res.orderId, evidenceConfirmed: res.evidence?.confirmed ?? null, sessionWarning: res.sessionWarning });
    }
    if (liveWrite && delayMs > 0 && idx < affordable.length - 1) await sleep(delayMs);
  }

  return {
    list, account: input.accountNumber, amountPerTicker: amount, buyingPower, dryRun: !liveWrite,
    counts: {
      items: items.length, tradable: tradable.length, attempted: affordable.length, placed,
      skipped: legs.filter((l) => l.status === "skipped").length,
      failed: legs.filter((l) => l.status === "failed").length,
      blocked: legs.filter((l) => l.status === "blocked").length
    },
    legs
  };
}

// ───────────────────────── Equity order engine (shared CLI + MCP) ─────────────────────────
// The order-construction path is the dangerous one to duplicate (alignment invariant): the CLI
// `buy`/`sell` commands and the MCP `robinhood_buy`/`robinhood_sell` tools both call
// placeEquityOrder so dedup, ref_id idempotency, the OTC/fractional guard, quantity math, and
// trade logging cannot drift between surfaces.

/** Extract a bare order id from an id-or-URL ("https://api.robinhood.com/orders/<id>/" or "<id>"). */
export function extractOrderId(idOrUrl: string): string {
  return idOrUrl.includes("/orders/") ? idOrUrl.split("/orders/")[1].replace(/\/$/, "") : idOrUrl;
}

export const DEDUP_WINDOW_MS = 300_000;

/**
 * Pure dedup filter: same-side orders in a non-terminal state created inside the window.
 * Stale pending orders (older than the window) do NOT block — a forgotten GTC limit from
 * yesterday is not a duplicate of today's intent.
 */
export function filterRecentPending(orders: any[], side: "buy" | "sell", nowMs: number, windowMs: number = DEDUP_WINDOW_MS): any[] {
  return (Array.isArray(orders) ? orders : []).filter((o: any) => {
    // A future-dated created_at (server clock skew) still blocks — it is pending NOW.
    const age = nowMs - Date.parse(String(o?.created_at ?? 0));
    return o?.side === side
      && o?.state !== "filled" && o?.state !== "cancelled" && o?.state !== "rejected"
      && Number.isFinite(age) && age < windowMs;
  });
}

// ── Market-session awareness ────────────────────────────────────────────────────────────────────
// The order body's `market_hours` and the "will it fill now or queue?" question both depend on the
// CURRENT US-equity session. We derive it from Robinhood's OWN market-hours endpoint (holiday- and
// half-day-aware — never a hardcoded 9:30–16:00 clock), with an ET-clock fallback only if that read
// fails. Zayd Khan // cold // www.zayd.wtf
export type MarketSession = "pre_market" | "regular" | "after_hours" | "closed";

export interface MarketSessionInfo {
  session: MarketSession;
  /** Is today a trading day at all (false on weekends/holidays). */
  isTradingDay: boolean;
  /** True when authoritative RH hours were used; false when the ET-clock fallback was. */
  authoritative: boolean;
}

/** ET calendar date `YYYY-MM-DD` for an epoch ms — DST-correct via Intl (en-CA yields ISO order). */
export function etDateString(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(nowMs));
}

/** ET-clock session heuristic — the fallback ONLY (no holiday/half-day awareness). */
export function etClockSession(nowMs: number): MarketSession {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return "closed";
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre_market";
  if (mins >= 16 * 60 && mins < 20 * 60) return "after_hours";
  return "closed";
}

/**
 * Classify the current US-equity session from Robinhood's authoritative hours endpoint.
 * Best-effort: any read failure falls back to the ET clock (still useful, just holiday-blind).
 */
export async function computeMarketSession(
  deps: { getJson?: typeof brokerageGetJson; now?: () => number } = {}
): Promise<MarketSessionInfo> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const nowMs = (deps.now ?? Date.now)();
  let hours: any;
  try {
    hours = await getJson("https://api.robinhood.com/markets/{market}/hours/{date}/", {
      market: "XNYS", date: etDateString(nowMs)
    });
  } catch {
    return { session: etClockSession(nowMs), isTradingDay: etClockSession(nowMs) !== "closed", authoritative: false };
  }
  if (!hours?.is_open) return { session: "closed", isTradingDay: false, authoritative: true };
  const t = (s?: string) => (s ? Date.parse(s) : NaN);
  const open = t(hours.opens_at), close = t(hours.closes_at);
  const extOpen = t(hours.extended_opens_at), extClose = t(hours.extended_closes_at);
  let session: MarketSession = "closed";
  if (Number.isFinite(open) && Number.isFinite(close) && nowMs >= open && nowMs < close) session = "regular";
  else if (Number.isFinite(extOpen) && Number.isFinite(open) && nowMs >= extOpen && nowMs < open) session = "pre_market";
  else if (Number.isFinite(close) && Number.isFinite(extClose) && nowMs >= close && nowMs < extClose) session = "after_hours";
  return { session, isTradingDay: true, authoritative: true };
}

export interface EquityOrderInput {
  symbol: string;
  accountNumber: string;
  side: "buy" | "sell";
  /** Dollar notional (fractional, market-style sizing). Mutually exclusive with shares. */
  amount?: number;
  /** Share quantity. Mutually exclusive with amount. */
  shares?: number;
  /** Limit price; omit for a market order. */
  limitPrice?: number;
  /** Optional (back-compat) — the gate is ROBINHOOD_ALLOW_LIVE_WRITE=1, enforced downstream. */
  liveWrite?: boolean;
  /** Skip the pending-duplicate check. */
  force?: boolean;
  /** Bypass the ROBINHOOD_MAX_ORDER_DOLLARS / ROBINHOOD_MAX_SESSION_DOLLARS notional caps for this order. */
  overrideCap?: boolean;
}

export interface EquityOrderDeps {
  getJson?: typeof brokerageGetJson;
  write?: typeof gatedBrokerageWrite;
  log?: typeof logTrade;
  now?: () => number;
  /** Injectable session detector (tests pass a fake; default reads RH's live hours). */
  getMarketSession?: typeof computeMarketSession;
}

export interface EquityOrderResult {
  symbol: string;
  account: string;
  side: "buy" | "sell";
  shares: number;
  estimatedPrice: number;
  estimatedTotal: number;
  type: "market" | "limit";
  /** True when an OTC order with no explicit limit was auto-limited at the marketable side (buy=ask, sell=bid). */
  otcAutoLimit: boolean;
  /** True when the send used the native `dollar_based_amount` fractional body (dollar-notional market order on a fractional-tradable name) rather than a computed quantity. */
  dollarBased: boolean;
  /** Detected US-equity session at send time (`regular`/`pre_market`/`after_hours`/`closed`); undefined if detection was skipped/failed. */
  session?: MarketSession;
  /** Set when the order will QUEUE rather than fill now (e.g. a fractional/market order placed outside regular hours). */
  sessionWarning?: string;
  live: boolean;
  dryRun: boolean;
  /** True when the engine PRE-EMPTED the send (nothing was attempted) — e.g. a fractional dollar-market
   *  order outside regular hours, which Robinhood rejects (HTTP 500). `force` bypasses the guard. */
  preflightBlocked?: boolean;
  refId: string;
  orderId: string | null;
  state: string | null;
  httpStatus: number | string;
  result?: Awaited<ReturnType<typeof gatedBrokerageWrite>>;
  /** Post-send order-history re-read (live sends only) — failure mode #20 encoded in code. */
  evidence?: OrderEvidence;
}

/**
 * Place (or dry-run) a simple equity order. One source of truth for both surfaces:
 *   1. amount XOR shares validation
 *   2. instrument resolution + OTC/fractional guard (failure mode #4 — dollar orders on
 *      non-`tradable` fractional names are impossible IN BOTH DIRECTIONS; switch to whole
 *      shares — OTC then auto-limits at the marketable side: BUY at the ask, SELL at the bid)
 *   3. live quote with a hard validity check (a dead quote must never become qty=Infinity)
 *   4. pending-duplicate check (live sends only; 5-min window; force skips)
 *   5. ref_id idempotency (safe to retry the SAME ref_id on 429 — nothing was placed)
 *   6. trading-log append on live sends
 * Dry-run unless the ROBINHOOD_ALLOW_LIVE_WRITE=1 switch is set — the engine's env gate still applies.
 */
export async function placeEquityOrder(input: EquityOrderInput, deps: EquityOrderDeps = {}): Promise<EquityOrderResult> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const write = deps.write ?? gatedBrokerageWrite;
  const log = deps.log ?? logTrade;
  const now = deps.now ?? Date.now;
  const getMarketSession = deps.getMarketSession ?? computeMarketSession;
  const symbol = input.symbol.toUpperCase();
  const side = input.side;
  if (!input.amount && !input.shares) throw new Error("Must specify amount (dollars) or shares (quantity)");
  if (input.amount && input.shares) throw new Error("Specify amount OR shares, not both");

  // 0. Owned-account guard — the #1 money-loss risk is a write to the WRONG account (a typo'd or
  // hallucinated account number templating straight into a live order body). Refuse a CONFIRMED
  // unowned account; a failed ownership lookup only WARNS (never wedges a write). This is the single
  // chokepoint behind the CLI buy/sell commands AND the MCP robinhood_buy/robinhood_sell tools, so
  // the guard can't protect one surface and miss another. Zayd Khan // cold // www.zayd.wtf
  await assertAccountOwned(input.accountNumber, { getJson });

  // 1. Resolve instrument — the response carries the OTC/fractional signals.
  const inst = (await getJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol })).results?.[0];
  if (!inst) throw new Error(`Symbol ${symbol} not found`);
  const iid = inst.id;
  const otc = Boolean(inst.otc_market_tier) || inst.fractional_tradability === "position_closing_only";
  if (input.amount && inst.fractional_tradability && inst.fractional_tradability !== "tradable") {
    // BOTH directions: a "$X of <OTC>" dollar/fractional order is impossible whether buying or
    // selling — switch to whole shares (the engine then auto-limits at the marketable side).
    throw new Error(`${symbol}: fractional_tradability=${inst.fractional_tradability} — cannot place a dollar/fractional ${side} order. Use shares (whole qty)${otc ? ` (OTC: auto-limits at the ${side === "buy" ? "ask" : "bid"})` : ""}.`);
  }

  // 2. Quote — hard-fail on a dead/missing quote so sizing math can't divide by zero.
  const q = (await getJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: iid })).results?.[0];
  const last = Number(q?.last_trade_price);
  if (!Number.isFinite(last) || last <= 0) throw new Error(`Invalid or missing quote for ${symbol} (last_trade_price=${q?.last_trade_price ?? "none"})`);

  // 3. Quantity (Robinhood: 4 decimal places for fractional shares).
  const rawShares = input.amount ? Number(input.amount) / last : Number(input.shares);
  const shares = Number(rawShares.toFixed(4));
  if (!Number.isFinite(shares) || shares <= 0) throw new Error(`Computed share quantity is invalid (${rawShares}) for ${symbol}`);
  if (otc && !Number.isInteger(shares)) {
    throw new Error(`${symbol}: OTC/ADR names trade in WHOLE shares only — got ${shares}. Round to a whole quantity.`);
  }

  // 3b. OTC marketable-limit guard, BOTH directions (verified live: OTC rejects market orders).
  // Without an explicit limit price, auto-limit at the marketable side of the live book:
  // BUY at the ASK, SELL at the BID (never the ask — that limit may sit unfilled above the
  // market). Falls back to last on a one-sided/dead book; the dead-quote hard-fail above
  // already guarantees `last` is usable.
  let effectiveLimit = input.limitPrice;
  let otcAutoLimit = false;
  if (otc && effectiveLimit == null) {
    const ask = Number(q?.ask_price);
    const bid = Number(q?.bid_price);
    effectiveLimit = side === "buy"
      ? (Number.isFinite(ask) && ask > 0 ? ask : last)
      : (Number.isFinite(bid) && bid > 0 ? bid : last);
    otcAutoLimit = true;
  }

  const isMarket = effectiveLimit == null;
  // An OTC auto-limit is market-intent (fill today), so it keeps gfd; explicit limits stay gtc.
  const tif = isMarket || otcAutoLimit ? "gfd" : "gtc";
  const price = isMarket ? last.toFixed(2) : Number(effectiveLimit).toFixed(2);
  const liveWrite = Boolean(input.liveWrite);

  // 4. Dedup: pending same-side orders on this instrument+account inside the window block the
  // send (live only — dry-runs can't duplicate anything). Best-effort: a failed check never
  // blocks, only a positive hit does.
  if (liveWrite && !input.force) {
    try {
      const recent = await getJson("https://api.robinhood.com/orders/", {}, {
        instrument: `https://api.robinhood.com/instruments/${iid}/`,
        account_numbers: input.accountNumber,
        is_closed: "false"
      });
      const pending = filterRecentPending(recent?.results, side, now());
      if (pending.length > 0) {
        throw new Error(
          `DEDUP: ${pending.length} pending ${side} order(s) for ${symbol} already exist. ` +
          `IDs: ${pending.map((o: any) => String(o.id ?? "").slice(0, 8)).join(", ")}. ` +
          `Pass --force (CLI) / force:true (MCP) to skip this check.`
        );
      }
    } catch (e: any) {
      if (String(e?.message ?? "").startsWith("DEDUP:")) throw e;
      // Dedup check failed non-fatally — continue.
    }
  }

  // 5. Send (ref_id = broker-level idempotency; a 429 retries the SAME ref_id safely).
  const refId = `${symbol}-${input.accountNumber}-${now()}`;

  // Body shape — two faithful forms, matching what robinhood.com itself sends:
  //   • Dollar-notional MARKET order on a fractional-tradable (non-OTC) name → the NATIVE fractional
  //     body: `dollar_based_amount {amount,currency_code}` (NOT a computed quantity) plus the live
  //     bid/ask collar (`bid_price`/`ask_price`/`bid_ask_timestamp`), `market_hours`, and
  //     `position_effect`. This is the exact body the web app posts for "$X of AAPL", and lets the
  //     broker — not us — derive the fill quantity from the dollar amount. (Capture: 2026-06-14.)
  //   • Everything else (whole shares, any limit order, OTC) → the quantity+price body. OTC and limit
  //     orders have no native dollar form; shares are already exact.
  // The collar fields come from the SAME live quote fetched above, so the timestamp is fresh (a stale
  // collar is the one thing Robinhood rejects on the dollar path). Missing/one-sided book → the field
  // is omitted rather than sent as 0/NaN. Zayd Khan // cold // www.zayd.wtf
  const dollarBased = input.amount != null && !otc && isMarket;

  // Session awareness — detect the CURRENT session so the order can (a) carry the right `market_hours`
  // and (b) tell the operator whether it fills NOW or queues to the next regular session. Best-effort:
  // a detection failure never blocks a send (session stays undefined, no warning). Fractional dollar
  // orders are regular-hours-only, so their `market_hours` is always "regular_hours" — but when placed
  // off-session we say so loudly, because "queued, not filled" is exactly the surprise to prevent.
  let session: MarketSession | undefined;
  let sessionWarning: string | undefined;
  try {
    session = (await getMarketSession({ getJson, now })).session;
  } catch { /* best-effort — leave session undefined */ }
  if (session && session !== "regular") {
    if (dollarBased) {
      sessionWarning = `Session is ${session}: fractional dollar orders fill ONLY in regular hours, so this will QUEUE to the next regular session — it will not fill now.`;
    } else if (isMarket) {
      sessionWarning = `Session is ${session}: a market order will QUEUE to the next regular session — it will not fill now. Use a limit order for extended-hours execution.`;
    }
  }

  // PRE-FLIGHT GUARD (failure mode: silent 500): a fractional dollar-MARKET order outside regular hours
  // is REJECTED by Robinhood with HTTP 500 — it does NOT queue (fractional/market orders only fill in
  // regular hours). Eating that raw 500 looks like an opaque failure. Pre-empt it with a clear,
  // actionable result and send NOTHING. `force` bypasses (e.g. to capture the live error for research).
  if (dollarBased && session && session !== "regular" && !input.force) {
    const reason = `Pre-flight: a fractional $${input.amount} ${side} of ${symbol} can't be placed during ${session} — Robinhood rejects dollar/market orders outside regular hours (they only fill in the regular session). Wait for the regular session, or buy whole shares with a limit. Pass force to attempt anyway.`;
    return {
      symbol, account: input.accountNumber, side, shares,
      estimatedPrice: last, estimatedTotal: shares * last,
      type: "market", otcAutoLimit, dollarBased,
      session, sessionWarning: reason,
      live: false, dryRun: false, preflightBlocked: true,
      refId, orderId: null, state: null, httpStatus: 0
    };
  }

  const baseBody: Record<string, unknown> = {
    account: `https://api.robinhood.com/accounts/${input.accountNumber}/`,
    instrument: `https://api.robinhood.com/instruments/${iid}/`,
    symbol,
    type: isMarket ? "market" : "limit",
    time_in_force: tif,
    trigger: "immediate",
    side,
    order_form_version: "7",
    ref_id: refId
  };
  let body: Record<string, unknown>;
  if (dollarBased) {
    const bid = Number(q?.bid_price);
    const ask = Number(q?.ask_price);
    body = {
      ...baseBody,
      dollar_based_amount: { amount: Number(input.amount).toFixed(2), currency_code: "USD" },
      market_hours: "regular_hours",
      position_effect: side === "buy" ? "open" : "close",
      ...(Number.isFinite(bid) && bid > 0 ? { bid_price: bid.toFixed(2) } : {}),
      ...(Number.isFinite(ask) && ask > 0 ? { ask_price: ask.toFixed(2) } : {}),
      ...(q?.updated_at ? { bid_ask_timestamp: String(q.updated_at) } : {})
    };
  } else {
    body = { ...baseBody, quantity: String(shares), price };
  }

  // NOTIONAL CAPS: block an oversized LIVE send. Applies only to a genuine live attempt (intent +
  // master switch on + account allowed by any lock); dry-runs and previews are never blocked.
  const notional = shares * (isMarket ? last : Number(effectiveLimit));
  if (liveWrite && process.env.ROBINHOOD_ALLOW_LIVE_WRITE === "1" && isAccountAllowed(input.accountNumber)) {
    checkNotionalCaps(notional, { override: input.overrideCap });
  }
  const result = await write({
    skipTradeLog: true, // placeEquityOrder writes its own richer log entry below — avoid double-logging
    url: "https://api.robinhood.com/orders/",
    method: "POST",
    body,
    dryRun: !liveWrite,
    liveWrite,
    accountNumber: input.accountNumber
  });
  // Record session spend ONLY on a confirmed live send (2xx) — a rejected order must not consume
  // the session budget and falsely block the next one.
  if (!result.dryRun && Number(result.status) >= 200 && Number(result.status) < 300) recordSessionNotional(notional);

  const rb = (() => {
    try { return typeof result.body === "string" ? JSON.parse(result.body) : result.body; }
    catch { return undefined; }
  })();

  // 6. Log live sends to local/trading-log.jsonl (order history stays the source of truth).
  if (!result.dryRun) {
    try {
      await log({
        ts: new Date().toISOString(),
        symbol, account: input.accountNumber, side,
        type: isMarket ? "market" : "limit",
        shares, price: isMarket ? last : Number(effectiveLimit),
        estimatedTotal: shares * last, refId,
        orderId: (rb as any)?.id ?? null, state: (rb as any)?.state ?? null, httpStatus: result.status
      });
    } catch { /* best-effort */ }
  }

  // 7. POST-SEND EVIDENCE (live sends only): after a 2xx, re-read the order from order history so
  // the result carries proof, not just an HTTP status (failure mode #20 — a lone 201 is not proof).
  // A failed/absent re-read is LOUD: confirmed:false + warning, never a silent success.
  // Zayd Khan // cold // www.zayd.wtf
  let evidence: OrderEvidence | undefined;
  if (!result.dryRun) {
    const sentId = (rb as any)?.id ?? null;
    const status = Number(result.status);
    if (status >= 200 && status < 300 && sentId) {
      evidence = await verifyOrderEvidence(String(sentId), "equity", { getJson });
    } else {
      evidence = {
        confirmed: false, id: sentId, state: (rb as any)?.state ?? null,
        warning: `EVIDENCE UNCONFIRMED: live send returned ${result.status}${sentId ? "" : " with no order id"} — treat as NOT executed until it appears in order history (the only proof an order happened).`
      };
    }
  }

  return {
    symbol, account: input.accountNumber, side, shares,
    estimatedPrice: last, estimatedTotal: shares * last,
    type: isMarket ? "market" : "limit",
    otcAutoLimit,
    dollarBased,
    session,
    sessionWarning,
    live: !result.dryRun, dryRun: result.dryRun, refId,
    orderId: (rb as any)?.id ?? (rb as any)?.url ?? null,
    state: (rb as any)?.state ?? null,
    httpStatus: result.status,
    result,
    evidence
  };
}

/**
 * Read one order by id-or-URL and resolve its ticker. Order objects carry an instrument URL,
 * not a symbol — the lookup joins instruments/?ids= so callers see "AAPL", not a UUID.
 * Symbol resolution is best-effort; the order itself is returned regardless.
 */
export async function getOrderStatus(idOrUrl: string, deps: { getJson?: typeof brokerageGetJson } = {}): Promise<any> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const order = await getJson("https://api.robinhood.com/orders/{0}/", { "0": extractOrderId(idOrUrl) });
  if (order && !order.symbol && typeof order.instrument === "string") {
    const m = /instruments\/([0-9a-f-]{8,})/i.exec(order.instrument);
    if (m) {
      try {
        const sym = (await getJson("https://api.robinhood.com/instruments/?ids={ids}", { ids: m[1] })).results?.[0]?.symbol;
        if (sym) return { ...order, symbol: sym };
      } catch { /* best-effort */ }
    }
  }
  return order;
}

// ───────────────────── Order evidence + cancel + panic + pretrade engines (shared CLI + MCP) ─────────────────────
// Zayd Khan // cold // www.zayd.wtf
//
// Failure mode #20 ("order history is the only proof an order happened") encoded as CODE, not
// discipline: every live send/cancel re-reads the order from order history and carries the result
// as `evidence`. A failed or absent re-read is LOUD (confirmed:false + warning), never silent.

export type OrderKind = "equity" | "options";

export interface OrderEvidence {
  /** True only when the order was re-read from brokerage order history after the live call. */
  confirmed: boolean;
  id: string | null;
  state: string | null;
  /** Present when confirmed is false (or the state contradicts the action) — surface it, never swallow it. */
  warning?: string;
}

/**
 * Re-read one order from brokerage order history (orders/{id}/ or options/orders/{id}/) and report
 * whether it actually exists there. This is the order-evidence rule as a function: a 201 alone is
 * NOT proof; the history record is. Never throws — a failed re-read returns confirmed:false with a
 * loud warning so callers can't mistake "couldn't verify" for "verified".
 */
export async function verifyOrderEvidence(
  idOrUrl: string,
  kind: OrderKind = "equity",
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<OrderEvidence> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const id = extractOrderId(idOrUrl);
  const url = kind === "options"
    ? "https://api.robinhood.com/options/orders/{0}/"
    : "https://api.robinhood.com/orders/{0}/";
  try {
    const order = await getJson(url, { "0": id });
    if (order && (order.id || order.state)) {
      return { confirmed: true, id: order.id ?? id, state: order.state ?? null };
    }
    return {
      confirmed: false, id, state: null,
      warning: `EVIDENCE UNCONFIRMED: ${kind} order ${id} re-read returned no order record — do NOT report this action as executed; brokerage order history is the only proof (failure mode #20).`
    };
  } catch (error) {
    return {
      confirmed: false, id, state: null,
      warning: `EVIDENCE UNCONFIRMED: ${kind} order ${id} re-read failed (${(error as Error).message.slice(0, 100)}) — do NOT report this action as executed; check order history directly (failure mode #20).`
    };
  }
}

export interface CancelOrderResult {
  orderId: string;
  kind: OrderKind;
  live: boolean;
  dryRun: boolean;
  httpStatus: number | string;
  state: string | null;
  /** Post-cancel order-history re-read (live sends only). */
  evidence?: OrderEvidence;
  gateReason?: string;
}

/**
 * Shared cancel path for equity AND options orders — single source for the CLI `cancel` command,
 * the MCP `robinhood_cancel` tool, and `panicCancelAll`. Env-gated via gatedBrokerageWrite
 * (dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 — the single switch; liveWrite optional). After a live 2xx it
 * re-reads the order and reports evidence; a cancel whose re-read is not cancelled/pending gets a
 * warning (it may have filled before the cancel landed).
 */
export async function cancelOrder(
  input: { idOrUrl: string; kind?: OrderKind; liveWrite?: boolean; dryRun?: boolean; logContext?: string },
  deps: { write?: typeof gatedBrokerageWrite; getJson?: typeof brokerageGetJson } = {}
): Promise<CancelOrderResult> {
  const write = deps.write ?? gatedBrokerageWrite;
  const getJson = deps.getJson ?? brokerageGetJson;
  const kind: OrderKind = input.kind ?? "equity";
  const id = extractOrderId(input.idOrUrl);
  const liveWrite = Boolean(input.liveWrite);
  const isDryRun = input.dryRun ?? !liveWrite;

  // 0. Owned-account guard (live cancels only — dry-runs are safe). Pre-read the order to get its
  // account, assert OWNERSHIP, AND capture the account so the ROBINHOOD_ALLOWED_ACCOUNT lock scopes
  // the cancel too (N1). Degrades gracefully: a failed pre-read warns but proceeds.
  let cancelAccount: string | undefined;
  if (!isDryRun) {
    try {
      const preUrl = kind === "options"
        ? "https://api.robinhood.com/options/orders/{0}/"
        : "https://api.robinhood.com/orders/{0}/";
      const order = await getJson(preUrl, { "0": id });
      const acctUrl = order?.account;
      if (acctUrl) {
        const acctNum = typeof acctUrl === "string"
          ? acctUrl.replace(/\/$/, "").split("/").pop()
          : String(acctUrl).replace(/\/$/, "").split("/").pop();
        if (acctNum) { cancelAccount = acctNum; await assertAccountOwned(acctNum, { getJson }); }
      }
    } catch (e: any) {
      // If the assertion throws (unowned account), propagate it.
      if (String(e?.message ?? "").includes("not one of your trading accounts")) throw e;
      // Otherwise (pre-read failed, network error, etc.), warn and proceed.
      process.stderr.write(`⚠️  Could not verify account ownership for ${kind} order ${id} (lookup failed). Proceeding — double-check the order.\\n`);
    }
  }

  const url = kind === "options"
    ? "https://api.robinhood.com/options/orders/{0}/cancel/"
    : "https://api.robinhood.com/orders/{0}/cancel/";
  const result = await write({
    url, method: "POST", params: { "0": id },
    dryRun: isDryRun, liveWrite,
    accountNumber: cancelAccount, // N1 — scope the allow-list to the order's account
    logContext: input.logContext ?? `cancel ${kind} order ${id}`
  });
  const rb = (() => {
    try { return typeof result.body === "string" ? JSON.parse(result.body) : result.body; }
    catch { return undefined; }
  })();
  let evidence: OrderEvidence | undefined;
  if (!result.dryRun) {
    const status = Number(result.status);
    if (status >= 200 && status < 300) {
      evidence = await verifyOrderEvidence(id, kind, deps);
      if (evidence.confirmed && evidence.state && !/cancel/i.test(evidence.state)) {
        evidence = {
          ...evidence,
          warning: `Cancel accepted (${result.status}) but the order re-reads as '${evidence.state}' — it may have filled before the cancel landed; verify in order history.`
        };
      }
    } else {
      evidence = {
        confirmed: false, id, state: (rb as any)?.state ?? null,
        warning: `EVIDENCE UNCONFIRMED: cancel returned ${result.status} — the order may still be open; check order history.`
      };
    }
  }
  return {
    orderId: id, kind, live: !result.dryRun, dryRun: result.dryRun,
    httpStatus: result.status, state: (rb as any)?.state ?? null, evidence, gateReason: result.reason
  };
}

// ── Open-order enumeration (orders open + panic's read half) ──────────────────────────────────

/** States Robinhood reports for not-yet-terminal orders (verified live: options/orders/?states= accepts a comma list). */
export const OPEN_ORDER_STATES = ["queued", "unconfirmed", "confirmed", "partially_filled"] as const;
const TERMINAL_ORDER_STATES = new Set(["filled", "cancelled", "rejected", "failed", "expired", "voided"]);

/** True when an order state is non-terminal (open/pending). Unknown states count as open — safer for panic. */
export function isOpenOrderState(state: unknown): boolean {
  const s = String(state ?? "").toLowerCase();
  return s !== "" && !TERMINAL_ORDER_STATES.has(s);
}

export interface OpenOrderRow {
  kind: OrderKind;
  id: string;
  accountNumber: string;
  accountLabel: string;
  symbol: string;
  description: string;
  side: string | null;
  state: string;
  quantity: number;
  /** Limit price per share/contract (NaN for market). */
  price: number;
  /** Order notional in dollars (options ×100). NaN when unpriceable. */
  notionalUsd: number;
  timeInForce: string | null;
  createdAt: string | null;
  ageHours: number | null;
  cancelCommand: string;
}

/**
 * Every open/pending order across ALL owned accounts (or one): equity orders/ (is_closed=false)
 * + options/orders/ (states=queued,confirmed,unconfirmed,partially_filled), symbol-resolved
 * (equity instrument UUIDs batch-joined), with age, TIF, limit, and the exact cancel command.
 * Shared by the CLI `orders open`, `panic`, and the MCP robinhood_orders_open/robinhood_panic.
 * Read-only; per-account failures degrade to warnings.
 */
export async function listOpenOrders(
  opts: { accountNumber?: string } = {},
  deps: { getJson?: typeof brokerageGetJson; now?: () => number } = {}
): Promise<{ accountsScanned: string[]; orders: OpenOrderRow[]; warnings: string[] }> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const now = deps.now ?? Date.now;
  const n = (v: unknown) => Number(v);
  const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
  const warnings: string[] = [];
  const orders: OpenOrderRow[] = [];
  const ageOf = (created: unknown): number | null => {
    const t = Date.parse(String(created ?? ""));
    return Number.isFinite(t) ? Math.round(((now() - t) / 3_600_000) * 10) / 10 : null;
  };

  for (const { acct, label } of accts) {
    try {
      const eq = await getJson("https://api.robinhood.com/orders/", {}, { account_numbers: acct, is_closed: "false" });
      for (const o of (eq?.results ?? []).filter((r: any) => isOpenOrderState(r?.state))) {
        const qty = n(o.quantity);
        const price = o.price != null ? n(o.price) : Number.NaN;
        orders.push({
          kind: "equity", id: String(o.id ?? ""), accountNumber: acct, accountLabel: label,
          symbol: o.symbol ?? String(o.instrument_id ?? o.instrument ?? "?"), // resolved below if UUID
          description: `${o.side ?? "?"} ${o.quantity ?? "?"} sh ${o.type ?? "?"}${Number.isFinite(price) ? ` @ $${price.toFixed(2)}` : ""}`,
          side: o.side ?? null, state: String(o.state ?? "?"), quantity: qty, price,
          notionalUsd: Number.isFinite(price) && Number.isFinite(qty) ? price * qty : Number.NaN,
          timeInForce: o.time_in_force ?? null, createdAt: o.created_at ?? null, ageHours: ageOf(o.created_at),
          cancelCommand: `node cli/dist/index.js cancel -i ${o.id} --kind equity   # dry-run; add ROBINHOOD_ALLOW_LIVE_WRITE=1 (--live optional) to send`
        });
      }
    } catch (e: any) { warnings.push(`equity open-orders read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }
    try {
      const op = await getJson("https://api.robinhood.com/options/orders/", {}, { account_numbers: acct, states: OPEN_ORDER_STATES.join(",") });
      for (const o of (op?.results ?? []).filter((r: any) => isOpenOrderState(r?.state))) {
        const qty = n(o.quantity);
        const price = o.price != null ? n(o.price) : Number.NaN;
        const strat = o.opening_strategy ?? o.closing_strategy ?? "";
        orders.push({
          kind: "options", id: String(o.id ?? ""), accountNumber: acct, accountLabel: label,
          symbol: o.chain_symbol ?? "?",
          description: `${strat} ${o.direction ? `(${o.direction})` : ""} ${o.quantity ?? "?"}×${Number.isFinite(price) ? ` @ $${price.toFixed(2)}` : ""}`.trim(),
          side: o.direction ?? null, state: String(o.state ?? "?"), quantity: qty, price,
          notionalUsd: Number.isFinite(price) && Number.isFinite(qty) ? price * qty * 100 : Number.NaN,
          timeInForce: o.time_in_force ?? null, createdAt: o.created_at ?? null, ageHours: ageOf(o.created_at),
          cancelCommand: `node cli/dist/index.js cancel -i ${o.id} --kind options   # dry-run; add ROBINHOOD_ALLOW_LIVE_WRITE=1 (--live optional) to send`
        });
      }
    } catch (e: any) { warnings.push(`options open-orders read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }
  }

  // Equity orders carry instrument UUIDs, not tickers — batch-resolve any unresolved symbols.
  const unresolved = orders.filter((o) => o.kind === "equity" && /[0-9a-f]{8}-[0-9a-f]{4}/i.test(o.symbol));
  if (unresolved.length) {
    try {
      const ids = [...new Set(unresolved.map((o) => {
        const m = /instruments\/([0-9a-f-]{8,})/i.exec(o.symbol);
        return m ? m[1] : o.symbol;
      }))];
      const data = await getJson("https://api.robinhood.com/instruments/?ids={ids}", { ids: ids.join(",") });
      const bySym = new Map<string, string>();
      for (const r of data?.results ?? []) if (r?.id && r?.symbol) bySym.set(String(r.id), String(r.symbol));
      for (const o of unresolved) {
        const m = /([0-9a-f]{8}-[0-9a-f-]{27,})/i.exec(o.symbol);
        const sym = m ? bySym.get(m[1]) : undefined;
        if (sym) o.symbol = sym;
      }
    } catch { warnings.push("equity instrument→ticker resolution failed — some open orders show UUIDs"); }
  }

  orders.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return { accountsScanned: accts.map((a) => a.acct), orders, warnings };
}

export interface PanicCancelRecord {
  httpStatus: number | string;
  dryRun: boolean;
  state: string | null;
  evidence?: OrderEvidence;
  gateReason?: string;
  error?: string;
}

export interface PanicResult {
  dryRun: boolean;
  accountsScanned: string[];
  found: number;
  cancelled: number;
  failed: number;
  orders: Array<OpenOrderRow & { cancel: PanicCancelRecord }>;
  warnings: string[];
  summary: string;
}

/**
 * PANIC: enumerate every open/pending order across ALL owned accounts and cancel each one —
 * every cancel individually env-gated through gatedBrokerageWrite (logContext "panic
 * cancel-all"). Dry-run by default: shows the full would-cancel list and sends NOTHING; a live
 * run needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; liveWrite optional) and re-reads each order for evidence.
 * One failed cancel never stops the sweep.
 */
export async function panicCancelAll(
  opts: { accountNumber?: string; liveWrite?: boolean; dryRun?: boolean } = {},
  deps: { getJson?: typeof brokerageGetJson; write?: typeof gatedBrokerageWrite; now?: () => number } = {}
): Promise<PanicResult> {
  const open = await listOpenOrders({ accountNumber: opts.accountNumber }, deps);
  const liveWrite = Boolean(opts.liveWrite);
  const rows: Array<OpenOrderRow & { cancel: PanicCancelRecord }> = [];
  let cancelled = 0;
  let failed = 0;
  for (const o of open.orders) {
    try {
      const r = await cancelOrder({
        idOrUrl: o.id, kind: o.kind, liveWrite,
        dryRun: opts.dryRun ?? !liveWrite,
        logContext: `panic cancel-all: ${o.kind} ${o.symbol} ${o.description} (acct …${o.accountNumber.slice(-4)})`
      }, deps);
      if (!r.dryRun) {
        const ok = Number(r.httpStatus) >= 200 && Number(r.httpStatus) < 300 && r.evidence?.confirmed !== false;
        if (ok) cancelled++; else failed++;
      }
      rows.push({ ...o, cancel: { httpStatus: r.httpStatus, dryRun: r.dryRun, state: r.state, evidence: r.evidence, gateReason: r.gateReason } });
    } catch (error) {
      failed++;
      rows.push({ ...o, cancel: { httpStatus: "error", dryRun: process.env.ROBINHOOD_ALLOW_LIVE_WRITE !== "1", state: null, error: (error as Error).message } });
    }
  }
  const dryRun = rows.length > 0 ? rows.every((r) => r.cancel.dryRun) : process.env.ROBINHOOD_ALLOW_LIVE_WRITE !== "1";
  const summary = rows.length === 0
    ? `No open/pending orders found across ${open.accountsScanned.length} account(s) — nothing to cancel.`
    : dryRun
      ? `DRY RUN: ${rows.length} open order(s) WOULD be cancelled — nothing was sent. Re-run with ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional) to cancel for real.`
      : `${rows.length} open order(s) found: ${cancelled} cancelled, ${failed} failed (evidence re-read per cancel; order history is the source of truth).`;
  return { dryRun, accountsScanned: open.accountsScanned, found: rows.length, cancelled, failed, orders: rows, warnings: open.warnings, summary };
}

// ── Account capability classification (shared by `accounts`, pretrade) ───────────────────────

/** Capability class for an account record (cash vs margin vs IRA) — moved here from the CLI so pretrade shares it. */
export function accountCapabilities(account: Record<string, any>): {
  canMarginBorrow: boolean;
  canRollOnMargin: boolean;
  canNakedShort: boolean;
  note: string;
} {
  const type = String(account?.type ?? "").toLowerCase();
  const brokType = String(account?.brokerage_account_type ?? "").toLowerCase();
  const isIra = brokType.includes("ira") || brokType.includes("roth") || type.includes("ira") || type.includes("roth");
  const isMargin = type === "margin" && !isIra;
  if (isIra) {
    return {
      canMarginBorrow: false,
      canRollOnMargin: false,
      canNakedShort: false,
      note: "IRA: long options, defined-risk spreads, and covered calls only — no margin borrowing and no naked/undefined-risk shorts."
    };
  }
  if (isMargin) {
    return {
      canMarginBorrow: true,
      canRollOnMargin: true,
      canNakedShort: true,
      note: "Margin: can borrow, roll, and run spreads/shorts that need buying power. PDT lifted on RH - no $25k day-trade cap (FINRA eliminated it 2026-06-04); maintenance margin still applies."
    };
  }
  return {
    canMarginBorrow: false,
    canRollOnMargin: false,
    canNakedShort: false,
    note: "Cash: buy/sell, cash-secured puts, covered calls, and debit spreads only. No margin borrowing, no naked/undefined-risk shorts, and no margin rolls — rolling is limited to closing then re-opening with SETTLED cash (T+1; watch good-faith violations)."
  };
}

// ── Pre-trade checklist engine ─────────────────────────────────────────────────────────────────

export type PretradeStatus = "PASS" | "WARN" | "BLOCK" | "MANUAL" | "SKIP";

export interface PretradeCheck {
  id: string;
  status: PretradeStatus;
  detail: string;
}

export interface PretradeReport {
  accountNumber: string;
  accountClass: string | null;
  checks: PretradeCheck[];
  clear: boolean;
  summary: string;
  resolved: Record<string, unknown>;
  note: string;
}

export interface PretradeInput {
  accountNumber: string;
  symbol?: string;
  chainId?: string;
  strike?: number;
  expiration?: string;
  optionType?: "call" | "put";
  limitPrice?: number;
}

/**
 * Pre-trade PASS/WARN/BLOCK checklist — every check it can run with the inputs given, each
 * degrading independently (a failed read is a WARN, never a crash):
 *   (a) account exists + capability class (cash/margin/IRA gating)
 *   (b) buying_power_breakdown (+ the overnight-BP note for GTC option opens)
 *   (c) options buying power / fees / collateral (readOptionsOrderFlow; collateral when chain known)
 *   (d) min-tick vs --limit-price (the ARKG $0.05 trap; reads options/chains/{id} min_ticks)
 *   (e) marketability — a POST, so it is surfaced as a manual gated command, NEVER sent from here
 *   (f) OTC/fractional guard for the equity symbol
 *   (+) exact-contract existence when strike/expiration/type are given
 * STRICTLY READ-ONLY: this engine never POSTs anything. Summary: "CLEAR TO BUILD ORDER" or
 * "BLOCKED: <reasons>" (only BLOCK blocks; WARN/MANUAL/SKIP are advisory).
 */
export async function runPretradeChecks(
  opts: PretradeInput,
  deps: { getJson?: typeof brokerageGetJson; getAll?: typeof brokerageGetAllResults } = {}
): Promise<PretradeReport> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const getAll = deps.getAll ?? brokerageGetAllResults;
  const n = (v: unknown) => Number(v);
  const checks: PretradeCheck[] = [];
  const resolved: Record<string, unknown> = {};
  let accountClass: string | null = null;
  const acct = String(opts.accountNumber);

  // (a) account exists + capability class
  try {
    const accts = await listOwnedTradingAccounts(getJson);
    const hit = accts.find((a) => a.acct === acct);
    if (!hit) {
      checks.push({ id: "account", status: "BLOCK", detail: `Account ${acct} is not one of your trading accounts (${accts.map((a) => "…" + a.acct.slice(-4)).join(", ")}) — wrong-account risk; refusing to plan against it.` });
    } else {
      // transfer graph type distinguishes IRA; cash/margin needs the per-account detail read.
      const graph = await getJson("https://bonfire.robinhood.com/transfer/accounts/");
      const rows: any[] = Array.isArray(graph?.results) ? graph.results : [];
      const graphRow = rows.find((r) => String(r?.account_number) === acct);
      const isIra = String(graphRow?.type ?? "").includes("ira");
      let detail: Record<string, any> = {};
      try { detail = await getJson("https://api.robinhood.com/accounts/{account_number}/", { account_number: acct }); } catch { /* degrade to graph type */ }
      const acctRecord = { ...detail, ...(isIra ? { brokerage_account_type: "ira_roth" } : {}) };
      const caps = accountCapabilities(acctRecord);
      accountClass = isIra ? "ira" : String(detail?.type ?? "unverified").toLowerCase();
      resolved.accountClass = accountClass;
      resolved.accountLabel = hit.label;
      checks.push({ id: "account", status: "PASS", detail: `Account …${acct.slice(-4)}${hit.label ? ` (${hit.label})` : ""} owned; class=${accountClass}. ${caps.note}` });
    }
  } catch (e: any) { checks.push({ id: "account", status: "WARN", detail: `account check failed: ${(e as Error).message.slice(0, 80)}` }); }

  // (b) buying power breakdown
  try {
    const bp = await getJson("https://api.robinhood.com/accounts/{account_number}/buying_power_breakdown", { account_number: acct });
    const regular = n(bp?.buying_power);
    resolved.buyingPower = regular;
    checks.push({
      id: "buying-power", status: Number.isFinite(regular) ? "PASS" : "WARN",
      detail: `Regular BP $${Number.isFinite(regular) ? regular.toFixed(2) : "?"}; intraday $${Number.isFinite(n(bp?.intraday_buying_power)) ? n(bp.intraday_buying_power).toFixed(2) : "?"}. NOTE: GTC option OPENS are gated by OVERNIGHT options buying power, not regular BP — regular BP looking fine does not mean a GTC open clears (see options-buying-power check).`
    });
  } catch (e: any) { checks.push({ id: "buying-power", status: "WARN", detail: `buying_power_breakdown read failed: ${(e as Error).message.slice(0, 80)}` }); }

  // Resolve the chain when only a symbol was given (needed for collateral + min-tick).
  let chainId = opts.chainId;
  let instrument: any;
  if (opts.symbol) {
    try {
      instrument = (await getJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: opts.symbol.toUpperCase() })).results?.[0];
      if (instrument && !chainId && instrument.tradable_chain_id) chainId = String(instrument.tradable_chain_id);
      if (chainId) resolved.chainId = chainId;
    } catch { /* the dependent checks degrade below */ }
  }

  // (c) options buying power / fees / collateral — shared pre-trade reads, each degrades inside.
  try {
    const flow = await readOptionsOrderFlow({ accountNumber: acct, chainId }, { getJson });
    const obp = n(flow.buyingPower?.options_buying_power ?? flow.buyingPower?.buying_power ?? flow.buyingPower?.amount);
    checks.push({
      id: "options-buying-power",
      status: flow.buyingPower ? "PASS" : "WARN",
      detail: flow.buyingPower
        ? `Options buying power read OK${Number.isFinite(obp) ? ` ($${obp.toFixed(2)})` : ""} — this (and overnight BP for GTC opens) is the real gate on option opens.`
        : `options buying power unavailable: ${flow.warnings.join("; ").slice(0, 100)}`
    });
    checks.push({
      id: "collateral",
      status: flow.collateral ? "PASS" : chainId ? "WARN" : "SKIP",
      detail: flow.collateral
        ? `Collateral requirements read OK${chainId ? ` for chain ${chainId}` : " (account-level)"} — covered calls need 100 shares/contract in the SAME account; CSPs need the cash.`
        : chainId
          ? `collateral read failed: ${flow.warnings.join("; ").slice(0, 100)}`
          : "no --symbol/--chain-id given; per-chain collateral skipped."
    });
    if (flow.fees) resolved.feesRead = true;
  } catch (e: any) { checks.push({ id: "options-buying-power", status: "WARN", detail: `options order-flow reads failed: ${(e as Error).message.slice(0, 80)}` }); }

  // (d) min-tick vs limit price (the ARKG $0.05 trap)
  if (chainId) {
    try {
      const chain = await getJson("https://api.robinhood.com/options/chains/{id}/", { id: chainId });
      const mt = chain?.min_ticks ?? {};
      const below = n(mt.below_tick);
      const above = n(mt.above_tick);
      const cutoff = n(mt.cutoff_price);
      resolved.minTicks = { belowTick: below, aboveTick: above, cutoffPrice: cutoff };
      if (opts.limitPrice == null) {
        checks.push({ id: "min-tick", status: "SKIP", detail: `No --limit-price given. Chain min_ticks: $${below} below the $${cutoff} cutoff, $${above} above — limits must land on the tick ($0.01 on a $0.05 chain → 400).` });
      } else {
        const price = Number(opts.limitPrice);
        const tick = Number.isFinite(cutoff) && price < cutoff ? below : above;
        const onTick = Number.isFinite(tick) && tick > 0 ? Math.abs(price / tick - Math.round(price / tick)) < 1e-6 : true;
        checks.push({
          id: "min-tick",
          status: onTick ? "PASS" : "BLOCK",
          detail: onTick
            ? `Limit $${price} satisfies the chain tick ($${tick} ${price < cutoff ? "below" : "at/above"} the $${cutoff} cutoff).`
            : `Limit $${price} is NOT a multiple of the chain tick $${tick} (cutoff $${cutoff}) — Robinhood 400s with "Price does not satisfy the min tick value" (the ARKG $0.05 trap). Nearest valid: $${(Math.round(price / tick) * tick).toFixed(2)}.`
        });
      }
    } catch (e: any) { checks.push({ id: "min-tick", status: "WARN", detail: `chain min_ticks read failed: ${(e as Error).message.slice(0, 80)}` }); }
  } else if (opts.limitPrice != null) {
    checks.push({ id: "min-tick", status: "WARN", detail: "limit price given but no chain resolved (--symbol or --chain-id needed) — min-tick can't be verified; do not assume $0.01 is valid." });
  }

  // (+) exact-contract existence when strike/expiration/type are given
  if (chainId && opts.strike != null && opts.expiration && opts.optionType) {
    try {
      const rows = await getAll(
        "https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}",
        { chain_id: chainId, expiration_dates: opts.expiration, type: opts.optionType }
      );
      const hit = rows.find((r: any) => Math.abs(n(r?.strike_price) - Number(opts.strike)) < 1e-6);
      if (hit) {
        resolved.optionInstrumentId = hit.id;
        checks.push({ id: "contract", status: "PASS", detail: `${opts.symbol ?? chainId} ${opts.expiration} $${opts.strike} ${opts.optionType} exists — option_instrument_id ${hit.id}.` });
      } else {
        const strikes = rows.map((r: any) => n(r?.strike_price)).filter(Number.isFinite).sort((a: number, b: number) => a - b);
        checks.push({ id: "contract", status: "BLOCK", detail: `No active $${opts.strike} ${opts.optionType} for ${opts.expiration} on this chain. ${strikes.length} strikes listed (${strikes.slice(0, 5).join(", ")} … ${strikes.slice(-3).join(", ")}).` });
      }
    } catch (e: any) { checks.push({ id: "contract", status: "WARN", detail: `contract enumeration failed: ${(e as Error).message.slice(0, 80)}` }); }
  }

  // (e) marketability — POST-only; surfaced as a manual gated step, never sent from here.
  checks.push({
    id: "marketability",
    status: "MANUAL",
    detail: `manual step (POST, gated): options/orders/marketability/ is a POST — pretrade never sends it. To probe marketability yourself, dry-run first: node cli/dist/index.js brokerage execute "https://bonfire.robinhood.com/options/orders/marketability/" --method POST --body-json '<order body>' --dry-run --json   (a live probe needs ROBINHOOD_ALLOW_LIVE_WRITE=1 — the single switch; --live-write optional).`
  });

  // (f) OTC / fractional guard for the equity symbol
  if (opts.symbol) {
    if (instrument) {
      const frac = String(instrument.fractional_tradability ?? "");
      const otc = Boolean(instrument.otc_market_tier) || frac === "position_closing_only";
      resolved.fractionalTradability = frac;
      checks.push({
        id: "otc-fractional",
        status: frac === "tradable" && !otc ? "PASS" : "WARN",
        detail: frac === "tradable" && !otc
          ? `${opts.symbol.toUpperCase()} is fractional-tradable — dollar-notional orders OK.`
          : `${opts.symbol.toUpperCase()}: fractional_tradability=${frac || "?"}${otc ? " (OTC)" : ""} — a "$X of ${opts.symbol.toUpperCase()}" dollar order is IMPOSSIBLE; use whole shares + a marketable limit (failure mode #4).`
      });
    } else {
      checks.push({ id: "otc-fractional", status: "WARN", detail: `instrument lookup failed for ${opts.symbol.toUpperCase()} — OTC/fractional status unknown.` });
    }
  }

  const blocks = checks.filter((c) => c.status === "BLOCK");
  const clear = blocks.length === 0;
  return {
    accountNumber: acct,
    accountClass,
    checks,
    clear,
    summary: clear ? "CLEAR TO BUILD ORDER" : `BLOCKED: ${blocks.map((b) => `${b.id} — ${b.detail}`).join(" | ")}`,
    resolved,
    note: "READ-ONLY preflight: nothing was sent. CLEAR means no hard blocker was found with the inputs given — it is NOT order approval; build the dry-run body next, then send only with the ROBINHOOD_ALLOW_LIVE_WRITE=1 switch."
  };
}

// ── Options close engine (sell-to-close / buy-to-close, never open) ───────────────────────────

/**
 * Pure mapping from a position's direction to the CLOSING leg orientation. The whole point of
 * `options close`: position_effect is ALWAYS "close" — long closes sell (credit), short closes
 * buy (debit). Never infers an open. Throws on an unknown direction instead of guessing.
 */
export function closeLegOrientation(positionType: string): { side: "buy" | "sell"; positionEffect: "close"; direction: "debit" | "credit" } {
  const p = String(positionType ?? "").toLowerCase();
  if (p === "long") return { side: "sell", positionEffect: "close", direction: "credit" };
  if (p === "short") return { side: "buy", positionEffect: "close", direction: "debit" };
  throw new Error(`Unknown position direction "${positionType}" — cannot infer the closing side; inspect the position (options inspect) and build the order manually.`);
}

export interface OptionsCloseCandidate {
  accountNumber: string;
  accountLabel: string;
  symbol: string;
  strategy: string;
  positionType: string;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  quantity: number;
  averageOpenPrice: number;
  optionId: string | null;
  multiLeg: boolean;
}

/**
 * Build a DRY-RUN close plan for an open option position: finds the position(s) for SYMBOL across
 * all owned accounts (aggregate_positions per account), requires --account/--strike/--expiration
 * disambiguation when several match, then derives the closing side/effect from the position's
 * direction (closeLegOrientation), quotes live bid/ask, computes a tick-rounded mid limit, and
 * emits the exact order body + the gated send command. NEVER sends anything itself; multi-leg
 * positions are listed but not auto-closed (use strategy-quote/roll-plan).
 */
export async function buildOptionsClosePlan(
  opts: { symbol: string; accountNumber?: string; strike?: number; expiration?: string; optionType?: "call" | "put"; quantity?: number },
  deps: { getJson?: typeof brokerageGetJson; getAll?: typeof brokerageGetAllResults } = {}
): Promise<any> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const getAll = deps.getAll ?? brokerageGetAllResults;
  const n = (v: unknown) => Number(v);
  const symbol = opts.symbol.toUpperCase();
  const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
  const warnings: string[] = [];

  // 1. Find every open position on the symbol across the scanned accounts.
  const candidates: OptionsCloseCandidate[] = [];
  for (const { acct, label } of accts) {
    try {
      const agg = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
      for (const p of agg) {
        if (String(p?.symbol ?? "").toUpperCase() !== symbol || !(n(p?.quantity) > 0)) continue;
        const legs = Array.isArray(p?.legs) ? p.legs : [];
        const leg = legs[0] ?? {};
        candidates.push({
          accountNumber: acct, accountLabel: label, symbol,
          strategy: String(p?.strategy ?? ""),
          positionType: String(leg?.position_type ?? (String(p?.strategy ?? "").startsWith("short") ? "short" : String(p?.strategy ?? "").startsWith("long") ? "long" : "")),
          optionType: leg?.option_type ?? null,
          strike: Number.isFinite(n(leg?.strike_price)) ? n(leg?.strike_price) : null,
          expiration: leg?.expiration_date ?? null,
          quantity: n(p?.quantity),
          averageOpenPrice: n(p?.average_open_price),
          optionId: leg?.option_id ?? null,
          multiLeg: legs.length > 1
        });
      }
    } catch (e: any) { warnings.push(`option positions read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }
  }
  if (candidates.length === 0) {
    throw new Error(`No open ${symbol} option position found across ${accts.length} account(s)${opts.accountNumber ? ` (account …${String(opts.accountNumber).slice(-4)})` : ""}. \`options close\` only closes existing positions — it never opens.`);
  }

  // 2. Apply disambiguators.
  let matches = candidates;
  if (opts.strike != null) matches = matches.filter((c) => c.strike != null && Math.abs(c.strike - Number(opts.strike)) < 1e-6);
  if (opts.expiration) matches = matches.filter((c) => c.expiration === opts.expiration);
  if (opts.optionType) matches = matches.filter((c) => c.optionType === opts.optionType);
  if (matches.length === 0) {
    return { symbol, needsDisambiguation: true, matched: 0, candidates, warnings, hint: "Filters matched nothing — the held contracts are listed in `candidates`; re-run with a strike/expiration/type from that list." };
  }
  if (matches.length > 1) {
    return { symbol, needsDisambiguation: true, matched: matches.length, candidates: matches, warnings, hint: "Multiple open positions match — re-run with --account/--strike/--expiration (and --type) to pick exactly one." };
  }
  const pos = matches[0];
  if (pos.multiLeg) {
    return { symbol, needsDisambiguation: false, multiLeg: true, position: pos, warnings, hint: "This is a MULTI-LEG position — `options close` only automates single-leg closes. Close it as a package via `options strategy-quote` (closing legs) or `options roll-plan`." };
  }
  if (!pos.optionId) throw new Error(`Matched the ${symbol} position but it carries no option_instrument_id — inspect with \`options holdings\`.`);

  // 3. Orientation from the position's direction — position_effect is ALWAYS close.
  const orientation = closeLegOrientation(pos.positionType);

  // 4. Live quote + tick-rounded mid limit.
  const mark = (await getJson("https://api.robinhood.com/marketdata/options/?ids={ids}", { ids: pos.optionId })).results?.[0] ?? {};
  const bid = n(mark.bid_price);
  const ask = n(mark.ask_price);
  const adj = n(mark.adjusted_mark_price ?? mark.mark_price);
  let mid = Number.isFinite(bid) && Number.isFinite(ask) && (bid > 0 || ask > 0) ? (bid + ask) / 2 : adj;
  let tick: number | null = null;
  try {
    const meta = await getJson("https://api.robinhood.com/options/instruments/{0}/", { "0": pos.optionId });
    if (meta?.chain_id) {
      const chain = await getJson("https://api.robinhood.com/options/chains/{id}/", { id: String(meta.chain_id) });
      const mt = chain?.min_ticks ?? {};
      const cutoff = n(mt.cutoff_price);
      tick = Number.isFinite(cutoff) && mid < cutoff ? n(mt.below_tick) : n(mt.above_tick);
      if (Number.isFinite(tick) && (tick as number) > 0) mid = Math.max(tick as number, Math.round(mid / (tick as number)) * (tick as number));
    }
  } catch { warnings.push("chain min_ticks read failed — mid limit not tick-rounded; check the chain before sending"); }
  if (!Number.isFinite(mid) || mid <= 0) {
    warnings.push("no usable bid/ask/mark — limit price left at 0.01 placeholder; re-quote before sending");
    mid = 0.01;
  }

  // 5. The exact dry-run body + gated send command (this function NEVER sends).
  const quantity = opts.quantity != null ? Number(opts.quantity) : pos.quantity;
  if (!(quantity > 0) || quantity > pos.quantity) throw new Error(`Close quantity ${quantity} is invalid for a position of ${pos.quantity} contract(s).`);
  const body = {
    account: `https://api.robinhood.com/accounts/${pos.accountNumber}/`,
    direction: orientation.direction,
    legs: [{
      side: orientation.side,
      option: `https://api.robinhood.com/options/instruments/${pos.optionId}/`,
      position_effect: orientation.positionEffect,
      ratio_quantity: 1
    }],
    type: "limit",
    time_in_force: "gfd",
    trigger: "immediate",
    price: (Math.round(mid * 100) / 100).toFixed(2),
    quantity: String(quantity),
    ref_id: randomUUID()
  };
  const bodyJson = JSON.stringify(body);
  return {
    symbol,
    needsDisambiguation: false,
    position: pos,
    orientation,
    action: orientation.side === "sell" ? "sell-to-close" : "buy-to-close",
    quote: { bid, ask, mark: adj, midLimit: Number(body.price), tick },
    dryRun: true,
    dryRunBody: body,
    commands: {
      dryRun: `node cli/dist/index.js brokerage execute "https://api.robinhood.com/options/orders/" --method POST --body-json '${bodyJson}' --json`,
      gatedSend: `ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js brokerage execute "https://api.robinhood.com/options/orders/" --method POST --body-json '${bodyJson}' --live-write --json`
    },
    warnings,
    note: "DRY-RUN plan only — nothing was sent. position_effect is always close (never infers an open). Re-quote bid/ask before a live send; after sending, verify in order history (the only proof)."
  };
}

// ───────────────────────── Wheel engine (status + next leg, shared CLI + MCP) ─────────────────────────
// "Where am I in the wheel, and what's the next leg?" answered from ACCOUNT EVIDENCE — shares held,
// short puts (CSP leg), short calls (CC leg) — never from memory of past intent. The classifier is
// pure and unit-tested; the composition reads positions + aggregate option positions (whose legs are
// self-describing: position_type/option_type/strike_price/expiration_date come inline, no per-leg
// instrument fetches). Descriptive, not prescriptive: it names the conventional next leg and emits
// the exact dry-run command, the operator decides. Background: docs/strategy-deep-dive-the-wheel-2026-06-04.md

export const WHEEL_DOC = "docs/strategy-deep-dive-the-wheel-2026-06-04.md";

export interface WheelLeg {
  optionId: string | null;
  side: "short" | "long" | "unknown";
  type: "call" | "put" | "unknown";
  strike: number | null;
  expiration: string | null;
  dte: number | null;
  contracts: number;
  strategy: string;
}

export interface WheelStateInput {
  sharesQty: number;
  avgCost: number | null;
  shortPuts: WheelLeg[];
  shortCalls: WheelLeg[];
  otherLegs: WheelLeg[];
}

export interface WheelNextLeg {
  action: string;
  rationale: string;
  /** The literal dry-run command to run next (never sends; live needs the ROBINHOOD_ALLOW_LIVE_WRITE=1 switch). */
  command: string | null;
}

export interface WheelClassification {
  stage: "not-started" | "cash-secured-put-open" | "csp-plus-shares" | "shares-uncovered"
    | "covered-call-open" | "short-call-undercovered" | "sub-100-shares";
  summary: string;
  nextLeg: WheelNextLeg;
  blockers: string[];
}

const fmtWheelLeg = (l: WheelLeg) =>
  `${l.contracts}× $${l.strike ?? "?"} ${l.type === "put" ? "P" : l.type === "call" ? "C" : "?"} ${l.expiration ?? "?"}${l.dte != null ? ` (${l.dte}d)` : ""}`;

/**
 * Pure wheel-stage classifier — exported for tests. Stages map to the wheel's legs:
 * CSP open (leg 1) → assigned/holding ≥100 shares (leg 2) → covered call open (leg 3) → called
 * away → back to leg 1. Coverage math is the one hard safety check: short calls beyond
 * shares/100 are flagged as naked/undercovered, never normalized.
 */
export function classifyWheelStage(
  s: WheelStateInput,
  ctx: { symbol?: string; accountNumber?: string } = {}
): WheelClassification {
  const S = ctx.symbol ?? "<SYMBOL>";
  const N = ctx.accountNumber ?? "<ACCOUNT_NUMBER>";
  const ccContracts = s.shortCalls.reduce((a, l) => a + l.contracts, 0);
  const cspContracts = s.shortPuts.reduce((a, l) => a + l.contracts, 0);
  const blockers: string[] = [];
  const extras = s.otherLegs.length
    ? ` ${s.otherLegs.length} non-wheel option leg(s) also present (long/multi-leg) — not counted as wheel legs.`
    : "";

  const cspQuote = `options strategy-quote cash-secured-short-put --account ${N} --symbol ${S} --expiration <pick via: options expirations ${S}> --leg short_put=<strike> --pricing-mode safe-sell-probe --json`;
  const ccQuote = (basisNote: string) =>
    `options strategy-quote covered-call --account ${N} --symbol ${S} --expiration <pick via: options expirations ${S}> --leg short_call=<strike${basisNote}> --pricing-mode safe-sell-probe --json`;
  const rollPlan = (type: "call" | "put", leg?: WheelLeg) =>
    `options roll-plan --account ${N} --symbol ${S} --type ${type} --close-expiration ${leg?.expiration ?? "<old-exp>"} --close-strike ${leg?.strike ?? "<old-strike>"} --open-expiration <new-exp> --open-strike <new-strike> [--cash-account] --json`;

  if (ccContracts > 0 && s.sharesQty < ccContracts * 100) {
    blockers.push(`short calls exceed share coverage: ${ccContracts} contract(s) need ${ccContracts * 100} shares, account holds ${s.sharesQty} — naked/undercovered (undefined-risk) exposure, NOT a wheel state`);
    return {
      stage: "short-call-undercovered",
      summary: `Short calls (${s.shortCalls.map(fmtWheelLeg).join(", ")}) without full share coverage.${extras}`,
      nextLeg: {
        action: "review the uncovered short call exposure before anything else",
        rationale: "The wheel's short call is COVERED by definition (100 shares per contract in the same account). Anything less is a different, undefined-risk position.",
        command: null
      },
      blockers
    };
  }
  if (ccContracts > 0) {
    return {
      stage: "covered-call-open",
      summary: `Wheel leg 3 working: ${s.sharesQty} shares covering ${s.shortCalls.map(fmtWheelLeg).join(", ")}.${extras}`,
      nextLeg: {
        action: "manage the short call to its end state",
        rationale: "Expires worthless → keep premium, sell the next call. Assigned (shares called away) → wheel restarts at leg 1 (CSP). Tested and you want to keep shares → roll out/up for a net credit.",
        command: rollPlan("call", s.shortCalls[0])
      },
      blockers
    };
  }
  if (cspContracts > 0) {
    const both = s.sharesQty >= 100;
    return {
      stage: both ? "csp-plus-shares" : "cash-secured-put-open",
      summary: `Wheel leg 1 working: ${s.shortPuts.map(fmtWheelLeg).join(", ")}${both ? ` — plus ${s.sharesQty} shares already held (CC candidate in parallel)` : ""}.${extras}`,
      nextLeg: {
        action: both ? "manage the short put; the existing 100+ shares can carry a covered call in parallel" : "manage the short put to its end state",
        rationale: "Expires worthless → keep premium, sell the next put. Assigned → you own 100 shares/contract at the strike (leg 2) and the conventional next move is the covered call. Tested → roll out(/down) for a net credit.",
        command: both ? ccQuote(s.avgCost != null ? ` — basis ~$${s.avgCost.toFixed(2)}` : "") : rollPlan("put", s.shortPuts[0])
      },
      blockers
    };
  }
  if (s.sharesQty >= 100) {
    const basisNote = s.avgCost != null ? ` ≥ basis $${s.avgCost.toFixed(2)}` : "";
    return {
      stage: "shares-uncovered",
      summary: `Wheel leg 2: holding ${s.sharesQty} shares${s.avgCost != null ? ` (avg $${s.avgCost.toFixed(2)})` : ""}, no short call against them.${extras}`,
      nextLeg: {
        action: "sell a covered call against the shares (leg 3)",
        rationale: `Each contract needs 100 shares in the SAME account (have ${Math.floor(s.sharesQty / 100)} contract(s) of coverage). Strike at/above cost basis keeps an assignment profitable; below basis locks a loss if called.`,
        command: ccQuote(basisNote)
      },
      blockers
    };
  }
  if (s.sharesQty > 0) {
    return {
      stage: "sub-100-shares",
      summary: `${s.sharesQty} share(s) held — below the 100 needed to cover one call.${extras}`,
      nextLeg: {
        action: "not wheelable at this size — accumulate to 100 shares, or start a fresh wheel via a cash-secured put",
        rationale: "Covered calls need 100-share lots. A CSP (leg 1) builds the lot via assignment while collecting premium.",
        command: cspQuote
      },
      blockers
    };
  }
  return {
    stage: "not-started",
    summary: `No shares and no wheel legs.${extras}`,
    nextLeg: {
      action: "start the wheel at leg 1: sell a cash-secured put",
      rationale: "Collateral = strike × 100 in settled cash per contract. Assigned → leg 2 (own the shares) → leg 3 (covered call). Pick the strike from the live chain.",
      command: cspQuote
    },
    blockers
  };
}

export interface WheelSymbolState extends WheelClassification {
  account: string | null;
  accountLabel: string;
  symbol: string;
  sharesQty: number;
  avgCost: number | null;
  shortPuts: WheelLeg[];
  shortCalls: WheelLeg[];
  otherLegs: WheelLeg[];
}

/**
 * Composed wheel status across accounts — the shared engine behind the CLI `wheel` command and
 * the MCP `robinhood_wheel` tool. Scans every trading account (or one), groups shares + option
 * legs by underlying, classifies each symbol's wheel stage, and emits the next-leg dry-run
 * command. Reads only; per-account failures degrade to a note instead of throwing.
 */
export async function computeWheelState(
  opts: { symbol?: string; accountNumber?: string } = {},
  deps: { getJson?: typeof brokerageGetJson; getAll?: typeof brokerageGetAllResults; now?: () => number } = {}
): Promise<any> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const getAll = deps.getAll ?? brokerageGetAllResults;
  const now = deps.now ?? Date.now;
  const n = (v: unknown) => Number(v);
  const wantSymbol = opts.symbol?.toUpperCase();

  // 1. Accounts — transfer/accounts/ is the complete graph; trading accounts only.
  const graph = await getJson("https://bonfire.robinhood.com/transfer/accounts/");
  const rows: any[] = Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : [];
  let accts = rows
    .filter((a) => (a?.type === "rhs" || a?.type === "ira_roth") && a?.account_number)
    .map((a) => ({ acct: String(a.account_number), label: String(a.account_name || a.display_title || "") }));
  if (opts.accountNumber) {
    accts = accts.filter((a) => a.acct === String(opts.accountNumber));
    if (!accts.length) throw new Error(`Account ${opts.accountNumber} is not one of your trading accounts.`);
  }

  const notes: string[] = [];
  const dteOf = (exp: string | null) =>
    exp ? Math.max(0, Math.ceil((Date.parse(exp) - now()) / 86_400_000)) : null;

  // 2. Per account: shares by symbol + option legs by underlying (legs are self-describing).
  const states: WheelSymbolState[] = [];
  for (const { acct, label } of accts) {
    const shares = new Map<string, { qty: number; avgCost: number | null }>();
    const legsBySymbol = new Map<string, WheelLeg[]>();
    try {
      const eq = await getAll("https://api.robinhood.com/positions/", {}, { nonzero: "true", account_number: acct });
      for (const p of eq) {
        const qty = n(p?.quantity);
        if (!p?.symbol || !(qty > 0)) continue;
        const avg = n(p.average_buy_price);
        shares.set(String(p.symbol).toUpperCase(), { qty, avgCost: Number.isFinite(avg) && avg > 0 ? avg : null });
      }
    } catch (e: any) { notes.push(`equity positions read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }
    try {
      const agg = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
      for (const pos of agg) {
        const sym = String(pos?.symbol ?? "").toUpperCase();
        const posQty = n(pos?.quantity);
        if (!sym || !(posQty > 0)) continue;
        const strategy = String(pos?.strategy ?? "");
        for (const leg of pos?.legs ?? []) {
          const side = leg?.position_type === "short" ? "short" : leg?.position_type === "long" ? "long"
            : strategy.startsWith("short") ? "short" : strategy.startsWith("long") ? "long" : "unknown";
          const type = leg?.option_type === "put" ? "put" : leg?.option_type === "call" ? "call" : "unknown";
          const strike = Number.isFinite(n(leg?.strike_price)) ? n(leg?.strike_price) : null;
          const expiration = leg?.expiration_date ?? null;
          const list = legsBySymbol.get(sym) ?? [];
          list.push({
            optionId: leg?.option_id ?? null, side, type, strike, expiration,
            dte: dteOf(expiration), contracts: posQty * (n(leg?.ratio_quantity) || 1), strategy
          });
          legsBySymbol.set(sym, list);
        }
      }
    } catch (e: any) { notes.push(`option positions read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }

    // 3. Symbols worth reporting: requested one, any with option legs, or any 100+ share lot.
    const symbols = new Set<string>();
    if (wantSymbol) symbols.add(wantSymbol);
    else {
      for (const s of legsBySymbol.keys()) symbols.add(s);
      for (const [s, v] of shares) if (v.qty >= 100) symbols.add(s);
    }
    for (const sym of symbols) {
      const legs = legsBySymbol.get(sym) ?? [];
      const input: WheelStateInput = {
        sharesQty: shares.get(sym)?.qty ?? 0,
        avgCost: shares.get(sym)?.avgCost ?? null,
        shortPuts: legs.filter((l) => l.side === "short" && l.type === "put"),
        shortCalls: legs.filter((l) => l.side === "short" && l.type === "call"),
        otherLegs: legs.filter((l) => !(l.side === "short" && (l.type === "put" || l.type === "call")))
      };
      // Per-account rows only where evidence exists; a requested symbol held nowhere falls
      // through to the single synthetic "discussion mode" row instead of N empty rows.
      if (wantSymbol ? input.sharesQty <= 0 && !legs.length : input.sharesQty < 100 && !legs.length) continue;
      const cls = classifyWheelStage(input, { symbol: sym, accountNumber: acct });
      states.push({ account: acct, accountLabel: label, symbol: sym, ...input, ...cls });
    }
  }

  // 4. Discussion mode: a requested symbol with no position anywhere still gets a not-started plan.
  if (wantSymbol && !states.length) {
    const cls = classifyWheelStage(
      { sharesQty: 0, avgCost: null, shortPuts: [], shortCalls: [], otherLegs: [] },
      { symbol: wantSymbol }
    );
    states.push({ account: null, accountLabel: "(no position in any scanned account)", symbol: wantSymbol, sharesQty: 0, avgCost: null, shortPuts: [], shortCalls: [], otherLegs: [], ...cls });
  }

  return {
    symbol: wantSymbol ?? null,
    accountsScanned: accts.map((a) => "…" + a.acct.slice(-4)),
    states,
    notes,
    reference: WHEEL_DOC,
    disclaimer: "Descriptive, not prescriptive — evidence + the conventional next leg. Live sends always need the ROBINHOOD_ALLOW_LIVE_WRITE=1 switch."
  };
}

// ───────────────── Dividends / Documents / Margin engines (shared CLI + MCP) ─────────────────
// Three first-class read surfaces live-verified 2026-06-11. Same alignment invariant as
// computePortfolioPnl: the engine lives HERE, the CLI renders it, the MCP returns it as JSON.

/**
 * Enumerate owned trading accounts (rhs + ira_roth) from the COMPLETE transfer graph —
 * the same pattern as computePortfolioPnl/computeWheelState (bare accounts/ under-reports).
 * Scopes to one account when given; throws on an unowned/typo'd account number.
 */
export async function listOwnedTradingAccounts(
  getJson: typeof brokerageGetJson,
  accountNumber?: string
): Promise<Array<{ acct: string; label: string }>> {
  const graph = await getJson("https://bonfire.robinhood.com/transfer/accounts/");
  const rows: any[] = Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : [];
  let accts = rows
    .filter((a) => (a?.type === "rhs" || a?.type === "ira_roth") && a?.account_number)
    .map((a) => ({ acct: String(a.account_number), label: String(a.account_name || a.display_title || "") }));
  if (accountNumber) {
    accts = accts.filter((a) => a.acct === String(accountNumber));
    if (!accts.length) throw new Error(`Account ${accountNumber} is not one of your trading accounts.`);
  }
  return accts;
}

const round2 = (value: number): number => (Number.isFinite(value) ? Math.round(value * 100) / 100 : Number.NaN);

// ── Dividends ──────────────────────────────────────────────────────────────────────────────────

export type DividendCadence = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "irregular";

/**
 * Detect a payout cadence from payable dates — the math is IN-ENGINE so callers can't botch it.
 * Median gap in days between unique sorted payable dates:
 *   ~5-9 → weekly · ~25-35 → monthly · ~80-100 → quarterly · ~170-190 → semiannual ·
 *   ~350-380 → annual · else irregular.
 * Median (not mean) so one suspended/special payout doesn't flip the classification. The weekly
 * band exists because weekly-pay income ETFs (QDTE et al.) are real and otherwise their income —
 * often the LARGEST payer in the account — would silently drop out of the projection.
 */
export function detectDividendCadence(payableDates: Array<string | null | undefined>): {
  cadence: DividendCadence;
  periodsPerYear: number;
  medianGapDays: number;
} {
  const times = [...new Set(payableDates.filter(Boolean).map(String))]
    .map((d) => Date.parse(d))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < 2) return { cadence: "irregular", periodsPerYear: 0, medianGapDays: Number.NaN };
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 86_400_000).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  const cadence: DividendCadence =
    median >= 5 && median <= 9 ? "weekly"
    : median >= 25 && median <= 35 ? "monthly"
    : median >= 80 && median <= 100 ? "quarterly"
    : median >= 170 && median <= 190 ? "semiannual"
    : median >= 350 && median <= 380 ? "annual"
    : "irregular";
  const periodsPerYear = { weekly: 52, monthly: 12, quarterly: 4, semiannual: 2, annual: 1, irregular: 0 }[cadence];
  return { cadence, periodsPerYear, medianGapDays: Math.round(median * 10) / 10 };
}

/**
 * Dividend income engine across all owned accounts (or one): history totals, per-symbol cadence,
 * upcoming payouts, last-12-months by month, and a PROJECTION in dollars. Hard-won field notes
 * (live-verified 2026-06-11):
 *   - dividends/ is ACCOUNT-SCOPED — the bare read silently returns only the default account, so
 *     fan out per account with ?account_number= (the wrong-account trap, read edition).
 *   - states seen live: paid | reinvested (DRIP — still income) | pending (upcoming) | voided.
 *   - `amount` is the position-sized dollar payout; `rate` is per-share; records carry an
 *     instrument URL, not a ticker → batch-resolve via instruments/?ids=.
 *   - projection counts CURRENTLY HELD symbols only (cross-checked against nonzero positions/),
 *     so a sold payer never inflates forecast income.
 * Per-account reads degrade to warnings; never throws on one bad account.
 */
export async function computeDividends(
  opts: { accountNumber?: string; symbol?: string } = {},
  deps: { getJson?: typeof brokerageGetJson; getAll?: typeof brokerageGetAllResults; now?: () => number } = {}
): Promise<any> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const getAll = deps.getAll ?? brokerageGetAllResults;
  const nowMs = (deps.now ?? Date.now)();
  const n = (v: unknown) => Number(v);
  const warnings: string[] = [];
  const wantSymbol = opts.symbol?.trim().toUpperCase() || undefined;
  const today = new Date(nowMs).toISOString().slice(0, 10);

  const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);

  // Per-account dividends + held positions, in parallel; each read degrades independently.
  const perAcct: any[] = await Promise.all(accts.map(async ({ acct, label }: any) => {
    const out = { acct, label, dividends: [] as any[], heldSymbols: new Set<string>() };
    try {
      out.dividends = await getAll("https://api.robinhood.com/dividends/", {}, { account_number: acct });
    } catch (e: any) { warnings.push(`dividends read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }
    try {
      const eq = await getAll("https://api.robinhood.com/positions/", {}, { nonzero: "true", account_number: acct });
      for (const p of eq) if (p?.symbol && n(p.quantity) > 0) out.heldSymbols.add(String(p.symbol).toUpperCase());
    } catch (e: any) { warnings.push(`positions read failed (…${acct.slice(-4)}) — held-symbol cross-check degraded: ${(e as Error).message.slice(0, 60)}`); }
    return out;
  }));

  // Resolve instrument URLs → tickers (batched; a dead/delisted instrument keeps its UUID stub).
  const allRaw = perAcct.flatMap((a: any) => a.dividends.map((d: any) => ({ ...d, _acct: a.acct })));
  const instId = (d: any): string | undefined => {
    const m = String(d?.instrument ?? "").match(/\/instruments\/([^/]+)\/?/);
    return m?.[1] ?? (d?.active_instrument_id ? String(d.active_instrument_id) : undefined);
  };
  const ids = [...new Set(allRaw.map(instId).filter(Boolean))] as string[];
  const symbolById = new Map<string, string>();
  try {
    for (let i = 0; i < ids.length; i += 40) {
      const data = await getJson("https://api.robinhood.com/instruments/?ids={ids}", { ids: ids.slice(i, i + 40).join(",") });
      for (const r of data?.results ?? []) if (r?.id && r?.symbol) symbolById.set(String(r.id), String(r.symbol).toUpperCase());
    }
  } catch (e: any) { warnings.push(`instrument resolve failed — some dividends keep an instrument UUID instead of a ticker (${(e as Error).message.slice(0, 60)})`); }

  const records = allRaw
    .map((d) => {
      const iid = instId(d);
      return {
        symbol: (iid && symbolById.get(iid)) || (iid ? `(${iid.slice(0, 8)}…)` : "(unknown)"),
        account: String(d._acct),
        state: String(d.state ?? ""),
        amountUsd: n(d.amount),
        ratePerShare: n(d.rate),
        position: n(d.position),
        withholdingUsd: n(d.withholding),
        exDividendDate: d.ex_dividend_date ?? null,
        recordDate: d.record_date ?? null,
        payableDate: d.payable_date ?? null,
        paidAt: d.paid_at ?? null,
        dripEnabled: d.drip_enabled ?? null
      };
    })
    .filter((d) => !wantSymbol || d.symbol === wantSymbol);

  // Received = paid OR reinvested (DRIP is income too); voided never counts; pending not yet.
  const received = records.filter((d) => (d.state === "paid" || d.state === "reinvested") && Number.isFinite(d.amountUsd));
  const recvDate = (d: any): string => String(d.paidAt ?? d.payableDate ?? "").slice(0, 10);
  const sumUsd = (xs: any[]) => round2(xs.reduce((s, d) => s + d.amountUsd, 0));
  const cutoff12mo = new Date(nowMs - 365 * 86_400_000).toISOString().slice(0, 10);
  const totals = {
    allTimeUsd: sumUsd(received),
    ytdUsd: sumUsd(received.filter((d) => recvDate(d).startsWith(today.slice(0, 4)))),
    last12moUsd: sumUsd(received.filter((d) => recvDate(d) >= cutoff12mo))
  };

  // Per-symbol: totals, cadence, annualized. Cadence reads ALL non-voided payable dates
  // (a pending payout is a real scheduled date and the freshest "regular amount").
  const heldSymbols = new Set<string>(perAcct.flatMap((a) => [...a.heldSymbols]));
  const bySymbolMap = new Map<string, any[]>();
  for (const d of records) {
    if (d.state === "voided") continue;
    const list = bySymbolMap.get(d.symbol) ?? [];
    list.push(d);
    bySymbolMap.set(d.symbol, list);
  }
  const bySymbol = [...bySymbolMap.entries()].map(([symbol, recs]) => {
    const recv = recs.filter((d) => d.state === "paid" || d.state === "reinvested");
    const dated = recs.filter((d) => d.payableDate).sort((a, b) => String(a.payableDate).localeCompare(String(b.payableDate)));
    const lastRec = dated[dated.length - 1];
    const { cadence, periodsPerYear, medianGapDays } = detectDividendCadence(recs.map((d) => d.payableDate));
    const lastAmountUsd = Number.isFinite(lastRec?.amountUsd) ? lastRec.amountUsd : Number.NaN;
    const annualizedUsd = periodsPerYear > 0 && Number.isFinite(lastAmountUsd) ? round2(lastAmountUsd * periodsPerYear) : Number.NaN;
    return {
      symbol,
      totalUsd: sumUsd(recv),
      count: recv.length,
      lastAmountUsd,
      lastPayableDate: lastRec?.payableDate ?? null,
      cadence,
      medianGapDays,
      annualizedUsd,
      currentlyHeld: heldSymbols.has(symbol)
    };
  }).sort((a, b) => (b.totalUsd || 0) - (a.totalUsd || 0));

  // Upcoming: pending state, or a future payable date that hasn't paid out yet.
  const upcoming = records
    .filter((d) => d.state === "pending" || (!d.paidAt && d.state !== "voided" && d.state !== "paid" && d.state !== "reinvested" && d.payableDate && String(d.payableDate) >= today))
    .map((d) => ({ symbol: d.symbol, amountUsd: d.amountUsd, payableDate: d.payableDate, exDividendDate: d.exDividendDate, state: d.state, account: d.account }))
    .sort((a, b) => String(a.payableDate ?? "").localeCompare(String(b.payableDate ?? "")));

  // Last 12 calendar months of received income, zero-filled so a dry month is visible.
  const anchor = new Date(nowMs);
  const byMonth: Array<{ month: string; totalUsd: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const key = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    byMonth.push({ month: key, totalUsd: sumUsd(received.filter((d) => recvDate(d).startsWith(key))) });
  }

  // Projection: regular-cadence symbols the operator STILL HOLDS. Sold payers are listed, not counted.
  const projected = bySymbol.filter((s) => s.currentlyHeld && Number.isFinite(s.annualizedUsd) && s.annualizedUsd > 0);
  const excludedSold = bySymbol.filter((s) => !s.currentlyHeld && Number.isFinite(s.annualizedUsd) && s.annualizedUsd > 0).map((s) => s.symbol);
  const annualUsd = round2(projected.reduce((s, x) => s + x.annualizedUsd, 0));
  const projection = {
    dailyUsd: round2(annualUsd / 365),
    weeklyUsd: round2(annualUsd / 52),
    monthlyUsd: round2(annualUsd / 12),
    quarterlyUsd: round2(annualUsd / 4),
    annualUsd,
    projectedSymbols: projected.map((s) => s.symbol),
    excludedSoldSymbols: excludedSold,
    method:
      "per symbol: cadence = median payable-date gap (~5-9d weekly, ~25-35d monthly, ~80-100d quarterly, ~170-190d semiannual, ~350-380d annual, else irregular); " +
      "annualizedUsd = most recent regular dividend amount × periods/year; projection sums annualizedUsd across CURRENTLY HELD symbols only " +
      "(cross-checked against nonzero positions/ so sold positions don't project income); irregular cadences excluded. " +
      "Granularity: dailyUsd = annualUsd/365, weeklyUsd = annualUsd/52, monthlyUsd = annualUsd/12, quarterlyUsd = annualUsd/4."
  };

  return {
    accountsScanned: accts.map((a) => "…" + a.acct.slice(-4)),
    symbol: wantSymbol ?? null,
    recordCount: records.length,
    totals,
    bySymbol,
    upcoming,
    byMonth,
    projection,
    warnings
  };
}

// ── Documents ──────────────────────────────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  type: string;
  date: string;
  /** Filter/filename year. For tax forms (1099*, 5498*) this is the TAX YEAR — issue year − 1, because a 1099 dated 2026-02 covers tax year 2025 (live-verified). Otherwise the document date's calendar year. */
  year: string;
  accountNumber: string;
  accountLast4: string;
  filetype: string;
  downloadUrl: string;
  createdAt: string | null;
}

const TAX_FORM_PREFIXES = ["1099", "5498"]; // covers 1099, 1099_crypto, 1099r_roth, 5498_roth

/** Year a document belongs to for filtering/filenames: tax forms map to their TAX year (issue year − 1). */
export function documentYear(type: string, date: string): string {
  const docYear = Number(String(date).slice(0, 4));
  if (!Number.isFinite(docYear) || docYear <= 0) return "unknown";
  return TAX_FORM_PREFIXES.some((p) => String(type).startsWith(p)) ? String(docYear - 1) : String(docYear);
}

/** Deterministic local filename: <year>-<type>-<acct last4>-<date>.<filetype> (path-safe). */
export function documentFilename(doc: { type: string; date: string; year: string; accountLast4: string; filetype?: string | null }): string {
  const ext = String(doc.filetype || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const clean = (s: unknown) => String(s).replace(/[^A-Za-z0-9._-]/g, "_");
  return `${clean(doc.year)}-${clean(doc.type)}-${clean(doc.accountLast4)}-${clean(doc.date)}.${ext}`;
}

/**
 * List account documents (statements, trade confirms, tax forms) across ALL accounts in one read —
 * documents/ is cursor-paginated via `next` (followed to the end) and, unlike dividends/, spans
 * every account without a fan-out (live-verified 2026-06-11). Filters:
 *   - type is PREFIX-matched, so type="1099" catches 1099 + 1099_crypto + 1099r_roth in one shot.
 *   - year matches the TAX year for tax forms and the calendar year otherwise (see documentYear).
 *   - accountNumber is exact.
 */
export async function listDocuments(
  opts: { type?: string; year?: string; accountNumber?: string } = {},
  deps: { getAll?: typeof brokerageGetAllResults } = {}
): Promise<{ count: number; documents: DocumentRecord[]; byType: Record<string, number>; warnings: string[] }> {
  const getAll = deps.getAll ?? brokerageGetAllResults;
  const rows = await getAll("https://api.robinhood.com/documents/", {}, {});
  const documents = rows
    .map((d: any): DocumentRecord => {
      const accountNumber = String(d?.account ?? "").match(/\/accounts\/([^/]+)\/?/)?.[1] ?? "";
      const type = String(d?.type ?? "");
      const date = String(d?.date ?? "");
      return {
        id: String(d?.id ?? ""),
        type,
        date,
        year: documentYear(type, date),
        accountNumber,
        accountLast4: accountNumber.slice(-4),
        filetype: String(d?.filetype ?? "pdf"),
        downloadUrl: String(d?.download_url ?? ""),
        createdAt: d?.created_at ?? null
      };
    })
    .filter((d: DocumentRecord) =>
      (!opts.type || d.type.startsWith(opts.type)) &&
      (!opts.year || d.year === String(opts.year)) &&
      (!opts.accountNumber || d.accountNumber === String(opts.accountNumber)))
    .sort((a: DocumentRecord, b: DocumentRecord) => b.date.localeCompare(a.date));
  const byType: Record<string, number> = {};
  for (const d of documents) byType[d.type] = (byType[d.type] ?? 0) + 1;
  return { count: documents.length, documents, byType, warnings: [] };
}

/**
 * Download matching documents to local/documents/ (gitignored). The tax-season one-shot:
 * downloadDocuments({ type: "1099", year: "2025" }) pulls every 1099 — brokerage, crypto, Roth —
 * for tax year 2025 in one call. Raw fetch with the same bearer auth the engine uses;
 * download_url 302s to storage and fetch follows (auth is dropped cross-origin by undici).
 * Per-file failures are collected, never thrown.
 */
export async function downloadDocuments(
  opts: { type?: string; year?: string; accountNumber?: string; limit?: number } = {},
  deps: { getAll?: typeof brokerageGetAllResults; fetchImpl?: typeof fetch; outDir?: string } = {}
): Promise<{
  directory: string;
  downloaded: Array<{ file: string; type: string; date: string; bytes: number }>;
  failures: Array<{ file: string; error: string }>;
  skipped: number;
}> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const listing = await listDocuments(opts, deps);
  const docs = opts.limit && opts.limit > 0 ? listing.documents.slice(0, opts.limit) : listing.documents;
  const directory = deps.outDir ?? join(repoRoot(), "local", "documents");
  mkdirSync(directory, { recursive: true });
  const token = process.env.ROBINHOOD_BROKERAGE_TOKEN;
  const headers: Record<string, string> = {
    accept: "*/*",
    "user-agent": process.env.ROBINHOOD_USER_AGENT ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    origin: "https://robinhood.com",
    referer: "https://robinhood.com/"
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const downloaded: Array<{ file: string; type: string; date: string; bytes: number }> = [];
  const failures: Array<{ file: string; error: string }> = [];
  for (const d of docs) {
    const file = documentFilename(d);
    try {
      if (!d.downloadUrl) throw new Error("no download_url on record");
      const res = await fetchImpl(d.downloadUrl, { headers, redirect: "follow" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(join(directory, file), buf);
      downloaded.push({ file, type: d.type, date: d.date, bytes: buf.length });
    } catch (e: any) {
      failures.push({ file, error: (e as Error).message.slice(0, 120) });
    }
  }
  return { directory, downloaded, failures, skipped: listing.documents.length - docs.length };
}

// ── Margin health ──────────────────────────────────────────────────────────────────────────────

/** Unwrap a Robinhood money object ({amount, currency_code, …}) or a bare numeric string. */
function moneyUsd(value: unknown): number {
  const raw = value && typeof value === "object" && "amount" in (value as Record<string, unknown>)
    ? (value as Record<string, unknown>).amount
    : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export interface MarginHealth {
  accountNumber: string;
  label: string;
  borrowedUsd: number;
  marginInterestRatePct: number;
  nextBillingDate: string | null;
  marginAvailableUsd: number;
  buyingPowerWithMarginUsd: number;
  projectedIntradayBpUsd: number;
  marginUsedIncludingCashHeldUsd: number;
  interestExemptionUsd: number;
}

/**
 * Margin health: am I borrowing, how much, at what rate, billed when. Reads
 * margin/{account_number}/investing_info/ for every owned account (or one) in parallel.
 * Field note (live-verified 2026-06-11): most fields are MONEY OBJECTS ({amount, currency_code}),
 * margin_interest_rate is a bare percent string ("5.0000" → 5%), next_billing_date can be null.
 * An account with no margin data (404/error) degrades SILENTLY into `skipped` — that absence IS
 * the answer for that account; one dead read never blanks the others.
 */
export async function getMarginHealth(
  accountNumber?: string,
  deps: { getJson?: typeof brokerageGetJson } = {}
): Promise<{ accounts: MarginHealth[]; scanned: string[]; skipped: string[]; warnings: string[] }> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const accts = await listOwnedTradingAccounts(getJson, accountNumber);
  const skipped: string[] = [];
  const results = await Promise.all(accts.map(async ({ acct, label }): Promise<MarginHealth | null> => {
    try {
      const m = await getJson("https://api.robinhood.com/margin/{account_number}/investing_info/", { account_number: acct });
      if (!m || (m.amount_borrowed === undefined && m.margin_available === undefined)) {
        skipped.push("…" + acct.slice(-4));
        return null;
      }
      return {
        accountNumber: acct,
        label: label || "…" + acct.slice(-4),
        borrowedUsd: moneyUsd(m.amount_borrowed),
        marginInterestRatePct: finiteNumber(m.margin_interest_rate),
        nextBillingDate: m.next_billing_date ?? null,
        marginAvailableUsd: moneyUsd(m.margin_available),
        buyingPowerWithMarginUsd: moneyUsd(m.buying_power_with_margin),
        projectedIntradayBpUsd: moneyUsd(m.projected_intraday_buying_power),
        marginUsedIncludingCashHeldUsd: moneyUsd(m.margin_used_including_cash_held),
        interestExemptionUsd: moneyUsd(m.interest_exemption_amount)
      };
    } catch {
      skipped.push("…" + acct.slice(-4)); // 404 / no margin product — silent per-account degrade
      return null;
    }
  }));
  return {
    accounts: results.filter((r): r is MarginHealth => r !== null),
    scanned: accts.map((a) => "…" + a.acct.slice(-4)),
    skipped,
    warnings: []
  };
}

// ── Film-study: trade review engine (round trips, realized P&L, notes) ─────────────────────────
// The operator's "athlete watching tape" mode: pull what actually FILLED, pair entries to exits,
// and put the realized DOLLAR outcomes in front of the operator with their own notes attached.
// Math lives here in the engine — agents must not hand-compute P&L or win rates.

export interface TradeNote {
  /** Timestamp header of the entry ("YYYY-MM-DD HH:MM"). */
  when: string;
  /** Freeform reference: an order id, a symbol, or symbol+date — matched by substring/token. */
  ref: string;
  note: string;
}

export const TRADE_NOTES_FILE = "trade-notes.md";

/** Render one trade-notes.md entry: `### YYYY-MM-DD HH:MM | <ref>` + the note + `---`. */
export function formatTradeNote(input: { ref: string; note: string; now?: Date }): string {
  const d = input.now ?? new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `\n### ${stamp} | ${input.ref.trim()}\n\n${input.note.trim()}\n\n---\n`;
}

/**
 * Append a film-study note to repo-root trade-notes.md (committed, operator-facing — the same
 * spirit as trading-log.md). LOCAL FILE ONLY: this never touches the brokerage account, so it
 * needs no write gate — but it DOES write the markdown file, so callers should say so.
 */
export function addTradeNote(
  input: { ref: string; note: string },
  deps: { file?: string; now?: Date } = {}
): { file: string; entry: string } {
  if (!input.ref?.trim() || !input.note?.trim()) {
    throw new Error("A trade note needs both a ref (order id / symbol / symbol+date) and the note text.");
  }
  const file = deps.file ?? join(repoRoot(), TRADE_NOTES_FILE);
  const entry = formatTradeNote({ ref: input.ref, note: input.note, now: deps.now });
  appendFileSync(file, entry);
  return { file, entry };
}

/** Parse trade-notes.md content into entries. Tolerates prose between entries; `---` ends a note. */
export function parseTradeNotes(content: string): TradeNote[] {
  const notes: TradeNote[] = [];
  let current: TradeNote | null = null;
  let body: string[] = [];
  const flush = () => {
    if (current && current.ref) notes.push({ ...current, note: body.join("\n").trim() });
    current = null;
    body = [];
  };
  for (const line of content.split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*\|\s*(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = { when: m[1].trim(), ref: m[2].trim(), note: "" };
      continue;
    }
    if (current) {
      if (/^---\s*$/.test(line)) { flush(); continue; }
      body.push(line);
    }
  }
  flush();
  return notes;
}

export function loadTradeNotes(deps: { file?: string } = {}): TradeNote[] {
  const file = deps.file ?? join(repoRoot(), TRADE_NOTES_FILE);
  try {
    return parseTradeNotes(readFileSync(file, "utf8"));
  } catch {
    return []; // no notes file yet — review still works, just unannotated
  }
}

/**
 * Does a note's ref point at this trade? Two matchers, per the ledger's freeform ref contract:
 *   - order id: substring either way (≥6 chars so a short ref can't match every UUID), or
 *   - symbol: the ref contains the symbol as a standalone token ("HPE 2026-06-10" → HPE trades).
 */
export function noteMatchesTrade(ref: string, trade: { symbol: string; orderIds: string[] }): boolean {
  const r = ref.trim().toLowerCase();
  if (!r) return false;
  for (const id of trade.orderIds) {
    const i = String(id ?? "").toLowerCase();
    if (!i) continue;
    if ((r.length >= 6 && i.includes(r)) || (i.length >= 6 && r.includes(i))) return true;
  }
  const tokens = ref.toUpperCase().split(/[^A-Z0-9.]+/).filter(Boolean);
  return tokens.includes(String(trade.symbol ?? "").toUpperCase());
}

export interface ReviewFill {
  kind: OrderKind;
  symbol: string;
  /** Options only: "HPE $30 call 2026-09-18" (best-effort resolve; UUID stub on failure). */
  contract: string | null;
  account: string;
  side: "buy" | "sell";
  /** Options only; equity fills carry null. */
  positionEffect: "open" | "close" | null;
  quantity: number;
  /** Per share (equity) / per contract premium (options). */
  priceUsd: number;
  /** quantity × price × (100 for options). */
  notionalUsd: number;
  timestamp: string;
  orderId: string;
  /** True when some/all of this fill could NOT be FIFO-matched (still open, partial, or the
   * other side filled outside the window). Never silently dropped. */
  openLeg: boolean;
  unmatchedQuantity: number;
  notes: TradeNote[];
}

export interface ReviewRoundTrip {
  kind: OrderKind;
  symbol: string;
  contract: string | null;
  account: string;
  quantity: number;
  direction: "long" | "short";
  openedAt: string;
  closedAt: string;
  holdDays: number;
  entryUsd: number;
  exitUsd: number;
  realizedPnlUsd: number;
  win: boolean;
  orderIds: string[];
  notes: TradeNote[];
}

export interface TradeReviewSummary {
  trades: number;
  roundTrips: number;
  winners: number;
  losers: number;
  /** winners / roundTrips × 100 (scratch trades count in the denominator). */
  winRatePct: number;
  totalRealizedUsd: number;
  bestTrade: { symbol: string; contract: string | null; realizedPnlUsd: number; account: string } | null;
  worstTrade: { symbol: string; contract: string | null; realizedPnlUsd: number; account: string } | null;
  avgHoldDays: number;
  openLegs: number;
}

/**
 * FILM-STUDY MODE: pull every FILLED equity + options order across owned accounts (or one) inside
 * the window, resolve tickers/contracts, FIFO-pair entries→exits per account+instrument, and
 * compute per-round-trip DOLLAR outcomes (entryUsd, exitUsd, realizedPnlUsd, holdDays, win/loss).
 * Pairing rules:
 *   - equity: buys open lots, sells consume them FIFO (RH equity is long-only — a sell with no
 *     lot in-window is an unmatched leg, not a short).
 *   - options: position_effect=open adds a lot (its side remembered), close consumes the opposite
 *     side FIFO; long P&L = (close − open) × 100 × qty, short P&L = (open − close) × 100 × qty.
 *   - anything unmatched (still open / opened before the window / partial) is flagged
 *     openLeg:true with its unmatchedQuantity — never silently dropped.
 * Notes from trade-notes.md attach to trades AND round trips by ref match (order id or symbol).
 * Read-only against the account; the only proof a trade happened remains order history — which is
 * exactly what this reads.
 */
export async function computeTradeReview(
  opts: { days?: number; symbol?: string; accountNumber?: string } = {},
  deps: {
    getJson?: typeof brokerageGetJson;
    getAll?: typeof brokerageGetAllResults;
    now?: () => number;
    loadNotes?: () => TradeNote[];
  } = {}
): Promise<{
  days: number;
  accountsScanned: string[];
  trades: ReviewFill[];
  roundTrips: ReviewRoundTrip[];
  summary: TradeReviewSummary;
  warnings: string[];
}> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const getAll = deps.getAll ?? brokerageGetAllResults;
  const nowMs = (deps.now ?? Date.now)();
  const days = opts.days && opts.days > 0 ? opts.days : 90;
  const cutoffMs = nowMs - days * 86_400_000;
  const wantSymbol = opts.symbol?.trim().toUpperCase() || undefined;
  const warnings: string[] = [];
  const n = (v: unknown) => Number(v);

  const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);

  // 1. Collect fills (execution-level, so multi-fill orders FIFO correctly).
  interface RawFill extends Omit<ReviewFill, "notes"> { instrumentKey: string; }
  const fills: RawFill[] = [];
  const equityInstrumentIds = new Set<string>();
  const optionInstrumentIds = new Set<string>();
  const instId = (url: unknown): string | null =>
    String(url ?? "").match(/\/instruments\/([^/]+)\/?/)?.[1] ?? null;

  for (const { acct } of accts) {
    try {
      const eq = await getAll("https://api.robinhood.com/orders/", {}, { account_numbers: acct }, { maxPages: 20 });
      for (const o of eq) {
        if (o?.state !== "filled") continue;
        const iid = instId(o.instrument) ?? String(o.instrument_id ?? "");
        if (!iid) continue;
        const side = o.side === "sell" ? "sell" : "buy";
        const executions = Array.isArray(o.executions) && o.executions.length
          ? o.executions
          : [{ price: o.average_price ?? o.price, quantity: o.cumulative_quantity ?? o.quantity, timestamp: o.updated_at ?? o.created_at }];
        for (const ex of executions) {
          const ts = String(ex.timestamp ?? o.updated_at ?? o.created_at ?? "");
          const t = Date.parse(ts);
          if (!Number.isFinite(t) || t < cutoffMs) continue;
          const qty = n(ex.quantity);
          const price = n(ex.price);
          if (!(qty > 0) || !Number.isFinite(price)) continue;
          equityInstrumentIds.add(iid);
          fills.push({
            kind: "equity", symbol: o.symbol ?? iid, contract: null, account: acct, side,
            positionEffect: null, quantity: qty, priceUsd: price, notionalUsd: round2(qty * price),
            timestamp: ts, orderId: String(o.id ?? ""), openLeg: false, unmatchedQuantity: 0,
            instrumentKey: `equity|${iid}`
          });
        }
      }
    } catch (e: any) { warnings.push(`equity orders read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }
    try {
      const op = await getAll("https://api.robinhood.com/options/orders/", {}, { account_numbers: acct, states: "filled" }, { maxPages: 20 });
      for (const o of op) {
        if (o?.state !== "filled") continue;
        for (const leg of o.legs ?? []) {
          const oid = String(leg.option ?? "").match(/\/options\/instruments\/([^/]+)\/?/)?.[1] ?? null;
          if (!oid) continue;
          const side = leg.side === "sell" ? "sell" : "buy";
          const effect = leg.position_effect === "close" ? "close" : "open";
          for (const ex of leg.executions ?? []) {
            const ts = String(ex.timestamp ?? o.updated_at ?? o.created_at ?? "");
            const t = Date.parse(ts);
            if (!Number.isFinite(t) || t < cutoffMs) continue;
            const qty = n(ex.quantity);
            const price = n(ex.price);
            if (!(qty > 0) || !Number.isFinite(price)) continue;
            optionInstrumentIds.add(oid);
            fills.push({
              kind: "options", symbol: String(o.chain_symbol ?? "?"), contract: oid, account: acct, side,
              positionEffect: effect, quantity: qty, priceUsd: price, notionalUsd: round2(qty * price * 100),
              timestamp: ts, orderId: String(o.id ?? ""), openLeg: false, unmatchedQuantity: 0,
              instrumentKey: `options|${oid}`
            });
          }
        }
      }
    } catch (e: any) { warnings.push(`options orders read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`); }
  }

  // 2. Resolve equity instrument UUIDs → tickers (orders carry instrument URLs, not symbols).
  if (equityInstrumentIds.size) {
    try {
      const ids = [...equityInstrumentIds];
      const bySym = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 40) {
        const data = await getJson("https://api.robinhood.com/instruments/?ids={ids}", { ids: ids.slice(i, i + 40).join(",") });
        for (const r of data?.results ?? []) if (r?.id && r?.symbol) bySym.set(String(r.id), String(r.symbol).toUpperCase());
      }
      for (const f of fills) {
        if (f.kind !== "equity") continue;
        const iid = f.instrumentKey.split("|")[1];
        f.symbol = bySym.get(iid) ?? f.symbol;
      }
    } catch (e: any) { warnings.push(`instrument→ticker resolve failed — some equity trades show UUIDs (${(e as Error).message.slice(0, 60)})`); }
  }

  // 3. Resolve option contracts → "$strike type expiration" labels (best-effort batch; UUID stub on failure).
  if (optionInstrumentIds.size) {
    try {
      const ids = [...optionInstrumentIds];
      const byContract = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 40) {
        const data = await getJson("https://api.robinhood.com/options/instruments/", {}, { ids: ids.slice(i, i + 40).join(",") });
        for (const r of data?.results ?? []) {
          if (!r?.id) continue;
          byContract.set(String(r.id), `${r.chain_symbol ?? ""} $${Number(r.strike_price)} ${r.type ?? "?"} ${r.expiration_date ?? "?"}`.trim());
        }
      }
      for (const f of fills) {
        if (f.kind !== "options" || !f.contract) continue;
        f.contract = byContract.get(f.contract) ?? `${f.symbol} ${f.contract.slice(0, 8)}…`;
      }
    } catch {
      warnings.push("option contract resolve failed — contracts shown as UUID stubs");
      for (const f of fills) if (f.kind === "options" && f.contract) f.contract = `${f.symbol} ${f.contract.slice(0, 8)}…`;
    }
  }

  // 4. Optional symbol scope, then FIFO pairing per account+instrument.
  const scoped = wantSymbol ? fills.filter((f) => f.symbol === wantSymbol) : fills;
  scoped.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  interface Lot { qty: number; price: number; ts: string; orderId: string; side: "buy" | "sell"; fill: RawFill; }
  const lots = new Map<string, Lot[]>();
  const roundTrips: ReviewRoundTrip[] = [];
  for (const f of scoped) {
    const key = `${f.account}|${f.instrumentKey}`;
    const mult = f.kind === "options" ? 100 : 1;
    const opens = f.kind === "options" ? f.positionEffect === "open" : f.side === "buy";
    if (opens) {
      const list = lots.get(key) ?? [];
      list.push({ qty: f.quantity, price: f.priceUsd, ts: f.timestamp, orderId: f.orderId, side: f.side, fill: f });
      lots.set(key, list);
      continue;
    }
    // closing fill: consume opposite-side lots FIFO
    let remaining = f.quantity;
    const queue = lots.get(key) ?? [];
    while (remaining > 1e-9 && queue.length) {
      const lotIndex = queue.findIndex((l) => l.side !== f.side || f.kind === "equity");
      if (lotIndex === -1) break;
      const lot = queue[lotIndex];
      // 8dp rounding kills FIFO float-subtraction noise (0.0247259999… → 0.024726) while
      // preserving Robinhood's 4dp fractional-share granularity with room to spare.
      const matched = Math.round(Math.min(remaining, lot.qty) * 1e8) / 1e8;
      const long = lot.side === "buy";
      const entryUsd = round2(lot.price * matched * mult);
      const exitUsd = round2(f.priceUsd * matched * mult);
      const realized = round2((long ? f.priceUsd - lot.price : lot.price - f.priceUsd) * matched * mult);
      const holdMs = Date.parse(f.timestamp) - Date.parse(lot.ts);
      roundTrips.push({
        kind: f.kind, symbol: f.symbol, contract: f.contract, account: f.account,
        quantity: matched, direction: long ? "long" : "short",
        openedAt: lot.ts, closedAt: f.timestamp,
        holdDays: Number.isFinite(holdMs) ? Math.round((holdMs / 86_400_000) * 10) / 10 : Number.NaN,
        entryUsd, exitUsd, realizedPnlUsd: realized, win: realized > 0,
        orderIds: [...new Set([lot.orderId, f.orderId])], notes: []
      });
      lot.qty -= matched;
      remaining -= matched;
      if (lot.qty <= 1e-9) queue.splice(lotIndex, 1);
    }
    if (remaining > 1e-9) {
      f.openLeg = true; // close with no in-window entry (opened pre-window) — flagged, not dropped
      f.unmatchedQuantity = Math.round(remaining * 10000) / 10000;
    }
  }
  // leftover lots = positions still open (or partially closed) — flag their source fills
  for (const queue of lots.values()) {
    for (const lot of queue) {
      lot.fill.openLeg = true;
      lot.fill.unmatchedQuantity = Math.round((lot.fill.unmatchedQuantity + lot.qty) * 10000) / 10000;
    }
  }

  // 5. Attach operator notes (trade-notes.md) by ref match — order id or symbol token.
  const notes = (deps.loadNotes ?? loadTradeNotes)();
  const trades: ReviewFill[] = scoped.map((f) => ({
    ...f,
    notes: notes.filter((note) => noteMatchesTrade(note.ref, { symbol: f.symbol, orderIds: [f.orderId] }))
  }));
  for (const rt of roundTrips) {
    rt.notes = notes.filter((note) => noteMatchesTrade(note.ref, { symbol: rt.symbol, orderIds: rt.orderIds }));
  }

  // 6. Summary — the film-study scoreboard, all in dollars.
  const winners = roundTrips.filter((r) => r.realizedPnlUsd > 0).length;
  const losers = roundTrips.filter((r) => r.realizedPnlUsd < 0).length;
  const totalRealizedUsd = round2(roundTrips.reduce((s, r) => s + r.realizedPnlUsd, 0));
  const holdVals = roundTrips.map((r) => r.holdDays).filter((x) => Number.isFinite(x));
  const best = roundTrips.reduce<ReviewRoundTrip | null>((acc, r) => (acc === null || r.realizedPnlUsd > acc.realizedPnlUsd ? r : acc), null);
  const worst = roundTrips.reduce<ReviewRoundTrip | null>((acc, r) => (acc === null || r.realizedPnlUsd < acc.realizedPnlUsd ? r : acc), null);
  const summary: TradeReviewSummary = {
    trades: trades.length,
    roundTrips: roundTrips.length,
    winners,
    losers,
    winRatePct: roundTrips.length ? Math.round((winners / roundTrips.length) * 1000) / 10 : Number.NaN,
    totalRealizedUsd,
    bestTrade: best ? { symbol: best.symbol, contract: best.contract, realizedPnlUsd: best.realizedPnlUsd, account: best.account } : null,
    worstTrade: worst ? { symbol: worst.symbol, contract: worst.contract, realizedPnlUsd: worst.realizedPnlUsd, account: worst.account } : null,
    avgHoldDays: holdVals.length ? Math.round((holdVals.reduce((s, x) => s + x, 0) / holdVals.length) * 10) / 10 : Number.NaN,
    openLegs: trades.filter((t) => t.openLeg).length
  };

  // strip the internal pairing key from the public rows
  const publicTrades = trades.map(({ instrumentKey: _k, ...rest }: any) => rest as ReviewFill);
  return { days, accountsScanned: accts.map((a) => "…" + a.acct.slice(-4)), trades: publicTrades, roundTrips, summary, warnings };
}

// ── Hotlist: operator-maintained ticker watchlist (hotlist.md) ──────────────────────────────────

export interface HotlistEntry {
  symbol: string;
  thesis: string | null;
  line: number;
}

export const HOTLIST_FILE = "hotlist.md";

/**
 * Parse hotlist.md content: one ticker per line, `TICKER — optional thesis/note` (em/en/plain
 * dash). Ignored: blank lines, headers/comments (#, <!--, >), and lines marked "(example)".
 */
export function parseHotlist(content: string): HotlistEntry[] {
  const out: HotlistEntry[] = [];
  content.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("<!--") || line.startsWith("-->") || line.startsWith(">")) return;
    if (/\(example\)/i.test(line)) return;
    const m = /^([A-Z][A-Z0-9.\-]{0,9})\s*(?:[—–-]+\s*(.*))?$/.exec(line);
    if (!m) return;
    out.push({ symbol: m[1], thesis: m[2]?.trim() || null, line: i + 1 });
  });
  return out;
}

export function loadHotlist(deps: { file?: string } = {}): HotlistEntry[] {
  const file = deps.file ?? join(repoRoot(), HOTLIST_FILE);
  try {
    return parseHotlist(readFileSync(file, "utf8"));
  } catch {
    return []; // no hotlist yet — callers explain how to seed it
  }
}

/**
 * Hotlist + live quotes: parse hotlist.md and quote every ticker (batched), returning last,
 * day $ and % change (per share), and the operator's thesis. Shared by the CLI `hotlist`
 * command and the MCP robinhood_hotlist tool. Read-only.
 */
export async function computeHotlist(
  deps: { getJson?: typeof brokerageGetJson; entries?: HotlistEntry[] } = {}
): Promise<{
  count: number;
  rows: Array<{ symbol: string; thesis: string | null; lastUsd: number; dayChangeUsd: number; dayChangePct: number; found: boolean }>;
  warnings: string[];
}> {
  const getJson = deps.getJson ?? brokerageGetJson;
  const entries = deps.entries ?? loadHotlist();
  const warnings: string[] = [];
  if (!entries.length) {
    return { count: 0, rows: [], warnings: [`${HOTLIST_FILE} has no active entries — add lines like "NVDA — ai capex thesis" (example-marked lines are ignored).`] };
  }
  const resolved = await Promise.all(entries.map(async (e) => {
    try {
      const inst = (await getJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: e.symbol })).results?.[0];
      return { ...e, instrumentId: inst?.id ? String(inst.id) : null };
    } catch {
      return { ...e, instrumentId: null };
    }
  }));
  const ids = resolved.map((r) => r.instrumentId).filter((x): x is string => Boolean(x));
  const quotes = new Map<string, any>();
  try {
    for (let i = 0; i < ids.length; i += 40) {
      const data = await getJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: ids.slice(i, i + 40).join(",") });
      for (const r of data?.results ?? []) if (r?.instrument_id) quotes.set(String(r.instrument_id), r);
    }
  } catch (e: any) { warnings.push(`quote batch failed (${(e as Error).message.slice(0, 60)})`); }
  const rows = resolved.map((r) => {
    const q = r.instrumentId ? quotes.get(r.instrumentId) : undefined;
    const last = Number(q?.last_trade_price ?? q?.last_extended_hours_trade_price);
    const prev = Number(q?.adjusted_previous_close ?? q?.previous_close);
    const ok = Number.isFinite(last) && last > 0;
    return {
      symbol: r.symbol,
      thesis: r.thesis,
      lastUsd: ok ? last : Number.NaN,
      dayChangeUsd: ok && Number.isFinite(prev) ? round2(last - prev) : Number.NaN,
      dayChangePct: ok && prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : Number.NaN,
      found: Boolean(q)
    };
  });
  for (const r of rows) if (!r.found) warnings.push(`${r.symbol}: no quote (unknown/delisted ticker?)`);
  return { count: rows.length, rows, warnings };
}

// ── Knowledge library access: knowledge/ modules + playbooks + the docs/ index ─────────────────
// Closes the "if a user only has the MCP, do they get the knowledge base?" gap: ONE engine serves
// the CLI `knowledge` command and the MCP robinhood_knowledge tool, so an MCP-only agent can pull
// the same operating modules a repo-local agent reads off disk.
// Zayd Khan // cold // www.zayd.wtf

export interface KnowledgeEntry {
  /** Stable id: file basename without .md ("wheel", "broker-call"); a colliding docs/ id gets a "docs-" prefix. */
  id: string;
  /** Repo-relative path ("knowledge/wheel.md"). */
  path: string;
  /** First markdown heading line, #s stripped. */
  title: string;
  /** First "When to load this" blockquote (knowledge modules/playbooks only) — the routing hint. */
  whenToLoad: string | null;
  kind: "module" | "playbook" | "doc";
}

function firstMarkdownHeading(content: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    const m = /^#+\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return null;
}

/** Extract the leading "> **When to load this:** …" blockquote (multi-line) from a module. */
function whenToLoadBlock(content: string): string | null {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((l) => /^>\s*\*\*When to load/i.test(l));
  if (start === -1) return null;
  const collected: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const m = /^>\s?(.*)$/.exec(lines[i]);
    if (!m) break;
    collected.push(m[1]);
  }
  return collected
    .join(" ")
    .replace(/\*\*When to load this:\*\*\s*/i, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

/**
 * Index the knowledge library: every knowledge/ module + knowledge/playbooks/ playbook (with the
 * "When to load this" routing hint), plus a docs/ reference index (filenames + first heading ONLY —
 * deep docs stay progressive-disclosure; load one via readKnowledge(id) when a module links there).
 */
export function listKnowledge(deps: { root?: string } = {}): KnowledgeEntry[] {
  const root = deps.root ?? repoRoot();
  const out: KnowledgeEntry[] = [];
  const seen = new Set<string>();
  const scan = (dir: string, kind: KnowledgeEntry["kind"], withHints: boolean) => {
    let files: string[] = [];
    try {
      files = readdirSync(join(root, dir)).filter((f) => f.toLowerCase().endsWith(".md")).sort();
    } catch {
      return; // directory absent (e.g. partial checkout) — index still serves what exists
    }
    for (const f of files) {
      let content: string;
      try {
        content = readFileSync(join(root, dir, f), "utf8");
      } catch {
        continue;
      }
      let id = f.replace(/\.md$/i, "").toLowerCase();
      if (seen.has(id)) id = `docs-${id}`; // docs/README.md must not shadow knowledge/README.md
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        path: `${dir}/${f}`,
        title: firstMarkdownHeading(content) ?? f,
        whenToLoad: withHints ? whenToLoadBlock(content) : null,
        kind
      });
    }
  };
  scan("knowledge", "module", true);
  scan("knowledge/playbooks", "playbook", true);
  scan("docs", "doc", false);
  return out;
}

/** Cheap did-you-mean for knowledge ids: substring containment, then shared-prefix/char overlap. */
function closestKnowledgeIds(want: string, ids: string[]): string[] {
  const w = want.toLowerCase();
  const scored = ids
    .map((id) => {
      let score = 0;
      if (id.includes(w) || w.includes(id)) score += 3;
      let prefix = 0;
      while (prefix < Math.min(id.length, w.length) && id[prefix] === w[prefix]) prefix++;
      score += Math.min(prefix, 3);
      const overlap = [...new Set(w)].filter((c) => id.includes(c)).length / Math.max(1, new Set(w).size);
      score += overlap;
      return { id, score };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.id);
}

/** Read one knowledge module/playbook/doc in full by id (basename without .md). Did-you-mean on a miss. */
export function readKnowledge(
  id: string,
  deps: { root?: string } = {}
): { id: string; path: string; title: string; kind: KnowledgeEntry["kind"]; content: string } {
  const root = deps.root ?? repoRoot();
  const entries = listKnowledge(deps);
  const want = id.trim().toLowerCase().replace(/\.md$/i, "");
  const hit = entries.find((e) => e.id === want);
  if (!hit) {
    const close = closestKnowledgeIds(want, entries.map((e) => e.id));
    throw new Error(
      `No knowledge module "${id}".${close.length ? ` Did you mean: ${close.join(", ")}?` : ""} Run \`knowledge\` (or robinhood_knowledge action=index) for the full index.`
    );
  }
  return { id: hit.id, path: hit.path, title: hit.title, kind: hit.kind, content: readFileSync(join(root, hit.path), "utf8") };
}

// ── Pending-roll ledger (rolls.md): cash-account kosher rolls are TWO-DAY trades ────────────────
// Close today, open next business day with settled cash — and sessions die between the legs. The
// pending intent lives in repo-root rolls.md so the NEXT session (CLI or MCP) picks the open leg
// back up. PENDING entries only: completion REMOVES the entry (the file stays clean), and the
// removed entry is returned so callers can log it to trading-log.md. Order history remains the
// only proof either leg actually executed.
// Zayd Khan // cold // www.zayd.wtf

export const ROLLS_FILE = "rolls.md";

export interface PendingRoll {
  symbol: string;
  /** Date the close leg was staged ("opened" in the header), YYYY-MM-DD. */
  opened: string;
  closedLeg: string | null;
  openIntent: string | null;
  earliestOpenDate: string | null;
  account: string | null;
  notes: string | null;
  /** Exact block text in rolls.md — used for surgical removal on completion. */
  block: string;
}

/**
 * Parse rolls.md content into pending entries. Contract: `### PENDING | SYMBOL | opened YYYY-MM-DD`
 * then `- field: value` lines. Headers marked EXAMPLE are ignored (the seeded sample), as is the
 * format template in the file header (its date placeholder never matches a real date).
 */
export function parsePendingRolls(content: string): PendingRoll[] {
  const rolls: PendingRoll[] = [];
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const m = /^###\s+PENDING\s*\|\s*([^|]+?)\s*\|\s*opened\s+(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const start = i;
    i++;
    while (i < lines.length && !/^###\s/.test(lines[i])) i++;
    const block = lines.slice(start, i).join("\n");
    if (/\bEXAMPLE\b/i.test(m[3] ?? "")) continue; // example entry — parser ignores
    const field = (name: string): string | null => {
      const fm = new RegExp(`^[-*]\\s*${name}\\s*:\\s*(.+)$`, "im").exec(block);
      const v = fm?.[1]?.trim();
      return v && v !== "—" ? v : null;
    };
    rolls.push({
      symbol: m[1].trim().toUpperCase(),
      opened: m[2],
      closedLeg: field("closed leg"),
      openIntent: field("intended open leg"),
      earliestOpenDate: field("earliest open date"),
      account: field("account"),
      notes: field("notes"),
      block
    });
  }
  return rolls;
}

/** Render one rolls.md entry block (the exact shape parsePendingRolls reads back). */
export function formatPendingRoll(input: {
  symbol: string;
  closedLeg?: string;
  openIntent?: string;
  earliestOpenDate?: string;
  account?: string;
  notes?: string;
  now?: Date;
}): string {
  const d = input.now ?? new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  const opened = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const acct = input.account?.trim();
  return [
    "",
    `### PENDING | ${input.symbol.trim().toUpperCase()} | opened ${opened}`,
    `- closed leg: ${input.closedLeg?.trim() || "—"}`,
    `- intended open leg: ${input.openIntent?.trim() || "fresh quote on the open day"}`,
    `- earliest open date: ${input.earliestOpenDate?.trim() || "next business day after the close"}`,
    `- account: ${acct ? `…${acct.slice(-4)}` : "—"}`,
    `- notes: ${input.notes?.trim() || "—"}`,
    ""
  ].join("\n");
}

/** Append a pending kosher-roll intent to rolls.md. Local file only — never touches the account. */
export function addPendingRoll(
  input: { symbol: string; closedLeg?: string; openIntent?: string; earliestOpenDate?: string; account?: string; notes?: string },
  deps: { file?: string; now?: Date } = {}
): { file: string; entry: string } {
  if (!input.symbol?.trim()) throw new Error("A pending roll needs at least a symbol.");
  const file = deps.file ?? join(repoRoot(), ROLLS_FILE);
  const entry = formatPendingRoll({ ...input, now: deps.now });
  appendFileSync(file, entry);
  return { file, entry };
}

export function listPendingRolls(deps: { file?: string } = {}): PendingRoll[] {
  const file = deps.file ?? join(repoRoot(), ROLLS_FILE);
  try {
    return parsePendingRolls(readFileSync(file, "utf8"));
  } catch {
    return []; // no ledger yet — nothing pending
  }
}

/**
 * Complete (or abandon) a pending roll: REMOVE its entry from rolls.md and return it so the caller
 * can append the completion to trading-log.md. Match by "SYMBOL" or "SYMBOL YYYY-MM-DD"; ambiguity
 * and misses fail loud with the live pending list. Overwrites the file with the entry excised —
 * completed entries never accumulate.
 */
export function completePendingRoll(
  symbolOrId: string,
  deps: { file?: string } = {}
): { file: string; removed: PendingRoll; remaining: number } {
  const file = deps.file ?? join(repoRoot(), ROLLS_FILE);
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    throw new Error(`${ROLLS_FILE} not found — nothing pending to complete.`);
  }
  const rolls = parsePendingRolls(content);
  const want = symbolOrId.trim().toUpperCase();
  const [sym, date] = want.split(/\s+/);
  const matches = rolls.filter((r) => r.symbol === sym && (!date || r.opened === date));
  if (matches.length === 0) {
    throw new Error(
      `No pending roll matches "${symbolOrId}". Pending: ${rolls.map((r) => `${r.symbol} (opened ${r.opened})`).join(", ") || "none"}.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} pending rolls match ${sym} — disambiguate with "SYMBOL YYYY-MM-DD": ${matches.map((r) => `${r.symbol} ${r.opened}`).join(", ")}.`
    );
  }
  const removed = matches[0];
  const next = content.replace(removed.block, "").replace(/\n{3,}/g, "\n\n");
  writeFileSync(file, next.endsWith("\n") ? next : next + "\n");
  return { file, removed, remaining: rolls.length - 1 };
}

/**
 * Append the roll-completion bookkeeping entry to trading-log.md (committed, operator-facing).
 * Local file write only; STATUS stays honest — order history is the only proof the open leg filled.
 */
export function appendRollCompletionLog(
  removed: PendingRoll,
  deps: { file?: string; now?: Date } = {}
): { file: string; entry: string } {
  const file = deps.file ?? join(repoRoot(), "trading-log.md");
  const d = deps.now ?? new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} local`;
  const entry = [
    "",
    "=== TRADE LOG ENTRY",
    `WHEN:    ${stamp}`,
    `ACCOUNT: ${removed.account ?? "…????"}`,
    `ACTION:  roll-ledger done ${removed.symbol} (pending kosher-roll intent cleared from rolls.md)`,
    `SIZE:    n/a           ORDER-ID: n/a`,
    `STATUS:  bookkeeping   (order history remains the only proof the open leg itself executed)`,
    `INTENT:  Cash-account staged roll resolved — open leg filled or the plan was dropped.`,
    `THREAD:  was: close=${removed.closedLeg ?? "?"}; open intent=${removed.openIntent ?? "?"} (staged ${removed.opened})`,
    "=== END",
    ""
  ].join("\n");
  appendFileSync(file, entry);
  return { file, entry };
}

// Zayd Khan // cold // www.zayd.wtf

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
}): { "x-api-key": string; "x-timestamp": string; "x-signature": string } {
  const timestamp = String(input.timestamp);
  const method = input.method.toUpperCase();
  const body = input.body ?? "";
  const signedMessage = `${input.apiKey}${timestamp}${input.path}${method}${body}`;
  const privateKey = privateKeyFromBase64Seed(input.privateKeyBase64);
  const signature = sign(null, Buffer.from(signedMessage, "utf8"), privateKey).toString("base64");
  // NOTE: never return `signedMessage` — it embeds the API key in plaintext and would be
  // echoed through the MCP/CLI response into logs and model context. Callers need only the
  // three signed headers below; reconstruct the message internally if ever required.
  return {
    "x-api-key": input.apiKey,
    "x-timestamp": timestamp,
    "x-signature": signature
  };
}

// --- Options analytics: pure helpers (shared by the `options` command surface) ---
//
// Robinhood splits cost basis (aggregate_positions.average_open_price, a
// per-contract dollar amount = premium * 100) from the live mark
// (marketdata/options.adjusted_mark_price, per share). Percent return joins the
// two. Kept pure so the math is unit-tested without any live calls.

/** Percent return of a long option: (markPerShare*100 - averageOpenPrice) / averageOpenPrice * 100. */
export function optionReturnPct(averageOpenPrice: number, adjustedMarkPrice: number): number {
  if (!(averageOpenPrice > 0) || !Number.isFinite(adjustedMarkPrice)) return Number.NaN;
  const currentValue = adjustedMarkPrice * 100;
  return ((currentValue - averageOpenPrice) / averageOpenPrice) * 100;
}

/**
 * Generic percent change from a base to a current value: (current - base) / base * 100.
 * Used for equity P/L (avg buy vs last) and day change (prev close vs last). Returns
 * NaN on a non-positive base or non-finite current so callers render "—" not Infinity.
 */
export function percentChange(base: number, current: number): number {
  if (!(base > 0) || !Number.isFinite(current)) return Number.NaN;
  return ((current - base) / base) * 100;
}

export interface CollarSanity {
  ref: number;
  ask: number;
  deviationPct: number;
  stale: boolean;
}

/**
 * Sanity-check the auto ask-collar used by a shares (market/OTC-limit) equity order.
 * The web order body carries the live ask as a price collar; after hours / on a halt the
 * marketdata ask goes stale and wide (observed: ARKG ask $92.80 vs a ~$33 stock), so baking
 * it as the collar protects nothing. Compare the ask to a robust reference — extended-hours
 * last → regular last → bid/ask mid — and flag an egregious gap (default >25%).
 *
 * Descriptive, not prescriptive: this only catches a broken quote, never a legitimately
 * aggressive price. Returns NaN deviation + stale:false when there's no usable reference,
 * so a missing quote never blocks an order on its own. Callers warn on dry-run, block live.
 */
export function collarSanity(
  quote: Record<string, unknown>,
  thresholdPct = 25
): CollarSanity {
  const num = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
  };
  const ask = num(quote.ask_price);
  const bid = num(quote.bid_price);
  const last = num(quote.last_extended_hours_trade_price) || num(quote.last_trade_price);
  const mid = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : Number.NaN;
  const ref = Number.isFinite(last) ? last : mid;
  if (!Number.isFinite(ref) || !Number.isFinite(ask)) return { ref, ask, deviationPct: Number.NaN, stale: false };
  const deviationPct = (Math.abs(ask - ref) / ref) * 100;
  return { ref, ask, deviationPct, stale: deviationPct > thresholdPct };
}

export type Moneyness = "ITM" | "ATM" | "OTM";

/** Classify a strike relative to spot for a call or put. Equality (or no spot) is ATM. */
export function classifyMoneyness(strike: number, spot: number, type: "call" | "put"): Moneyness {
  if (!(spot > 0) || strike === spot) return "ATM";
  const strikeBelowSpot = strike < spot;
  if (type === "call") return strikeBelowSpot ? "ITM" : "OTM";
  return strikeBelowSpot ? "OTM" : "ITM";
}

/**
 * Slice the strike ladder to `width` strikes on each side of the strike nearest
 * spot (so an ATM-centered window of up to 2*width+1 rows). Returns the input
 * untouched when spot is unknown or the ladder already fits the window.
 */
export function selectNearStrikes<T extends { strike: number }>(rows: T[], spot: number, width: number): T[] {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  if (!(spot > 0) || !(width >= 0) || sorted.length <= width * 2 + 1) return sorted;
  let centerIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  sorted.forEach((row, index) => {
    const distance = Math.abs(row.strike - spot);
    if (distance < bestDistance) {
      bestDistance = distance;
      centerIndex = index;
    }
  });
  return sorted.slice(Math.max(0, centerIndex - width), centerIndex + width + 1);
}

function finitePrice(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function finiteNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function firstFinite(...values: number[]): number {
  return values.find((value) => Number.isFinite(value)) ?? Number.NaN;
}

function roundOptionMoney(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100) / 100;
}

function signedGreek(
  legs: OptionsStrategyPricingLegInput[],
  key: "delta" | "gamma" | "theta" | "vega" | "rho",
  multiplier: 100
): number {
  const total = legs.reduce((sum, leg) => {
    const value = finiteNumber(leg[key]);
    if (!Number.isFinite(value)) return sum;
    const sign = leg.action === "sell" ? -1 : 1;
    return sum + sign * value * Math.max(1, leg.ratioQuantity ?? 1) * multiplier;
  }, 0);
  return roundOptionMoney(total);
}

export function buildOptionsStrategyPricingSummary(input: {
  legs: OptionsStrategyPricingLegInput[];
  mode?: OptionsStrategyPricingMode;
  preferredDirection?: "credit" | "debit";
  farLimitOffset?: number;
}): OptionsStrategyPricingSummary {
  const mode = input.mode ?? "mid";
  if (!["natural", "mid", "safe-sell-probe", "safe-buy-probe"].includes(mode)) {
    throw new Error("pricing mode must be one of: natural, mid, safe-sell-probe, safe-buy-probe");
  }
  if (input.legs.length === 0) throw new Error("at least one option leg is required");
  const warnings: string[] = [];
  const farLimitOffset = input.farLimitOffset ?? 200;

  const legs = input.legs.map((leg): OptionsStrategyPricingLegSummary => {
    const bid = finitePrice(leg.bid);
    const ask = finitePrice(leg.ask);
    const mark = finitePrice(leg.mark);
    const last = finitePrice(leg.last);
    const ratioQuantity = Math.max(1, leg.ratioQuantity ?? 1);
    const hasBidAsk = Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid && ask > 0;
    const midUnitPrice = hasBidAsk ? (bid + ask) / 2 : firstFinite(mark, last, leg.action === "sell" ? bid : ask);
    const naturalUnitPrice =
      leg.action === "sell" ? firstFinite(bid, mark, last, ask) : firstFinite(ask, mark, last, bid);
    const quoteSource = hasBidAsk ? "bid_ask" : Number.isFinite(mark) ? "mark" : Number.isFinite(last) ? "last" : "missing";
    const signedNaturalContribution = (leg.action === "sell" ? 1 : -1) * naturalUnitPrice * ratioQuantity;
    const signedMidContribution = (leg.action === "sell" ? 1 : -1) * midUnitPrice * ratioQuantity;
    const bidAskWidth = Number.isFinite(bid) && Number.isFinite(ask) ? ask - bid : Number.NaN;

    if (!hasBidAsk) warnings.push(`${leg.id}: missing or unusable bid/ask; fell back to ${quoteSource}.`);
    if (Number.isFinite(bidAskWidth) && bidAskWidth < 0) warnings.push(`${leg.id}: crossed bid/ask quote.`);
    if (Number.isFinite(bidAskWidth) && bidAskWidth > 1) warnings.push(`${leg.id}: bid/ask width is wide (${bidAskWidth.toFixed(2)}).`);

    return {
      id: leg.id,
      action: leg.action,
      ratioQuantity,
      bid,
      ask,
      mark,
      last,
      naturalUnitPrice: roundOptionMoney(naturalUnitPrice),
      midUnitPrice: roundOptionMoney(midUnitPrice),
      signedNaturalContribution: roundOptionMoney(signedNaturalContribution),
      signedMidContribution: roundOptionMoney(signedMidContribution),
      bidAskWidth: roundOptionMoney(bidAskWidth),
      quoteSource
    };
  });

  const naturalNet = roundOptionMoney(legs.reduce((sum, leg) => sum + leg.signedNaturalContribution, 0));
  const midNet = roundOptionMoney(legs.reduce((sum, leg) => sum + leg.signedMidContribution, 0));
  const inferredDirection = naturalNet >= 0 ? "credit" : "debit";
  const direction = input.preferredDirection ?? inferredDirection;
  const naturalPrice = roundOptionMoney(Math.abs(naturalNet));
  const midPrice = roundOptionMoney(Math.abs(midNet));
  let limitPrice = mode === "natural" ? naturalPrice : midPrice;

  if (mode === "safe-sell-probe") {
    limitPrice = direction === "credit" ? naturalPrice + farLimitOffset : Math.max(0.01, naturalPrice - farLimitOffset);
    warnings.push(`safe-sell-probe limit is intentionally $${farLimitOffset.toFixed(2)} away from the natural market; dry-run only.`);
  } else if (mode === "safe-buy-probe") {
    limitPrice = direction === "debit" ? Math.max(0.01, naturalPrice - farLimitOffset) : naturalPrice + farLimitOffset;
    warnings.push(`safe-buy-probe limit is intentionally $${farLimitOffset.toFixed(2)} away from the natural market; dry-run only.`);
  }

  if (!Number.isFinite(limitPrice)) warnings.push("limit price could not be computed from available quotes.");

  return {
    mode,
    direction,
    naturalNet,
    midNet,
    naturalPrice,
    midPrice,
    limitPrice: roundOptionMoney(limitPrice),
    farLimitOffset,
    legs,
    netGreeks: {
      contractMultiplier: 100,
      delta: signedGreek(input.legs, "delta", 100),
      gamma: signedGreek(input.legs, "gamma", 100),
      theta: signedGreek(input.legs, "theta", 100),
      vega: signedGreek(input.legs, "vega", 100),
      rho: signedGreek(input.legs, "rho", 100)
    },
    warnings
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

// Zayd Khan // cold // www.zayd.wtf
// ── 6 Financial Tools (recovered from dist/lib.js after accidental git checkout) ──

export async function computeIncome(opts: any = {}, deps: any = {}) {
    const getJson = deps.getJson ?? brokerageGetJson;
    const getAll = deps.getAll ?? brokerageGetAllResults;
    const nowMs = (deps.now ?? Date.now)();
    const warnings = [];
    const year = opts.year ?? new Date(nowMs).getUTCFullYear();
    const yearStr = String(year);
    const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
    // 1. Dividends — reuse the existing engine
    let divResult;
    try {
        divResult = await computeDividends({ accountNumber: opts.accountNumber }, { getJson, getAll, now: () => nowMs });
    }
    catch (e: any) {
        warnings.push(`dividends engine failed: ${(e as Error).message.slice(0, 60)}`);
        divResult = { byMonth: [], totals: { last12moUsd: 0 }, warnings: [] };
        warnings.push(...(divResult.warnings ?? []));
    }
    // 2. Option premium from filled orders
    const n = (v: unknown) => Number(v);
    let totalPremiumTtm = 0;
    const ttmStart = new Date(nowMs - 365 * 86_400_000).toISOString().slice(0, 10);
    const premiumByMonth = new Map();
    for (const { acct } of accts) {
        try {
            const orders = await getAll("https://api.robinhood.com/options/orders/", {}, { account_number: acct, state: "filled" });
            for (const o of orders) {
                const createdAt = String(o.created_at ?? "").slice(0, 10);
                if (createdAt < ttmStart)
                    continue;
                const monthKey = createdAt.slice(0, 7);
                for (const leg of o.legs ?? []) {
                    const side = String(leg.side ?? "");
                    const effect = String(leg.position_effect ?? "");
                    // Premium = net credits from sell-to-open minus debits from buy-to-close
                    const isCredit = side === "sell" && effect === "open";
                    const isDebit = side === "buy" && effect === "close";
                    if (!isCredit && !isDebit)
                        continue;
                    for (const ex of leg.executions ?? []) {
                        const qty = n(ex.quantity);
                        const price = n(ex.price);
                        if (!(qty > 0) || !Number.isFinite(price))
                            continue;
                        const notional = price * qty * 100;
                        const signed = isCredit ? notional : -notional;
                        totalPremiumTtm += signed;
                        premiumByMonth.set(monthKey, (premiumByMonth.get(monthKey) ?? 0) + signed);
                    }
                }
            }
        }
        catch (e: any) {
            warnings.push(`option orders read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`);
        }
    }
    // 3. Monthly breakdown — marry dividend byMonth with premium byMonth
    const divByMonth = new Map();
    for (const m of divResult.byMonth ?? []) {
        if (m.month?.length === 7)
            divByMonth.set(String(m.month), n(m.totalUsd));
    }
    const allMonths = new Set([...divByMonth.keys(), ...premiumByMonth.keys()]);
    const sortedMonths = [...allMonths].sort();
    const monthlyBreakdown = sortedMonths.map((month: any) => ({
        month,
        dividendsUsd: round2(divByMonth.get(month) ?? 0),
        optionPremiumUsd: round2(premiumByMonth.get(month) ?? 0),
        totalUsd: round2((divByMonth.get(month) ?? 0) + (premiumByMonth.get(month) ?? 0))
    }));
    const dividendsTtm = round2(divResult.totals?.last12moUsd ?? 0);
    const premiumTtm = round2(totalPremiumTtm);
    const ttmTotal = round2(dividendsTtm + premiumTtm);
    const monthlyAverage = round2(ttmTotal / 12);
    const projectedAnnual = round2(monthlyAverage * 12);
    // Assignment edge-case warning
    const assignmentNote = "Option premium includes sell-to-open credits that may have resulted in assignment. Assignment events are not directly detectable via the API — premium from assigned positions may represent a cost-basis adjustment rather than standalone income. Cross-check against position history for any stock acquired near option expiration dates.";
    warnings.push(assignmentNote);
    const notes = [assignmentNote];
    return {
        accountsScanned: accts.map((a: any) => "…" + a.acct.slice(-4)),
        year,
        monthlyBreakdown,
        ttmTotalUsd: ttmTotal,
        monthlyAverageUsd: monthlyAverage,
        projectedAnnualRunRateUsd: projectedAnnual,
        dividendsTtmUsd: dividendsTtm,
        optionPremiumTtmUsd: premiumTtm,
        warnings,
        notes
    };
}
/**
 * Portfolio risk scanner: max loss across open positions, assignment exposure (ITM shorts),
 * undercovered short legs, margin-call distance, and concentration warnings (>20% in one symbol).
 */
export async function computeRisk(opts: any = {}, deps: any = {}) {
    const getJson = deps.getJson ?? brokerageGetJson;
    const getAll = deps.getAll ?? brokerageGetAllResults;
    const n = (v: unknown) => Number(v);
    const warnings = [];
    const positions = [];
    const concentrationWarnings = [];
    const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
    const perAcct: any[] = await Promise.all(accts.map(async ({ acct, label }: any) => {
        const out = { acct, label, equityPositions: [], optionPositions: [], equity: Number.NaN, borrowed: 0 };
        try {
            const eq = await getAll("https://api.robinhood.com/positions/", {}, { nonzero: "true", account_number: acct });
            out.equityPositions = eq.filter((p: any) => n(p.quantity) > 0).map((p: any) => ({ symbol: p.symbol, iid: p.instrument_id, qty: n(p.quantity), avgCost: n(p.average_buy_price) }));
        }
        catch (e: any) {
            warnings.push(`equity positions read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`);
        }
        try {
            const agg = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
            out.optionPositions = agg.map((p: any) => ({
                symbol: p.symbol, strategy: p.strategy, qty: n(p.quantity), avgOpenPrice: n(p.average_open_price),
                legs: (p.legs ?? []).map((l: any) => ({ optionId: l.option_id, side: l.position_type === "short" ? "short" : "long", type: l.option_type, strike: n(l.strike_price), expiration: l.expiration_date, ratioQuantity: n(l.ratio_quantity) || 1 })),
                underlyingType: p.underlying_type ?? "equity"
            }));
        }
        catch (e: any) {
            warnings.push(`option positions read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`);
        }
        try {
            const p = await getJson("https://api.robinhood.com/portfolios/{num}/", { num: acct });
            out.equity = n(p.equity);
        }
        catch { /* degrade */ }
        try {
            const m = await getJson("https://api.robinhood.com/margin/{account_number}/investing_info/", { account_number: acct });
            out.borrowed = n(m?.amount_borrowed) ?? 0;
        }
        catch { /* no margin */ }
        return out;
    }));
    const allEqIds = [...new Set(perAcct.flatMap((a: any) => a.equityPositions.map((p: any) => p.iid).filter(Boolean)))];
    const eqQuotes = new Map();
    try {
        for (let i = 0; i < allEqIds.length; i += 40) {
            const data = await getJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: allEqIds.slice(i, i + 40).join(",") });
            for (const r of data?.results ?? [])
                if (r?.instrument_id)
                    eqQuotes.set(r.instrument_id, r);
        }
    }
    catch (e: any) {
        warnings.push(`equity quotes batch failed: ${(e as Error).message.slice(0, 60)}`);
    }
    const allOptIds = [...new Set(perAcct.flatMap((a: any) => a.optionPositions.flatMap((p: any) => p.legs.map((l: any) => l.optionId).filter(Boolean))))];
    const optMarks = new Map();
    try {
        for (let i = 0; i < allOptIds.length; i += 40) {
            const data = await getJson("https://api.robinhood.com/marketdata/options/?ids={ids}", { ids: allOptIds.slice(i, i + 40).join(",") });
            for (const r of data?.results ?? [])
                if (r?.instrument_id)
                    optMarks.set(r.instrument_id, r);
        }
    }
    catch (e: any) {
        warnings.push(`option marks batch failed: ${(e as Error).message.slice(0, 60)}`);
    }
    let totalEquity = 0, totalBorrowed = 0;
    const symbolValues = new Map();
    for (const a of perAcct) {
        totalEquity += Number.isFinite(a.equity) ? a.equity : 0;
        totalBorrowed += a.borrowed;
        for (const p of a.equityPositions) {
            const q = eqQuotes.get(p.iid) ?? {};
            const last = n(q.last_trade_price);
            const mktVal = Number.isFinite(last) ? p.qty * last : Number.NaN;
            positions.push({ kind: "equity", symbol: p.symbol, description: p.symbol, side: "long", quantity: p.qty, marketValueUsd: round2(mktVal), maxLossUsd: round2(mktVal), itmExpirationRisk: false, undercoveredShortLegs: 0, account: a.acct });
            symbolValues.set(p.symbol, (symbolValues.get(p.symbol) ?? 0) + (Number.isFinite(mktVal) ? mktVal : 0));
        }
        for (const p of a.optionPositions) {
            let totalPosMktVal = 0, maxLoss: number | null = 0, itmRisk = false, undercovered = 0;
            for (const leg of p.legs) {
                const mark = optMarks.get(leg.optionId) ?? {};
                const markPrice = n(mark.adjusted_mark_price ?? mark.mark_price);
                const legVal = Number.isFinite(markPrice) ? markPrice * 100 * p.qty * leg.ratioQuantity : Number.NaN;
                const isShort = leg.side === "short";
                const sign = isShort ? -1 : 1;
                totalPosMktVal += (Number.isFinite(legVal) ? legVal : 0) * sign;
                if (isShort) {
                    const spotRef = a.equityPositions.find((ep: any) => ep.symbol === p.symbol);
                    const spot = spotRef ? n((eqQuotes.get(spotRef.iid) ?? {})?.last_trade_price) : Number.NaN;
                    if (Number.isFinite(spot) && Number.isFinite(leg.strike)) {
                        const moneyness = classifyMoneyness(leg.strike, spot, leg.type);
                        itmRisk = itmRisk || moneyness === "ITM";
                    }
                    if (leg.type === "call") {
                        const shares = a.equityPositions.find((ep: any) => ep.symbol === p.symbol);
                        const needed = p.qty * leg.ratioQuantity * 100;
                        if (!shares || shares.qty < needed)
                            undercovered += needed - (shares?.qty ?? 0);
                    }
                    maxLoss = null;
                }
            }
            // Max loss for a purely-long position = total debit paid, computed ONCE from the
            // position-level cost basis. average_open_price is ALREADY per-contract dollars
            // (premium × 100; see optionReturnPct), so it is multiplied by the contract count
            // ONLY — never by another 100 — and only after the leg loop, so a multi-leg long
            // (e.g. a long straddle) is not counted once per leg. Any short leg already set
            // maxLoss = null (spread defined-risk is intentionally left unmodeled here).
            if (maxLoss !== null) {
                const debit = n(p.avgOpenPrice) * p.qty;
                maxLoss = Number.isFinite(debit) ? debit : null;
            }
            positions.push({ kind: "option", symbol: p.symbol, description: `${p.symbol} ${p.strategy ?? ""}`.trim(), side: p.strategy?.startsWith("short") ? "short" : "long", quantity: p.qty, marketValueUsd: round2(totalPosMktVal), maxLossUsd: maxLoss !== null ? round2(maxLoss) : null, itmExpirationRisk: itmRisk, undercoveredShortLegs: undercovered, account: a.acct });
            symbolValues.set(p.symbol, (symbolValues.get(p.symbol) ?? 0) + (Number.isFinite(totalPosMktVal) ? Math.abs(totalPosMktVal) : 0));
        }
    }
    const totalPortfolio = [...symbolValues.values()].reduce((s, v) => s + v, 0);
    for (const [symbol, value] of symbolValues) {
        if (totalPortfolio <= 0)
            break;
        const pct = (value / totalPortfolio) * 100;
        if (pct > 20)
            concentrationWarnings.push({ symbol, weightPct: round2(pct), message: `${symbol} is ${pct.toFixed(1)}% of portfolio (>20% concentration).` });
    }
    const marginCallDistance = totalEquity > 0 ? round2((totalBorrowed / totalEquity) * 100) : null;
    return { accountsScanned: accts.map((a: any) => "…" + a.acct.slice(-4)), totalEquityUsd: round2(totalEquity), totalBorrowedUsd: round2(totalBorrowed), marginCallDistancePct: marginCallDistance, positions, concentrationWarnings, warnings };
}
/**
 * Greeks scenario calculator: takes current portfolio Greeks, applies spot ±X%, IV ±N%,
 * T - N days, and computes estimated P&L per position and total.
 */
export async function computeWhatIf(opts: any = {}, deps: any = {}) {
    const getJson = deps.getJson ?? brokerageGetJson;
    const getAll = deps.getAll ?? brokerageGetAllResults;
    const n = (v: unknown) => Number(v);
    const warnings = [];
    const spotPct = opts.spotPct ?? 0;
    const ivPct = opts.ivPct ?? 0;
    const days = opts.days ?? 0;
    const rateChangePct = opts.rateChangePct ?? 0;
    const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
    const allPositions = [];
    for (const { acct } of accts) {
        try {
            const agg = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
            for (const p of agg) {
                allPositions.push({ symbol: p.symbol, description: `${p.symbol} ${p.strategy ?? ""}`.trim(), qty: n(p.quantity), legs: (p.legs ?? []).map((l: any) => ({ optionId: l.option_id, side: l.position_type === "short" ? "short" : "long", ratioQuantity: n(l.ratio_quantity) || 1 })) });
            }
        }
        catch (e: any) {
            warnings.push(`option positions read failed: ${(e as Error).message.slice(0, 60)}`);
        }
    }
    const allOptIds = [...new Set(allPositions.flatMap((p: any) => p.legs.map((l: any) => l.optionId).filter(Boolean)))];
    const optMarks = new Map();
    try {
        for (let i = 0; i < allOptIds.length; i += 40) {
            const data = await getJson("https://api.robinhood.com/marketdata/options/?ids={ids}", { ids: allOptIds.slice(i, i + 40).join(",") });
            for (const r of data?.results ?? [])
                if (r?.instrument_id)
                    optMarks.set(r.instrument_id, r);
        }
    }
    catch (e: any) {
        warnings.push(`option marks batch failed: ${(e as Error).message.slice(0, 60)}`);
    }
    // ── resolve underlyings → spot prices for delta/gamma dollar P&L ──
    const uniqueSymbols = [...new Set(allPositions.map((p: any) => p.symbol).filter(Boolean))];
    const spotPrices = new Map();
    try {
        for (const sym of uniqueSymbols) {
            try {
                const iid = await resolveInstrumentId(sym, { getJson });
                if (!iid)
                    continue;
                const q = await getJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: iid });
                const last = n(q?.results?.[0]?.last_trade_price);
                if (Number.isFinite(last) && last > 0)
                    spotPrices.set(sym, last);
            }
            catch { /* individual symbol lookup can fail */ }
        }
    }
    catch (e: any) {
        warnings.push(`spot price resolution failed: ${(e as Error).message.slice(0, 60)}`);
    }
    const perPosition = [];
    let totalPnl = 0, totalDelta = 0, totalGamma = 0, totalTheta = 0, totalVega = 0, totalRho = 0;
    let totalDeltaPnl = 0, totalGammaPnl = 0, totalThetaPnl = 0, totalVegaPnl = 0, totalRhoPnl = 0;
    for (const pos of allPositions) {
        let netDelta = 0, netGamma = 0, netTheta = 0, netVega = 0, netRho = 0, mktVal = 0;
        for (const leg of pos.legs) {
            const mark = optMarks.get(leg.optionId) ?? {};
            const sign = leg.side === "short" ? -1 : 1;
            const ratio = leg.ratioQuantity * pos.qty;
            const delta = n(mark.delta) * sign * ratio * 100;
            const gamma = n(mark.gamma) * sign * ratio * 100;
            const theta = n(mark.theta) * sign * ratio * 100;
            const vega = n(mark.vega) * sign * ratio * 100;
            const rawRho = n(mark.rho);
            const rho = Number.isFinite(rawRho) ? rawRho * sign * ratio * 100 : 0;
            netDelta += delta;
            netGamma += gamma;
            netTheta += theta;
            netVega += vega;
            netRho += rho;
            const markPrice = n(mark.adjusted_mark_price ?? mark.mark_price);
            if (Number.isFinite(markPrice))
                mktVal += Math.abs(markPrice * 100 * ratio);
        }
        const spotPrice = spotPrices.get(pos.symbol) ?? 0;
        const spotChg = spotPct / 100; // e.g. 0.05 for +5%
        const spotDollarMove = Number.isFinite(spotPrice) && spotPrice > 0 ? spotPrice * spotChg : 0;
        // netDelta is already delta × contracts × 100 → dollar P&L per $1 underlying move
        const deltaPnl = netDelta * spotDollarMove;
        // netGamma is already gamma × contracts × 100 → change in delta per $1 underlying move
        const gammaPnl = 0.5 * netGamma * spotDollarMove * spotDollarMove;
        const thetaPnl = netTheta * days; // netTheta is daily $ decay × contracts × 100
        // netVega is $ per 1 percentage-point IV change × contracts × 100 — multiply by IV points directly
        const vegaPnl = netVega * ivPct;
        // netRho is $ per 1 percentage-point rate change × contracts × 100 — multiply by rate change points directly
        const rhoPnl = Number.isFinite(netRho) ? netRho * rateChangePct : 0;
        const estPnl = deltaPnl + gammaPnl + thetaPnl + vegaPnl + rhoPnl;
        perPosition.push({ symbol: pos.symbol, description: pos.description, estimatedPnlUsd: round2(estPnl), marketValueUsd: round2(mktVal), netDelta: round2(netDelta), netGamma: round2(netGamma), netTheta: round2(netTheta), netVega: round2(netVega), netRho: round2(netRho) });
        totalPnl += estPnl;
        totalDelta += netDelta;
        totalGamma += netGamma;
        totalTheta += netTheta;
        totalVega += netVega;
        totalRho += netRho;
        totalDeltaPnl += deltaPnl;
        totalGammaPnl += gammaPnl;
        totalThetaPnl += thetaPnl;
        totalVegaPnl += vegaPnl;
        if (Number.isFinite(rhoPnl)) totalRhoPnl += rhoPnl;
    }
    return { accountsScanned: accts.map((a: any) => "…" + a.acct.slice(-4)), scenario: { spotChangePct: spotPct, ivChangePct: ivPct, daysPassed: days, rateChangePct }, totalEstimatedPnlUsd: round2(totalPnl), totalRho: round2(totalRho), greekDecomposition: { deltaUsd: round2(totalDeltaPnl), gammaUsd: round2(totalGammaPnl), thetaUsd: round2(totalThetaPnl), vegaUsd: round2(totalVegaPnl), rhoUsd: round2(totalRhoPnl) }, perPosition, warnings };
}
/**
 * Event calendar: upcoming option expirations, ex-dividend dates, earnings dates.
 * Sorted by date; assignment-risk flag for ITM short calls near ex-div.
 */
export async function computeCalendar(opts: any = {}, deps: any = {}) {
    const getJson = deps.getJson ?? brokerageGetJson;
    const getAll = deps.getAll ?? brokerageGetAllResults;
    const nowMs = (deps.now ?? Date.now)();
    const n = (v: unknown) => Number(v);
    const warnings = [];
    const days = opts.days ?? 30;
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const cutoff = new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);
    const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
    const events = [];
    const allLegs = [];
    for (const { acct } of accts) {
        try {
            const agg = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
            for (const p of agg) {
                for (const leg of p.legs ?? []) {
                    if (leg.expiration_date && leg.expiration_date >= today && leg.expiration_date <= cutoff) {
                        allLegs.push({ symbol: p.symbol, type: leg.option_type ?? "unknown", strike: n(leg.strike_price), expiration: leg.expiration_date, side: leg.position_type === "short" ? "short" : "long" });
                    }
                }
            }
        }
        catch (e: any) {
            warnings.push(`option positions read failed: ${(e as Error).message.slice(0, 60)}`);
        }
    }
    const expByKey = new Map();
    for (const leg of allLegs) {
        const key = `${leg.expiration}|${leg.symbol}`;
        const list = expByKey.get(key) ?? [];
        list.push(`${leg.side} ${leg.type}${leg.strike ? ` $${leg.strike}` : ""}`);
        expByKey.set(key, list);
    }
    for (const [key, descs] of expByKey) {
        const [date, symbol] = key.split("|");
        const isShortCall = descs.some((d: any) => d.includes("short") && d.includes("call"));
        events.push({ date, type: "expiration", symbol, detail: `${descs.length} contract(s): ${descs.join(", ")}`, assignmentRisk: isShortCall });
    }
    for (const { acct } of accts) {
        try {
            const divs = await getAll("https://api.robinhood.com/dividends/", {}, { account_number: acct });
            for (const d of divs) {
                const exDate = d.ex_dividend_date ?? d.record_date;
                if (!exDate || exDate < today || exDate > cutoff)
                    continue;
                const sym = String((d.symbol ?? d._symbol ?? "")).toUpperCase();
                if (!sym)
                    continue;
                const shortCallNearby = allLegs.some((l: any) => l.symbol === sym && l.side === "short" && l.type === "call" && Math.abs(new Date(l.expiration).getTime() - new Date(exDate).getTime()) < 5 * 86_400_000);
                events.push({ date: exDate, type: "ex-dividend", symbol: sym, detail: `$${n(d.amount).toFixed(2)} dividend${d.state ? ` (${d.state})` : ""}`, assignmentRisk: shortCallNearby });
            }
        }
        catch { /* degrade */ }
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    return { accountsScanned: accts.map((a: any) => "…" + a.acct.slice(-4)), days, events, warnings: warnings.length ? warnings : ["Earnings dates not directly available via brokerage API; expirations and ex-dividend dates from position evidence."] };
}
/**
 * Concentration & Net Greeks: concentration by underlying (% of portfolio per symbol),
 * flag >20%, plus portfolio-wide net Greeks summed across all positions.
 */
export async function computeExposure(opts: any = {}, deps: any = {}) {
    const getJson = deps.getJson ?? brokerageGetJson;
    const getAll = deps.getAll ?? brokerageGetAllResults;
    const n = (v: unknown) => Number(v);
    const warnings = [];
    const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
    const symbolValues = new Map();
    const greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    let totalEquity = 0;
    for (const { acct } of accts) {
        try {
            const p = await getJson("https://api.robinhood.com/portfolios/{num}/", { num: acct });
            totalEquity += n(p.equity);
        }
        catch { /* degrade */ }
        try {
            const eq = await getAll("https://api.robinhood.com/positions/", {}, { nonzero: "true", account_number: acct });
            const eqIds = eq.filter((p: any) => n(p.quantity) > 0 && p.instrument_id).map((p: any) => p.instrument_id);
            if (eqIds.length) {
                const quotesMap = new Map();
                for (let i = 0; i < eqIds.length; i += 40) {
                    const data = await getJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: eqIds.slice(i, i + 40).join(",") });
                    for (const r of data?.results ?? [])
                        if (r?.instrument_id)
                            quotesMap.set(r.instrument_id, r);
                }
                for (const p of eq) {
                    const qty = n(p.quantity);
                    if (!(qty > 0))
                        continue;
                    const q = quotesMap.get(p.instrument_id) ?? {};
                    const last = n(q.last_trade_price);
                    const mktVal = Number.isFinite(last) ? qty * last : 0;
                    symbolValues.set(p.symbol, (symbolValues.get(p.symbol) ?? 0) + mktVal);
                    greeks.delta += qty;
                }
            }
        }
        catch (e: any) {
            warnings.push(`equity positions read failed: ${(e as Error).message.slice(0, 60)}`);
        }
        try {
            const agg = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
            const optIds = agg.flatMap((p: any) => (p.legs ?? []).map((l: any) => l.option_id).filter(Boolean));
            const marksMap = new Map();
            if (optIds.length) {
                for (let i = 0; i < optIds.length; i += 40) {
                    const data = await getJson("https://api.robinhood.com/marketdata/options/?ids={ids}", { ids: optIds.slice(i, i + 40).join(",") });
                    for (const r of data?.results ?? [])
                        if (r?.instrument_id)
                            marksMap.set(r.instrument_id, r);
                }
            }
            for (const p of agg) {
                let posMktVal = 0;
                for (const leg of p.legs ?? []) {
                    const mark = marksMap.get(leg.option_id) ?? {};
                    const sign = leg.position_type === "short" ? -1 : 1;
                    const ratio = n(leg.ratio_quantity) || 1;
                    const qty = n(p.quantity);
                    const markPrice = n(mark.adjusted_mark_price ?? mark.mark_price);
                    if (Number.isFinite(markPrice))
                        posMktVal += Math.abs(markPrice * 100 * qty * ratio);
                    greeks.delta += n(mark.delta) * sign * qty * ratio * 100;
                    greeks.gamma += n(mark.gamma) * sign * qty * ratio * 100;
                    greeks.theta += n(mark.theta) * sign * qty * ratio * 100;
                    greeks.vega += n(mark.vega) * sign * qty * ratio * 100;
                    greeks.rho += n(mark.rho) * sign * qty * ratio * 100;
                }
                symbolValues.set(p.symbol, (symbolValues.get(p.symbol) ?? 0) + posMktVal);
            }
        }
        catch (e: any) {
            warnings.push(`option positions read failed: ${(e as Error).message.slice(0, 60)}`);
        }
    }
    const totalPortfolio = [...symbolValues.values()].reduce((s, v) => s + v, 0);
    const concentration = [...symbolValues.entries()]
        .map(([symbol, value]) => ({ symbol, marketValueUsd: round2(value), weightPct: totalPortfolio > 0 ? round2((value / totalPortfolio) * 100) : 0, flag: totalPortfolio > 0 && (value / totalPortfolio) > 0.2 }))
        .sort((a, b) => b.weightPct - a.weightPct);
    return { accountsScanned: accts.map((a: any) => "…" + a.acct.slice(-4)), totalEquityUsd: round2(totalEquity), concentration, netGreeks: { contractMultiplier: 100, delta: round2(greeks.delta), gamma: round2(greeks.gamma), theta: round2(greeks.theta), vega: round2(greeks.vega), rho: round2(greeks.rho) }, warnings };
}
/**
 * Autopilot: scan all open short options approaching expiration (within N days, default 7),
 * compute potential roll candidates, emit dry-run order bodies. Read-only.
 */
export async function computeAutopilot(opts: any = {}, deps: any = {}) {
    const getJson = deps.getJson ?? brokerageGetJson;
    const getAll = deps.getAll ?? brokerageGetAllResults;
    const nowMs = (deps.now ?? Date.now)();
    const n = (v: unknown) => Number(v);
    const warnings = [];
    const lookahead = opts.days ?? 7;
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const cutoff = new Date(nowMs + lookahead * 86_400_000).toISOString().slice(0, 10);
    const accts = await listOwnedTradingAccounts(getJson, opts.accountNumber);
    const candidates = [];
    for (const { acct } of accts) {
        try {
            const agg = await getAll("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" });
            const symbols = [...new Set(agg.map((p: any) => p.symbol))];
            const spotBySymbol = new Map();
            const chainIdBySymbol = new Map();
            try {
                for (const sym of symbols) {
                    const inst = (await getJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: sym })).results?.[0];
                    if (inst?.id) {
                        const q = (await getJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: inst.id })).results?.[0];
                        const last = n(q?.last_trade_price);
                        if (Number.isFinite(last))
                            spotBySymbol.set(sym, last);
                        if (inst.tradable_chain_id)
                            chainIdBySymbol.set(sym, String(inst.tradable_chain_id));
                    }
                }
            }
            catch (e: any) {
                warnings.push(`spot quotes failed: ${(e as Error).message.slice(0, 60)}`);
            }
            for (const p of agg) {
                for (const leg of p.legs ?? []) {
                    if (leg.position_type !== "short")
                        continue;
                    if (!leg.expiration_date || leg.expiration_date > cutoff || leg.expiration_date < today)
                        continue;
                    const optType = leg.option_type;
                    const strike = n(leg.strike_price);
                    const dte = Math.max(0, Math.ceil((Date.parse(leg.expiration_date) - nowMs) / 86_400_000));
                    const spot = spotBySymbol.get(p.symbol) ?? Number.NaN;
                    const itmBy = Number.isFinite(spot) && Number.isFinite(strike) ? (optType === "call" ? spot - strike : strike - spot) : null;
                    const betterStrike = strike;
                    const expDateParts = leg.expiration_date.split('-').map(Number);
                    const expDate = new Date(expDateParts[0], expDateParts[1] - 1, expDateParts[2]);
                    const nextFriday = new Date(expDate.getTime() + 7 * 86_400_000);
                    nextFriday.setDate(nextFriday.getDate() + ((5 + 7 - nextFriday.getDay()) % 7));
                    const targetExp = nextFriday.toISOString().slice(0, 10);
                    const itmDesc = itmBy !== null && itmBy > 0 ? `ITM by $${itmBy.toFixed(2)}` : itmBy !== null ? `OTM by $${Math.abs(itmBy).toFixed(2)}` : "unknown";
                    const closeLegId = leg.option_id;
                    const chainId = chainIdBySymbol.get(p.symbol);
                    // Try to fetch live pricing for the roll
                    let estimatedNetCredit = null;
                    let netCreditMessage = `${p.symbol} $${strike} ${optType} expires ${leg.expiration_date} (${dte}d, ${itmDesc}). Consider rolling to ${targetExp} $${betterStrike} ${optType}. Run options strategy-quote to price.`;
                    let netCreditCanBeNegative;
                    if (chainId) {
                        try {
                            // Look up the open leg option instrument
                            const targetStrikeFormatted = betterStrike.toFixed(4);
                            const openLegUrl = "https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}";
                            const openLegInstruments = await getAll(openLegUrl, { chain_id: chainId, expiration_dates: targetExp, type: optType }, { strike_price: targetStrikeFormatted });
                            const openLegId = openLegInstruments?.find((i: any) => Math.abs(n(i.strike_price) - betterStrike) < 0.01)?.id;
                            if (openLegId && closeLegId) {
                                // Fetch market data for both legs
                                const marketData = await getJson("https://api.robinhood.com/marketdata/options/?ids={ids}", { ids: `${closeLegId},${openLegId}` });
                                const results = marketData?.results ?? [];
                                const closeLegQuote = results.find((r: any) => r.instrument_id === closeLegId) ?? {};
                                const openLegQuote = results.find((r: any) => r.instrument_id === openLegId) ?? {};
                                const closeAsk = n(closeLegQuote.ask_price);
                                const openBid = n(openLegQuote.bid_price);
                                if (Number.isFinite(closeAsk) && Number.isFinite(openBid)) {
                                    estimatedNetCredit = round2(openBid - closeAsk);
                                    netCreditMessage = `${p.symbol} $${strike} ${optType} expires ${leg.expiration_date} (${dte}d, ${itmDesc}). Roll to ${targetExp} $${betterStrike} ${optType}: estimated net ${estimatedNetCredit >= 0 ? "credit" : "debit"} $${Math.abs(estimatedNetCredit).toFixed(2)} per contract (open bid $${openBid.toFixed(2)} - close ask $${closeAsk.toFixed(2)}).`;
                                    netCreditCanBeNegative = estimatedNetCredit < 0 ? true : undefined;
                                }
                            }
                        }
                        catch (e: any) {
                            // Graceful degradation: estimatedNetCredit stays null
                            warnings.push(`pricing failed for ${p.symbol}: ${(e as Error).message.slice(0, 80)}`);
                        }
                    }
                    candidates.push({
                        symbol: p.symbol, currentPosition: `${p.symbol} ${optType} $${strike} ${leg.expiration_date}`,
                        expiration: leg.expiration_date, dte, itmBy: itmBy !== null ? round2(itmBy) : null, strike, type: optType, side: "short",
                        rollCandidate: { targetExpiration: targetExp, targetStrike: betterStrike, estimatedNetCredit, message: netCreditMessage, netCreditCanBeNegative },
                        dryRunOrder: { close: { action: "buy to close", leg: `${p.symbol} $${strike} ${optType} ${leg.expiration_date}` }, open: { action: "sell to open", leg: `${p.symbol} $${betterStrike} ${optType} ${targetExp}` } }
                    });
                }
            }
        }
        catch (e: any) {
            warnings.push(`option positions read failed (…${acct.slice(-4)}): ${(e as Error).message.slice(0, 60)}`);
        }
    }
    candidates.sort((a, b) => a.dte - b.dte);
    return { accountsScanned: accts.map((a: any) => "…" + a.acct.slice(-4)), lookaheadDays: lookahead, candidates, warnings };
    }

    /** Unified transaction history: equity + options + crypto orders + ACH transfers, newest first. */
    export async function getUnifiedHistory(
    opts: { days?: number; accountNumber?: string },
    deps: { getJson?: typeof brokerageGetJson; now?: () => number } = {}
    ): Promise<Array<{ time: string; kind: string; summary: string; state: string }>> {
    const getJson = deps.getJson ?? brokerageGetJson;
    const now = deps.now ?? Date.now;
    const days = Math.max(1, opts.days ?? 3);
    const cutoffMs = now() - days * 86400000;
    const inWindow = (ts: unknown): boolean => {
      const t = Date.parse(String(ts ?? ""));
      return Number.isFinite(t) && t >= cutoffMs;
    };
    const events: Array<{ time: string; kind: string; summary: string; state: string }> = [];

    // Equity orders
    const eq = await tryBrokerageGetJson(
      `https://api.robinhood.com/orders/${opts.accountNumber ? `?account_number=${encodeURIComponent(opts.accountNumber)}` : ""}`
    );
    if (eq.ok) for (const r of ((eq.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "equity", summary: `${r.side ?? "?"} ${r.quantity ?? "?"} @ ${r.average_price ?? r.price ?? "?"}`, state: String(r.state ?? "?") });
    }

    // Options orders
    const op = await tryBrokerageGetJson(
      `https://api.robinhood.com/options/orders/${opts.accountNumber ? `?account_numbers=${encodeURIComponent(opts.accountNumber)}` : ""}`
    );
    if (op.ok) for (const r of ((op.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "option", summary: `${r.chain_symbol ?? "?"} ${r.opening_strategy ?? r.closing_strategy ?? ""} ${r.direction ? `(${r.direction})` : ""} ${r.quantity ?? ""} @ ${r.price ?? "?"}`.trim(), state: String(r.state ?? "?") });
    }

    // Crypto orders
    const cx = await tryBrokerageGetJson("https://nummus.robinhood.com/orders/");
    if (cx.ok) for (const r of ((cx.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "crypto", summary: `${r.side ?? "?"} ${r.quantity ?? "?"} @ ${r.average_price ?? r.price ?? "?"}`, state: String(r.state ?? "?") });
    }

    // ACH transfers
    const ach = await tryBrokerageGetJson("https://api.robinhood.com/ach/transfers/");
    if (ach.ok) for (const r of ((ach.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "transfer", summary: `${r.direction ?? "?"} ${r.amount ?? "?"}`, state: String(r.state ?? "?") });
    }

    events.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    return events;
    }

    // Zayd Khan // cold // www.zayd.wtf
