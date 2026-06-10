#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
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
  selectRouteByQueryAndMethod,
  brokerageGetJson,
  brokerageGetAllResults,
  computePortfolioPnl,
  tryBrokerageGetJson,
  gatedBrokerageWrite,
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

// selectRouteByQueryAndMethod is imported from the shared lib — single source of truth with the
// CLI so the two resolvers can never diverge on write safety again.

const INSTRUMENTS_SYMBOL_URL = "https://api.robinhood.com/instruments/?symbol={symbol}";
const MARKETDATA_QUOTES_URL = "https://api.robinhood.com/marketdata/quotes/?ids={ids}";
const MARKETDATA_FUNDAMENTALS_URL = "https://api.robinhood.com/marketdata/fundamentals/{id}/";
const INSTRUMENT_SHORTING_URL = "https://api.robinhood.com/instruments/{id}/shorting/";
const INSTRUMENT_BUYING_POWER_URL = "https://bonfire.robinhood.com/accounts/{id}/instrument_buying_power/{uuid}/";
const INSTRUMENT_MARGIN_REQUIREMENTS_URL = "https://bonfire.robinhood.com/instruments/{uuid}/margin-requirements/";

// brokerageGetJson + tryBrokerageGetJson are imported from the shared lib (same as the CLI).

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
    description: "Execute a Robinhood brokerage/account request using caller-owned auth env. Reads run live; writes are dry-run by default and require liveWrite=true plus ROBINHOOD_ALLOW_LIVE_WRITE=1. Pass dryRun=true to force a non-sending plan. After any live write, append a trading-log.md entry (intent + strategy thread); brokerage order history is the only proof an order happened (order-evidence rule).",
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
    const gate = resolveLiveWriteGate({ risk: route.risk, method, dryRun, liveWrite });
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
    const gate = resolveLiveWriteGate({ risk: route.risk, method, dryRun, liveWrite });
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
    description: "Open equity positions (live read). Returns symbol, quantity, average_buy_price, instrument_id. Pass account_number to scope to one account (else all).",
    inputSchema: z.object({ account_number: z.string().optional() }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number }) => {
    const query: Record<string, string> = { nonzero: "true" };
    if (account_number) query.account_number = account_number;
    const data = await brokerageGetJson("https://api.robinhood.com/positions/", {}, query);
    const held = (Array.isArray(data.results) ? data.results : []).filter((p: any) => n(p.quantity) > 0);
    return jsonResponse({ count: held.length, positions: held.map((p: any) => ({ symbol: p.symbol, quantity: n(p.quantity), average_buy_price: n(p.average_buy_price), instrument_id: p.instrument_id })) });
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
      if (!accts.includes(String(account_number))) return jsonResponse({ error: `Account ${account_number} not found.` });
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
      "Place an equity buy order. Market buys are fractional, limit orders are whole shares. Dry-run by default; set live=true and ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute. Auto-resolves symbol to instrument, fetches live quote, calculates shares from dollar amount.",
    inputSchema: z.object({
      symbol: z.string(),
      account_number: z.string(),
      amount: z.number().positive().optional(),
      shares: z.number().positive().optional(),
      price: z.number().positive().optional(),
      live: z.boolean().default(false),
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ symbol, account_number, amount, shares, price: limitPrice, live }) => {
    if (!amount && !shares) return jsonResponse({ error: "Must specify amount (dollars) or shares (quantity)" });
    if (amount && shares) return jsonResponse({ error: "Specify amount OR shares, not both" });

    try {
      const inst = (await brokerageGetJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: symbol.toUpperCase() })).results?.[0];
      if (!inst) return jsonResponse({ error: `Symbol ${symbol} not found` });
      const iid = inst.id;

      const q = (await brokerageGetJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: iid })).results?.[0];
      if (!q) return jsonResponse({ error: `No quote for ${symbol}` });
      const last = Number(q.last_trade_price);
      if (!last || last <= 0) return jsonResponse({ error: `Invalid price: $${last}` });

      const isMarket = !limitPrice;
      const rawShares = amount ? amount / last : Number(shares);
      const qty = Number(rawShares.toFixed(4));
      const orderPrice = limitPrice ? limitPrice.toFixed(2) : last.toFixed(2);

      const result = await gatedBrokerageWrite({
        url: "https://api.robinhood.com/orders/",
        method: "POST",
        body: {
          account: `https://api.robinhood.com/accounts/${account_number}/`,
          instrument: `https://api.robinhood.com/instruments/${iid}/`,
          symbol: symbol.toUpperCase(),
          type: isMarket ? "market" : "limit",
          time_in_force: isMarket ? "gfd" : "gtc",
          trigger: "immediate",
          side: "buy",
          quantity: String(qty),
          price: orderPrice,
          order_form_version: "7"
        },
        dryRun: !live,
        liveWrite: Boolean(live)
      });

      const rb = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
      return jsonResponse({
        symbol: symbol.toUpperCase(),
        account: account_number,
        shares: qty,
        estimatedPrice: last,
        estimatedTotal: qty * last,
        type: isMarket ? "market" : "limit",
        live: !result.dryRun,
        orderId: rb?.id ?? rb?.url ?? null,
        state: rb?.state ?? null,
        httpStatus: result.status,
        dryRun: result.dryRun
      });
    } catch (e: any) {
      return jsonResponse({ error: e.message });
    }
  }
);

