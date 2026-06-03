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
      purpose: "Dry-run handoff only; live send still requires exact approval and the double write gate.",
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
      "Live options orders remain blocked unless exact user approval, --live-write, and ROBINHOOD_ALLOW_LIVE_WRITE=1 are all present.",
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
    "No universal URL is proven to open an unopened Robinhood option with expiration, strike, call/put, side, and account already selected.",
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
    "write gates are dry-run unless exact approval, --live-write, and ROBINHOOD_ALLOW_LIVE_WRITE=1 are present"
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
      "any live write attempted without --live-write and ROBINHOOD_ALLOW_LIVE_WRITE=1"
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
      "x-robinhood-web-app-version": process.env.ROBINHOOD_WEB_APP_VERSION ?? "2026.23.2025+43f8dad0de15",
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
