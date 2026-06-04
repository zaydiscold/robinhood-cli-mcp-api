#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  buildAccountContextUrl,
  buildOptionsContractLinkBundle,
  buildOptionsContractNavigationPlan,
  buildOptionsStrategyOrderPlan,
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
  resolveLiveWriteGate,
  signCryptoRequest,
  summarizeApiMap
} from "@zaydiscold/robinhood-cli/lib";

type RiskLevel = "read" | "sensitive-read" | "write-safe" | "write-mutate" | "write-or-sensitive" | "destructive";

const server = new McpServer({
  name: "robinhood-cli-mcp",
  version: "0.1.0"
});

function jsonResponse(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }]
  };
}

function toolAnnotations(readOnly: boolean, risk: RiskLevel) {
  return {
    readOnlyHint: readOnly,
    destructiveHint: risk === "destructive",
    idempotentHint: readOnly || risk === "write-safe",
    openWorldHint: true,
    "mcp:read-only": readOnly,
    "mcp:risk": risk
  } as any;
}

function selectRouteByQueryAndMethod<T extends { url: string; methods?: string[] }>(
  matches: T[],
  query: string,
  method?: string
): T | undefined {
  const candidates = matches.filter((candidate) => candidate.url === query);
  const pool = candidates.length > 0 ? candidates : matches;
  if (method) {
    const requested = method.toUpperCase();
    const exact = pool.find((candidate) => candidate.methods?.map((item) => item.toUpperCase()).includes(requested));
    if (exact) return exact;
    // FAIL CLOSED on write verbs: a forced POST/PATCH/PUT/DELETE with no matching write route must
    // NOT silently degrade to a GET (read) route at the wrong risk class. Mirrors the CLI resolver.
    const isWrite = requested !== "GET" && requested !== "HEAD";
    if (isWrite && pool.some((candidate) => candidate.methods?.length)) return undefined;
    return pool[0];
  }
  return pool[0];
}

const INSTRUMENTS_SYMBOL_URL = "https://api.robinhood.com/instruments/?symbol={symbol}";
const MARKETDATA_QUOTES_URL = "https://api.robinhood.com/marketdata/quotes/?ids={ids}";
const MARKETDATA_FUNDAMENTALS_URL = "https://api.robinhood.com/marketdata/fundamentals/{id}/";
const INSTRUMENT_SHORTING_URL = "https://api.robinhood.com/instruments/{id}/shorting/";
const INSTRUMENT_BUYING_POWER_URL = "https://bonfire.robinhood.com/accounts/{id}/instrument_buying_power/{uuid}/";
const INSTRUMENT_MARGIN_REQUIREMENTS_URL = "https://bonfire.robinhood.com/instruments/{uuid}/margin-requirements/";

async function brokerageGetJson(
  url: string,
  params: Record<string, string> = {},
  query: Record<string, string> = {}
): Promise<any> {
  const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: url });
  const route = selectRouteByQueryAndMethod(matches, url, "GET");
  if (!route) throw new Error(`Route missing from map: ${url}`);
  const plan = planBrokerageRequest({ route, method: "GET", params, dryRun: false });
  if (plan.missingParams.length > 0) {
    throw new Error(`Missing params for ${url}: ${plan.missingParams.join(", ")}`);
  }
  if (Object.keys(query).length > 0) {
    const parsed = new URL(plan.url);
    for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value);
    plan.url = parsed.toString();
  }
  const result = await executeBrokerageRequest(plan, { dryRun: false, fullBody: true });
  if (result.status !== 200) throw new Error(`${result.status} ${result.statusText} for ${plan.url}`);
  return JSON.parse(result.body || "{}");
}

async function tryBrokerageGetJson(
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

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function percentChange(previous: number, current: number): number {
  if (!Number.isFinite(previous) || previous === 0 || !Number.isFinite(current)) return Number.NaN;
  return ((current - previous) / previous) * 100;
}

function quoteLast(quote: any): number {
  return finiteNumber(quote?.last_trade_price ?? quote?.last_extended_hours_trade_price);
}

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
      accountNumber: z.string(),
      symbol: z.string(),
      expiration: z.string(),
      optionType: z.enum(["call", "put"]),
      side: z.enum(["buy", "sell"]),
      strike: z.string(),
      positionEffect: z.enum(["open", "close"]).default("open"),
      chainId: z.string().optional(),
      equityInstrumentId: z.string().optional(),
      optionInstrumentId: z.string().optional(),
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
      accountNumber: z.string(),
      symbol: z.string(),
      expiration: z.string(),
      optionType: z.enum(["call", "put"]),
      side: z.enum(["buy", "sell"]),
      strike: z.string(),
      positionEffect: z.enum(["open", "close"]).default("open"),
      chainId: z.string().optional(),
      equityInstrumentId: z.string().optional(),
      underlyingInstrumentId: z.string().optional(),
      optionInstrumentId: z.string().optional(),
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
      symbol: z.string(),
      accountNumber: z.string().optional()
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
    description: "Execute a Robinhood brokerage/account request using caller-owned auth env. Reads run live; writes are dry-run by default and require liveWrite=true plus ROBINHOOD_ALLOW_LIVE_WRITE=1. Pass dryRun=true to force a non-sending plan.",
    annotations: toolAnnotations(false, "write-or-sensitive"),
    inputSchema: z.object({
      query: z.string(),
      method: z.string().optional(),
      params: z.array(z.string()).default([]),
      body: z.unknown().optional(),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().default(false),
      fullBody: z.boolean().default(false)
    })
  },
  async ({ query, method, params, body, dryRun, liveWrite, fullBody }) => {
    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query });
    const route = selectRouteByQueryAndMethod(matches, query, method);
    if (!route) {
      throw new Error(`No brokerage route matched: ${query}`);
    }
    const gate = resolveLiveWriteGate({ risk: route.risk, dryRun, liveWrite });
    const effectiveDryRun = dryRun || gate.forcedDryRun;
    const plan = planBrokerageRequest({
      route,
      method,
      params: parseParamAssignments(params),
      body,
      dryRun: effectiveDryRun
    });
    const result = await executeBrokerageRequest(plan, { body, dryRun: effectiveDryRun, fullBody });
    return jsonResponse(gate.forcedDryRun ? { ...result, liveWriteBlocked: gate.reason } : result);
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
    description: "Execute an official Robinhood Crypto API request using caller-owned API key env. Reads run live; writes (orders/cancels) are dry-run by default and require liveWrite=true plus ROBINHOOD_ALLOW_LIVE_WRITE=1. Pass dryRun=true to force a non-sending plan.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: z.object({
      query: z.string(),
      method: z.string().optional(),
      params: z.array(z.string()).default([]),
      queryParams: z.array(z.string()).default([]),
      body: z.string().optional(),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().default(false),
      fullBody: z.boolean().default(false)
    })
  },
  async ({ query, method, params, queryParams, body, dryRun, liveWrite, fullBody }) => {
    const matches = filterRobinhoodRoutes(loadRobinhoodRoutes(), { host: "trading.robinhood.com", query });
    const route = selectRouteByQueryAndMethod(matches, query, method);
    if (!route) {
      throw new Error(`No official Crypto route matched: ${query}`);
    }
    const gate = resolveLiveWriteGate({ risk: route.risk, dryRun, liveWrite });
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
    return jsonResponse(gate.forcedDryRun ? { ...result, liveWriteBlocked: gate.reason } : result);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
