#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import {
  buildAccountContextUrl,
  buildOptionsContractLinkBundle,
  buildOptionsContractNavigationPlan,
  buildOptionsStrategyOrderPlan,
  computeAutopilot,
  computeSentinel,
  computeCalendar,
  computeExposure,
  computeIncome,
  computePerformance,
  computeRisk,
  computeWhatIf,
  computeNews,
  computeRatings,
  computeEarnings,
  computeMovers,
  computeOptionsEvents,
  executeBrokerageRequest,
  executeCryptoRequest,
  filterAccountContextWorkflows,
  filterBrokerageRoutes,
  filterOptionsStrategyWorkflows,
  filterRobinhoodRoutes,
  listCryptoRoutes,
  loadAccountContextWorkflows,
  loadBrowserRoutes,
  loadBrokerageRoutes,
  loadOptionsStrategyWorkflows,
  loadRobinhoodRoutes,
  parseParamAssignments,
  planBrokerageRequest,
  planCryptoRequest,
  inferBrokerageMethod,
  resolveLiveWriteGate,
  accountFromWriteRequest,
  riskIsWrite,
  selectRouteByQueryAndMethod,
  brokerageGetJson,
  brokerageGetAllResults,
  loadOwnedAccounts,
  fetchOptionMarks,
  computePortfolioPnl,
  getUnifiedHistory,
  computeDividends,
  computeTradeReview,
  addTradeNote,
  computeHotlist,
  listKnowledge,
  readKnowledge,
  listPendingRolls,
  addPendingRoll,
  completePendingRoll,
  appendRollCompletionLog,
  listDocuments,
  getMarginHealth,
  tryBrokerageGetJson,
  gatedBrokerageWrite,
  watchlistMutateItems,
  createWatchlist,
  getWatchlistItems,
  buyWatchlistBasket,
  placeEquityOrder,
  assertAccountOwned,
  getOrderStatus,
  extractOrderId,
  cancelOrder,
  listOpenOrders,
  panicCancelAll,
  runPretradeChecks,
  buildOptionsClosePlan,
  computeWheelState,
  signCryptoRequest,
  summarizeApiMap,
  buildEndpointDirectory,
  ENDPOINT_DOMAINS,
  describeRoute,
  loadRecipes,
  filterRecipes,
  readOptionsOrderFlow,
  selectNearStrikes,
  classifyMoneyness,
  finiteNumber,
  quoteLast,
  optionMoney,
  buildOptionsStrategyPricingSummary,
  percentChange,
  fetchRecurringSchedules,
  setRecurringState,
  recurringSymbol,
  detectAccountClass,
  buildAtomicRollOrderBody,
  resolveRollModel,
  appendPortfolioSnapshot,
  buildOptionsWorkbench,
  CAPABILITIES,
  capabilityEnabled,
  diffPortfolioSnapshots,
  maybeShareSafe,
  readPortfolioSnapshots,
  runDoctor,
  watchOrderLifecycle
} from "@zaydiscold/robinhood-cli/lib";

type RiskLevel = "read" | "sensitive-read" | "write-safe" | "write-mutate" | "write-or-sensitive" | "destructive";

// Branded input schemas for strict type safety and input boundary validation
const symbolSchema = z.string().regex(/^[A-Za-z0-9.-]{1,10}$/, "Invalid symbol format");
const symbolOptionalSchema = symbolSchema.optional();

const accountNumberSchema = z.string().regex(/^\d+$/, "Account number must be numeric");
const accountNumberOptionalSchema = accountNumberSchema.optional();

const uuidSchema = z.string().uuid("Invalid UUID format");
const uuidOptionalSchema = uuidSchema.optional();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const dateOptionalSchema = dateSchema.optional();

const strikeSchema = z.string().regex(/^\d+(\.\d+)?$/, "Strike must be a positive decimal number");

export const server = new McpServer(
  {
    name: "robinhood-cli-mcp",
    title: "Robinhood CLI MCP — Zayd Khan // cold // zayd.wtf",
    version: "0.1.0"
  },
  {
    // Boot pointer for MCP-only agents (no repo checkout needed) — Zayd Khan // cold // www.zayd.wtf
    instructions:
      "Control plane for a REAL Robinhood account. CARDINAL RULE: reads run live and free; writes are dry-run by default, gated by the single master switch ROBINHOOD_ALLOW_LIVE_WRITE=1 in the server's environment (no per-call liveWrite needed; pass dryRun:true to preview even when it's on). ACCOUNT DISCOVERY: never hardcode account numbers — enumerate at runtime via robinhood_accounts (the transfer/accounts/ full graph); act only on the account the operator designates. CLASSIFY BEFORE WRITE: classify the exact options strategy before building — never infer naked exposure from loose wording. ORDER-EVIDENCE RULE: brokerage order history is the ONLY proof a trade happened — not a 201, not a UI screen. KEY TOOL FAMILIES: portfolio (P&L in dollars by underlying), positions/options (holdings), pretrade (PASS/WARN/BLOCK pre-flight), options-chain/expirations/strategy-quote/roll-plan/close (full options surface), dividends/documents/margin/review/income/risk/whatif/calendar/exposure/autopilot (financial tools), watchlist-add/remove/create/items/buy (watchlist CRUD + basket buy), buy/sell/cancel/order-status (order lifecycle), wheel (evidence-based wheel stage + next-leg command), knowledge/roll-ledger/hotlist (operator memory), settings/recurring (account control), search (natural-language → ticker), recipes (intent → the one command). SIGNAL SOURCING: the due-diligence doctrine ranks signal quality — X/Reddit pulse (fastest) → news/midlands confirmer → institutional outlook (regime layer) → academic math (foundation); none is gospel, all subordinate to live market data + order history. At session start on any trading topic, pull the operator knowledge library via robinhood_knowledge (action=index, then read the module that matches the task) and check robinhood_roll_ledger (action=list) for pending cash-account kosher rolls whose open leg may be due — they are two-day trades and sessions die between the legs. After any live write append a trading-log.md entry; brokerage order history is the ONLY proof an order happened."
  }
);

// Every tool returns an object via jsonResponse(), so every tool declares at least that truthful
// structural contract. Capability-registry tools below replace it with a precise schema. This makes
// structuredContent protocol-valid without inventing fake per-field guarantees for legacy tools.
const registerToolBase = server.registerTool.bind(server);
(server as any).registerTool = (name: string, config: any, handler: any) => {
  const definition = CAPABILITIES.find((entry) => entry.mcp === name);
  if (!definition) throw new Error(`MCP tool ${name} is missing from the typed capability registry`);
  if (!capabilityEnabled(definition)) return undefined;
  return registerToolBase(name, { outputSchema: z.object({}).catchall(z.unknown()), ...config }, handler);
};

function registerCapabilityTool(id: string, config: any, handler: any): void {
  const definition = CAPABILITIES.find((entry) => entry.id === id);
  if (!definition?.mcp) throw new Error(`Capability ${id} is missing an MCP name`);
  if (!capabilityEnabled(definition)) return;
  (server as any).registerTool(definition.mcp, config, handler);
}

function jsonResponse(value: unknown) {
  const safeValue = maybeShareSafe(value);
  const structuredContent = safeValue !== null && typeof safeValue === "object" && !Array.isArray(safeValue)
    ? safeValue as Record<string, unknown>
    : { result: safeValue };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(safeValue, null, 2) ?? "null" }],
    structuredContent
  };
}

// Structured tool error (MCP convention): return { isError: true, ... } instead of letting a handler
// throw. A bare throw IS caught by the SDK and surfaced as an error, but returning isError lets us
// give the agent a clean, actionable message rather than an opaque stack — and replaces the no-op
// `catch (e) { throw e; }` rethrows that previously added nothing. Zayd Khan // cold // www.zayd.wtf
function mcpError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  const code = e instanceof Error && e.name && e.name !== "Error"
    ? e.name.replace(/Error$/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()
    : "ROBINHOOD_ERROR";
  const retryable = /(?:429|rate.?limit|timeout|temporar|ECONNRESET|fetch failed)/i.test(message);
  const error = { code, message, retryable };
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `ERROR [${code}]: ${message}` }],
    structuredContent: { error }
  };
}

// Make the execution state of a WRITE tool UNMISSABLE. The operator runs live by default, so the
// dangerous failure is a dry-run response that READS like a success — an agent (or human) sees an
// order id / 201 / plan and assumes it's done. `executed` + a loud `executionStatus` are hoisted to
// the TOP of every write response so "nothing was sent" can never be mistaken for "done". Reads never
// call this. Zayd Khan // cold // www.zayd.wtf
function writeStatus(result: object, opts: { dryRun: boolean; reason?: string }) {
  const executionStatus = opts.dryRun
    ? `⚠️ DRY RUN — NOT EXECUTED. Nothing was sent to Robinhood; no order was placed, changed, or cancelled.${opts.reason ? ` Reason: ${opts.reason}` : ""} To execute for real: set ROBINHOOD_ALLOW_LIVE_WRITE=1 in the server's environment — the single master switch; no per-call liveWrite needed. (dryRun:true still previews any one call even when the switch is on.)`
    : `✅ LIVE — SENT to Robinhood. A 2xx alone is not proof: confirm the order in order history (evidence.confirmed).`;
  return jsonResponse({ executed: !opts.dryRun, executionStatus, ...result });
}

function toolAnnotations(readOnly: boolean, risk: RiskLevel) {
  const isWrite = risk !== "read" && risk !== "sensitive-read";
  return {
    readOnlyHint: readOnly,
    destructiveHint: isWrite,
    idempotentHint: readOnly || risk === "write-safe",
    openWorldHint: true
  };
}

// Live-flag alias resolution (param-consistency pass 2026-06-11): the parity tools historically
// took `live` while the executor tools took `liveWrite`. Every write tool now accepts BOTH —
// `liveWrite` is canonical, `live` is the accepted alias — both are now OPTIONAL no-ops kept for
// back-compat: the env switch ROBINHOOD_ALLOW_LIVE_WRITE=1 is the SOLE live-write gate.
// Zayd Khan // cold // www.zayd.wtf
function resolveLiveFlag(liveWrite?: boolean, live?: boolean): boolean {
  return Boolean(liveWrite ?? live);
}

// selectRouteByQueryAndMethod is imported from the shared lib — single source of truth with the
// CLI so the two resolvers can never diverge on write safety again.

const INSTRUMENTS_SYMBOL_URL = "https://api.robinhood.com/instruments/?symbol={symbol}";
const MARKETDATA_QUOTES_URL = "https://api.robinhood.com/marketdata/quotes/?ids={ids}";
const MARKETDATA_FUNDAMENTALS_URL = "https://api.robinhood.com/marketdata/fundamentals/{id}/";
const INSTRUMENT_SHORTING_URL = "https://api.robinhood.com/instruments/{id}/shorting/";
const INSTRUMENT_BUYING_POWER_URL = "https://bonfire.robinhood.com/accounts/{id}/instrument_buying_power/{uuid}/";
const INSTRUMENT_MARGIN_REQUIREMENTS_URL = "https://bonfire.robinhood.com/instruments/{uuid}/margin-requirements/";

// brokerageGetJson + tryBrokerageGetJson are imported from the shared lib (same as the CLI).
// finiteNumber, quoteLast, optionMoney are also imported from the shared lib.

server.registerTool(
  "robinhood_api_map_summary",
  {
    title: "Robinhood API Map Summary",
    description: "Summarize the bundled official Crypto OpenAPI and brokerage/account route map.",
    inputSchema: z.object({}),
    annotations: toolAnnotations(true, "read")
  },
  async () => jsonResponse(summarizeApiMap())
);

server.registerTool(
  "robinhood_api_map_directory",
  {
    title: "Robinhood API Map Directory",
    description: "By-domain endpoint directory: maps intent to the right route, the first-class command that drives it, and the response fields it returns (verified/inferred/undocumented). This does not make live calls.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      domain: z.enum(ENDPOINT_DOMAINS).optional(),
      query: z.string().optional(),
      withFields: z.boolean().default(false)
    })
  },
  async ({ domain, query, withFields }) => jsonResponse(buildEndpointDirectory({ domain, query, withFields }))
);

server.registerTool(
  "robinhood_brokerage_describe",
  {
    title: "Robinhood Brokerage Route Describe",
    description: "Self-describing route card for one URL: required tokens, query keys, response fields (verified/inferred/undocumented), risk, and the first-class command that drives it. On a miss returns did-you-mean suggestions; on ambiguity returns the candidate URLs. Never makes a live call.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      query: z.string(),
      method: z.string().optional()
    })
  },
  async ({ query, method }) => jsonResponse(describeRoute(query, method))
);

server.registerTool(
  "robinhood_recipes",
  {
    title: "Robinhood Recipes",
    description: "Intent → the one command to run. Maps a plain-English goal (optionally filtered by free-text query) to the verified first-class CLI command and its MCP-tool equivalent. The agent's intent-routing table. Does not make live calls.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      query: z.string().optional()
    })
  },
  async ({ query }) => {
    const recipes = filterRecipes(loadRecipes(), query);
    return jsonResponse({ count: recipes.length, recipes });
  }
);

server.registerTool(
  "robinhood_options_order_flow",
  {
    title: "Robinhood Options Order Flow",
    description: "Pre-trade options context (live reads): options buying power (per account — the real gate on opens), the fee schedule, and collateral requirements. Each read degrades to a warning independently. The options/orders/review preview is a POST and stays behind the gated write path.",
    annotations: toolAnnotations(true, "sensitive-read"),
    inputSchema: z.object({
      accountNumber: accountNumberOptionalSchema,
      chainId: uuidOptionalSchema
    })
  },
  async ({ accountNumber, chainId }) => jsonResponse(await readOptionsOrderFlow({ accountNumber, chainId }))
);

server.registerTool(
  "robinhood_brokerage_routes",
  {
    title: "Robinhood Brokerage Routes",
    description: "List reverse-engineered brokerage/account routes with optional risk/category/host/query filters. This does not make live calls.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      risk: z.enum(["read", "sensitive-read", "write-safe", "write-mutate", "write-or-sensitive", "destructive"]).optional(),
      category: z.string().optional(),
      host: z.string().optional(),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50)
    })
  },
  async ({ risk, category, host, query, limit }) => {
    const routes = filterBrokerageRoutes(loadBrokerageRoutes(), { risk, category, host, query }).slice(0, limit);
    return jsonResponse({ count: routes.length, routes });
  }
);