// ── robinhood_sell: mirror of buy ──
server.registerTool(
  "robinhood_sell",
  {
    title: "Robinhood Sell Order",
    description: "Place an equity sell order. Market sells are fractional. Dry-run by default.",
    inputSchema: z.object({
      symbol: z.string(), account_number: z.string(),
      amount: z.number().positive().optional(), shares: z.number().positive().optional(),
      price: z.number().positive().optional(), live: z.boolean().default(false),
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ symbol, account_number, amount, shares, price: limitPrice, live }) => {
    if (!amount && !shares) return jsonResponse({ error: "Must specify amount or shares" });
    try {
      const inst = (await brokerageGetJson("https://api.robinhood.com/instruments/?symbol={symbol}", { symbol: symbol.toUpperCase() })).results?.[0];
      if (!inst) return jsonResponse({ error: `Symbol ${symbol} not found` });
      const iid = inst.id;
      const q = (await brokerageGetJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: iid })).results?.[0];
      const last = Number(q?.last_trade_price ?? 0);
      const qty = Number((amount ? amount / last : Number(shares)).toFixed(4));
      const result = await gatedBrokerageWrite({
        url: "https://api.robinhood.com/orders/", method: "POST",
        body: { account: `https://api.robinhood.com/accounts/${account_number}/`, instrument: `https://api.robinhood.com/instruments/${iid}/`, symbol: symbol.toUpperCase(), type: limitPrice ? "limit" : "market", time_in_force: limitPrice ? "gtc" : "gfd", trigger: "immediate", side: "sell", quantity: String(qty), price: (limitPrice ?? last).toFixed(2), order_form_version: "7" },
        dryRun: !live, liveWrite: Boolean(live)
      });
      const rb = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
      return jsonResponse({ symbol: symbol.toUpperCase(), account: account_number, shares: qty, estimatedPrice: last, type: limitPrice ? "limit" : "market", live: !result.dryRun, orderId: rb?.id ?? null, state: rb?.state ?? null, httpStatus: result.status });
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_cancel: cancel order by ID ──
server.registerTool(
  "robinhood_cancel",
  {
    title: "Robinhood Cancel Order",
    description: "Cancel a pending order by ID.",
    inputSchema: z.object({ order_id: z.string(), live: z.boolean().default(false) }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ order_id, live }) => {
    try {
      const result = await gatedBrokerageWrite({
        url: `https://api.robinhood.com/orders/${order_id}/cancel/`, method: "POST",
        dryRun: !live, liveWrite: Boolean(live)
      });
      const rb = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
      return jsonResponse({ orderId: order_id, live: !result.dryRun, state: rb?.state ?? null, httpStatus: result.status });
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_order_status: check status of a single order ──
server.registerTool(
  "robinhood_order_status",
  {
    title: "Robinhood Order Status",
    description: "Check status of a single order by ID — symbol, side, quantity, price, state, fills.",
    inputSchema: z.object({ order_id: z.string() }),
    annotations: toolAnnotations(true, "sensitive-read")
  },
  async ({ order_id }) => {
    try {
      const id = order_id.includes("/orders/") ? order_id.split("/orders/")[1].replace(/\/$/, "") : order_id;
      const data = await brokerageGetJson("https://api.robinhood.com/orders/{0}/", { "0": id });
      return jsonResponse(data);
    } catch (e: any) { return jsonResponse({ error: e.message }); }
  }
);

// ── robinhood_settings: read account settings ──
server.registerTool(
  "robinhood_settings",
  {
    title: "Robinhood Account Settings",
    description: "Read account settings: DRIP, options trade-on-expiration, PDT protection, cash sweep, stock lending.",
    inputSchema: z.object({ account_number: z.string() }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number }) => {
    const get = async (url: string) => { try { return await brokerageGetJson(url, { account: account_number }); } catch (e) { return { error: (e as Error).message.slice(0, 60) }; } };
    const [drip, opt, margin, sweep, lending] = await Promise.all([
      get("https://api.robinhood.com/corp_actions/drip/account_settings/{account}/"),
      get("https://api.robinhood.com/options/option_settings/{account}/"),
      get("https://api.robinhood.com/settings/margin/{account}/"),
      get(/* sweep state */ "https://api.robinhood.com/accounts/{account}/" /* simplified — use main */),
      get(/* stock lending */ "https://api.robinhood.com/accounts/{account}/")
    ]);
    return jsonResponse({
      account: account_number, generatedAt: new Date().toISOString(),
      dripEnabled: drip?.dividend_reinvestment_enabled ?? drip?.drip_enabled,
      optionsLevel: opt?.option_level,
      pdtProtection: margin?.day_trades_protection,
      leverageEnabled: margin?.leverage_enabled
    });
  }
);

server.registerTool(
  "robinhood_options_holdings",
  {
    title: "Robinhood Options Holdings",
    description: "Every held option contract across accounts (or one), each with its option_instrument_id (UUID) + contract link, symbol, qty, average_open_price. The owned-contract map.",
    inputSchema: z.object({ account_number: z.string().optional() }),
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
    inputSchema: z.object({ option_instrument_id: z.string() }),
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
    description: "Read or toggle account settings (double-gated). action=show reads all; drip/expiration/pdt/lending/sweep toggle the corresponding setting. Writes are dry-run unless liveWrite=true AND ROBINHOOD_ALLOW_LIVE_WRITE=1. Cash-sweep only supports disable (enroll needs the agreement-sign flow). After any live write, append a trading-log.md entry (intent + thread); order history is the only proof a change took effect (order-evidence rule).",
    inputSchema: z.object({
      account_number: z.string(),
      action: z.enum(["show", "drip", "expiration", "pdt", "lending", "sweep"]),
      enable: z.boolean().optional(),
      instrument_id: z.string().optional(),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().default(false)
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ account_number, action, enable, instrument_id, dryRun, liveWrite }) => {
    if (action === "show") {
      const get = async (url: string) => { try { return await brokerageGetJson(url, { account: account_number }); } catch (e) { return { error: (e as Error).message.slice(0, 60) }; } };
      const [drip, opt, margin, sweep, lending] = await Promise.all([
        get("https://api.robinhood.com/corp_actions/drip/account_settings/{account}/"),
        get("https://api.robinhood.com/options/option_settings/{account}/"),
        get("https://api.robinhood.com/settings/margin/{account}/"),
        get("https://api.robinhood.com/accounts/{account}/sweep_enrollment_state/"),
        get("https://bonfire.robinhood.com/slip/{account}/status/")
      ]);
      return jsonResponse({ account: account_number, dripEnabled: drip?.drip_enabled, tradingOnExpiration: opt?.trading_on_expiration_state, dayTradesProtection: margin?.day_trades_protection, sweepEnrolled: sweep?.sweep_enrolled, stockLendingEnabled: lending?.is_enabled });
    }
    let url: string, method: string, params: Record<string, string> = { account: account_number }, body: unknown;
    if (action === "drip") {
      url = instrument_id ? "https://api.robinhood.com/corp_actions/drip/instrument_settings/{account}/{instrument_id}/" : "https://api.robinhood.com/corp_actions/drip/account_settings/{account}/";
      if (instrument_id) params.instrument_id = instrument_id;
      method = "PATCH"; body = { drip_enabled: Boolean(enable) };
    } else if (action === "expiration") {
      url = "https://api.robinhood.com/options/option_settings/{account}/"; method = "PATCH"; body = { trading_on_expiration_state: enable ? "enabled" : "disabled" };
    } else if (action === "pdt") {
      url = "https://api.robinhood.com/settings/margin/{account}/"; method = "PUT"; body = { day_trades_protection: Boolean(enable) };
    } else if (action === "lending") {
      url = "https://bonfire.robinhood.com/slip/{account}/status/"; method = "PUT"; body = { is_enabled: Boolean(enable), was_ever_enabled: true };
    } else { // sweep
      if (enable) throw new Error("Only sweep disable is automated; enroll needs the agreement-sign flow.");
      url = "https://api.robinhood.com/accounts/{account}/sweep_enrollment_state/"; method = "POST"; body = { sweep_enrollment_action: "unenroll" };
    }
    const r = await gatedBrokerageWrite({ url, method, params, body, dryRun, liveWrite });
    return jsonResponse(r.dryRun && r.reason ? { ...r, liveWriteBlocked: r.reason } : r);
  }
);

server.registerTool(
  "robinhood_recurring",
  {
    title: "Robinhood Recurring Schedules",
    description: "List or mutate recurring investment schedules (double-gated writes). action=list reads all; create/edit/end mutate. Writes dry-run unless liveWrite=true AND ROBINHOOD_ALLOW_LIVE_WRITE=1. After any live write, append a trading-log.md entry (intent + thread); order history is the only proof a change took effect (order-evidence rule).",
    inputSchema: z.object({
      action: z.enum(["list", "create", "edit", "end"]),
      id: z.string().optional(),
      account_number: z.string().optional(),
      symbol: z.string().optional(),
      amount: z.number().optional(),
      frequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
      start_date: z.string().optional(),
      dryRun: z.boolean().default(false),
      liveWrite: z.boolean().default(false)
    }),
    annotations: toolAnnotations(false, "write-mutate")
  },
  async ({ action, id, account_number, symbol, amount, frequency, start_date, dryRun, liveWrite }) => {
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
      return jsonResponse(r.dryRun && r.reason ? { ...r, liveWriteBlocked: r.reason } : r);
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
    return jsonResponse(r.dryRun && r.reason ? { ...r, liveWriteBlocked: r.reason } : r);
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
    if (ids.length === 0) return jsonResponse({ quotes: [] });
    const q = (await brokerageGetJson("https://api.robinhood.com/marketdata/quotes/?ids={ids}", { ids: ids.join(",") })).results ?? [];
    return jsonResponse({ quotes: q.filter(Boolean).map((r: any) => ({ symbol: r.symbol, last: n(r.last_trade_price), bid: n(r.bid_price), ask: n(r.ask_price), previousClose: n(r.previous_close) })) });
  }
);

server.registerTool(
  "robinhood_history",
  {
    title: "Robinhood Transaction History",
    description: "Recent equity + options order history (newest first). Order history is the source of truth for whether a trade happened (see the order-evidence rule). Pass account_number to scope equity orders.",
    inputSchema: z.object({ account_number: z.string().optional(), limit: z.number().default(20) }),
    annotations: toolAnnotations(true, "read")
  },
  async ({ account_number, limit }) => {
    const eqUrl = "https://api.robinhood.com/orders/";
    const eq = await tryBrokerageGetJson(eqUrl, {}, account_number ? { account_number } : {});
    const opt = await tryBrokerageGetJson("https://api.robinhood.com/options/orders/");
    return jsonResponse({
      equityOrders: eq.ok ? (eq.data.results ?? []).slice(0, limit) : { error: eq.error },
      optionOrders: opt.ok ? (opt.data.results ?? []).slice(0, limit) : { error: opt.error }
    });
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
  "robinhood_options_enumerate",
  {
    title: "Robinhood Options Enumerate",
    description: "Bulk-enumerate EVERY option contract (strike + option_instrument_id + desktop link) for a symbol/expiration. Option UUIDs are random v4 — enumeration is the ONLY way to resolve them; this is the canonical UUID resolver before quoting/ordering or inspecting.",
    inputSchema: z.object({ symbol: z.string(), expiration: z.string().optional(), type: z.enum(["call", "put", "both"]).default("both") }),
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

const transport = new StdioServerTransport();
await server.connect(transport);