server.registerTool(
  "robinhood_routes",
  {
    title: "Robinhood Unified Routes",
    description: "List the unified Robinhood route map: official Crypto OpenAPI plus brokerage/account browser-backed routes. This does not make live calls.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      risk: z.enum(["read", "sensitive-read", "write-safe", "write-mutate", "write-or-sensitive", "destructive"]).optional(),
      category: z.string().optional(),
      host: z.string().optional(),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(300).default(80)
    })
  },
  async ({ risk, category, host, query, limit }) => {
    const routes = filterRobinhoodRoutes(loadRobinhoodRoutes(), { risk, category, host, query }).slice(0, limit);
    return jsonResponse({ count: routes.length, routes });
  }
);

server.registerTool(
  "robinhood_browser_routes",
  {
    title: "Robinhood Browser Routes",
    description: "List latest sanitized authenticated CDP route templates from Robinhood ticker/account pages.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      host: z.string().optional(),
      risk: z.enum(["read", "sensitive-read", "write-safe", "write-mutate", "write-or-sensitive", "destructive"]).optional(),
      limit: z.number().int().min(1).max(250).default(80)
    })
  },
  async ({ host, risk, limit }) => {
    const routes = loadBrowserRoutes()
      .filter((route) => (!host || route.host === host) && (!risk || route.risk === risk))
      .slice(0, limit);
    return jsonResponse({ count: routes.length, routes });
  }
);

server.registerTool(
  "robinhood_account_context_workflows",
  {
    title: "Robinhood Account Context Workflows",
    description: "List browser-observed account_number routing behavior across Robinhood web surfaces. This does not make live calls.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      behavior: z.enum(["propagates", "mixed", "ignored", "not-applicable", "stale-route"]).optional(),
      surface: z.string().optional(),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50)
    })
  },
  async ({ behavior, surface, query, limit }) => {
    const workflows = filterAccountContextWorkflows(loadAccountContextWorkflows(), { behavior, surface, query }).slice(0, limit);
    return jsonResponse({ count: workflows.length, workflows });
  }
);

server.registerTool(
  "robinhood_account_context_url",
  {
    title: "Robinhood Account Context URL",
    description: "Build a Robinhood web URL from an account-context workflow template. This only returns a planned URL and warnings.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      id: z.string(),
      params: z.array(z.string()).default([])
    })
  },
  async ({ id, params }) => {
    const workflow = loadAccountContextWorkflows().find((candidate) => candidate.id === id);
    if (!workflow) throw new Error(`No account-context workflow matched id: ${id}`);
    return jsonResponse(buildAccountContextUrl(workflow, parseParamAssignments(params)));
  }
);

server.registerTool(
  "robinhood_options_strategy_workflows",
  {
    title: "Robinhood Options Strategy Workflows",
    description: "List options strategy templates with payoff, Greek posture, risk class, and Robinhood lookup guidance.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      category: z.string().optional(),
      aggressiveness: z.enum(["conservative", "moderate", "aggressive"]).optional(),
      definedRisk: z.boolean().optional(),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50)
    })
  },
  async ({ category, aggressiveness, definedRisk, query, limit }) => {
    const workflows = filterOptionsStrategyWorkflows(loadOptionsStrategyWorkflows(), {
      category,
      aggressiveness,
      definedRisk,
      query
    }).slice(0, limit);
    return jsonResponse({ count: workflows.length, workflows });
  }
);

server.registerTool(
  "robinhood_options_strategy_plan",
  {
    title: "Robinhood Options Strategy Plan",
    description: "Build a dry-run Robinhood options order body template for a named options strategy. This does not execute an order.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      id: z.string(),
      params: z.array(z.string()).default([])
    })
  },
  async ({ id, params }) => {
    const workflow = loadOptionsStrategyWorkflows().find((candidate) => candidate.id === id);
    if (!workflow) throw new Error(`No options strategy workflow matched id: ${id}`);
    return jsonResponse(buildOptionsStrategyOrderPlan(workflow, parseParamAssignments(params)));
  }
);

server.registerTool(
  "robinhood_options_contract_plan",
  {
    title: "Robinhood Options Contract Navigation Plan",
    description:
      "Build account-scoped web navigation candidates plus deterministic API lookup steps for one exact options contract. This does not execute an order.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      accountNumber: accountNumberSchema,
      symbol: symbolSchema,
      expiration: dateSchema,
      optionType: z.enum(["call", "put"]),
      side: z.enum(["buy", "sell"]),
      strike: strikeSchema,
      positionEffect: z.enum(["open", "close"]).default("open"),
      chainId: uuidOptionalSchema,
      equityInstrumentId: uuidOptionalSchema,
      optionInstrumentId: uuidOptionalSchema,
      source: z.string().default("robinhood-cli-contract-plan")
    })
  },
  async ({
    accountNumber,
    symbol,
    expiration,
    optionType,
    side,
    strike,
    positionEffect,
    chainId,
    equityInstrumentId,
    optionInstrumentId,
    source
  }) =>
    jsonResponse(
      buildOptionsContractNavigationPlan({
        accountNumber,
        symbol,
        expiration,
        optionType,
        side,
        strike,
        positionEffect,
        chainId,
        equityInstrumentId,
        optionInstrumentId,
        source
      })
    )
);

server.registerTool(
  "robinhood_options_contract_link_bundle",
  {
    title: "Robinhood Options Contract Link Bundle",
    description:
      "Build a dry-run account-pinned options navigation/webhook handoff bundle from known contract fields. This does not execute an order.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      accountNumber: accountNumberSchema,
      symbol: symbolSchema,
      expiration: dateSchema,
      optionType: z.enum(["call", "put"]),
      side: z.enum(["buy", "sell"]),
      strike: strikeSchema,
      positionEffect: z.enum(["open", "close"]).default("open"),
      chainId: uuidOptionalSchema,
      equityInstrumentId: uuidOptionalSchema,
      underlyingInstrumentId: uuidOptionalSchema,
      optionInstrumentId: uuidOptionalSchema,
      optionInstrumentUrl: z.string().optional(),
      occSymbol: z.string().optional(),
      source: z.string().default("robinhood-cli-contract-links"),
      farLimitOffset: z.number().default(200),
      bid: z.union([z.number(), z.string()]).optional(),
      ask: z.union([z.number(), z.string()]).optional(),
      mark: z.union([z.number(), z.string()]).optional(),
      last: z.union([z.number(), z.string()]).optional(),
      delta: z.union([z.number(), z.string()]).optional(),
      gamma: z.union([z.number(), z.string()]).optional(),
      theta: z.union([z.number(), z.string()]).optional(),
      vega: z.union([z.number(), z.string()]).optional(),
      rho: z.union([z.number(), z.string()]).optional(),
      impliedVolatility: z.union([z.number(), z.string()]).optional(),
      volume: z.union([z.number(), z.string()]).optional(),
      openInterest: z.union([z.number(), z.string()]).optional(),
      strategyQuoteUrl: z.string().optional()
    })
  },
  async ({
    accountNumber,
    symbol,
    expiration,
    optionType,
    side,
    strike,
    positionEffect,
    chainId,
    equityInstrumentId,
    underlyingInstrumentId,
    optionInstrumentId,
    optionInstrumentUrl,
    occSymbol,
    source,
    farLimitOffset,
    bid,
    ask,
    mark,
    last,
    delta,
    gamma,
    theta,
    vega,
    rho,
    impliedVolatility,
    volume,
    openInterest,
    strategyQuoteUrl
  }) =>
    jsonResponse(
      buildOptionsContractLinkBundle({
        accountNumber,
        symbol,
        expiration,
        optionType,
        side,
        strike,
        positionEffect,
        chainId,
        equityInstrumentId,
        underlyingInstrumentId,
        optionInstrumentId,
        optionInstrumentUrl,
        occSymbol,
        source,
        farLimitOffset,
        quote: {
          bid,
          ask,
          mark,
          last,
          delta,
          gamma,
          theta,
          vega,
          rho,
          impliedVolatility,
          volume,
          openInterest
        },
        strategyQuoteUrl
      })
    )
);

server.registerTool(
  "robinhood_stock_profile",
  {
    title: "Robinhood Stock Profile",
    description:
      "Live-read the Robinhood stock page data for a symbol: quote, description, fundamentals, shorting/borrow, and optional account buying-power/margin context.",
    annotations: toolAnnotations(true, "sensitive-read"),
    inputSchema: z.object({
      symbol: symbolSchema,
      accountNumber: accountNumberOptionalSchema
    })
  },
  async ({ symbol, accountNumber }) => {
    const normalizedSymbol = symbol.toUpperCase();
    const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol: normalizedSymbol })).results?.[0];
    if (!instrument) throw new Error(`No equity instrument found for ${normalizedSymbol}.`);
    const instrumentId = String(instrument.id);
    const quote = (
      await brokerageGetJson(MARKETDATA_QUOTES_URL, { ids: instrumentId }, {
        bounds: "24_5",
        include_bbo_source: "true",
        include_inactive: "true"
      })
    ).results?.[0] ?? {};
    const fundamentalsResult = await tryBrokerageGetJson(MARKETDATA_FUNDAMENTALS_URL, { id: instrumentId }, {
      bounds: "trading",
      include_inactive: "true"
    });
    const fundamentals = fundamentalsResult.ok ? fundamentalsResult.data : {};
    const shortingResult = await tryBrokerageGetJson(INSTRUMENT_SHORTING_URL, { id: instrumentId });
    const shorting = shortingResult.ok ? shortingResult.data : undefined;
    const accountReads: Record<string, unknown> = {};
    const accountWarnings: string[] = [];
    if (accountNumber) {
      const buyingPower = await tryBrokerageGetJson(INSTRUMENT_BUYING_POWER_URL, { id: accountNumber, uuid: instrumentId });
      if (buyingPower.ok) accountReads.instrumentBuyingPower = buyingPower.data;
      else accountWarnings.push(`instrument buying power unavailable: ${buyingPower.error}`);
      const margin = await tryBrokerageGetJson(INSTRUMENT_MARGIN_REQUIREMENTS_URL, { uuid: instrumentId }, { account_number: accountNumber });
      if (margin.ok) accountReads.marginRequirements = margin.data;
      else accountWarnings.push(`margin requirements unavailable: ${margin.error}`);
    }
    const last = quoteLast(quote);
    const previousClose = finiteNumber(quote.previous_close ?? quote.adjusted_previous_close);
    return jsonResponse({
      symbol: normalizedSymbol,
      name: instrument.simple_name ?? instrument.name,
      instrumentId,
      instrumentUrl: instrument.url,
      stockPageUrl: `https://robinhood.com/stocks/${normalizedSymbol}${accountNumber ? `?account_number=${encodeURIComponent(accountNumber)}` : ""}`,
      type: instrument.type,
      tradeable: instrument.tradeable,
      tradability: instrument.tradability,
      fractionalTradability: instrument.fractional_tradability,
      shortSellingTradability: instrument.short_selling_tradability,
      tradableChainId: instrument.tradable_chain_id,
      quote: {
        last,
        previousClose,
        dayPct: percentChange(previousClose, last),
        bid: finiteNumber(quote.bid_price),
        ask: finiteNumber(quote.ask_price),
        bidSize: finiteNumber(quote.bid_size),
        askSize: finiteNumber(quote.ask_size),
        lastExtendedHours: finiteNumber(quote.last_extended_hours_trade_price)
      },
      fundamentals: {
        description: fundamentals.description,
        marketCap: finiteNumber(fundamentals.market_cap),
        peRatio: finiteNumber(fundamentals.pe_ratio),
        pbRatio: finiteNumber(fundamentals.pb_ratio),
        dividendYield: finiteNumber(fundamentals.dividend_yield),
        open: finiteNumber(fundamentals.open),
        high: finiteNumber(fundamentals.high),
        low: finiteNumber(fundamentals.low),
        volume: finiteNumber(fundamentals.volume),
        averageVolume: finiteNumber(fundamentals.average_volume),
        averageVolume30Days: finiteNumber(fundamentals.average_volume_30_days),
        high52Weeks: finiteNumber(fundamentals.high_52_weeks),
        low52Weeks: finiteNumber(fundamentals.low_52_weeks),
        sector: fundamentals.sector,
        industry: fundamentals.industry,
        ceo: fundamentals.ceo,
        headquartersCity: fundamentals.headquarters_city,
        headquartersState: fundamentals.headquarters_state,
        yearFounded: fundamentals.year_founded,
        distributionFrequency: fundamentals.distribution_frequency,
        exDividendDate: fundamentals.ex_dividend_date,
        dividendPerShare: finiteNumber(fundamentals.dividend_per_share)
      },
      shorting: shorting
        ? {
            borrowRate: finiteNumber(shorting.fee),
            dailyFee: finiteNumber(shorting.daily_fee),
            inventoryRange: shorting.inventory_range,
            feeTimestamp: shorting.fee_timestamp,
            inventoryTimestamp: shorting.inventory_timestamp
          }
        : undefined,
      accountContext: accountNumber ? { accountNumber, ...accountReads } : undefined,
      warnings: [
        ...(fundamentalsResult.ok ? [] : [`fundamentals unavailable: ${fundamentalsResult.error}`]),
        ...(shortingResult.ok ? [] : [`shorting unavailable: ${shortingResult.error}`]),
        ...accountWarnings
      ]
    });
  }
);

server.registerTool(
  "robinhood_brokerage_plan",
  {
    title: "Robinhood Brokerage Request Plan",
    description: "Create a dry-run request plan for a mapped brokerage/account route. This does not execute the request.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      query: z.string(),
      method: z.string().optional(),
      params: z.array(z.string()).default([])
    })
  },
  async ({ query, method, params }) => {
    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query });
    const route = selectRouteByQueryAndMethod(matches, query, method);
    if (!route) {
      throw new Error(`No brokerage route matched: ${query}`);
    }
    return jsonResponse(
      planBrokerageRequest({
        route,
        method,
        params: parseParamAssignments(params)
      })
    );
  }
);

server.registerTool(
  "robinhood_brokerage_execute",
  {
    title: "Robinhood Brokerage Execute",
    description: "Execute a Robinhood brokerage/account request using caller-owned auth env. Reads run live; writes are dry-run by default and require ROBINHOOD_ALLOW_LIVE_WRITE=1 set in the server env (liveWrite optional). Pass dryRun=true to force a non-sending plan. Pass queryParams:[\"key=value\"] to append URL query params AFTER route matching (e.g. queryParams:[\"list_id=<id>\",\"owner_type=custom\"] for discovery/lists/items/) — the route map matches on the path, so this is how you read query-param endpoints without a one-off script. After any live write, append a trading-log.md entry (intent + strategy thread); brokerage order history is the only proof an order happened (order-evidence rule).",
    annotations: toolAnnotations(false, "write-or-sensitive"),
    inputSchema: z.object({
      query: z.string(),
      method: z.string().optional(),
      params: z.array(z.string()).default([]),
      queryParams: z.array(z.string()).default([]),
      body: z.unknown().optional(),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional(),
      overrideCap: z.boolean().default(false).describe("bypass configured order/session notional caps for this raw order"),
      fullBody: z.boolean().default(false)
    })
  },
  async ({ query, method, params, queryParams, body, dryRun, liveWrite: liveWriteParam, live, overrideCap, fullBody }, extra) => {
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query });
    const route = selectRouteByQueryAndMethod(matches, query, method);
    if (!route) {
      throw new Error(`No brokerage route matched: ${query}`);
    }
    const parsedParams = parseParamAssignments(params);
    const parsedQuery = parseParamAssignments(queryParams);
    const requestMethod = (method ?? inferBrokerageMethod(route)).toUpperCase();
    const isWrite = riskIsWrite(route.risk) || (requestMethod !== "GET" && requestMethod !== "HEAD");
    if (isWrite) {
      const result = await gatedBrokerageWrite({
        url: route.url,
        method: requestMethod,
        params: parsedParams,
        query: parsedQuery,
        body,
        dryRun,
        liveWrite,
        overrideCap,
        fullBody,
        signal: extra.signal,
        logContext: `raw MCP brokerage execute: ${requestMethod} ${route.url}`
      });
      return writeStatus(result, { dryRun: result.dryRun, reason: result.reason });
    }
    const plan = planBrokerageRequest({
      route,
      method: requestMethod,
      params: parsedParams,
      query: parsedQuery,
      body,
      dryRun
    });
    const result = await executeBrokerageRequest(plan, {
      body,
      dryRun,
      fullBody,
      signal: extra.signal
    });
    return jsonResponse(result);
  }
);

server.registerTool(
  "robinhood_crypto_routes",
  {
    title: "Robinhood Crypto Routes",
    description: "List official Robinhood Crypto OpenAPI paths and methods.",
    inputSchema: z.object({}),
    annotations: toolAnnotations(true, "read")
  },
  async () => {
    const routes = listCryptoRoutes();
    return jsonResponse({ count: routes.length, routes });
  }
);

server.registerTool(
  "robinhood_crypto_sign",
  {
    title: "Robinhood Crypto Sign",
    description: "Generate official Robinhood Crypto API auth headers without sending a request.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      apiKey: z.string(),
      privateKeyBase64: z.string(),
      timestamp: z.string(),
      path: z.string(),
      method: z.string().default("GET"),
      body: z.string().default("")
    })
  },
  async ({ apiKey, privateKeyBase64, timestamp, path, method, body }) =>
    jsonResponse(
      signCryptoRequest({
        apiKey,
        privateKeyBase64,
        timestamp,
        path,
        method,
        body
      })
    )
);

server.registerTool(
  "robinhood_crypto_plan",
  {
    title: "Robinhood Crypto Request Plan",
    description: "Create a dry-run plan for an official Robinhood Crypto API route. This does not execute the request.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: z.object({
      query: z.string(),
      method: z.string().optional(),
      params: z.array(z.string()).default([]),
      queryParams: z.array(z.string()).default([]),
      body: z.string().optional()
    })
  },
  async ({ query, method, params, queryParams, body }) => {
    const matches = filterRobinhoodRoutes(loadRobinhoodRoutes(), { host: "trading.robinhood.com", query });
    const route = selectRouteByQueryAndMethod(matches, query, method);
    if (!route) {
      throw new Error(`No official Crypto route matched: ${query}`);
    }
    return jsonResponse(
      planCryptoRequest({
        route,
        method,
        params: parseParamAssignments(params),
        query: parseParamAssignments(queryParams),
        body,
        dryRun: true
      })
    );
  }
);

server.registerTool(
  "robinhood_crypto_execute",
  {
    title: "Robinhood Crypto Execute",
    description: "Execute an official Robinhood Crypto API request using caller-owned API key env. Reads run live; writes (orders/cancels) are dry-run by default and require ROBINHOOD_ALLOW_LIVE_WRITE=1 set in the server env (liveWrite optional). Pass dryRun=true to force a non-sending plan.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: z.object({
      query: z.string(),
      method: z.string().optional(),
      params: z.array(z.string()).default([]),
      queryParams: z.array(z.string()).default([]),
      body: z.string().optional(),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional(),
      fullBody: z.boolean().default(false)
    })
  },
  async ({ query, method, params, queryParams, body, dryRun, liveWrite: liveWriteParam, live, fullBody }) => {
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    const matches = filterRobinhoodRoutes(loadRobinhoodRoutes(), { host: "trading.robinhood.com", query });
    const route = selectRouteByQueryAndMethod(matches, query, method);
    if (!route) {
      throw new Error(`No official Crypto route matched: ${query}`);
    }
    const gate = resolveLiveWriteGate({ risk: route.risk, method, dryRun, liveWrite, accountNumber: accountFromWriteRequest(body, parseParamAssignments(params)) });
    const effectiveDryRun = dryRun || gate.forcedDryRun;
    const plan = planCryptoRequest({
      route,
      method,
      params: parseParamAssignments(params),
      query: parseParamAssignments(queryParams),
      body,
      dryRun: effectiveDryRun
    });
    const result = await executeCryptoRequest(plan, { body, dryRun: effectiveDryRun, fullBody });
    const m = method?.toUpperCase();
    const isWrite = riskIsWrite(route.risk) || (m !== undefined && m !== "GET" && m !== "HEAD");
    if (isWrite) return writeStatus(result as object, { dryRun: effectiveDryRun, reason: gate.forcedDryRun ? gate.reason : undefined });
    return jsonResponse(result);
  }
);

// --- Parity tools: mirror the CLI's first-class verbs, all via the SHARED engine -----------------
// Reads use brokerageGetJson; writes use the hoisted gatedBrokerageWrite (same gated path as the CLI).
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : Number.NaN; };

server.registerTool(
  "robinhood_accounts",
  {
    title: "Robinhood Accounts",
    description: "List every trading account (the COMPLETE graph via transfer/accounts/ — the bare accounts/ endpoint under-reports). Returns account_number, type, name. Use this to discover accounts; never hardcode account numbers.",
    inputSchema: z.object({}),
    annotations: toolAnnotations(true, "read")
  },
  async () => {
    const graph = await brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/");
    const rows = (Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : [])
      .filter((a: any) => a?.type === "rhs" || a?.type === "ira_roth")
      .map((a: any) => ({ account_number: a.account_number, type: a.type, name: a.account_name ?? a.display_title ?? "" }));
    return jsonResponse({ count: rows.length, accounts: rows });
  }
);

server.registerTool(
  "robinhood_positions",
  {
    title: "Robinhood Equity Positions",
    description: "Open equity positions (live read). Returns account, symbol, quantity, average_buy_price, instrument_id. With no account_number, enumerates the FULL owned account graph and reads per-account (the bare positions/ endpoint silently defaults to ONE account — the wrong-account/under-reporting trap). Pass account_number to scope to one.",
    inputSchema: z.object({ account_number: z.string().optional() }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number }) => {
    // EH-03: enumerate every owned account, not just the default one. The bare positions/ read
    // returns only the individual account — contracts/shares in IRAs or secondary accounts vanish.
    let accounts: string[];
    if (account_number) {
      accounts = [account_number];
    } else {
      const owned = await loadOwnedAccounts();
      accounts = owned ? [...owned.numbers] : [];
    }
    const held: any[] = [];
    if (accounts.length === 0) {
      // Owned-graph lookup failed — fall back to the bare (single/default) read rather than nothing.
      const data = await brokerageGetJson("https://api.robinhood.com/positions/", {}, { nonzero: "true" });
      for (const p of (Array.isArray(data.results) ? data.results : [])) if (n(p.quantity) > 0) held.push(p);
    } else {
      const perAccount = await Promise.all(accounts.map(async (acct) => {
        try {
          const data = await brokerageGetJson("https://api.robinhood.com/positions/", {}, { nonzero: "true", account_number: acct });
          return (Array.isArray(data.results) ? data.results : [])
            .filter((p: any) => n(p.quantity) > 0)
            .map((p: any) => ({ ...p, account_number: p.account_number ?? acct }));
        } catch { return []; }
      }));
      for (const arr of perAccount) held.push(...arr);
    }
    return jsonResponse({ count: held.length, positions: held.map((p: any) => ({ account: p.account_number, symbol: p.symbol, quantity: n(p.quantity), average_buy_price: n(p.average_buy_price), instrument_id: p.instrument_id })) });
  }
);

server.registerTool(
  "robinhood_portfolio",
  {
    title: "Robinhood Portfolio P&L",
    description:
      "One-call portfolio P&L across ALL owned accounts (or one) in DOLLARS. Per-account day change (equity − adjusted_equity_previous_close) AND after-hours change (extended_hours_equity − equity), then dollar-weighted drivers rolled up by underlying (or position) across accounts — equities AND options. Answers 'how am I down today / after hours and which names'. Ranks by DOLLARS not percent. Discloses a reconciliation residual (cash/dividends/transfers) so the drivers vs top-line gap is explicit. After-hours is EQUITY-only (options don't print after-hours). Live read; no gate.",
    inputSchema: z.object({
      by: z.enum(["underlying", "account", "position"]).default("underlying"),
      window: z.enum(["day", "after-hours", "both"]).default("both"),
      account_number: z.string().optional(),
      top: z.number().int().min(0).max(200).default(12)
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ by, window, account_number, top }) =>
    jsonResponse(await computePortfolioPnl({ by, window, accountNumber: account_number, top }))
);

// ── robinhood_buying_power: standalone per-account buying power + margin health ──
server.registerTool(
  "robinhood_buying_power",
  {
    title: "Robinhood Buying Power",
    description:
      "Per-account buying power breakdown: regular BP, unleveraged BP, intraday BP, cash, margin used, margin health %. Answers 'what can I actually deploy right now?'. Includes excess_maintenance vs excess_margin distinction. Live read; no gate.",
    inputSchema: z.object({
      account_number: z.string().optional(),
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number }) => {
    const graph = await brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/");
    const rows: any[] = Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : [];
    let accts: string[] = [];
    for (const a of rows) {
      if (a?.type !== "rhs" && a?.type !== "ira_roth") continue;
      if (!a.account_number) continue;
      accts.push(String(a.account_number));
    }
    if (account_number) {
      if (!accts.includes(String(account_number))) throw new Error(`Account ${account_number} not found.`);
      accts = [String(account_number)];
    }
    const results: any[] = [];
    for (const acct of accts) {
      try {
        const bp = await brokerageGetJson("https://api.robinhood.com/accounts/{num}/buying_power_breakdown", { num: acct });
        const p = await brokerageGetJson("https://api.robinhood.com/portfolios/{num}/", { num: acct });
        const n = (v: unknown) => Number(v);
        const equity = n(p.equity);
        const marketVal = n(p.market_value);
        const marginHealth = marketVal > 0 ? (equity / marketVal) * 100 : Number.NaN;
        results.push({
          accountNumber: acct,
          buyingPower: n(bp.buying_power),
          unleveragedBuyingPower: n(bp.unleveraged_buying_power),
          intradayBuyingPower: n(bp.intraday_buying_power),
          cash: n(bp.cash ?? (bp.breakdown?.find((x: any) => x.category === "Cash")?.value ?? 0)),
          leverageEnabled: bp.leverage_enabled ?? false,
          marginTotal: bp.breakdown?.find((x: any) => x.title?.toLowerCase().includes("margin total"))?.value ?? null,
          marginUsed: bp.breakdown?.find((x: any) => x.title?.toLowerCase().includes("margin used"))?.value ?? null,
          excessMaintenance: n(p.excess_maintenance),
          excessMargin: n(p.excess_margin),
          equity,
          marketValue: marketVal,
          marginHealthPct: marginHealth,
        });
      } catch (e) { results.push({ accountNumber: acct, error: (e as Error).message }); }
    }
    return jsonResponse(results);
  }
);

// ── robinhood_buy: simple market/limit order — matching the CLI `buy` command ──
server.registerTool(
  "robinhood_buy",
  {
    title: "Robinhood Buy Order",
    description:
      "Place an equity buy order. Market buys are fractional, limit orders are whole shares. Dry-run by default; set ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute (single env switch; liveWrite optional). Auto-resolves symbol, fetches live quote, sizes shares from dollar amount, blocks OTC/non-fractional dollar orders, dedups against pending same-side orders (5-min window; force=true skips), sends a ref_id for broker-level idempotency, logs live sends to the trading log, and re-reads the order from order history after a live send (`evidence.confirmed`) — same shared engine as the CLI `buy` command.",
    inputSchema: z.object({
      symbol: symbolSchema,
      account_number: accountNumberSchema,
      amount: z.number().positive().optional(),
      shares: z.number().positive().optional(),
      price: z.number().positive().optional(),
      time_in_force: z.enum(["gfd", "gtc"]).optional().describe("time in force; omit to let the engine pick (gfd market/OTC, gtc limit). gtc is rejected on a fractional dollar-market order"),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional(),
      force: z.boolean().default(false),
      overrideCap: z.boolean().optional().describe("bypass the ROBINHOOD_MAX_ORDER_DOLLARS / ROBINHOOD_MAX_SESSION_DOLLARS notional caps for this order"),
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ symbol, account_number, amount, shares, price: limitPrice, dryRun, liveWrite, live, force, overrideCap, time_in_force }) => {
    try {
      await assertAccountOwned(account_number);
      const r = await placeEquityOrder({
        symbol, accountNumber: account_number, side: "buy",
        amount, shares, limitPrice, timeInForce: time_in_force,
        dryRun,
        liveWrite: resolveLiveFlag(liveWrite, live), force: Boolean(force), overrideCap: Boolean(overrideCap)
      });
      const { result: _raw, ...summary } = r;
      return writeStatus(summary, { dryRun: summary.dryRun });
    } catch (e: any) {
      return mcpError(e);
    }
  }
);

// ── robinhood_sell: mirror of buy ──
server.registerTool(
  "robinhood_sell",
  {
    title: "Robinhood Sell Order",
    description: "Place an equity sell order. Market sells are fractional. Dry-run by default; set ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute (single env switch; liveWrite optional). Dedups against pending same-side orders (5-min window; force=true skips), sends a ref_id for broker-level idempotency, logs live sends to the trading log, and re-reads the order from order history after a live send (`evidence.confirmed`) — same shared engine as the CLI `sell` command.",
    inputSchema: z.object({
      symbol: symbolSchema, account_number: accountNumberSchema,
      amount: z.number().positive().optional(), shares: z.number().positive().optional(),
      price: z.number().positive().optional(),
      time_in_force: z.enum(["gfd", "gtc"]).optional().describe("time in force; omit to let the engine pick (gfd market/OTC, gtc limit). gtc is rejected on a fractional dollar-market order"),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(), live: z.boolean().optional(),
      force: z.boolean().default(false),
      overrideCap: z.boolean().optional().describe("bypass the ROBINHOOD_MAX_ORDER_DOLLARS / ROBINHOOD_MAX_SESSION_DOLLARS notional caps for this order"),
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ symbol, account_number, amount, shares, price: limitPrice, dryRun, liveWrite, live, force, overrideCap, time_in_force }) => {
    try {
      await assertAccountOwned(account_number);
      const r = await placeEquityOrder({
        symbol, accountNumber: account_number, side: "sell",
        amount, shares, limitPrice, timeInForce: time_in_force,
        dryRun,
        liveWrite: resolveLiveFlag(liveWrite, live), force: Boolean(force), overrideCap: Boolean(overrideCap)
      });
      const { result: _raw, ...summary } = r;
      return writeStatus(summary, { dryRun: summary.dryRun });
    } catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_cancel: cancel order by ID (equity or options, evidence re-read on live sends) ──
// Zayd Khan // cold // www.zayd.wtf
server.registerTool(
  "robinhood_cancel",
  {
    title: "Robinhood Cancel Order",
    description: "Cancel a pending order by ID (kind=equity|options). Dry-run by default; ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute (single env switch; liveWrite optional). Live cancels re-read the order from order history and return `evidence` (confirmed/state) — order history is the only proof the cancel took.",
    inputSchema: z.object({
      order_id: uuidSchema,
      kind: z.enum(["equity", "options"]).default("equity"),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional(),
      force: z.boolean().default(false).describe("bypass the fail-closed account pre-read — cancel even when the order's account can't be verified"),
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ order_id, kind, dryRun, liveWrite, live, force }) => {
    try {
      // Shared engine (cancelOrder in lib.ts) — same path as the CLI `cancel` command and `panic`.
      const r = await cancelOrder({ idOrUrl: order_id, kind, dryRun, liveWrite: resolveLiveFlag(liveWrite, live), force: Boolean(force) });
      return writeStatus(r, { dryRun: r.dryRun, reason: r.gateReason });
    } catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_orders_open: every open/pending order across accounts (panic's read half) ──
// Zayd Khan // cold // www.zayd.wtf
server.registerTool(
  "robinhood_orders_open",
  {
    title: "Robinhood Open Orders",
    description: "All open/pending equity + options orders across ALL owned accounts (or one), symbol-resolved, with state, age, TIF, limit price, and the exact cancel command for each. Read-only; per-account read failures degrade to warnings. Same shared engine as the CLI `orders open` and the read half of `panic`.",
    inputSchema: z.object({ account_number: accountNumberOptionalSchema }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number }) => {
    try { return jsonResponse(await listOpenOrders({ accountNumber: account_number })); }
    catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_panic: enumerate + cancel EVERY open order (each cancel env-gated) ──
// Zayd Khan // cold // www.zayd.wtf
server.registerTool(
  "robinhood_panic",
  {
    title: "Robinhood Panic Cancel-All",
    description: "PANIC: enumerate every open/pending equity + options order across ALL owned accounts (or one) and cancel each — every cancel individually env-gated (logContext 'panic cancel-all'). DRY-RUN by default: returns the full would-cancel list and sends NOTHING. A live sweep needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single env switch; liveWrite optional), and re-reads each order from order history for evidence. Summary reports found/cancelled/failed.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema,
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional()
    }),
    annotations: toolAnnotations(false, "destructive")
  },
  async ({ account_number, dryRun, liveWrite, live }) => {
    await assertAccountOwned(account_number);
    try {
      const r = await panicCancelAll({ accountNumber: account_number, dryRun, liveWrite: resolveLiveFlag(liveWrite, live) });
      return writeStatus(r, { dryRun: r.dryRun });
    } catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_pretrade: PASS/WARN/BLOCK preflight checklist (read-only, never POSTs) ──
// Zayd Khan // cold // www.zayd.wtf
server.registerTool(
  "robinhood_pretrade",
  {
    title: "Robinhood Pre-trade Preflight",
    description: "Pre-trade PASS/WARN/BLOCK checklist with the inputs given, each check degrading independently: account ownership + capability class (cash/margin/IRA), buying_power_breakdown (with the overnight-BP-gates-GTC-option-opens note), options buying power/fees/collateral, chain min-tick vs limit_price (the ARKG $0.05 trap), exact-contract existence, OTC/fractional guard. Marketability is a POST and is surfaced as a manual gated command — this tool NEVER sends anything. Summary: 'CLEAR TO BUILD ORDER' or 'BLOCKED: <reasons>'.",
    inputSchema: z.object({
      account_number: accountNumberSchema,
      symbol: symbolOptionalSchema,
      chain_id: uuidOptionalSchema,
      strike: z.number().optional(),
      expiration: dateOptionalSchema,
      option_type: z.enum(["call", "put"]).optional(),
      limit_price: z.number().optional()
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number, symbol, chain_id, strike, expiration, option_type, limit_price }) => {
    try {
      return jsonResponse(await runPretradeChecks({
        accountNumber: account_number, symbol, chainId: chain_id,
        strike, expiration, optionType: option_type, limitPrice: limit_price
      }));
    } catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_options_close: dry-run close plan for an open option position ──
// Zayd Khan // cold // www.zayd.wtf
server.registerTool(
  "robinhood_options_close",
  {
    title: "Robinhood Options Close Plan",
    description: "Build the DRY-RUN close order for an open option position: finds the position(s) for the symbol across all owned accounts, requires account_number/strike/expiration disambiguation when several match, derives sell-to-close (long) or buy-to-close (short) from the position's direction — position_effect is ALWAYS close, never infers an open — quotes live bid/ask, computes a tick-rounded mid limit, and returns the exact order body + the gated send command. NEVER sends anything; multi-leg positions are flagged for strategy-quote/roll-plan instead.",
    inputSchema: z.object({
      symbol: symbolSchema,
      account_number: accountNumberOptionalSchema,
      strike: z.number().optional(),
      expiration: dateOptionalSchema,
      option_type: z.enum(["call", "put"]).optional(),
      quantity: z.number().positive().optional()
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ symbol, account_number, strike, expiration, option_type, quantity }) => {
    try {
      return jsonResponse(await buildOptionsClosePlan({
        symbol, accountNumber: account_number, strike, expiration, optionType: option_type, quantity
      }));
    } catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_order_status: check status of a single order ──
server.registerTool(
  "robinhood_order_status",
  {
    title: "Robinhood Order Status",
    description: "Check status of a single order by ID or URL — symbol (UUID resolved to the real ticker), side, quantity, price, state, fills.",
    inputSchema: z.object({ order_id: z.string() }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ order_id }) => {
    try {
      return jsonResponse(await getOrderStatus(order_id));
    } catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_wheel: Wheel-strategy status + next leg from account evidence ──
server.registerTool(
  "robinhood_wheel",
  {
    title: "Robinhood Wheel Status",
    description:
      "Where am I in the Wheel (CSP → assignment → covered call → called away), and what's the next leg? Reads shares + short puts/calls per account from live evidence, classifies the stage, flags undercovered short calls, and returns the literal next-leg dry-run command. Works with no position (discussion mode: returns the leg-1 entry plan). Read-only; descriptive, not prescriptive. Background doc: docs/strategy-deep-dive-the-wheel-2026-06-04.md.",
    inputSchema: z.object({
      symbol: symbolOptionalSchema,
      account_number: accountNumberOptionalSchema
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ symbol, account_number }) => {
    try {
      return jsonResponse(await computeWheelState({ symbol, accountNumber: account_number }));
    } catch (e: any) { return mcpError(e); }
  }
);

server.registerTool(
  "robinhood_options_holdings",
  {
    title: "Robinhood Options Holdings",
    description: "Every held option contract across accounts (or one), each with its option_instrument_id (UUID) + contract link, symbol, qty, average_open_price. The owned-contract map.",
    inputSchema: z.object({ account_number: accountNumberOptionalSchema }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number }) => {
    let accounts: string[];
    const labels = new Map<string, string>();
    if (account_number) accounts = [account_number];
    else {
      const graph = await brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/");
      const rows = (Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : []).filter((a: any) => a?.type === "rhs" || a?.type === "ira_roth");
      accounts = rows.map((a: any) => String(a.account_number));
      for (const a of rows) labels.set(String(a.account_number), a.account_name ?? "");
    }
    const all: any[] = [];
    for (const acct of accounts) {
      const positions = (await brokerageGetJson("https://api.robinhood.com/options/aggregate_positions/?account_numbers=", {}, { account_numbers: acct, nonzero: "true" })).results ?? [];
      for (const p of positions) {
        const oid = String((p.legs?.[0]?.option ?? "").split("/options/instruments/")[1] ?? "").replace(/\//g, "");
        all.push({ account: acct, accountLabel: labels.get(acct) ?? "", symbol: p.symbol, optionInstrumentId: oid, quantity: n(p.quantity), averageOpenPrice: n(p.average_open_price), strategy: p.strategy, link: `https://robinhood.com/options/${oid}?account_number=${acct}` });
      }
    }
    return jsonResponse({ count: all.length, holdings: all });
  }
);

server.registerTool(
  "robinhood_options_inspect",
  {
    title: "Robinhood Option Inspect",
    description: "Full detail for ONE owned/known option contract by its UUID: metadata, live Greeks/quote, and fill history (side/effect/qty/price/date). Tolerates the web _L1 leg suffix. Read.",
    inputSchema: z.object({ option_instrument_id: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(_[Ll]\d+)?$/, "Invalid option instrument ID format") }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ option_instrument_id }) => {
    const id = option_instrument_id.replace(/_L\d+$/i, "").trim();
    const meta = await brokerageGetJson("https://api.robinhood.com/options/instruments/{0}/", { "0": id });
    const mark = (await brokerageGetJson("https://api.robinhood.com/marketdata/options/?ids={ids}", { ids: id })).results?.[0] ?? {};
    const fills: any[] = [];
    if (meta.chain_id) {
      const orders = (await brokerageGetJson("https://api.robinhood.com/options/orders/", {}, { chain_ids: meta.chain_id, states: "filled" })).results ?? [];
      for (const o of orders) for (const leg of o.legs ?? []) {
        if (!String(leg.option ?? "").includes(id)) continue;
        for (const ex of leg.executions ?? []) fills.push({ side: leg.side, positionEffect: leg.position_effect, quantity: n(ex.quantity), price: n(ex.price), timestamp: ex.timestamp });
      }
      fills.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    }
    return jsonResponse({
      optionInstrumentId: id, symbol: meta.chain_symbol, strike: n(meta.strike_price), type: meta.type, expiration: meta.expiration_date, state: meta.state, chainId: meta.chain_id,
      quote: { bid: n(mark.bid_price), ask: n(mark.ask_price), mark: n(mark.adjusted_mark_price), last: n(mark.last_trade_price), ivPct: n(mark.implied_volatility) * 100 },
      greeks: { delta: n(mark.delta), gamma: n(mark.gamma), theta: n(mark.theta), vega: n(mark.vega), rho: n(mark.rho) },
      openInterest: n(mark.open_interest), volume: n(mark.volume), fills,
      link: `https://robinhood.com/options/${id}`
    });
  }
);

server.registerTool(
  "robinhood_settings",
  {
    title: "Robinhood Account Settings",
    description: "Read or toggle account settings (env-gated). action=show reads all; drip/expiration/pdt/lending/sweep toggle the corresponding setting. Writes are dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 (single env switch; liveWrite optional). Cash-sweep only supports disable (enroll needs the agreement-sign flow). After any live write, append a trading-log.md entry (intent + thread); order history is the only proof a change took effect (order-evidence rule).",
    inputSchema: z.object({
      account_number: accountNumberSchema,
      action: z.enum(["show", "drip", "expiration", "pdt", "lending", "sweep"]),
      enable: z.boolean().optional(),
      instrument_id: uuidOptionalSchema,
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional()
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ account_number, action, enable, instrument_id, dryRun, liveWrite: liveWriteParam, live }) => {
    await assertAccountOwned(account_number);
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    if (action === "show") {
      const get = async (url: string) => { try { return await brokerageGetJson(url, { account_number: account_number }); } catch (e) { return { error: (e as Error).message.slice(0, 60) }; } };
      const [drip, opt, margin, sweep, lending] = await Promise.all([
        get("https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/"),
        get("https://api.robinhood.com/options/option_settings/{account_number}/"),
        get("https://api.robinhood.com/settings/margin/{account_number}/"),
        get("https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/"),
        get("https://bonfire.robinhood.com/slip/{account_number}/status/")
      ]);
      return jsonResponse({ account: account_number, dripEnabled: drip?.drip_enabled, tradingOnExpiration: opt?.trading_on_expiration_state, dayTradesProtection: margin?.day_trades_protection, sweepEnrolled: sweep?.sweep_enrolled, stockLendingEnabled: lending?.is_enabled });
    }
    let url: string, method: string, params: Record<string, string> = { account_number: account_number }, body: unknown;
    if (action === "drip") {
      url = instrument_id ? "https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/{instrument_id}/" : "https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/";
      if (instrument_id) params.instrument_id = instrument_id;
      method = "PATCH"; body = { drip_enabled: Boolean(enable) };
    } else if (action === "expiration") {
      url = "https://api.robinhood.com/options/option_settings/{account_number}/"; method = "PATCH"; body = { trading_on_expiration_state: enable ? "enabled" : "disabled" };
    } else if (action === "pdt") {
      url = "https://api.robinhood.com/settings/margin/{account_number}/"; method = "PUT"; body = { day_trades_protection: Boolean(enable) };
    } else if (action === "lending") {
      url = "https://bonfire.robinhood.com/slip/{account_number}/status/"; method = "PUT"; body = { is_enabled: Boolean(enable), was_ever_enabled: true };
    } else { // sweep
      if (enable) throw new Error("Only sweep disable is automated; enroll needs the agreement-sign flow.");
      url = "https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/"; method = "POST"; body = { sweep_enrollment_action: "unenroll" };
    }
    const r = await gatedBrokerageWrite({ url, method, params, body, dryRun, liveWrite });
    return writeStatus(r, { dryRun: r.dryRun, reason: r.reason });
  }
);

server.registerTool(
  "robinhood_recurring",
  {
    title: "Robinhood Recurring Schedules",
    description: "List or mutate recurring investment schedules (env-gated writes). action=list reads all; create/edit/end/pause/resume mutate. Writes dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 (single env switch; liveWrite optional). After any live write, append a trading-log.md entry (intent + thread); order history is the only proof a change took effect (order-evidence rule).",
    inputSchema: z.object({
      action: z.enum(["list", "create", "edit", "end", "pause", "resume"]),
      id: uuidOptionalSchema,
      all: z.boolean().optional().describe("Pause or resume all matching schedules"),
      account_number: accountNumberOptionalSchema,
      symbol: symbolOptionalSchema,
      amount: z.number().optional(),
      frequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
      start_date: dateOptionalSchema,
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional()
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ action, id, all, account_number, symbol, amount, frequency, start_date, dryRun, liveWrite: liveWriteParam, live }) => {
    if (account_number) {
      await assertAccountOwned(account_number);
    }
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    const LIST = "https://bonfire.robinhood.com/recurring_schedules/";
    const ITEM = "https://bonfire.robinhood.com/recurring_schedules/{0}/";
    if (action === "list") {
      const data = await brokerageGetJson(LIST);
      return jsonResponse(data);
    }
    if (action === "create") {
      if (!account_number || !symbol || !(Number(amount) > 0)) throw new Error("create needs account_number, symbol, and a positive amount.");
      const inst = (await brokerageGetJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: symbol.toUpperCase() })).results?.[0];
      if (!inst) throw new Error(`No instrument for ${symbol}.`);
      const body = { account_number, amount: { amount: Number(amount).toFixed(2), currency_code: "USD" }, frequency: frequency ?? "weekly", investment_asset: { asset_id: inst.id, asset_symbol: inst.symbol, asset_type: "equity" }, source_of_funds: "buying_power", start_date: start_date ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10), ref_id: randomUUID() };
      const r = await gatedBrokerageWrite({ url: LIST, method: "POST", body, dryRun, liveWrite });
      return writeStatus(r, { dryRun: r.dryRun, reason: r.reason });
    }
    if (action === "pause" || action === "resume") {
      const desired = action === "resume" ? "active" : "paused";
      if (all) {
        const schedules = await fetchRecurringSchedules();
        let pool = schedules.filter((s) => (desired === "active" ? s.state !== "active" : s.state === "active"));
        if (account_number) pool = pool.filter((s) => s.account_number === account_number);
        if (pool.length === 0) {
          return jsonResponse({ message: `Nothing to ${action} (no matching schedules).` });
        }
        const results: Array<{ symbol: string; id: string; status: number | string; mode: string; reason?: string }> = [];
        for (const s of pool) {
          const r = await setRecurringState(s.id, desired, { dryRun, liveWrite });
          results.push({ symbol: recurringSymbol(s), id: s.id, status: r.status, mode: r.dryRun ? "dry-run" : "live", reason: r.reason });
        }
        const isDryRun = results.some((r) => r.mode === "dry-run");
        return writeStatus({ results }, { dryRun: isDryRun });
      } else {
        if (!id) throw new Error(`${action} needs a schedule id or all: true.`);
        const r = await setRecurringState(id, desired, { dryRun, liveWrite });
        return writeStatus(r, { dryRun: r.dryRun, reason: r.reason });
      }
    }
    if (!id) throw new Error(`${action} needs a schedule id.`);
    let body: unknown;
    if (action === "edit") {
      const b: Record<string, unknown> = {};
      if (Number(amount) > 0) b.amount = { amount: Number(amount).toFixed(2), currency_code: "USD" };
      if (frequency) b.frequency = frequency;
      if (Object.keys(b).length === 0) throw new Error("edit needs amount and/or frequency.");
      body = b;
    } else { body = { state: "deleted" }; } // end
    const r = await gatedBrokerageWrite({ url: ITEM, method: "PATCH", params: { "0": id }, body, dryRun, liveWrite });
    return writeStatus(r, { dryRun: r.dryRun, reason: r.reason });
  }
);

server.registerTool(
  "robinhood_quote",
  {
    title: "Robinhood Quote",
    description: "Live quote(s) for one or more equity/ETF symbols (last, bid, ask, previous close). Read.",
    inputSchema: z.object({ symbols: z.array(z.string()).min(1) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ symbols }) => {
    const ids: string[] = [];
    for (const s of symbols) {
      const inst = (await brokerageGetJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: s.toUpperCase() })).results?.[0];
      if (inst?.id) ids.push(inst.id);
    }
    if (ids.length === 0) return jsonResponse({ quotes: [], bySymbol: {} });
    const q = (await brokerageGetJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: ids.join(",") })).results ?? [];
    const quotes = q.filter(Boolean).map((r: any) => ({ symbol: r.symbol, last: n(r.last_trade_price), bid: n(r.bid_price), ask: n(r.ask_price), previousClose: n(r.previous_close) }));
    // Also key by symbol so an agent can look up a specific ticker without scanning the array (the
    // array is kept for back-compat + stable ordering). Zayd Khan // cold // www.zayd.wtf
    const bySymbol: Record<string, (typeof quotes)[number]> = {};
    for (const row of quotes) if (row.symbol) bySymbol[row.symbol] = row;
    return jsonResponse({ quotes, bySymbol });
  }
);

server.registerTool(
  "robinhood_history",
  {
    title: "Robinhood Transaction History",
    description: "Unified transaction history (newest first): equity orders + options orders + crypto (nummus) + ACH transfers over a day window — the SAME shared engine as the CLI `history` command. Order history is the source of truth for whether a trade happened (see the order-evidence rule). Pass `days` to widen the window (default 3) and `account_number` to scope equity orders.",
    inputSchema: z.object({ account_number: accountNumberOptionalSchema, days: z.number().int().positive().default(3), limit: z.number().default(20) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number, days, limit }) => {
    const events = await getUnifiedHistory({ accountNumber: account_number, days });
    return jsonResponse({ events: events.slice(0, limit) });
  }
);

server.registerTool(
  "robinhood_watchlist",
  {
    title: "Robinhood Watchlists",
    description: "Your custom watchlists (owner_type=custom is mandatory). Read.",
    inputSchema: z.object({}),
    annotations: toolAnnotations(true, "read")
  },
  async () => jsonResponse(await brokerageGetJson("https://api.robinhood.com/discovery/lists/?owner_type=custom", {}, { owner_type: "custom" }))
);

server.registerTool(
  "robinhood_watchlist_add",
  {
    title: "Robinhood Watchlist — Add",
    description: "Add tickers to a custom watchlist (resolved by name or id). Watchlists are user-level, not account-scoped. Reads resolve the list + each symbol's instrument UUID; the write is dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 (single env switch; liveWrite optional).",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: z.object({
      list: z.string(),
      symbols: z.array(symbolSchema).min(1),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional()
    })
  },
  async ({ list, symbols, dryRun, liveWrite: liveWriteParam, live }) => {
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    const out = await watchlistMutateItems({ list, symbols, operation: "create", dryRun, liveWrite });
    return writeStatus(
      { list: out.list, operation: "add", items: out.items, status: out.result.status, body: out.result.body },
      { dryRun: out.result.dryRun, reason: out.result.reason }
    );
  }
);

server.registerTool(
  "robinhood_watchlist_remove",
  {
    title: "Robinhood Watchlist — Remove",
    description: "Remove tickers from a custom watchlist (resolved by name or id). Dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 (single env switch; liveWrite optional).",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: z.object({
      list: z.string(),
      symbols: z.array(symbolSchema).min(1),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional()
    })
  },
  async ({ list, symbols, dryRun, liveWrite: liveWriteParam, live }) => {
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    const out = await watchlistMutateItems({ list, symbols, operation: "delete", dryRun, liveWrite });
    return writeStatus(
      { list: out.list, operation: "remove", items: out.items, status: out.result.status, body: out.result.body },
      { dryRun: out.result.dryRun, reason: out.result.reason }
    );
  }
);

server.registerTool(
  "robinhood_watchlist_create",
  {
    title: "Robinhood Watchlist — Create",
    description: "Create a new custom watchlist (display_name, optional icon emoji). Dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 (single env switch; liveWrite optional).",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: z.object({
      name: z.string(),
      emoji: z.string().optional(),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional()
    })
  },
  async ({ name, emoji, dryRun, liveWrite: liveWriteParam, live }) => {
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    const out = await createWatchlist({ displayName: name, iconEmoji: emoji, dryRun, liveWrite });
    return writeStatus(
      { displayName: name, status: out.result.status, body: out.result.body },
      { dryRun: out.result.dryRun, reason: out.result.reason }
    );
  }
);

server.registerTool(
  "robinhood_watchlist_items",
  {
    title: "Robinhood Watchlist — Items",
    description: "Read a custom watchlist's tickers (resolved by name or id) live — each item's symbol, price, object_type, and an equity-buyable flag (active + US-tradable instrument). The READ half of operating on a watchlist; pair with robinhood_watchlist_buy. Live read; no gate.",
    inputSchema: z.object({ list: z.string() }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ list }) => {
    const { list: wl, items } = await getWatchlistItems(list);
    return jsonResponse({ list: wl, count: items.length, tradable: items.filter((i) => i.tradable).length, items });
  }
);

server.registerTool(
  "robinhood_watchlist_buy",
  {
    title: "Robinhood Watchlist — Basket Buy",
    description: "Buy $<amount> of EACH equity-buyable ticker in a custom watchlist (BP-aware basket; the EXECUTION half of operating on a watchlist). Loops the SAME shared placeEquityOrder engine per ticker — OTC/fractional guard, pending dedup, ref_id idempotency, the after-hours fractional pre-flight guard, trade-log + order-history evidence — and reads the account's buying power so it only attempts what fits ($amount each), skipping the rest with reasons rather than hammering doomed orders. Dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 (single env switch; liveWrite optional).",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: z.object({
      list: z.string(),
      account_number: accountNumberSchema,
      amount: z.number().positive().default(1),
      limit: z.number().int().positive().optional(),
      delayMs: z.number().int().nonnegative().optional(),
      force: z.boolean().default(false),
      overrideCap: z.boolean().optional().describe("bypass the ROBINHOOD_MAX_ORDER_DOLLARS / ROBINHOOD_MAX_SESSION_DOLLARS notional caps for every leg"),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().optional(),
      live: z.boolean().optional()
    })
  },
  async ({ list, account_number, amount, limit, delayMs, force, overrideCap, dryRun, liveWrite: liveWriteParam, live }) => {
    await assertAccountOwned(account_number);
    const liveWrite = resolveLiveFlag(liveWriteParam, live);
    const out = await buyWatchlistBasket({ list, amount, accountNumber: account_number, limit, delayMs, force, overrideCap: Boolean(overrideCap), dryRun, liveWrite });
    return writeStatus(out, { dryRun: out.dryRun });
  }
);

server.registerTool(
  "robinhood_options_enumerate",
  {
    title: "Robinhood Options Enumerate",
    description: "Bulk-enumerate EVERY option contract (strike + option_instrument_id + desktop link) for a symbol/expiration. Option UUIDs are random v4 — enumeration is the ONLY way to resolve them; this is the canonical UUID resolver before quoting/ordering or inspecting.",
    inputSchema: z.object({ symbol: symbolSchema, expiration: dateOptionalSchema, type: z.enum(["call", "put", "both"]).default("both") }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ symbol, expiration, type }) => {
    const inst = (await brokerageGetJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: symbol.toUpperCase() })).results?.[0];
    if (!inst?.tradable_chain_id) throw new Error(`No options chain for ${symbol}.`);
    const chainId = inst.tradable_chain_id;
    const exps: string[] = (await brokerageGetJson("https://api.robinhood.com/options/chains/{id}/", { id: chainId })).expiration_dates ?? [];
    if (exps.length === 0) throw new Error(`${symbol} chain has no listed expirations.`);
    const exp = expiration && exps.includes(expiration) ? expiration : exps[0];
    const types = type === "both" ? ["call", "put"] : [type];
    const contracts: any[] = [];
    for (const t of types) {
      const rows = await brokerageGetAllResults("https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}", { chain_id: chainId, expiration_dates: exp, type: t });
      for (const r of rows) contracts.push({ type: t, strike: n(r.strike_price), optionInstrumentId: r.id, link: `https://robinhood.com/options/instruments/${r.id}/` });
    }
    contracts.sort((a, b) => (a.type === b.type ? a.strike - b.strike : a.type < b.type ? -1 : 1));
    return jsonResponse({ symbol: symbol.toUpperCase(), chainId, expiration: exp, count: contracts.length, contracts });
  }
);

// ── robinhood_dividends: income engine — history, cadence, projected income in dollars ──
server.registerTool(
  "robinhood_dividends",
  {
    title: "Robinhood Dividends",
    description:
      "Dividend income engine across ALL owned accounts (or one): all-time/YTD/last-12-months totals in DOLLARS, per-symbol cadence detection (weekly/monthly/quarterly/semiannual/annual via median payable-date gap), upcoming payouts, last 12 months by month, and PROJECTED income at every granularity ($/day · $/wk · $/mo · $/qtr · $/yr) from CURRENTLY HELD symbols only (cross-checked against nonzero positions so sold payers don't project). Math is done in-engine — do not hand-compute cadence or annualization. Same shared engine as the CLI `dividends` command. Live read; no gate.",
    inputSchema: z.object({ account_number: accountNumberOptionalSchema, symbol: symbolOptionalSchema }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number, symbol }) => {
    try { return jsonResponse(await computeDividends({ accountNumber: account_number, symbol })); }
    catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_documents: statements, trade confirms, tax forms — list + download URLs only ──
server.registerTool(
  "robinhood_documents",
  {
    title: "Robinhood Documents",
    description:
      "List account documents (account statements, trade confirms, 1099/1099_crypto/1099r_roth/5498_roth tax forms) across all accounts with their download_urls. LIST ONLY — this tool never writes files; hand the download_url to the operator or use the CLI `documents download` for local PDFs. type is PREFIX-matched ('1099' catches every 1099 variant — the tax-season one-shot is type=1099 + year=2025). year is the TAX year for tax forms (a 1099 dated Feb 2026 is tax year 2025) and the calendar year otherwise. Live read; no gate.",
    inputSchema: z.object({ type: z.string().optional(), year: z.string().optional(), account_number: accountNumberOptionalSchema }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ type, year, account_number }) => {
    try { return jsonResponse(await listDocuments({ type, year, accountNumber: account_number })); }
    catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_margin: am I borrowing, how much, at what rate, billed when ──
server.registerTool(
  "robinhood_margin",
  {
    title: "Robinhood Margin Health",
    description:
      "Margin health per account: am I borrowing, how much, at what rate, billed when — amount borrowed, margin interest rate %, next billing date, margin available, buying power with margin, projected intraday BP. Scans every owned account when account_number is omitted; accounts without margin data degrade silently into `skipped`. Same shared engine as the CLI `margin` command. Live read; no gate.",
    inputSchema: z.object({ account_number: accountNumberOptionalSchema }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number }) => {
    try { return jsonResponse(await getMarginHealth(account_number)); }
    catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_review: FILM-STUDY MODE — round trips, realized P&L, operator notes attached ──
server.registerTool(
  "robinhood_review",
  {
    title: "Robinhood Trade Review (Film Study)",
    description:
      "Film-study mode: pull FILLED equity + options orders across owned accounts in the window, FIFO-pair entries→exits per contract/symbol, and return per-round-trip DOLLAR outcomes (entryUsd, exitUsd, realizedPnlUsd, holdDays, win/loss) plus a summary (winners/losers, winRatePct, totalRealizedUsd, best/worst trade, avgHoldDays). Unmatchable legs (still open / opened pre-window / partial) come back flagged openLeg:true, never silently dropped. Operator notes from trade-notes.md attach to matching trades by ref (order id or symbol). Math is done in-engine — do not hand-compute P&L or win rates. Same shared engine as the CLI `review` command. Live read; no gate.",
    inputSchema: z.object({
      days: z.number().int().min(1).max(3650).default(90),
      symbol: symbolOptionalSchema,
      account_number: accountNumberOptionalSchema
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ days, symbol, account_number }) => {
    try { return jsonResponse(await computeTradeReview({ days, symbol, accountNumber: account_number })); }
    catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_review_note: append a film-study note to trade-notes.md (local file only) ──
server.registerTool(
  "robinhood_review_note",
  {
    title: "Robinhood Review Note",
    description:
      "Append a film-study note to repo-root trade-notes.md (format: `### YYYY-MM-DD HH:MM | <ref>` + note + `---`). ref is freeform — an order id, a symbol, or symbol+date — and `review`/robinhood_review attach the note to matching trades by ref. NOTE: this WRITES the local markdown file (committed, operator-facing — same spirit as trading-log.md) but never touches the brokerage account, so no live-write gate applies.",
    inputSchema: z.object({
      ref: z.string(),
      note: z.string()
    }),
    annotations: toolAnnotations(false, "write-safe")
  },
  async ({ ref, note }) => {
    try { return jsonResponse(addTradeNote({ ref, note })); }
    catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_hotlist: operator-maintained ticker watchlist (hotlist.md) + live quotes ──
server.registerTool(
  "robinhood_hotlist",
  {
    title: "Robinhood Hotlist",
    description:
      "Quote the operator's hotlist (repo-root hotlist.md — one `TICKER — optional thesis` per line; agents read it on finance tasks alongside ball-knowledge.md). Returns live last, day $ and % change, and the operator's thesis per ticker. Headers/blank/example-marked lines are ignored. Same shared engine as the CLI `hotlist` command. Live read; no gate.",
    inputSchema: z.object({}),
    annotations: toolAnnotations(true, "read")
  },
  async () => {
    try { return jsonResponse(await computeHotlist()); }
    catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_income: combined income engine (dividends + option premium) ──
server.registerTool(
  "robinhood_income",
  {
    title: "Robinhood Combined Income",
    description:
      "Combined income engine: dividends + option premium net of debits from fill evidence, broken down by month, with TTM total, monthly average, and projected annual run-rate. Math is done in-engine — do not hand-compute. Same shared engine as the CLI `income` command.\n\n⚠️ Edge case: Sell-to-open credits that result in assignment (exercised short options) have no buy-to-close order on record — the premium may represent a cost-basis adjustment on assigned shares rather than standalone income. Cross-check against position history for stock acquired near option expiration dates. This caveat is surfaced in the response's `notes` and `warnings` fields. Live read; no gate.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema,
      year: z.number().int().optional()
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number, year }) => {
    try { return jsonResponse(await computeIncome({ accountNumber: account_number, year })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_performance: portfolio equity curve over time ──
server.registerTool(
  "robinhood_performance",
  {
    title: "Robinhood Portfolio Performance",
    description:
      "Portfolio historical performance — the equity curve over time: account value + return across day/week/month/3month/ytd/year/all spans, from the desktop app's own chart route. Per-account (RH exposes no all-accounts performance route — sum client-side for a portfolio-wide curve); each point carries timestamp, dollar value, and return %. Same shared engine as the CLI `performance` command. Live read; no gate.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema,
      span: z.enum(["day", "week", "month", "3month", "ytd", "year", "all"]).optional(),
      include_all_hours: z.boolean().optional()
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number, span, include_all_hours }) => {
    try { return jsonResponse(await computePerformance({ accountNumber: account_number, span, includeAllHours: include_all_hours })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_risk: portfolio risk scanner ──
server.registerTool(
  "robinhood_risk",
  {
    title: "Robinhood Portfolio Risk Scanner",
    description:
      "Portfolio risk scanner: max loss per position (debit paid for longs; bounded-but-unmodeled for defined-risk spreads; unlimited only for naked short calls), ITM assignment exposure by expiration, undercovered short legs, margin utilization (borrowed/equity %), and concentration warnings (>20% in one symbol). Same shared engine as the CLI `risk` command. Live read; no gate.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number }) => {
    try { return jsonResponse(await computeRisk({ accountNumber: account_number })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_whatif: greeks scenario calculator ──
server.registerTool(
  "robinhood_whatif",
  {
    title: "Robinhood What-If Scenario Calculator",
    description:
      "Greeks scenario calculator: apply spot ±X%, IV ±N%, T - N days, rate ±P% to current portfolio Greeks (from live marketdata/options/) and compute estimated P&L per position and total via Taylor approximation (ΔP ≈ delta·ΔS + ½gamma·ΔS² + theta·Δt + vega·Δσ + rho·Δr). Same shared engine as the CLI `whatif` command. Live read; no gate.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema,
      spot_pct: z.number().default(0),
      iv_pct: z.number().default(0),
      days: z.number().int().default(0),
      rate_change_pct: z.number().default(0)
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number, spot_pct, iv_pct, days, rate_change_pct }) => {
    try { return jsonResponse(await computeWhatIf({ accountNumber: account_number, spotPct: spot_pct, ivPct: iv_pct, days, rateChangePct: rate_change_pct })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_calendar: event calendar ──
server.registerTool(
  "robinhood_calendar",
  {
    title: "Robinhood Event Calendar",
    description:
      "Event calendar: upcoming option expirations (from open positions), ex-dividend dates (for held stocks from dividends/), and earnings dates (from fundamentals/ when available). Sorted by date with assignment-risk flags for ITM short calls near ex-div dates. Same shared engine as the CLI `calendar` command. Live read; no gate.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema,
      days: z.number().int().min(1).max(365).default(30)
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number, days }) => {
    try { return jsonResponse(await computeCalendar({ accountNumber: account_number, days })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── Signal & event reads (Phase 3): news / ratings / earnings / movers / options-events ──
// The midlands + marketdata signal layer the docs reference (SKILL.md signal-sourcing doctrine) but
// which was previously unreachable cleanly (raw brokerage execute can't take ?query= params). All
// live reads, no gate; same shared engines as the CLI news/ratings/earnings/movers/options-events.
server.registerTool(
  "robinhood_news",
  {
    title: "Robinhood Per-Ticker News",
    description: "Latest news for a ticker (source + headline + clickable link + published date). The 'confirmer' layer in the signal-sourcing doctrine — slow but authoritative for discrete/binary events. Same engine as the CLI `news` command. Live read; no gate.",
    inputSchema: z.object({ symbol: symbolSchema, limit: z.number().int().min(1).max(50).default(15) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ symbol, limit }) => {
    try { return jsonResponse(await computeNews({ symbol, limit })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

server.registerTool(
  "robinhood_ratings",
  {
    title: "Robinhood Analyst Ratings",
    description: "Analyst ratings for a ticker: buy/hold/sell counts, a derived consensus, and the rationale texts. Institutional sentiment signal (resolves symbol → instrument → midlands/ratings/). Same engine as the CLI `ratings` command. Live read; no gate.",
    inputSchema: z.object({ symbol: symbolSchema, limit: z.number().int().min(1).max(50).default(12) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ symbol, limit }) => {
    try { return jsonResponse(await computeRatings({ symbol, limit })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

server.registerTool(
  "robinhood_earnings",
  {
    title: "Robinhood Earnings Calendar",
    description: "Earnings history/calendar for a ticker: per-quarter EPS estimate vs actual (surprise), report date + timing (am/pm), and the earnings-call replay link. The binary-event-awareness / assignment-risk tier. Same engine as the CLI `earnings` command. Live read; no gate.",
    inputSchema: z.object({ symbol: symbolSchema, limit: z.number().int().min(1).max(40).default(8) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ symbol, limit }) => {
    try { return jsonResponse(await computeEarnings({ symbol, limit })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

server.registerTool(
  "robinhood_movers",
  {
    title: "Robinhood S&P 500 Movers",
    description: "S&P 500 top movers: symbol + day move% + price, inline. direction up (gainers) or down (losers). Discovery / crowd-momentum surface. Same engine as the CLI `movers` command. Live read; no gate.",
    inputSchema: z.object({ direction: z.enum(["up", "down"]).default("up"), limit: z.number().int().min(1).max(50).default(10) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ direction, limit }) => {
    try { return jsonResponse(await computeMovers({ direction, limit })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

server.registerTool(
  "robinhood_options_events",
  {
    title: "Robinhood Options Events",
    description: "Options corporate events across owned accounts (or one): expirations, assignments, exercises — the feed the web UI uses for per-position options P&L + assignment tracking, with best-effort symbol enrichment. Same engine as the CLI `options-events` command. Live read; no gate.",
    inputSchema: z.object({ account_number: accountNumberOptionalSchema, limit: z.number().int().min(1).max(100).default(25) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number, limit }) => {
    try { return jsonResponse(await computeOptionsEvents({ accountNumber: account_number, limit })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_exposure: concentration & net greeks ──
server.registerTool(
  "robinhood_exposure",
  {
    title: "Robinhood Concentration & Net Greeks",
    description:
      "Concentration & Net Greeks: concentration by underlying (% of portfolio per symbol, flag >20%), plus portfolio-wide net Greeks (delta/gamma/theta/vega/rho) summed across all equity and option positions. Same shared engine as the CLI `exposure` command. Live read; no gate.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number }) => {
    try { return jsonResponse(await computeExposure({ accountNumber: account_number })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_autopilot: automated roll management ──
server.registerTool(
  "robinhood_autopilot",
  {
    title: "Robinhood Autopilot (Roll Management)",
    description:
      "Autopilot: scan all open short options approaching expiration (within N days, default 7), compute potential roll candidates (same underlying, next weekly/monthly expiration, equal or better strike for credit), and emit dry-run order bodies. Read-only — never places orders. Same shared engine as the CLI `autopilot` command.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema,
      days: z.number().int().min(1).max(30).default(7)
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number, days }) => {
    try { return jsonResponse(await computeAutopilot({ accountNumber: account_number, days })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_sentinel: daily risk + event guardian ──
server.registerTool(
  "robinhood_sentinel",
  {
    title: "Robinhood Sentinel — Daily Risk + Event Guardian",
    description:
      "Daily risk + event guardian: composes computeRisk (portfolio risk scan — positions, concentration, margin, Greeks exposure) + computeOptionsEvents (assignment, exercise, expiration history). Zero CDP — safe for scheduled daily scans. Returns a consolidated report with risk scan, upcoming events, and warnings. Live read; no gate.",
    inputSchema: z.object({
      account_number: accountNumberOptionalSchema,
      event_lookahead_days: z.number().int().min(1).max(30).default(7)
    }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ account_number, event_lookahead_days }) => {
    try { return jsonResponse(await computeSentinel({ accountNumber: account_number, eventLookaheadDays: event_lookahead_days })); }
    catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_knowledge: the operator knowledge library, served over MCP ──
// Zayd Khan // cold // www.zayd.wtf
server.registerTool(
  "robinhood_knowledge",
  {
    title: "Robinhood Knowledge Library",
    description:
      "The operator knowledge library (knowledge/ operating modules + playbooks + the docs/ deep-dive index) served over MCP, so an MCP-only agent gets the same knowledge base a repo-local agent reads off disk. action=index (default) lists every module with its id, title, and when-to-load routing hint; action=read with id returns the full module text. ALWAYS check the index at session start when trading topics arise; modules end with APPLY-IT sections mapping knowledge onto live account commands. Same shared engine as the CLI `knowledge` command. Local file read; never calls the brokerage.",
    inputSchema: z.object({
      action: z.enum(["index", "read"]).default("index"),
      id: z.string().optional()
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ action, id }) => {
    try {
      if (action === "read") {
        if (!id) throw new Error("action=read needs an id — run action=index for the list (e.g. wheel, rolling, broker-call).");
        return jsonResponse(readKnowledge(id));
      }
      const entries = listKnowledge();
      return jsonResponse({ count: entries.length, entries });
    } catch (e: any) { return mcpError(e); }
  }
);

// ── robinhood_roll_ledger: pending cash-account (kosher) roll intents — rolls.md ──
// Zayd Khan // cold // www.zayd.wtf
server.registerTool(
  "robinhood_roll_ledger",
  {
    title: "Robinhood Pending-Roll Ledger",
    description:
      "Pending kosher-roll ledger (repo-root rolls.md). A cash-account roll is a TWO-DAY trade — close today, open next business day with settled cash — and sessions die between the legs: CHECK action=list at session start so a staged open leg is never orphaned. action=list (default, read-only) returns every pending intent; action=add stages one (symbol required; closed/open_intent/earliest/account/note optional); action=done removes the matched entry (symbol, or 'SYMBOL YYYY-MM-DD' to disambiguate) and appends the completion to trading-log.md. Same shared engine as the CLI `roll-ledger` command. Local markdown bookkeeping only — never places orders; brokerage order history stays the only proof either leg executed.",
    inputSchema: z.object({
      action: z.enum(["list", "add", "done"]).default("list"),
      symbol: z.string().optional(),
      account: z.string().optional(),
      closed: z.string().optional(),
      open_intent: z.string().optional(),
      earliest: z.string().optional(),
      note: z.string().optional()
    }),
    annotations: toolAnnotations(false, "write-safe")
  },
  async ({ action, symbol, account, closed, open_intent, earliest, note }) => {
    try {
      if (action === "add") {
        if (!symbol?.trim()) throw new Error("action=add needs a symbol.");
        return jsonResponse(addPendingRoll({ symbol, account, closedLeg: closed, openIntent: open_intent, earliestOpenDate: earliest, notes: note }));
      }
      if (action === "done") {
        if (!symbol?.trim()) throw new Error('action=done needs a symbol (or "SYMBOL YYYY-MM-DD" to disambiguate).');
        const r = completePendingRoll(symbol);
        const log = appendRollCompletionLog(r.removed);
        const { block: _b, ...removed } = r.removed;
        return jsonResponse({ file: r.file, removed, remaining: r.remaining, tradingLog: log.file });
      }
      const rolls = listPendingRolls().map(({ block: _b, ...rest }) => rest);
      return jsonResponse({ count: rolls.length, rolls });
    } catch (e: any) { return mcpError(e); }
  }
);

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (finiteNumber, quoteLast, optionMoney are imported from the shared lib)

// ── robinhood_search: instrument/crypto/index search (midlands/search/) ──
const SEARCH_URL = "https://api.robinhood.com/midlands/search/?query={query}";

server.registerTool(
  "robinhood_search",
  {
    title: "Robinhood Instrument Search",
    description:
      "Search Robinhood's instrument universe by name/ticker (the web search bar). Grounds ticker resolution: resolves company names, partial names, and tickers to their canonical symbols, instrument UUIDs, tradability, fractional eligibility, and OTC flags. Returns up to 20 results. Live read; no gate.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(20).default(12)
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ query, limit }) => {
    try {
      const data = await brokerageGetJson(SEARCH_URL, { query });
      const insts: any[] = Array.isArray(data.instruments) ? data.instruments : [];
      const rows = insts.slice(0, limit).map((i: any) => ({
        symbol: i.symbol,
        name: i.simple_name || i.name,
        tradable: i.tradability,
        fractional: i.fractional_tradability,
        otc: i.otc_market_tier ? "OTC" : "",
        id: i.id
      }));
      return jsonResponse({ query, count: rows.length, results: rows });
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_options_expirations: standalone expiration date lister ──
const OPTIONS_CHAIN_URL = "https://api.robinhood.com/options/chains/{id}/";

server.registerTool(
  "robinhood_options_expirations",
  {
    title: "Robinhood Options Expirations",
    description:
      "List every available option expiration date for a symbol (live read). Returns the chain UUID and ordered expiration dates. Same shared engine as the CLI `options expirations` command.",
    inputSchema: z.object({
      symbol: z.string()
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ symbol }) => {
    try {
      const sym = symbol.toUpperCase();
      const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol: sym })).results?.[0];
      if (!instrument) throw new Error(`No equity instrument found for ${sym}.`);
      const chainId = instrument.tradable_chain_id;
      if (!chainId) throw new Error(`${sym} has no tradable options chain.`);
      const expirations: string[] = (await brokerageGetJson(OPTIONS_CHAIN_URL, { id: chainId })).expiration_dates ?? [];
      return jsonResponse({ symbol: sym, chainId, count: expirations.length, expirations });
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_options_chain: wraps selectNearStrikes + classifyMoneyness from lib.ts ──
const OPTIONS_INSTRUMENTS_URL =
  "https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}";

// fetchOptionMarks is imported from lib.ts (shared, chunked ≤40/req marketdata fetcher) — the local
// copy was re-introduced by a rebase; this removes the EH-01 duplicate again.

server.registerTool(
  "robinhood_options_chain",
  {
    title: "Robinhood Options Chain",
    description:
      "Print the option chain around the money for a symbol (live read). Fetches the underlying spot, the nearest expiration, and all strikes for the selected type, then narrows to a centered window using selectNearStrikes() and classifies each strike as ITM/ATM/OTM via classifyMoneyness(). Returns the chain with live bid/ask/mark, delta, IV%, volume, OI, and moneyness per strike. Same shared engine as the CLI `options chain` command.",
    inputSchema: z.object({
      symbol: symbolSchema,
      expiration: dateOptionalSchema,
      type: z.enum(["call", "put"]).default("call"),
      width: z.number().int().min(0).max(50).default(8)
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ symbol, expiration, type, width }) => {
    try {
      const sym = symbol.toUpperCase();
      const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol: sym })).results?.[0];
      if (!instrument) throw new Error(`No equity instrument found for ${sym}.`);
      const chainId = instrument.tradable_chain_id;
      if (!chainId) throw new Error(`${sym} has no tradable options chain.`);
      const quote = (await brokerageGetJson(MARKETDATA_QUOTES_URL, { ids: instrument.id })).results?.[0] ?? {};
      const spot = finiteNumber(quote.last_trade_price ?? quote.adjusted_previous_close);
      const expirations: string[] = (await brokerageGetJson(OPTIONS_CHAIN_URL, { id: chainId })).expiration_dates ?? [];
      if (expirations.length === 0) throw new Error(`${sym} chain has no listed expirations.`);
      const exp = expiration && expirations.includes(expiration) ? expiration : expirations[0];
      const instruments: any[] = await brokerageGetAllResults(OPTIONS_INSTRUMENTS_URL, { chain_id: chainId, expiration_dates: exp, type });
      const ladder = instruments
        .map((row: any) => ({ strike: finiteNumber(row.strike_price), id: row.id }))
        .filter((row: any) => Number.isFinite(row.strike) && row.id);
      const near = selectNearStrikes(ladder, spot, width);
      const marks = await fetchOptionMarks(near.map((row: any) => row.id));
      const rows = near.map((row: any) => {
        const mark = marks.get(row.id) ?? {};
        return {
          optionInstrumentId: row.id,
          optionInstrumentUrl: `https://api.robinhood.com/options/instruments/${row.id}/`,
          strike: row.strike,
          bid: finiteNumber(mark.bid_price),
          ask: finiteNumber(mark.ask_price),
          mark: finiteNumber(mark.adjusted_mark_price),
          delta: finiteNumber(mark.delta),
          ivPct: finiteNumber(mark.implied_volatility) * 100,
          volume: finiteNumber(mark.volume),
          openInterest: finiteNumber(mark.open_interest),
          moneyness: classifyMoneyness(row.strike, spot, type)
        };
      });
      return jsonResponse({ symbol: sym, spot, expiration: exp, type, count: rows.length, strikes: rows, otherExpirations: expirations.length > 1 ? expirations.slice(0, 12) : undefined });
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_options_strategy_quote: wraps buildOptionsStrategyPricingSummary from lib.ts ──
server.registerTool(
  "robinhood_options_strategy_quote",
  {
    title: "Robinhood Options Strategy Quote",
    description:
      "Multi-leg live pricing for an options strategy (verticals, condors, straddles, etc.). Takes leg inputs (id, action: buy|sell, strike, bid/ask/mark/last, greeks, ratioQuantity) and returns per-leg natural/mid pricing, net credit/debit, direction, and limit-price recommendations by mode (natural/mid/safe-sell-probe/safe-buy-probe). Wraps the shared buildOptionsStrategyPricingSummary() engine — same as the CLI `options strategy-quote` command. Live reads happen BEFORE calling this tool (fetch quotes/greeks separately); this tool does pure math. Read-only; no gate.",
    inputSchema: z.object({
      legs: z.array(z.object({
        id: z.string(),
        action: z.enum(["buy", "sell"]),
        strike: z.number().optional(),
        bid: z.number().optional(),
        ask: z.number().optional(),
        mark: z.number().optional(),
        last: z.number().optional(),
        delta: z.number().optional(),
        gamma: z.number().optional(),
        theta: z.number().optional(),
        vega: z.number().optional(),
        rho: z.number().optional(),
        ratioQuantity: z.number().int().positive().default(1)
      })).min(1),
      mode: z.enum(["natural", "mid", "safe-sell-probe", "safe-buy-probe"]).default("mid"),
      preferredDirection: z.enum(["credit", "debit"]).optional(),
      farLimitOffset: z.number().default(200)
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ legs, mode, preferredDirection, farLimitOffset }) => {
    try {
      const summary = buildOptionsStrategyPricingSummary({
        legs: legs.map((leg) => ({
          id: leg.id,
          action: leg.action,
          strike: leg.strike,
          bid: leg.bid,
          ask: leg.ask,
          mark: leg.mark,
          last: leg.last,
          delta: leg.delta,
          gamma: leg.gamma,
          theta: leg.theta,
          vega: leg.vega,
          rho: leg.rho,
          ratioQuantity: leg.ratioQuantity
        })),
        mode,
        preferredDirection,
        farLimitOffset
      });
      return jsonResponse(summary);
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_options_roll_plan: dry-run roll plan for a single option leg ──
server.registerTool(
  "robinhood_options_roll_plan",
  {
    title: "Robinhood Options Roll Plan",
    description:
      "Build a dry-run option roll plan. DEFAULT (mode=auto) emits the ATOMIC native roll — the SINGLE 2-leg `strategy_roll` order the real Robinhood 'Roll this position' button POSTs (verified) — for margin/IRA accounts. For CASH accounts it falls back to the KOSHER two-order staging (close today, open next business day with a notBeforeDate + ledger tip; T+1 good-faith). mode=atomic|kosher forces the model; cash_account=true forces kosher. Resolves both legs, fetches live bid/ask, computes limit prices per pricing mode, returns the order body/bodies + net credit/debit. NEVER sends orders. Same shared builder as the CLI `options roll-plan`.",
    inputSchema: z.object({
      account_number: z.string(),
      symbol: z.string(),
      type: z.enum(["call", "put"]),
      close_expiration: z.string(),
      close_strike: z.number(),
      open_expiration: z.string(),
      open_strike: z.number(),
      close_side: z.enum(["buy", "sell"]).default("sell"),
      open_side: z.enum(["buy", "sell"]).default("buy"),
      close_pricing_mode: z.enum(["natural", "mid", "safe-sell-probe", "safe-buy-probe"]).default("safe-sell-probe"),
      open_pricing_mode: z.enum(["natural", "mid", "safe-sell-probe", "safe-buy-probe"]).default("mid"),
      quantity: z.number().int().positive().default(1),
      time_in_force: z.enum(["gfd", "gtc"]).default("gfd"),
      cash_account: z.boolean().default(false),
      mode: z.enum(["auto", "atomic", "kosher"]).default("auto")
    }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number, symbol, type, close_expiration, close_strike, open_expiration, open_strike, close_side, open_side, close_pricing_mode, open_pricing_mode, quantity, time_in_force, cash_account, mode }) => {
    try {
      const sym = symbol.toUpperCase();
      const fn = finiteNumber;

      // Resolve the underlying instrument and chain
      const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol: sym })).results?.[0];
      if (!instrument) throw new Error(`No equity instrument for ${sym}.`);
      const chainId = instrument.tradable_chain_id;
      if (!chainId) throw new Error(`${sym} has no tradable options chain.`);

      // Resolve close-leg option instrument
      const closeInstruments = await brokerageGetAllResults(OPTIONS_INSTRUMENTS_URL, {
        chain_id: chainId, expiration_dates: close_expiration, type
      });
      const closeOpt = closeInstruments.find((i: any) => fn(i.strike_price) === close_strike);
      if (!closeOpt) throw new Error(`No close-leg option found: ${sym} ${close_expiration} ${close_strike} ${type}.`);

      // Resolve open-leg option instrument
      const openInstruments = await brokerageGetAllResults(OPTIONS_INSTRUMENTS_URL, {
        chain_id: chainId, expiration_dates: open_expiration, type
      });
      const openOpt = openInstruments.find((i: any) => fn(i.strike_price) === open_strike);
      if (!openOpt) throw new Error(`No open-leg option found: ${sym} ${open_expiration} ${open_strike} ${type}.`);

      // Fetch live marks for both
      const marks = await fetchOptionMarks([closeOpt.id, openOpt.id]);
      const closeMark = marks.get(closeOpt.id) ?? {};
      const openMark = marks.get(openOpt.id) ?? {};

      // Compute limit prices
      const closeBid = fn(closeMark.bid_price);
      const closeAsk = fn(closeMark.ask_price);
      const openBid = fn(openMark.bid_price);
      const openAsk = fn(openMark.ask_price);

      function legLimit(bid: number, ask: number, side: "buy" | "sell", mode: string): number {
        if (mode === "natural") return side === "sell" ? bid : ask;
        const mid = (Number.isFinite(bid) && Number.isFinite(ask)) ? (bid + ask) / 2 : (side === "sell" ? bid : ask);
        if (mode === "safe-sell-probe") return side === "sell" ? bid + 200 : Math.max(0.01, ask - 200);
        if (mode === "safe-buy-probe") return side === "buy" ? Math.max(0.01, ask - 200) : bid + 200;
        return mid;
      }

      const closeLimit = optionMoney(legLimit(closeBid, closeAsk, close_side, close_pricing_mode));
      const openLimit = optionMoney(legLimit(openBid, openAsk, open_side, open_pricing_mode));

      if (!Number.isFinite(closeLimit)) throw new Error(`Could not compute close-leg limit from ${close_pricing_mode}.`);
      if (!Number.isFinite(openLimit)) throw new Error(`Could not compute open-leg limit from ${open_pricing_mode}.`);

      // Build the staged single-leg dry-run order bodies (used by the kosher path; informational in atomic).
      const closeOrder = {
        account_number,
        legs: [{ option_id: closeOpt.id, side: close_side, position_effect: "close", ratio_quantity: quantity }],
        type: "limit",
        quantity: String(quantity),
        price: closeLimit.toFixed(2),
        time_in_force,
        ref_id: crypto.randomUUID(),
        _dryRun: true
      };

      const openOrderBody = {
        account_number,
        legs: [{ option_id: openOpt.id, side: open_side, position_effect: "open", ratio_quantity: quantity }],
        type: "limit",
        quantity: String(quantity),
        price: openLimit.toFixed(2),
        time_in_force,
        ref_id: crypto.randomUUID(),
        _dryRun: true
      };

      const closeCredit = close_side === "sell" ? closeLimit : -closeLimit;
      const openCredit = open_side === "sell" ? openLimit : -openLimit;
      const net = optionMoney(closeCredit + openCredit);

      // ── Account-type-aware roll dispatch (parity with the CLI) ─────────────────────────────────
      // DEFAULT atomic native roll for margin/IRA; kosher two-order staging ONLY for cash.
      let accountClass: "cash" | "margin" | "ira" | "unverified" = "unverified";
      let brokerageAccountType = "";
      let capsNote = "";
      let detectionNote = "";
      if (mode === "auto" && !cash_account) {
        try {
          const det = await detectAccountClass(account_number);
          accountClass = det.accountClass;
          brokerageAccountType = det.brokerageAccountType;
          capsNote = det.caps.note;
        } catch (e: any) {
          detectionNote = `account-type detection failed (${String(e?.message ?? e).slice(0, 60)}); defaulting to atomic — pass mode='kosher' if this is a CASH account.`;
        }
      }
      const resolvedMode = resolveRollModel(mode, accountClass, cash_account === true);

      const closeUrl = `https://api.robinhood.com/options/instruments/${closeOpt.id}/`;
      const openUrl = `https://api.robinhood.com/options/instruments/${openOpt.id}/`;
      const rollOrder =
        resolvedMode === "atomic"
          ? buildAtomicRollOrderBody({
              account: account_number,
              closeOptionUrl: closeUrl,
              openOptionUrl: openUrl,
              closeSide: close_side,
              openSide: open_side,
              closeLimit,
              openLimit,
              quantity: String(quantity),
              timeInForce: time_in_force,
              refId: randomUUID(),
              checkOverrides: [],
              accountType: brokerageAccountType || undefined,
              closeQuote: { bid: closeBid, ask: closeAsk, openInterest: finiteNumber(closeMark.open_interest) },
              openQuote: { bid: openBid, ask: openAsk, openInterest: finiteNumber(openMark.open_interest) }
            })
          : undefined;

      return jsonResponse({
        mode: "dry_run",
        sent: false,
        rollModel: {
          resolvedMode,
          requestedMode: mode,
          accountClass,
          brokerageAccountType: brokerageAccountType || undefined,
          accountCapability: capsNote || undefined,
          detectionNote: detectionNote || undefined,
          rule: "Atomic native roll (one strategy_roll 2-leg order) is the default for margin/IRA; the two-order kosher staging is used ONLY for cash accounts (T+1 good-faith). See docs/native-option-roll-surface-2026-06-23.md."
        },
        strategy: {
          id: resolvedMode === "kosher" ? "kosher-roll" : "atomic-native-roll",
          title: resolvedMode === "kosher" ? "Cash-account delayed option roll (two orders, T+1)" : "Atomic native roll (one strategy_roll order)",
          optionType: type,
          direction: net >= 0 ? "credit" : "debit"
        },
        accountContext: { accountNumber: account_number, symbol: sym, closeExpiration: close_expiration, openExpiration: open_expiration },
        closeLeg: { side: close_side, positionEffect: "close", strike: close_strike, expiration: close_expiration, pricingMode: close_pricing_mode, limitPrice: closeLimit },
        openLeg: { side: open_side, positionEffect: "open", strike: open_strike, expiration: open_expiration, pricingMode: open_pricing_mode, limitPrice: openLimit },
        net: { estimatedLimitNet: net, direction: net >= 0 ? "credit" : "debit", note: "Computed from selected dry-run limit controls, not a fill guarantee." },
        rollOrder, // present only in atomic mode — the ONE body to send to options/orders/
        orders: { closeOrder, openOrder: openOrderBody },
        warnings: [
          "Dry-run only; no orders were sent.",
          resolvedMode === "atomic"
            ? "ATOMIC roll: send the single `rollOrder` body to options/orders/ (one order, two legs). closeOrder/openOrder are informational only — do NOT send them separately for an atomic roll."
            : "KOSHER roll (cash account): open-leg notional depends on settled cash after the close leg fills (T+1); stage the open leg next business day.",
          ...(resolvedMode === "atomic" && close_pricing_mode === "safe-sell-probe"
            ? ["rollOrder.price is the NET of both legs; the default close `safe-sell-probe` makes it an un-fillable probe. For a realistic sendable net, pass close_pricing_mode='mid' and open_pricing_mode='mid'."]
            : []),
          "Requote before any live order."
        ]
      });
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// Zayd Khan // cold // www.zayd.wtf

// ── MCP Resources: the operator knowledge library ────────────────────────────────────────────────
// The same modules behind robinhood_knowledge, exposed as MCP Resources so resource-aware clients
// (e.g. Claude Desktop) can browse/attach them natively instead of only via a tool call. A single
// resource TEMPLATE (robinhood://knowledge/{id}) with a list callback enumerates every module, so new
// knowledge/*.md files appear automatically. Zayd Khan // cold // www.zayd.wtf
server.registerResource(
  "knowledge",
  new ResourceTemplate("robinhood://knowledge/{id}", {
    list: async () => ({
      resources: listKnowledge().map((e) => ({
        uri: `robinhood://knowledge/${e.id}`,
        name: e.id,
        title: e.title,
        description: e.whenToLoad ?? e.title,
        mimeType: "text/markdown"
      }))
    })
  }),
  {
    title: "Robinhood operator knowledge library",
    description:
      "Per-topic operating modules + playbooks (wheel, rolling, multi-leg, greeks, tax, accounts, signals, execution-safety, broker-call). Same content as the robinhood_knowledge tool, browseable as MCP resources.",
    mimeType: "text/markdown"
  },
  async (uri, variables) => {
    const raw = variables.id;
    const id = String(Array.isArray(raw) ? raw[0] : raw);
    const k = readKnowledge(id); // throws with a close-match hint if the id is unknown
    return { contents: [{ uri: uri.href, text: k.content, mimeType: "text/markdown" }] };
  }
);

const doctorOutputSchema = z.object({
  ok: z.boolean(),
  summary: z.object({ pass: z.number(), warn: z.number(), fail: z.number() }),
  checks: z.array(z.object({ id: z.string(), status: z.enum(["pass", "warn", "fail"]), message: z.string() }))
});
const lifecycleOutputSchema = z.object({
  id: z.string(), state: z.enum(["planned", "sent", "confirmed", "filled", "rejected", "cancelled", "unknown"]),
  transitions: z.array(z.object({ state: z.string(), at: z.string() }).catchall(z.unknown())), outcomeKnown: z.boolean(), retrySafe: z.literal(false)
});

registerCapabilityTool("doctor", {
  title: "Robinhood Doctor",
  description: "Offline health check for source/dist parity, credential-file hygiene, route provenance, write-gate state, knowledge files, share-safe state, and MCP profile. Never calls Robinhood.",
  inputSchema: z.object({}), outputSchema: doctorOutputSchema, annotations: toolAnnotations(true, "read")
}, async () => jsonResponse(runDoctor(process.cwd())));

registerCapabilityTool("order-lifecycle", {
  title: "Robinhood Durable Order Watch",
  description: "Poll order history to a terminal state. Performs a final reconciliation read before unknown and never retries an order whose outcome is unknown.",
  inputSchema: z.object({ id: z.string(), interval_ms: z.number().int().min(0).default(2000), timeout_ms: z.number().int().positive().default(120000) }),
  outputSchema: lifecycleOutputSchema, annotations: toolAnnotations(true, "read")
}, async ({ id, interval_ms, timeout_ms }: any) => jsonResponse(await watchOrderLifecycle({ id, poll: getOrderStatus, intervalMs: interval_ms, timeoutMs: timeout_ms })));

registerCapabilityTool("options-workbench", {
  title: "Robinhood Options Workbench",
  description: "Analyze one exact options package: premium, expiry payoff samples, signed Greeks, collateral/review, roll comparisons, and a body-bound approval card. Pure analysis; never sends.",
  inputSchema: z.object({
    symbol: z.string(), expiration: z.string(), underlying_price: z.number(), quantity: z.number().int().positive().default(1), pricing_mode: z.enum(["natural", "mid"]).default("mid"),
    legs: z.array(z.object({ id: z.string(), action: z.enum(["buy", "sell"]), type: z.enum(["call", "put"]), strike: z.number(), premium: z.number().optional(), bid: z.number().optional(), ask: z.number().optional(), mark: z.number().optional(), ratioQuantity: z.number().int().positive().optional(), delta: z.number().optional(), gamma: z.number().optional(), theta: z.number().optional(), vega: z.number().optional() })).min(1),
    order_body: z.unknown().optional(), collateral: z.unknown().optional(), review: z.unknown().optional(), roll_alternatives: z.array(z.unknown()).optional()
  }),
  outputSchema: z.object({ contract: z.object({}).catchall(z.unknown()), package: z.object({ netPremium: z.number() }), payoff: z.object({}).catchall(z.unknown()), netGreeks: z.object({ delta: z.number(), gamma: z.number(), theta: z.number(), vega: z.number() }), approvalCard: z.object({}).catchall(z.unknown()), rollAlternatives: z.array(z.unknown()) }),
  annotations: toolAnnotations(true, "read")
}, async (args: any) => jsonResponse(buildOptionsWorkbench({ symbol: args.symbol, expiration: args.expiration, underlyingPrice: args.underlying_price, quantity: args.quantity, pricingMode: args.pricing_mode, legs: args.legs, orderBody: args.order_body, collateral: args.collateral, review: args.review, rollAlternatives: args.roll_alternatives })));

registerCapabilityTool("portfolio-snapshot", {
  title: "Robinhood Portfolio Time Machine",
  description: "Capture, list, or diff private timestamped portfolio snapshots. Capture performs live reads; list/diff are local-only.",
  inputSchema: z.object({ action: z.enum(["capture", "list", "diff"]).default("capture"), account_number: z.string().optional(), path: z.string().default(resolve(process.cwd(), "local/portfolio-snapshots.jsonl")) }),
  outputSchema: z.object({}).catchall(z.unknown()), annotations: toolAnnotations(true, "read")
}, async ({ action, account_number, path }: any) => {
  const snapshots = readPortfolioSnapshots(path);
  if (action === "list") return jsonResponse({ path, count: snapshots.length, snapshots: snapshots.map(({ id, capturedAt }) => ({ id, capturedAt })) });
  if (action === "diff") {
    if (snapshots.length < 2) return mcpError(new Error("Need at least two snapshots to diff"));
    return jsonResponse(diffPortfolioSnapshots(snapshots.at(-2)!, snapshots.at(-1)!));
  }
  const snapshot = { version: 1 as const, id: randomUUID(), capturedAt: new Date().toISOString(), source: "portfolio" as const, data: await computePortfolioPnl({ accountNumber: account_number, top: 0 }) };
  appendPortfolioSnapshot(path, snapshot);
  return jsonResponse({ path, snapshot });
});

registerCapabilityTool("share-safe", {
  title: "Robinhood Share-safe Preview",
  description: "Redact sensitive fields from an object without changing server state. Set ROBINHOOD_SHARE_SAFE=1 to apply the same policy to every tool response.",
  inputSchema: z.object({ value: z.unknown() }), outputSchema: z.object({ result: z.unknown() }), annotations: toolAnnotations(true, "read")
}, async ({ value }: any) => jsonResponse({ result: maybeShareSafe(value, { ...process.env, ROBINHOOD_SHARE_SAFE: "1" }) }));

// ── MCP Prompts: reusable operating templates ────────────────────────────────────────────────────
// Surfaced so a client can offer them as slash-commands / starters. Each just orchestrates EXISTING
// tools — no new capability, no write side effects. Zayd Khan // cold // www.zayd.wtf
server.registerPrompt(
  "daily-brief",
  {
    title: "Daily brief — risk + P&L + pending rolls",
    description: "Morning guardian sweep: sentinel (risk + option events) → portfolio P&L in dollars → pending cash-account rolls due today."
  },
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Give me my daily brief. 1) Run robinhood_sentinel across all accounts and surface assignment exposure + time-sensitive option events. 2) Run robinhood_portfolio (use --after-hours framing if the regular session is closed) and report the day move in DOLLARS by underlying. 3) Run robinhood_roll_ledger (action=list) and flag any cash-account roll whose open leg is due today. Lead with what needs attention, in dollars; do not place any orders."
        }
      }
    ]
  })
);
server.registerPrompt(
  "pretrade-checklist",
  {
    title: "Pre-trade safety checklist",
    description: "Run the PASS/WARN/BLOCK pre-flight and the classify-before-write checklist for one order; never sends.",
    argsSchema: {
      symbol: z.string().describe("ticker, e.g. AAPL"),
      account_number: z.string().describe("the account to act on"),
      side: z.string().describe("buy or sell (equity), or the exact options strategy")
    }
  },
  ({ symbol, account_number, side }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Before I place a ${side} on ${symbol} in account ${account_number}: 1) classify the EXACT strategy (sell-to-close ≠ covered call ≠ credit spread ≠ naked short) — never infer naked exposure from loose wording. 2) Run robinhood_pretrade and report each PASS/WARN/BLOCK (buying power, collateral, marketability, min-tick, account capability). 3) Echo back the resolved account + symbol + side + quantity + limit price. 4) STOP and wait for my explicit yes before any live send. Reads/dry-runs only until I confirm.`
        }
      }
    ]
  })
);
server.registerPrompt(
  "wheel-review",
  {
    title: "Wheel stage review",
    description: "Classify the wheel stage from live positions and propose the next leg as a dry-run; flags undercovered short calls.",
    argsSchema: { symbol: z.string().describe("the wheel underlying, e.g. F") }
  },
  ({ symbol }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Review my wheel on ${symbol}: run robinhood_wheel, classify the stage (CSP → assignment → covered call → roll) from live positions, flag any undercovered short calls, and propose the next leg as a DRY-RUN order. Explain the thread (what we'd be rolling from). Do not send anything.`
        }
      }
    ]
  })
);

export async function startStdioServer(): Promise<void> {
  // Live-write discoverability (the silent-dry-run trap): writes need the master switch in THIS
  // server's environment. Keep this inside the executable entry point so protocol tests can import
  // the configured server without taking over stdio.
  if (process.env.ROBINHOOD_ALLOW_LIVE_WRITE !== "1") {
    process.stderr.write(
      "⚠️  robinhood-cli MCP: LIVE WRITES DISABLED — ROBINHOOD_ALLOW_LIVE_WRITE is not \"1\" in this server's " +
      "environment, so EVERY write tool will dry-run regardless of liveWrite:true (the env switch is the single gate). " +
      "Reads work normally. To enable real orders, re-register with the env gate and reload, e.g.:\n" +
      "    claude mcp add robinhood-cli -s user -e ROBINHOOD_ALLOW_LIVE_WRITE=1 -- node <repo>/mcp/dist/server.js\n" +
      "  then /reload-mcp (or restart the client).\n"
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) await startStdioServer();

// Zayd Khan // cold // www.zayd.wtf
