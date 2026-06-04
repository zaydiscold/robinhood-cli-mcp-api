#!/usr/bin/env node
// SELF-EXTENSION PROTOCOL (read if you are an LLM/agent)
//
// If you discover a Robinhood route that is NOT in api-map/:
//   1. Add it to api-map/brokerage-routes.json or the OpenAPI map.
//   2. Classify risk conservatively.
//   3. Document discovery and auth/session evidence in docs/undocumented-surface.md.
//   4. Personal repo commands may execute live with caller-owned auth; use --dry-run for non-sending tests.

import { Command } from "commander";
import { randomUUID } from "node:crypto";
import {
  buildAccountContextUrl,
  buildOptionsContractLinkBundle,
  buildOptionsContractNavigationPlan,
  buildOptionsStrategyPricingSummary,
  buildOptionsStrategyOrderPlan,
  classifyMoneyness,
  collarSanity,
  selectRouteByQueryAndMethod,
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
  optionReturnPct,
  parseParamAssignments,
  percentChange,
  planBrokerageRequest,
  planCryptoRequest,
  printJson,
  printTable,
  resolveLiveWriteGate,
  selectNearStrikes,
  signCryptoRequest,
  summarizeApiMap
} from "./lib.js";
import type { OptionStrategyLegTemplate, OptionsStrategyPricingMode } from "./lib.js";

// .env auto-load + token self-heal live in lib.ts (shared by CLI + MCP server),
// so importing it above is enough — no per-entry loader needed here.

const program = new Command();

program
  .name("robinhood-cli")
  .description("Personal live Robinhood API map CLI. Crypto signing helper plus brokerage/account route inventory and executor.")
  .version("0.1.0");

function parseJsonBody(value?: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid --body-json: ${(error as Error).message}`);
  }
}

function parseBodyString(options: { body?: string; bodyJson?: string }): string | undefined {
  if (options.body !== undefined && options.bodyJson !== undefined) {
    throw new Error("Use either --body or --body-json, not both.");
  }
  if (options.body !== undefined) return options.body;
  if (options.bodyJson !== undefined) return JSON.stringify(parseJsonBody(options.bodyJson));
  return undefined;
}

// selectRouteByQueryAndMethod is imported from ./lib.js — single source of truth shared with
// the MCP server so the two resolvers can never diverge on write safety (they once did).

const apiMap = new Command("api-map").description("Inspect bundled API maps");

apiMap
  .command("summary")
  .description("Summarize Crypto OpenAPI and brokerage route inventory")
  .option("--json", "emit JSON")
  .action((options: { json?: boolean }) => {
    const summary = summarizeApiMap();
    if (options.json) {
      printJson(summary);
      return;
    }
    process.stdout.write(`Unified: ${summary.unified.routes} route entries / ${summary.unified.openapiOperations} OpenAPI operations\n`);
    process.stdout.write(`Crypto: ${summary.crypto.paths} paths / ${summary.crypto.operations} operations\n`);
    process.stdout.write(`Brokerage: ${summary.brokerage.routes} route templates\n`);
    process.stdout.write(`Browser CDP: ${summary.brokerage.browserRoutes} route templates\n`);
    process.stdout.write(`Unified risk: ${Object.entries(summary.unified.byRisk).map(([risk, count]) => `${risk}=${count}`).join(", ")}\n`);
  });

apiMap
  .command("routes")
  .description("List the unified Robinhood API map: official Crypto plus brokerage/account routes")
  .option("--risk <risk>", "filter by risk")
  .option("--category <category>", "filter by category")
  .option("--host <host>", "filter by host")
  .option("--query <text>", "substring filter against URL")
  .option("--json", "emit JSON")
  .action((options: { risk?: string; category?: string; host?: string; query?: string; json?: boolean }) => {
    const routes = filterRobinhoodRoutes(loadRobinhoodRoutes(), options);
    if (options.json) {
      printJson({ count: routes.length, routes });
      return;
    }
    printTable(
      routes.map((route) => ({
        risk: route.risk,
        category: (route.categories ?? []).join(",") || "uncategorized",
        host: route.host,
        source: route.source ?? "unknown",
        url: route.url
      })),
      ["risk", "category", "host", "source", "url"]
    );
  });

apiMap
  .command("browser-routes")
  .description("List the latest sanitized authenticated CDP route templates")
  .option("--host <host>", "filter by host")
  .option("--risk <risk>", "filter by risk")
  .option("--json", "emit JSON")
  .action((options: { host?: string; risk?: string; json?: boolean }) => {
    const routes = loadBrowserRoutes().filter((route) => (!options.host || route.host === options.host) && (!options.risk || route.risk === options.risk));
    if (options.json) {
      printJson({ count: routes.length, routes });
      return;
    }
    printTable(
      routes.map((route) => ({
        risk: route.risk,
        host: route.host,
        categories: (route.categories ?? []).join(",") || "uncategorized",
        seenOn: route.seenOn.join(","),
        url: route.url
      })),
      ["risk", "host", "categories", "seenOn", "url"]
    );
  });

apiMap
  .command("account-context")
  .description("List browser-observed account_number routing behavior across Robinhood surfaces")
  .option("--behavior <behavior>", "propagates, mixed, ignored, not-applicable, or stale-route")
  .option("--surface <surface>", "filter by surface, e.g. stocks, legend, transfers")
  .option("--query <text>", "substring filter")
  .option("--json", "emit JSON")
  .action((options: { behavior?: any; surface?: string; query?: string; json?: boolean }) => {
    const workflows = filterAccountContextWorkflows(loadAccountContextWorkflows(), options);
    if (options.json) {
      printJson({ count: workflows.length, workflows });
      return;
    }
    printTable(
      workflows.map((workflow) => ({
        behavior: workflow.behavior,
        surface: workflow.surface,
        risk: workflow.risk,
        safe: workflow.safeToAutomate ? "yes" : "no",
        id: workflow.id,
        route: workflow.webRoute
      })),
      ["behavior", "surface", "risk", "safe", "id", "route"]
    );
  });

apiMap
  .command("account-url")
  .description("Build a Robinhood web URL from an account-context workflow template")
  .argument("<id>", "workflow id, e.g. stock-detail-order-ticket")
  .option("--account <account_number>", "sets account_number")
  .option("--symbol <symbol>", "sets symbol")
  .option("--instrument-id <instrument_uuid>", "sets instrument_uuid")
  .option("--layout-id <layout_uuid>", "sets layout_uuid")
  .option("--param <name=value>", "replace any other placeholder; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--json", "emit JSON")
  .action(
    (
      id: string,
      options: {
        account?: string;
        symbol?: string;
        instrumentId?: string;
        layoutId?: string;
        param?: string[];
        json?: boolean;
      }
    ) => {
      const workflow = loadAccountContextWorkflows().find((candidate) => candidate.id === id);
      if (!workflow) throw new Error(`No account-context workflow matched id: ${id}`);
      const params = {
        ...parseParamAssignments(options.param),
        account_number: options.account,
        symbol: options.symbol,
        instrument_uuid: options.instrumentId,
        layout_uuid: options.layoutId
      };
      const built = buildAccountContextUrl(workflow, params);
      if (options.json) {
        printJson(built);
        return;
      }
      process.stdout.write(`${built.url}\n`);
      for (const warning of built.warnings) process.stderr.write(`warning: ${warning}\n`);
      if (built.missingParams.length > 0) process.stderr.write(`missing params: ${built.missingParams.join(", ")}\n`);
    }
  );

apiMap
  .command("options-strategies")
  .description("List options strategy workflow templates with payoff and Greek posture")
  .option("--category <category>", "filter by category")
  .option("--aggressiveness <level>", "conservative, moderate, or aggressive")
  .option("--defined-risk", "only defined-risk strategies")
  .option("--undefined-risk", "only undefined-risk strategies")
  .option("--query <text>", "substring filter")
  .option("--json", "emit JSON")
  .action(
    (options: {
      category?: string;
      aggressiveness?: string;
      definedRisk?: boolean;
      undefinedRisk?: boolean;
      query?: string;
      json?: boolean;
    }) => {
      const definedRisk = options.definedRisk ? true : options.undefinedRisk ? false : undefined;
      const workflows = filterOptionsStrategyWorkflows(loadOptionsStrategyWorkflows(), {
        category: options.category,
        aggressiveness: options.aggressiveness,
        definedRisk,
        query: options.query
      });
      if (options.json) {
        printJson({ count: workflows.length, workflows });
        return;
      }
      printTable(
        workflows.map((workflow) => ({
          risk: workflow.definedRisk ? "defined" : "undefined",
          aggression: workflow.aggressiveness,
          category: workflow.category,
          margin: workflow.requiresMargin ? "yes" : "no",
          id: workflow.id,
          title: workflow.title
        })),
        ["risk", "aggression", "category", "margin", "id", "title"]
      );
    }
  );

apiMap
  .command("options-strategy-plan")
  .description("Build a dry-run options order body template for a strategy workflow")
  .argument("<id>", "strategy id, e.g. iron-condor")
  .option("--param <name=value>", "fill a strategy placeholder; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--json", "emit JSON")
  .action((id: string, options: { param?: string[]; json?: boolean }) => {
    const workflow = loadOptionsStrategyWorkflows().find((candidate) => candidate.id === id);
    if (!workflow) throw new Error(`No options strategy workflow matched id: ${id}`);
    const plan = buildOptionsStrategyOrderPlan(workflow, parseParamAssignments(options.param));
    if (options.json) {
      printJson(plan);
      return;
    }
    process.stdout.write(`${workflow.title} (${workflow.id})\n`);
    process.stdout.write(`mode: ${plan.mode}\nrisk: ${plan.risk}\n\nlookup steps:\n`);
    for (const step of plan.lookupSteps) process.stdout.write(`- ${step}\n`);
    process.stdout.write(`\norder body:\n${JSON.stringify(plan.order, null, 2)}\n`);
    for (const warning of plan.warnings) process.stderr.write(`warning: ${warning}\n`);
    if (plan.missingParams.length > 0) process.stderr.write(`missing params: ${plan.missingParams.join(", ")}\n`);
  });

apiMap
  .command("options-contract-plan")
  .description("Plan account-scoped web navigation candidates and API lookup steps for one exact options contract")
  .requiredOption("--account <account_number>", "selected Robinhood account_number")
  .requiredOption("--symbol <symbol>", "underlying symbol, e.g. XBI")
  .requiredOption("--expiration <YYYY-MM-DD>", "option expiration date")
  .requiredOption("--type <call|put>", "option type")
  .requiredOption("--side <buy|sell>", "trade side")
  .requiredOption("--strike <strike>", "strike price")
  .option("--position-effect <open|close>", "position effect", "open")
  .option("--chain-id <chain_id>", "known Robinhood option chain id")
  .option("--equity-instrument-id <uuid>", "known underlying equity instrument id")
  .option("--option-id <option_instrument_id>", "known Robinhood option instrument id")
  .option("--source <source>", "URL probe/source marker", "robinhood-cli-contract-plan")
  .option("--json", "emit JSON")
  .action(
    (options: {
      account: string;
      symbol: string;
      expiration: string;
      type: "call" | "put";
      side: "buy" | "sell";
      strike: string;
      positionEffect?: "open" | "close";
      chainId?: string;
      equityInstrumentId?: string;
      optionId?: string;
      source?: string;
      json?: boolean;
    }) => {
      const plan = buildOptionsContractNavigationPlan({
        accountNumber: options.account,
        symbol: options.symbol,
        expiration: options.expiration,
        optionType: options.type,
        side: options.side,
        strike: options.strike,
        positionEffect: options.positionEffect,
        chainId: options.chainId,
        equityInstrumentId: options.equityInstrumentId,
        optionInstrumentId: options.optionId,
        source: options.source
      });
      if (options.json) {
        printJson(plan);
        return;
      }
      process.stdout.write(`selector: ${plan.selector.symbol} ${plan.selector.expiration} ${plan.selector.strike} ${plan.selector.optionType} ${plan.selector.side}-${plan.selector.positionEffect}\n`);
      process.stdout.write("\nweb navigation candidates:\n");
      for (const link of plan.webNavigation) process.stdout.write(`- [${link.confidence}] ${link.id}: ${link.url}\n`);
      process.stdout.write("\napi resolution:\n");
      for (const step of plan.apiResolutionSteps) process.stdout.write(`- ${step.method} ${step.url} (${step.id})\n`);
      for (const warning of plan.warnings) process.stderr.write(`warning: ${warning}\n`);
      if (plan.missingParams.length > 0) process.stderr.write(`missing params: ${plan.missingParams.join(", ")}\n`);
    }
  );

apiMap
  .command("options-contract-links")
  .alias("options-contract-link-pack")
  .description("Resolve one exact option contract live and return account-pinned navigation/webhook handoff links")
  .requiredOption("--account <account_number>", "selected Robinhood account_number")
  .requiredOption("--symbol <symbol>", "underlying symbol, e.g. DRAM")
  .requiredOption("--expiration <YYYY-MM-DD>", "option expiration date")
  .requiredOption("--type <call|put>", "option type")
  .requiredOption("--side <buy|sell>", "trade side")
  .requiredOption("--strike <strike>", "strike price")
  .option("--position-effect <open|close>", "position effect", "open")
  .option("--chain-id <chain_id>", "known Robinhood option chain id")
  .option("--source <source>", "source marker for generated handoff links", "robinhood-cli-contract-links")
  .option("--far-limit-offset <dollars>", "far pricing offset for safe sell/buy dry-run probes", "200")
  .option("--json", "emit JSON")
  .action(
    async (options: {
      account: string;
      symbol: string;
      expiration: string;
      type: "call" | "put";
      side: "buy" | "sell";
      strike: string;
      positionEffect?: "open" | "close";
      chainId?: string;
      source?: string;
      farLimitOffset?: string;
      json?: boolean;
    }) => {
      const bundle = await resolveExactContractLinkBundle({
        account: options.account,
        symbol: options.symbol,
        expiration: options.expiration,
        optionType: options.type,
        side: options.side,
        strike: options.strike,
        positionEffect: options.positionEffect ?? "open",
        chainId: options.chainId,
        source: options.source,
        farLimitOffset: Number(options.farLimitOffset ?? "200")
      });
      if (options.json) {
        printJson(bundle);
        return;
      }
      process.stdout.write(
        `${bundle.selector.symbol} ${bundle.selector.expiration} ${bundle.selector.strike} ${bundle.selector.optionType} ${bundle.selector.side}-${bundle.selector.positionEffect}\n`
      );
      process.stdout.write(`exact API resolution: ${bundle.exactApiResolutionProven ? "yes" : "no"}\n`);
      process.stdout.write(`exact UI deep link: ${bundle.exactUiSelectionProven ? "yes" : "not proven"}\n\n`);
      process.stdout.write(`primary handoff: ${bundle.webhookHandoff.copyPastePrimary}\n`);
      process.stdout.write(`account web shell: ${bundle.links.accountScopedWebShell}\n`);
      if (bundle.links.appChainById) process.stdout.write(`app chain handoff: ${bundle.links.appChainById}\n`);
      if (bundle.resolvedContract?.optionInstrumentUrl) {
        process.stdout.write(`option instrument: ${bundle.resolvedContract.optionInstrumentUrl}\n`);
      }
      if (bundle.quote) {
        printTable(
          [
            {
              bid: usd(finiteNumber(bundle.quote.bid)),
              ask: usd(finiteNumber(bundle.quote.ask)),
              mark: usd(finiteNumber(bundle.quote.mark)),
              last: usd(finiteNumber(bundle.quote.last)),
              natural: usd(finiteNumber(bundle.quote.naturalPrice)),
              mid: usd(finiteNumber(bundle.quote.midPrice))
            }
          ],
          ["bid", "ask", "mark", "last", "natural", "mid"]
        );
      }
      process.stdout.write(
        `\npricing controls: safe-sell-probe ${usd(finiteNumber(bundle.pricingControls.safeSellProbeLimit))}, ` +
          `safe-buy-probe ${usd(finiteNumber(bundle.pricingControls.safeBuyProbeLimit))}\n`
      );
      for (const warning of bundle.warnings) process.stderr.write(`warning: ${warning}\n`);
    }
  );

program.addCommand(apiMap);

const brokerage = new Command("brokerage").description("Inspect reverse-engineered brokerage/account routes");

brokerage
  .command("routes")
  .description("List brokerage/account route templates")
  .option("--risk <risk>", "filter by risk: read, sensitive-read, write-safe, write-mutate, write-or-sensitive, destructive")
  .option("--category <category>", "filter by category")
  .option("--host <host>", "filter by host")
  .option("--query <text>", "substring filter against URL")
  .option("--json", "emit JSON")
  .action((options: { risk?: string; category?: string; host?: string; query?: string; json?: boolean }) => {
    const routes = filterBrokerageRoutes(loadBrokerageRoutes(), options);
    if (options.json) {
      printJson({ count: routes.length, routes });
      return;
    }
    printTable(
      routes.map((route) => ({
        risk: route.risk,
        category: (route.categories ?? []).join(",") || "uncategorized",
        host: route.host,
        url: route.url
      })),
      ["risk", "category", "host", "url"]
    );
  });

brokerage
  .command("route")
  .description("Inspect one brokerage/account route by exact URL or substring")
  .argument("<query>", "exact URL or URL substring")
  .option("--json", "emit JSON")
  .action((query: string, options: { json?: boolean }) => {
    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query });
    const exact = matches.find((route) => route.url === query);
    const selected = exact ? [exact] : matches;
    if (options.json) {
      printJson({ count: selected.length, routes: selected });
      return;
    }
    if (selected.length === 0) {
      throw new Error(`No brokerage route matched: ${query}`);
    }
    printTable(
      selected.map((route) => ({
        risk: route.risk,
        category: (route.categories ?? []).join(",") || "uncategorized",
        host: route.host,
        url: route.url
      })),
      ["risk", "category", "host", "url"]
    );
  });

brokerage
  .command("plan")
  .description("Build a brokerage/account request plan from a mapped route")
  .argument("<query>", "exact URL or URL substring")
  .option("--method <method>", "override inferred HTTP method")
  .option("--param <name=value>", "replace a route placeholder; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--json", "emit JSON")
  .action((query: string, options: { method?: string; param?: string[]; json?: boolean }) => {
    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query });
    const route = selectRouteByQueryAndMethod(matches, query, options.method);
    if (!route) {
      throw new Error(`No brokerage route matched: ${query}`);
    }
    const plan = planBrokerageRequest({
      route,
      method: options.method,
      params: parseParamAssignments(options.param),
      dryRun: true
    });
    if (options.json) {
      printJson(plan);
      return;
    }
    process.stdout.write(`${plan.method} ${plan.url}\n`);
    process.stdout.write(`${plan.command}\n`);
    for (const warning of plan.warnings) {
      process.stderr.write(`warning: ${warning}\n`);
    }
    if (plan.missingParams.length > 0) {
      process.stderr.write(`missing params: ${plan.missingParams.join(", ")}\n`);
    }
  });

brokerage
  .command("execute")
  .description("Execute a brokerage/account request. Reads run live; writes are dry-run by default and require --live-write plus ROBINHOOD_ALLOW_LIVE_WRITE=1. Uses ROBINHOOD_BROKERAGE_TOKEN or ROBINHOOD_COOKIE.")
  .argument("<query>", "exact URL or URL substring")
  .option("--method <method>", "override inferred HTTP method")
  .option("--param <name=value>", "replace a route placeholder; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--body-json <json>", "JSON request body")
  .option("--dry-run", "print execution plan without sending")
  .option("--live-write", "permit a live write (also requires ROBINHOOD_ALLOW_LIVE_WRITE=1)")
  .option("--full", "print full response body instead of bounded preview")
  .option("--json", "emit JSON")
  .action(async (query: string, options: { method?: string; param?: string[]; bodyJson?: string; dryRun?: boolean; liveWrite?: boolean; full?: boolean; json?: boolean }) => {
    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query });
    const route = selectRouteByQueryAndMethod(matches, query, options.method);
    if (!route) {
      throw new Error(`No brokerage route matched: ${query}`);
    }
    const gate = resolveLiveWriteGate({
      risk: route.risk,
      method: options.method,
      dryRun: Boolean(options.dryRun),
      liveWrite: Boolean(options.liveWrite)
    });
    if (gate.forcedDryRun && gate.reason) {
      process.stderr.write(`${gate.reason}\n`);
    }
    const effectiveDryRun = Boolean(options.dryRun) || gate.forcedDryRun;
    const plan = planBrokerageRequest({
      route,
      method: options.method,
      params: parseParamAssignments(options.param),
      body: parseJsonBody(options.bodyJson),
      dryRun: effectiveDryRun
    });
    const result = await executeBrokerageRequest(plan, {
      dryRun: effectiveDryRun,
      body: parseJsonBody(options.bodyJson),
      fullBody: Boolean(options.full)
    });
    if (options.json) {
      printJson(result);
      return;
    }
    process.stdout.write(`${result.status} ${result.statusText} ${result.method} ${result.url}\n`);
    process.stdout.write(result.body ? `${result.body}\n` : "");
  });

// --- Equity buy: first-class wrapper over the WEB order body ---
// Builds exactly the gate-clearing body (order_form_version 7 + live bid/ask collar)
// documented in AGENTS.md, with the OTC / fractional guard so a dollar order can never
// be sent for a non-fractional/OTC name. Same engine + same two-gate write protection.
const ORDERS_URL = "https://api.robinhood.com/orders/";
brokerage
  .command("buy <symbol>")
  .description("Equity buy: --dollars (fractional/market) or --shares (whole; OTC auto-limit). Web order body. Dry-run by default; live needs --live-write AND ROBINHOOD_ALLOW_LIVE_WRITE=1.")
  .requiredOption("--account <account_number>", "brokerage account number")
  .option("--dollars <amount>", "dollar-notional fractional buy (market, regular hours only)")
  .option("--shares <qty>", "share quantity (whole shares for OTC names)")
  .option("--limit <price>", "explicit limit price; else market with ask collar (OTC forces a limit at the ask)")
  .option("--tif <gfd|gtc>", "time in force", "gfd")
  .option("--dry-run", "print plan/body, send nothing")
  .option("--live-write", "permit a live write (also requires ROBINHOOD_ALLOW_LIVE_WRITE=1)")
  .option("--json", "emit JSON")
  .action(async (symbol: string, opts: { account: string; dollars?: string; shares?: string; limit?: string; tif?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (!opts.dollars && !opts.shares) throw new Error("Pass --dollars <amt> or --shares <qty>.");
    if (opts.dollars && opts.shares) throw new Error("Pass only one of --dollars or --shares.");
    if (opts.dollars && !(Number(opts.dollars) > 0)) throw new Error(`--dollars must be a positive number (got "${opts.dollars}").`);
    if (opts.shares && !(Number(opts.shares) > 0)) throw new Error(`--shares must be a positive number (got "${opts.shares}").`);
    if (opts.limit && !(Number(opts.limit) > 0)) throw new Error(`--limit must be a positive number (got "${opts.limit}").`);
    const acctLabel = await assertOwnedAccount(opts.account);
    const inst = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
    if (!inst) throw new Error(`No instrument for ${symbol} — check the ticker (use 'brokerage search').`);
    const q = (await brokerageGetJson(MARKETDATA_QUOTES_URL, { ids: inst.id })).results?.[0] ?? {};
    // OTC signal: otc_market_tier populated OR fractional only closeable.
    const otc = Boolean(inst.otc_market_tier) || inst.fractional_tradability === "position_closing_only";

    const body: Record<string, unknown> = {
      account: `https://api.robinhood.com/accounts/${opts.account}/`,
      instrument: `https://api.robinhood.com/instruments/${inst.id}/`,
      symbol: inst.symbol,
      side: "buy",
      time_in_force: opts.tif === "gtc" ? "gtc" : "gfd",
      trigger: "immediate",
      position_effect: "open",
      market_hours: "regular_hours",
      order_form_version: 7,
      bid_price: q.bid_price,
      ask_price: q.ask_price,
      bid_ask_timestamp: q.updated_at ?? new Date().toISOString(),
      ref_id: randomUUID()
    };

    if (opts.dollars) {
      if (inst.fractional_tradability !== "tradable") {
        throw new Error(`${inst.symbol}: fractional_tradability=${inst.fractional_tradability} — cannot place a dollar/fractional order. Use --shares <whole qty>${otc ? " (OTC: limit at ask)" : ""}.`);
      }
      body.type = "market";
      body.dollar_based_amount = { amount: Number(opts.dollars).toFixed(2), currency_code: "USD" };
    } else {
      body.quantity = String(opts.shares);
      // The auto-collar uses the live ask; guard against a null/empty/zero ask becoming the
      // order price/collar (halted name, bad quote). An explicit --limit bypasses the ask entirely.
      if (!opts.limit && !(Number(q.ask_price) > 0)) {
        throw new Error(`${inst.symbol}: no usable ask price from the quote (ask=${JSON.stringify(q.ask_price)}). Pass an explicit --limit <price> or retry during market hours.`);
      }
      if (opts.limit || otc) {
        body.type = "limit";
        body.price = opts.limit ?? q.ask_price;
      } else {
        body.type = "market";
        body.price = q.ask_price; // collar
      }
    }

    // Collar sanity (shares path, auto-collar only — explicit --limit is the user's call).
    let collarWarning: string | undefined;
    if (opts.shares && !opts.limit) {
      const c = collarSanity(q);
      if (c.stale) {
        collarWarning =
          `${inst.symbol}: ask-collar ${c.ask} is ${c.deviationPct.toFixed(0)}% off reference ${c.ref.toFixed(2)} ` +
          `(stale/after-hours quote — this collar would not protect the order). ` +
          `Pass an explicit --limit <price> (regular-hours marketable limit) or retry during market hours.`;
      }
    }

    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: ORDERS_URL });
    const route = selectRouteByQueryAndMethod(matches, ORDERS_URL, "POST");
    if (!route) throw new Error("orders/ POST route missing from map — rebuild (AGENTS.md §3).");
    const gate = resolveLiveWriteGate({ risk: route.risk, method: "POST", dryRun: Boolean(opts.dryRun), liveWrite: Boolean(opts.liveWrite) });
    if (gate.forcedDryRun && gate.reason) process.stderr.write(`${gate.reason}\n`);
    const effectiveDryRun = Boolean(opts.dryRun) || gate.forcedDryRun;
    // Block a LIVE send on a stale collar; warn (still inspectable) on a dry-run.
    if (collarWarning) {
      if (effectiveDryRun) process.stderr.write(`⚠️  ${collarWarning}\n`);
      else throw new Error(collarWarning);
    }
    const plan = planBrokerageRequest({ route, method: "POST", params: {}, body, dryRun: effectiveDryRun });
    const result = await executeBrokerageRequest(plan, { dryRun: effectiveDryRun, body, fullBody: true });

    const kind = opts.dollars ? `$${Number(opts.dollars).toFixed(2)} fractional/market` : `${opts.shares}sh ${body.type}${otc ? " (OTC)" : ""}`;
    const acctTag = acctLabel ? `${opts.account} (${acctLabel})` : opts.account;
    if (opts.json) {
      printJson({ symbol: inst.symbol, account: opts.account, accountLabel: acctLabel, otc, kind, dryRun: effectiveDryRun, status: result.status, body: result.body });
      return;
    }
    process.stdout.write(`${effectiveDryRun ? "DRY-RUN" : result.status + " " + result.statusText} buy ${inst.symbol} ${kind} acct ${acctTag}\n`);
    process.stdout.write(result.body ? `${result.body}\n` : "");
  });

// --- Instrument search: ground ticker resolution in Robinhood's own universe ---
// The web search bar. Use this BEFORE buying when you only have a name/theme, so an
// agent never guesses a ticker (e.g. "oracle 2x" -> ORCX/ORCU, not a hallucinated SSO).
const SEARCH_URL = "https://api.robinhood.com/midlands/search/?query={query}";
brokerage
  .command("search <query>")
  .description("Search Robinhood's instrument universe by name/ticker (the web search bar). Grounds ticker resolution: 'oracle 2x' -> ORCX/ORCU. Shows tradability, fractional eligibility, and OTC flag.")
  .option("--limit <n>", "max results", "12")
  .option("--json", "emit JSON")
  .action(async (query: string, opts: { limit?: string; json?: boolean }) => {
    const data = await brokerageGetJson(SEARCH_URL, { query });
    const insts: any[] = Array.isArray(data.instruments) ? data.instruments : [];
    const rows = insts.slice(0, Number(opts.limit ?? 12)).map((i) => ({
      symbol: i.symbol,
      name: i.simple_name || i.name,
      tradable: i.tradability,
      fractional: i.fractional_tradability,
      otc: i.otc_market_tier ? "OTC" : "",
      id: i.id
    }));
    if (opts.json) { printJson({ query, count: rows.length, results: rows }); return; }
    if (!rows.length) { process.stdout.write(`No instruments for "${query}".\n`); return; }
    for (const r of rows) {
      process.stdout.write(`${String(r.symbol || "").padEnd(8)} ${String(r.tradable || "").padEnd(10)} frac=${String(r.fractional || "-").padEnd(20)} ${String(r.otc).padEnd(4)} ${r.name || ""}\n`);
    }
  });

program.addCommand(brokerage);

// --- Recurring investments: first-class command surface ---
// Wraps the mapped recurring_schedules routes so any agent can manage recurring
// buys without hand-crafting a `brokerage execute` URL + body. Same engine, same gate.
const RECURRING_LIST_URL = "https://bonfire.robinhood.com/recurring_schedules/";
const RECURRING_ITEM_URL = "https://bonfire.robinhood.com/recurring_schedules/{0}/";

function recurringSymbol(s: any): string {
  return s?.investment_asset?.asset_symbol ?? s?.investment_target?.instrument_symbol ?? "?";
}

async function fetchRecurringSchedules(): Promise<any[]> {
  const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: RECURRING_LIST_URL });
  const route = selectRouteByQueryAndMethod(matches, RECURRING_LIST_URL, "GET");
  if (!route) throw new Error("recurring_schedules GET route missing from map — rebuild (AGENTS.md §3).");
  const plan = planBrokerageRequest({ route, method: "GET", params: {}, dryRun: false });
  const result = await executeBrokerageRequest(plan, { dryRun: false, fullBody: true });
  const parsed = JSON.parse(result.body ?? "{}");
  return Array.isArray(parsed.results) ? parsed.results : [];
}

async function setRecurringState(
  id: string,
  state: "active" | "paused",
  options: { dryRun?: boolean; liveWrite?: boolean }
): Promise<{ status: number | string; dryRun: boolean; reason?: string }> {
  const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: RECURRING_ITEM_URL });
  const route = selectRouteByQueryAndMethod(matches, RECURRING_ITEM_URL, "PATCH");
  if (!route) throw new Error("recurring_schedules/{0}/ PATCH route missing from map — rebuild (AGENTS.md §3).");
  const gate = resolveLiveWriteGate({ risk: route.risk, method: "PATCH", dryRun: Boolean(options.dryRun), liveWrite: Boolean(options.liveWrite) });
  const effectiveDryRun = Boolean(options.dryRun) || gate.forcedDryRun;
  const body = { state };
  const plan = planBrokerageRequest({ route, method: "PATCH", params: { "0": id }, body, dryRun: effectiveDryRun });
  const result = await executeBrokerageRequest(plan, { dryRun: effectiveDryRun, body, fullBody: false });
  return { status: result.status, dryRun: effectiveDryRun, reason: gate.reason };
}

function collectId(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

// Generic double-gated brokerage write. Pass the EXACT templated URL (with {placeholders}) so the
// resolver matches one route and the ambiguity guard can't fire. Dry-run by default; a live send
// needs --live-write AND ROBINHOOD_ALLOW_LIVE_WRITE=1. Returns status + the (dry-run or live) body.
async function gatedBrokerageWrite(opts: {
  url: string;
  method: string;
  params?: Record<string, string>;
  body?: unknown;
  dryRun?: boolean;
  liveWrite?: boolean;
}): Promise<{ status: number | string; dryRun: boolean; reason?: string; body?: string }> {
  const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: opts.url });
  const route = selectRouteByQueryAndMethod(matches, opts.url, opts.method);
  if (!route) throw new Error(`No ${opts.method} route for ${opts.url} — check the map / rebuild (AGENTS.md §3).`);
  const gate = resolveLiveWriteGate({ risk: route.risk, method: opts.method, dryRun: Boolean(opts.dryRun), liveWrite: Boolean(opts.liveWrite) });
  const effectiveDryRun = Boolean(opts.dryRun) || gate.forcedDryRun;
  const plan = planBrokerageRequest({ route, method: opts.method, params: opts.params ?? {}, body: opts.body, dryRun: effectiveDryRun });
  const result = await executeBrokerageRequest(plan, { dryRun: effectiveDryRun, body: opts.body, fullBody: true });
  return { status: result.status, dryRun: effectiveDryRun, reason: gate.reason, body: result.body };
}

async function runRecurringSet(
  desired: "active" | "paused",
  options: { id?: string[]; all?: boolean; account?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }
): Promise<void> {
  const schedules = await fetchRecurringSchedules();
  const byId = new Map<string, any>(schedules.map((s) => [s.id, s]));
  const targets: Array<{ id: string; symbol: string }> = [];
  if (options.all) {
    let pool = schedules.filter((s) => (desired === "active" ? s.state !== "active" : s.state === "active"));
    if (options.account) pool = pool.filter((s) => s.account_number === options.account);
    for (const s of pool) targets.push({ id: s.id, symbol: recurringSymbol(s) });
  }
  for (const id of options.id ?? []) {
    if (!targets.some((t) => t.id === id)) {
      const s = byId.get(id);
      targets.push({ id, symbol: s ? recurringSymbol(s) : "?" });
    }
  }
  const verb = desired === "active" ? "resume" : "pause";
  if (targets.length === 0) {
    process.stdout.write(`Nothing to ${verb} (no matching schedules). Use --id <id> or --all.\n`);
    return;
  }
  const results: Array<{ symbol: string; id: string; status: number | string; mode: string }> = [];
  let reasonShown = false;
  for (const t of targets) {
    const { status, dryRun, reason } = await setRecurringState(t.id, desired, options);
    if (dryRun && reason && !reasonShown) {
      process.stderr.write(`${reason}\n`);
      reasonShown = true;
    }
    results.push({ symbol: t.symbol, id: t.id, status, mode: dryRun ? "dry-run" : "live" });
  }
  if (options.json) {
    printJson(results);
  } else {
    printTable(results, ["symbol", "status", "mode", "id"]);
    const ok = results.filter((r) => r.status === 200).length;
    const live = results.filter((r) => r.mode === "live").length;
    process.stdout.write(`${desired === "active" ? "Resumed" : "Paused"}: ${ok}/${results.length} ok (${live} live).\n`);
  }
  if (results.some((r) => r.mode === "live" && r.status !== 200)) process.exitCode = 1;
}

const recurring = new Command("recurring").description("Manage recurring investment schedules (list / resume / pause)");

recurring
  .command("list")
  .description("List recurring buys and their state (live read)")
  .option("--account <num>", "filter by account number")
  .option("--state <state>", "filter by state, e.g. active or paused")
  .option("--json", "emit JSON")
  .action(async (options: { account?: string; state?: string; json?: boolean }) => {
    let rows = await fetchRecurringSchedules();
    if (options.account) rows = rows.filter((r) => r.account_number === options.account);
    if (options.state) rows = rows.filter((r) => r.state === options.state);
    const slim = rows.map((r) => ({
      symbol: recurringSymbol(r),
      state: r.state,
      amount: r.amount?.amount,
      frequency: r.frequency,
      account: r.account_number,
      next: r.next_investment_date ?? "",
      id: r.id
    }));
    if (options.json) {
      printJson(slim);
      return;
    }
    if (slim.length === 0) {
      process.stdout.write("No recurring schedules.\n");
      return;
    }
    printTable(slim, ["symbol", "state", "amount", "frequency", "account", "next", "id"]);
  });

recurring
  .command("resume")
  .description("Resume paused recurring buys. Live write — needs --live-write AND ROBINHOOD_ALLOW_LIVE_WRITE=1 (else dry-run).")
  .option("--id <id>", "schedule id to resume; repeatable", collectId, [])
  .option("--all", "resume ALL currently-paused schedules")
  .option("--account <num>", "limit --all to one account number")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "permit the live write")
  .option("--json", "emit JSON")
  .action(async (options: { id?: string[]; all?: boolean; account?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) =>
    runRecurringSet("active", options)
  );

recurring
  .command("pause")
  .description("Pause active recurring buys. Live write — needs --live-write AND ROBINHOOD_ALLOW_LIVE_WRITE=1 (else dry-run).")
  .option("--id <id>", "schedule id to pause; repeatable", collectId, [])
  .option("--all", "pause ALL currently-active schedules")
  .option("--account <num>", "limit --all to one account number")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "permit the live write")
  .option("--json", "emit JSON")
  .action(async (options: { id?: string[]; all?: boolean; account?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) =>
    runRecurringSet("paused", options)
  );

recurring
  .command("create")
  .description("Create a recurring investment schedule (PROVEN write). Dry-run by default; live needs --live-write AND ROBINHOOD_ALLOW_LIVE_WRITE=1.")
  .requiredOption("--account <account_number>", "account number")
  .requiredOption("--symbol <ticker>", "equity ticker to invest in")
  .requiredOption("--amount <usd>", "dollar amount per cycle")
  .option("--frequency <weekly|biweekly|monthly>", "cadence", "weekly")
  .option("--start-date <YYYY-MM-DD>", "first investment date (default: tomorrow)")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "permit the live write")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; symbol: string; amount: string; frequency?: string; startDate?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (!(Number(opts.amount) > 0)) throw new Error(`--amount must be a positive number (got "${opts.amount}").`);
    const label = await assertOwnedAccount(opts.account);
    const inst = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol: opts.symbol.toUpperCase() })).results?.[0];
    if (!inst) throw new Error(`No instrument for ${opts.symbol} — check the ticker ('brokerage search').`);
    const start = opts.startDate ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const body = {
      account_number: opts.account,
      amount: { amount: Number(opts.amount).toFixed(2), currency_code: "USD" },
      frequency: opts.frequency ?? "weekly",
      investment_asset: { asset_id: inst.id, asset_symbol: inst.symbol, asset_type: "equity" },
      source_of_funds: "buying_power",
      start_date: start,
      ref_id: randomUUID()
    };
    const r = await gatedBrokerageWrite({ url: RECURRING_LIST_URL, method: "POST", body, dryRun: opts.dryRun, liveWrite: opts.liveWrite });
    if (r.dryRun && r.reason) process.stderr.write(`${r.reason}\n`);
    if (opts.json) { printJson({ account: opts.account, accountLabel: label, symbol: inst.symbol, amount: body.amount, frequency: body.frequency, startDate: start, dryRun: r.dryRun, status: r.status, body: r.body }); return; }
    process.stdout.write(`${r.dryRun ? "DRY-RUN" : r.status} create recurring ${inst.symbol} $${body.amount.amount} ${body.frequency} from ${start} acct ${opts.account}${label ? ` (${label})` : ""}\n`);
    if (r.body) process.stdout.write(`${r.body}\n`);
  });

recurring
  .command("edit")
  .description("Edit a recurring schedule's amount and/or frequency (PROVEN write). Dry-run by default.")
  .requiredOption("--id <schedule_id>", "schedule id (from 'recurring list')")
  .option("--amount <usd>", "new dollar amount per cycle")
  .option("--frequency <weekly|biweekly|monthly>", "new cadence")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "permit the live write")
  .option("--json", "emit JSON")
  .action(async (opts: { id: string; amount?: string; frequency?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (!opts.amount && !opts.frequency) throw new Error("Pass --amount and/or --frequency to edit.");
    if (opts.amount && !(Number(opts.amount) > 0)) throw new Error(`--amount must be positive (got "${opts.amount}").`);
    const body: Record<string, unknown> = {};
    if (opts.amount) body.amount = { amount: Number(opts.amount).toFixed(2), currency_code: "USD" };
    if (opts.frequency) body.frequency = opts.frequency;
    const r = await gatedBrokerageWrite({ url: RECURRING_ITEM_URL, method: "PATCH", params: { "0": opts.id }, body, dryRun: opts.dryRun, liveWrite: opts.liveWrite });
    if (r.dryRun && r.reason) process.stderr.write(`${r.reason}\n`);
    if (opts.json) { printJson({ id: opts.id, changes: body, dryRun: r.dryRun, status: r.status, body: r.body }); return; }
    process.stdout.write(`${r.dryRun ? "DRY-RUN" : r.status} edit recurring ${opts.id} ${JSON.stringify(body)}\n`);
    if (r.body) process.stdout.write(`${r.body}\n`);
  });

recurring
  .command("end")
  .description("End/delete a recurring schedule (PATCH state=deleted). Dry-run by default; live needs both gates.")
  .requiredOption("--id <schedule_id>", "schedule id to end")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "permit the live write")
  .option("--json", "emit JSON")
  .action(async (opts: { id: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    const r = await gatedBrokerageWrite({ url: RECURRING_ITEM_URL, method: "PATCH", params: { "0": opts.id }, body: { state: "deleted" }, dryRun: opts.dryRun, liveWrite: opts.liveWrite });
    if (r.dryRun && r.reason) process.stderr.write(`${r.reason}\n`);
    if (opts.json) { printJson({ id: opts.id, dryRun: r.dryRun, status: r.status, body: r.body }); return; }
    process.stdout.write(`${r.dryRun ? "DRY-RUN" : r.status} end recurring ${opts.id}\n`);
    if (r.body) process.stdout.write(`${r.body}\n`);
  });

program.addCommand(recurring);

// --- Account settings: first-class wrappers over the PROVEN settings-write endpoints ---
// (capability map docs/account-settings-capability-map-2026-06-03.md). Every write double-gated.
const DRIP_ACCOUNT_URL = "https://api.robinhood.com/corp_actions/drip/account_settings/{account}/";
const DRIP_INSTRUMENT_URL = "https://api.robinhood.com/corp_actions/drip/instrument_settings/{account}/{instrument_id}/";
const OPTION_SETTINGS_URL = "https://api.robinhood.com/options/option_settings/{account}/";
const MARGIN_SETTINGS_URL = "https://api.robinhood.com/settings/margin/{account}/";
const SWEEP_STATE_URL = "https://api.robinhood.com/accounts/{account}/sweep_enrollment_state/";
const STOCK_LENDING_URL = "https://bonfire.robinhood.com/slip/{account}/status/";

const settings = new Command("settings").description("Read/write account settings: DRIP, trade-on-expiration, PDT protection, cash sweep, stock lending. Writes double-gated.");

settings
  .command("show")
  .description("Read all settings for an account (DRIP, options trade-on-expiration, margin/PDT-protection, cash sweep, stock lending). Live read.")
  .requiredOption("--account <account_number>", "account number")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; json?: boolean }) => {
    const label = await assertOwnedAccount(opts.account);
    const get = async (url: string) => { try { return await brokerageGetJson(url, { account: opts.account }); } catch (e) { return { error: (e as Error).message.slice(0, 60) }; } };
    const [drip, optionSettings, margin, sweep, lending] = await Promise.all([
      get(DRIP_ACCOUNT_URL), get(OPTION_SETTINGS_URL), get(MARGIN_SETTINGS_URL), get(SWEEP_STATE_URL), get(STOCK_LENDING_URL)
    ]);
    const out = {
      account: opts.account, accountLabel: label,
      dripEnabled: drip?.drip_enabled, tradingOnExpiration: optionSettings?.trading_on_expiration_state,
      dayTradesProtection: margin?.day_trades_protection, sweepEnrolled: sweep?.sweep_enrolled, stockLendingEnabled: lending?.is_enabled
    };
    if (opts.json) { printJson(out); return; }
    process.stdout.write(`Settings — ${opts.account}${label ? ` (${label})` : ""}\n`);
    process.stdout.write(`  DRIP (dividend reinvestment): ${out.dripEnabled ?? "—"}\n`);
    process.stdout.write(`  Options trade-on-expiration:  ${out.tradingOnExpiration ?? "—"}\n`);
    process.stdout.write(`  PDT day-trade protection:     ${out.dayTradesProtection ?? "—"}\n`);
    process.stdout.write(`  Cash sweep enrolled:          ${out.sweepEnrolled ?? "—"}\n`);
    process.stdout.write(`  Stock lending enabled:        ${out.stockLendingEnabled ?? "—"}\n`);
  });

const writeFlag = (action: () => Promise<{ status: number | string; dryRun: boolean; reason?: string; body?: string }>, json: boolean | undefined, label: string) => action().then((r) => {
  if (r.dryRun && r.reason) process.stderr.write(`${r.reason}\n`);
  if (json) { printJson({ action: label, dryRun: r.dryRun, status: r.status, body: r.body }); return; }
  process.stdout.write(`${r.dryRun ? "DRY-RUN" : r.status} ${label}\n`);
  if (r.body) process.stdout.write(`${r.body}\n`);
});

settings
  .command("drip")
  .description("Toggle dividend reinvestment (DRIP). Account-wide, or per-stock with --instrument. Double-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--enable", "turn DRIP on")
  .option("--disable", "turn DRIP off")
  .option("--instrument <instrument_id>", "scope to one stock (per-instrument DRIP)")
  .option("--dry-run", "plan only")
  .option("--live-write", "permit live write")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; enable?: boolean; disable?: boolean; instrument?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.enable === opts.disable) throw new Error("Pass exactly one of --enable / --disable.");
    await assertOwnedAccount(opts.account);
    const url = opts.instrument ? DRIP_INSTRUMENT_URL : DRIP_ACCOUNT_URL;
    const params: Record<string, string> = { account: opts.account };
    if (opts.instrument) params.instrument_id = opts.instrument;
    await writeFlag(() => gatedBrokerageWrite({ url, method: "PATCH", params, body: { drip_enabled: Boolean(opts.enable) }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `DRIP ${opts.enable ? "enable" : "disable"}${opts.instrument ? ` (instrument ${opts.instrument})` : " (account-wide)"} ${opts.account}`);
  });

settings
  .command("expiration")
  .description("Toggle 'trade on expiration' for options. Double-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--enable", "enable trading on expiration")
  .option("--disable", "disable trading on expiration")
  .option("--dry-run", "plan only")
  .option("--live-write", "permit live write")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; enable?: boolean; disable?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.enable === opts.disable) throw new Error("Pass exactly one of --enable / --disable.");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: OPTION_SETTINGS_URL, method: "PATCH", params: { account: opts.account }, body: { trading_on_expiration_state: opts.enable ? "enabled" : "disabled" }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `trade-on-expiration ${opts.enable ? "enabled" : "disabled"} ${opts.account}`);
  });

settings
  .command("pdt")
  .description("Toggle PDT (pattern-day-trade) protection. Double-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--on", "enable PDT protection")
  .option("--off", "disable PDT protection")
  .option("--dry-run", "plan only")
  .option("--live-write", "permit live write")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; on?: boolean; off?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.on === opts.off) throw new Error("Pass exactly one of --on / --off.");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: MARGIN_SETTINGS_URL, method: "PUT", params: { account: opts.account }, body: { day_trades_protection: Boolean(opts.on) }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `PDT-protection ${opts.on ? "on" : "off"} ${opts.account}`);
  });

settings
  .command("lending")
  .description("Toggle stock lending (SLIP). Double-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--enable", "enable stock lending")
  .option("--disable", "disable stock lending")
  .option("--dry-run", "plan only")
  .option("--live-write", "permit live write")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; enable?: boolean; disable?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.enable === opts.disable) throw new Error("Pass exactly one of --enable / --disable.");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: STOCK_LENDING_URL, method: "PUT", params: { account: opts.account }, body: { is_enabled: Boolean(opts.enable), was_ever_enabled: true }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `stock-lending ${opts.enable ? "enable" : "disable"} ${opts.account}`);
  });

settings
  .command("sweep")
  .description("Cash sweep enrollment. --disable unenrolls (proven). Enroll requires a separate agreement-sign flow — not automated. Double-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--disable", "unenroll from cash sweep")
  .option("--dry-run", "plan only")
  .option("--live-write", "permit live write")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; disable?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (!opts.disable) throw new Error("Only --disable (unenroll) is automated. Enrolling needs the agreement-sign flow (see capability map).");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: SWEEP_STATE_URL, method: "POST", params: { account: opts.account }, body: { sweep_enrollment_action: "unenroll" }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `cash-sweep unenroll ${opts.account}`);
  });

program.addCommand(settings);

// --- Options: first-class positions performance + chain ---
// Wraps the mapped options routes (aggregate_positions, marketdata/options,
// instruments, chains, options/instruments) into two read-only convenience
// commands so an agent can answer "what's my best option?" and "show me the
// chain for X" without hand-assembling six `brokerage execute` calls. Same
// engine, same map. All reads — no live-write gate needed.
const AGG_POSITIONS_URL = "https://api.robinhood.com/options/aggregate_positions/?account_numbers=";
const MARKETDATA_OPTIONS_URL = "https://api.robinhood.com/marketdata/options/?ids={ids}";
const MARKETDATA_OPTIONS_STRATEGY_QUOTES_URL = "https://api.robinhood.com/marketdata/options/strategy/quotes/";
const INSTRUMENTS_SYMBOL_URL = "https://api.robinhood.com/instruments/?symbol={symbol}";
const OPTIONS_CHAINS_LIST_URL = "https://api.robinhood.com/options/chains/";
const OPTIONS_CHAIN_URL = "https://api.robinhood.com/options/chains/{id}/";
const OPTIONS_INSTRUMENTS_URL =
  "https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}";
const MARKETDATA_QUOTES_URL = "https://api.robinhood.com/marketdata/quotes/?ids={ids}";
const OPTION_INSTRUMENT_URL = "https://api.robinhood.com/options/instruments/{0}/";
const OPTIONS_ORDERS_GET_URL = "https://api.robinhood.com/options/orders/";
const MARKETDATA_FUNDAMENTALS_URL = "https://api.robinhood.com/marketdata/fundamentals/{id}/";
const INSTRUMENT_SHORTING_URL = "https://api.robinhood.com/instruments/{id}/shorting/";
const INSTRUMENT_BUYING_POWER_URL = "https://bonfire.robinhood.com/accounts/{id}/instrument_buying_power/{uuid}/";
const INSTRUMENT_MARGIN_REQUIREMENTS_URL = "https://bonfire.robinhood.com/instruments/{uuid}/margin-requirements/";

// Authenticated GET against a mapped route, with {placeholders} filled from
// params and optional query-string params appended after substitution (for
// filters like ?nonzero=true or ?owner_type=custom that aren't route slots).
// Returns parsed JSON; throws on a missing route, unfilled placeholder, or non-200.
async function brokerageGetJson(
  url: string,
  params: Record<string, string> = {},
  query: Record<string, string> = {}
): Promise<any> {
  const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query: url });
  const route = selectRouteByQueryAndMethod(matches, url, "GET");
  if (!route) throw new Error(`Route missing from map: ${url} — rebuild the map (AGENTS.md §3).`);
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

// Owned-account validation. The #1 money-loss risk is acting on the WRONG account — a typo'd or
// hallucinated account number otherwise templates straight into a live order body. We resolve the
// real account set once (from transfer/accounts/, the COMPLETE graph) and refuse a write to an
// account the token doesn't own. If the lookup itself fails (offline / mid-refresh) we WARN but do
// not hard-block, so a transient read failure can't wedge every write.
let _ownedAccountsCache: { numbers: Set<string>; labels: Map<string, string> } | null = null;
async function loadOwnedAccounts(): Promise<{ numbers: Set<string>; labels: Map<string, string> } | null> {
  if (_ownedAccountsCache) return _ownedAccountsCache;
  try {
    const graph = await brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/");
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
async function assertOwnedAccount(accountNumber: string): Promise<string | undefined> {
  const owned = await loadOwnedAccounts();
  if (!owned) {
    process.stderr.write(`⚠️  Could not verify account ${accountNumber} against your owned accounts (lookup failed). Proceeding — double-check the number.\n`);
    return undefined;
  }
  if (!owned.numbers.has(String(accountNumber))) {
    throw new Error(
      `Account ${accountNumber} is not one of your trading accounts (${[...owned.numbers].map((n) => "…" + n.slice(-4)).join(", ")}). ` +
        `Refusing to act on an unowned/typo'd account.`
    );
  }
  return owned.labels.get(String(accountNumber)) || "";
}

const num = (value: unknown): number => Number(value);
const usd = (value: number): string => (Number.isFinite(value) ? `$${value.toFixed(2)}` : "—");
const pct = (value: number): string => (Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—");
const compactNumber = (value: number): string =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2
      }).format(value)
    : "—";

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

interface OpenOptionPosition {
  symbol: string;
  name: string;
  averageOpenPrice: number;
  quantity: number;
  optionId: string;
}

async function loadOpenOptionPositions(): Promise<OpenOptionPosition[]> {
  const data = await brokerageGetJson(AGG_POSITIONS_URL);
  const results: any[] = Array.isArray(data.results) ? data.results : [];
  const open: OpenOptionPosition[] = [];
  for (const position of results) {
    const quantity = num(position.quantity);
    const optionId = position.legs?.[0]?.option_id;
    if (!(quantity > 0) || !optionId) continue;
    // detail_display_name is like "$50 Call 6/18/27" — it omits the underlying,
    // so prefix the symbol to keep the leaderboard legible (DRAM vs HPE vs …).
    const detail = position.detail_display_name ?? position.strategy;
    open.push({
      symbol: position.symbol,
      name: `${position.symbol} ${detail}`,
      averageOpenPrice: num(position.average_open_price),
      quantity,
      optionId
    });
  }
  return open;
}

// Fetch option marketdata for many instrument ids, chunked to keep URLs bounded.
async function fetchOptionMarks(ids: string[]): Promise<Map<string, any>> {
  const marks = new Map<string, any>();
  const chunkSize = 40;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const data = await brokerageGetJson(MARKETDATA_OPTIONS_URL, { ids: ids.slice(i, i + chunkSize).join(",") });
    for (const row of data.results ?? []) {
      if (row?.instrument_id) marks.set(row.instrument_id, row);
    }
  }
  return marks;
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function optionMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function optionPriceString(value: number): string {
  return Number.isFinite(value) ? optionMoney(value).toFixed(2) : "0.01";
}

function nextBusinessDay(date = new Date()): string {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString().slice(0, 10);
}

function optionInstrumentId(row: any): string | undefined {
  if (row?.id) return String(row.id);
  const match = String(row?.url ?? row?.instrument ?? "").match(/\/options\/instruments\/([^/]+)\/?$/);
  return match?.[1];
}

function sameStrike(left: unknown, right: unknown): boolean {
  const a = finiteNumber(left);
  const b = finiteNumber(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.000001;
}

function strikeForLeg(leg: OptionStrategyLegTemplate, assignments: Record<string, string>): string | undefined {
  const keys = [leg.id, leg.strikeRole, `${leg.id}_strike`, `${leg.strikeRole}_price`, `${leg.strikeRole}_strike`];
  const raw = keys.map((key) => assignments[key]).find((value) => value !== undefined && value !== "");
  return raw?.trim().replace(/^\$/, "").replace(/,/g, "");
}

function expirationForLeg(leg: OptionStrategyLegTemplate, defaultExpiration: string, assignments: Record<string, string>): string {
  const keys = [`${leg.id}_expiration`, `${leg.strikeRole}_expiration`, `${leg.id}_date`, `${leg.strikeRole}_date`];
  const raw = keys.map((key) => assignments[key]).find((value) => value !== undefined && value !== "");
  return raw?.trim() || defaultExpiration;
}

function summarizeAvailableStrikes(instruments: any[]): string {
  const strikes = instruments
    .map((row) => finiteNumber(row?.strike_price))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (strikes.length === 0) return "none";
  const sample = strikes.length <= 20 ? strikes : [...strikes.slice(0, 8), Number.NaN, ...strikes.slice(-8)];
  return sample.map((value) => (Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "...")).join(", ");
}

async function resolveChainIdForAccount(symbol: string, account: string, fallbackChainId: string, warnings: string[]): Promise<string> {
  try {
    const data = await brokerageGetJson(OPTIONS_CHAINS_LIST_URL, {}, { account_number: account, underlying_symbol: symbol });
    const first = Array.isArray(data.results) ? data.results[0] : data;
    const chainId = first?.id ?? first?.chain_id;
    if (chainId) return String(chainId);
    warnings.push("Account-scoped chain lookup returned no chain id; using the underlying instrument tradable_chain_id fallback.");
  } catch (error) {
    warnings.push(`Account-scoped chain lookup failed; using tradable_chain_id fallback. ${(error as Error).message}`);
  }
  return fallbackChainId;
}

async function fetchStrategyQuote(ids: string[], ratios: string[], types: string[], warnings: string[]): Promise<any | undefined> {
  try {
    const data = await brokerageGetJson(MARKETDATA_OPTIONS_STRATEGY_QUOTES_URL, {}, {
      ids: ids.join(","),
      ratios: ratios.join(","),
      types: types.join(","),
      include_all_sessions: "true"
    });
    return Array.isArray(data.results) ? data.results[0] ?? data.results : data;
  } catch (error) {
    warnings.push(`Package strategy quote endpoint did not return a usable quote; leg bid/ask math is still available. ${(error as Error).message}`);
    return undefined;
  }
}

async function resolveExactContractLinkBundle(input: {
  account: string;
  symbol: string;
  expiration: string;
  optionType: "call" | "put";
  side: "buy" | "sell";
  strike: string;
  positionEffect: "open" | "close";
  chainId?: string;
  source?: string;
  farLimitOffset?: number;
}) {
  const symbol = input.symbol.toUpperCase();
  const account = input.account;
  const warnings: string[] = [];
  const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
  if (!instrument) throw new Error(`No equity instrument found for ${symbol}.`);
  const fallbackChainId = instrument.tradable_chain_id;
  if (!fallbackChainId && !input.chainId) throw new Error(`${symbol} has no tradable options chain.`);
  const chainId = input.chainId ?? (await resolveChainIdForAccount(symbol, account, String(fallbackChainId), warnings));
  const expirations: string[] = (await brokerageGetJson(OPTIONS_CHAIN_URL, { id: chainId })).expiration_dates ?? [];
  if (expirations.length > 0 && !expirations.includes(input.expiration)) {
    throw new Error(`${symbol} chain does not list ${input.expiration}. First expirations: ${expirations.slice(0, 12).join(", ")}`);
  }

  const data = await brokerageGetJson(
    OPTIONS_INSTRUMENTS_URL,
    { chain_id: chainId, expiration_dates: input.expiration, type: input.optionType },
    { account_number: account }
  );
  const instruments: any[] = Array.isArray(data.results) ? data.results : [];
  const match = instruments.find((row: any) => sameStrike(row?.strike_price, input.strike));
  if (!match) {
    throw new Error(
      `No ${input.optionType} strike ${input.strike} for ${symbol} ${input.expiration}. Available ${input.optionType} strikes: ${summarizeAvailableStrikes(instruments)}`
    );
  }
  const optionId = optionInstrumentId(match);
  if (!optionId) throw new Error(`Matched ${symbol} ${input.expiration} ${input.strike} ${input.optionType} but could not read option instrument id.`);

  const marks = await fetchOptionMarks([optionId]);
  const mark = marks.get(optionId) ?? {};
  const quoteTypes = [input.side === "sell" ? "short" : "long"];
  const strategyQuote = await fetchStrategyQuote([optionId], ["1"], quoteTypes, warnings);
  const strategyQuoteUrl = new URL(MARKETDATA_OPTIONS_STRATEGY_QUOTES_URL);
  strategyQuoteUrl.searchParams.set("ids", optionId);
  strategyQuoteUrl.searchParams.set("ratios", "1");
  strategyQuoteUrl.searchParams.set("types", quoteTypes[0]);
  strategyQuoteUrl.searchParams.set("include_all_sessions", "true");

  const bundle = buildOptionsContractLinkBundle({
    accountNumber: account,
    symbol,
    expiration: input.expiration,
    optionType: input.optionType,
    side: input.side,
    strike: input.strike,
    positionEffect: input.positionEffect,
    chainId,
    equityInstrumentId: instrument.id,
    underlyingInstrumentId: instrument.id,
    optionInstrumentId: optionId,
    optionInstrumentUrl: `https://api.robinhood.com/options/instruments/${optionId}/`,
    occSymbol: match.chain_symbol ?? match.occ_symbol ?? match.symbol,
    source: input.source,
    farLimitOffset: input.farLimitOffset,
    quote: {
      bid: mark.bid_price,
      ask: mark.ask_price,
      mark: mark.adjusted_mark_price ?? mark.mark_price,
      last: mark.last_trade_price,
      delta: mark.delta,
      gamma: mark.gamma,
      theta: mark.theta,
      vega: mark.vega,
      rho: mark.rho,
      impliedVolatility: mark.implied_volatility,
      volume: mark.volume,
      openInterest: mark.open_interest
    },
    strategyQuoteUrl: strategyQuoteUrl.toString(),
    strategyQuote
  });
  bundle.warnings = [...warnings, ...bundle.warnings];
  bundle.evidence.push({
    source: "live-cli-resolution",
    finding: "Resolved the exact option instrument id through authenticated Robinhood reads before building navigation handoff links."
  });
  return bundle;
}

type SingleLegPricingMode = "natural" | "mid" | "safe-sell-probe" | "safe-buy-probe";

function singleLegLimitFromBundle(bundle: Awaited<ReturnType<typeof resolveExactContractLinkBundle>>, mode: SingleLegPricingMode): number {
  if (mode === "safe-sell-probe") return finiteNumber(bundle.pricingControls.safeSellProbeLimit);
  if (mode === "safe-buy-probe") return finiteNumber(bundle.pricingControls.safeBuyProbeLimit);
  if (mode === "natural") return finiteNumber(bundle.pricingControls.naturalPrice);
  return finiteNumber(bundle.pricingControls.midPrice);
}

function buildSingleLegDryRunOrder(input: {
  account: string;
  optionInstrumentUrl: string;
  side: "buy" | "sell";
  positionEffect: "open" | "close";
  quantity: string;
  timeInForce: string;
  limitPrice: number;
  refId: string;
}) {
  return {
    account: `https://api.robinhood.com/accounts/${input.account}/`,
    direction: input.side === "buy" ? "debit" : "credit",
    legs: [
      {
        side: input.side,
        option: input.optionInstrumentUrl,
        position_effect: input.positionEffect,
        ratio_quantity: 1
      }
    ],
    type: "limit",
    time_in_force: input.timeInForce,
    trigger: "immediate",
    price: optionPriceString(input.limitPrice),
    quantity: input.quantity,
    ref_id: input.refId
  };
}

const options = new Command("options").description("Options analytics: position performance, live chains, and dry-run strategy quotes");

options
  .command("positions")
  .description("Rank your open option positions by return (live read). Premiums and % only — no account totals.")
  .option("--json", "emit JSON")
  .action(async (opts: { json?: boolean }) => {
    const open = await loadOpenOptionPositions();
    if (open.length === 0) {
      process.stdout.write("No open option positions.\n");
      return;
    }
    const marks = await fetchOptionMarks(open.map((position) => position.optionId));
    const rows = open
      .map((position) => {
        const mark = num(marks.get(position.optionId)?.adjusted_mark_price);
        const delta = num(marks.get(position.optionId)?.delta);
        return {
          contract: position.name,
          qty: position.quantity,
          entry: position.averageOpenPrice / 100,
          mark,
          returnPct: optionReturnPct(position.averageOpenPrice, mark),
          delta
        };
      })
      .sort((a, b) => (Number.isFinite(b.returnPct) ? b.returnPct : -Infinity) - (Number.isFinite(a.returnPct) ? a.returnPct : -Infinity));
    if (opts.json) {
      printJson(rows);
      return;
    }
    printTable(
      rows.map((row) => ({
        contract: row.contract,
        qty: row.qty,
        entry: usd(row.entry),
        mark: usd(row.mark),
        return: pct(row.returnPct),
        delta: Number.isFinite(row.delta) ? row.delta.toFixed(2) : "—"
      })),
      ["contract", "qty", "entry", "mark", "return", "delta"]
    );
    const best = rows.find((row) => Number.isFinite(row.returnPct));
    if (best) process.stdout.write(`\nBest performer: ${best.contract} at ${pct(best.returnPct)}.\n`);
  });

options
  .command("chain")
  .description("Print the option chain around the money for a symbol (live read)")
  .argument("<symbol>", "underlying ticker, e.g. MRVL")
  .option("--expiration <date>", "YYYY-MM-DD expiration; default is the nearest")
  .option("--type <type>", "call or put", "call")
  .option("--width <n>", "strikes to show on each side of spot", "8")
  .option("--json", "emit JSON")
  .action(async (symbolArg: string, opts: { expiration?: string; type?: string; width?: string; json?: boolean }) => {
    const symbol = symbolArg.toUpperCase();
    const type = (opts.type ?? "call").toLowerCase() === "put" ? "put" : "call";
    const width = Math.max(0, Number.parseInt(opts.width ?? "8", 10) || 0);

    const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
    if (!instrument) throw new Error(`No equity instrument found for ${symbol}.`);
    const chainId = instrument.tradable_chain_id;
    if (!chainId) throw new Error(`${symbol} has no tradable options chain.`);

    const quote = (await brokerageGetJson(MARKETDATA_QUOTES_URL, { ids: instrument.id })).results?.[0] ?? {};
    const spot = num(quote.last_trade_price ?? quote.adjusted_previous_close);

    const expirations: string[] = (await brokerageGetJson(OPTIONS_CHAIN_URL, { id: chainId })).expiration_dates ?? [];
    if (expirations.length === 0) throw new Error(`${symbol} chain has no listed expirations.`);
    const expiration = opts.expiration && expirations.includes(opts.expiration) ? opts.expiration : expirations[0];

    const instruments: any[] =
      (await brokerageGetJson(OPTIONS_INSTRUMENTS_URL, { chain_id: chainId, expiration_dates: expiration, type })).results ?? [];
    const ladder = instruments
      .map((row) => ({ strike: num(row.strike_price), id: row.id }))
      .filter((row) => Number.isFinite(row.strike) && row.id);
    const near = selectNearStrikes(ladder, spot, width);
    const marks = await fetchOptionMarks(near.map((row) => row.id));

    const rows = near.map((row) => {
      const mark = marks.get(row.id) ?? {};
      return {
        optionInstrumentId: row.id,
        optionInstrumentUrl: `https://api.robinhood.com/options/instruments/${row.id}/`,
        strike: row.strike,
        bid: num(mark.bid_price),
        ask: num(mark.ask_price),
        mark: num(mark.adjusted_mark_price),
        delta: num(mark.delta),
        ivPct: num(mark.implied_volatility) * 100,
        volume: num(mark.volume),
        openInterest: num(mark.open_interest),
        moneyness: classifyMoneyness(row.strike, spot, type)
      };
    });

    if (opts.json) {
      printJson({ symbol, spot, expiration, type, strikes: rows });
      return;
    }
    process.stdout.write(`${symbol} ${type}s — exp ${expiration} — spot ${usd(spot)}\n\n`);
    printTable(
      rows.map((row) => ({
        strike: row.strike.toFixed(2),
        bid: usd(row.bid),
        ask: usd(row.ask),
        mark: usd(row.mark),
        // RH returns literal 0 for absent greeks; delta AND iv both exactly 0 = stale/missing
        // (a real quoted option never has both), so render — rather than a misleading 0.00.
        delta: Number.isFinite(row.delta) && !(row.delta === 0 && row.ivPct === 0) ? row.delta.toFixed(2) : "—",
        iv: Number.isFinite(row.ivPct) && !(row.delta === 0 && row.ivPct === 0) ? `${row.ivPct.toFixed(0)}%` : "—",
        vol: Number.isFinite(row.volume) ? row.volume : "—",
        oi: Number.isFinite(row.openInterest) ? row.openInterest : "—",
        money: row.moneyness
      })),
      ["strike", "bid", "ask", "mark", "delta", "iv", "vol", "oi", "money"]
    );
    if (expirations.length > 1) {
      process.stdout.write(`\nOther expirations: ${expirations.slice(0, 8).join(", ")}${expirations.length > 8 ? " …" : ""}\n`);
    }
  });

options
  .command("enumerate")
  .description("Bulk-enumerate EVERY option contract (strike + option_instrument_id + desktop deep link) for a symbol/expiration. Option UUIDs are random v4 — enumeration is the ONLY way to get them; one call per (chain, expiration, type). This is the canonical UUID-resolution path.")
  .argument("<symbol>", "underlying ticker, e.g. ARKG")
  .option("--expiration <date>", "YYYY-MM-DD; default nearest. Pass 'all' to list every expiration first.")
  .option("--type <call|put|both>", "contract type", "both")
  .option("--quotes", "also fetch bid/ask/mark per contract (extra calls)")
  .option("--account <account_number>", "pin the desktop deep links to an account")
  .option("--json", "emit JSON")
  .action(async (symbolArg: string, opts: { expiration?: string; type?: string; quotes?: boolean; account?: string; json?: boolean }) => {
    const symbol = symbolArg.toUpperCase();
    const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
    if (!instrument) throw new Error(`No equity instrument for ${symbol} — check the ticker via 'brokerage search'.`);
    const chainId = instrument.tradable_chain_id;
    if (!chainId) throw new Error(`${symbol} has no tradable options chain.`);
    const expirations: string[] = (await brokerageGetJson(OPTIONS_CHAIN_URL, { id: chainId })).expiration_dates ?? [];
    if (expirations.length === 0) throw new Error(`${symbol} chain has no listed expirations.`);
    if (opts.expiration === "all") {
      if (opts.json) { printJson({ symbol, chainId, expirations }); return; }
      process.stdout.write(`${symbol} expirations (chain ${chainId}):\n  ${expirations.join("\n  ")}\n`);
      return;
    }
    const expiration = opts.expiration && expirations.includes(opts.expiration) ? opts.expiration : expirations[0];
    const types = opts.type === "call" ? ["call"] : opts.type === "put" ? ["put"] : ["call", "put"];
    const acct = opts.account;
    const contracts: any[] = [];
    for (const type of types) {
      const rows: any[] =
        (await brokerageGetJson(OPTIONS_INSTRUMENTS_URL, { chain_id: chainId, expiration_dates: expiration, type })).results ?? [];
      const marks = opts.quotes ? await fetchOptionMarks(rows.map((r) => r.id)) : new Map();
      for (const row of rows) {
        const m = marks.get(row.id) ?? {};
        contracts.push({
          type,
          strike: num(row.strike_price),
          optionInstrumentId: row.id,
          deepLink: `https://robinhood.com/options/instruments/${row.id}/${acct ? `?account_number=${acct}` : ""}`,
          ...(opts.quotes ? { bid: num(m.bid_price), ask: num(m.ask_price), mark: num(m.adjusted_mark_price) } : {})
        });
      }
    }
    contracts.sort((a, b) => (a.type === b.type ? a.strike - b.strike : a.type < b.type ? -1 : 1));
    if (opts.json) { printJson({ symbol, chainId, expiration, count: contracts.length, contracts }); return; }
    process.stdout.write(`${symbol} — exp ${expiration} — ${contracts.length} contracts (chain ${chainId})\n`);
    for (const c of contracts) {
      const q = opts.quotes ? ` bid ${usd(c.bid)}/ask ${usd(c.ask)}` : "";
      process.stdout.write(`  ${c.type.padEnd(4)} ${c.strike.toFixed(2).padStart(9)}  ${c.optionInstrumentId}${q}\n`);
    }
  });

// --- Owned-option inspection: the "click the contract, read everything" flow ---
// Pulls the full option-detail page surface for ONE contract by its option_instrument_id (uuid):
// metadata + live Greeks/quote + the fill history (bought/sold, price, date, qty) + a rare
// tax-timing note + the exact buy/sell handoff. Mirrors what the web contract page shows.
options
  .command("inspect")
  .description("Inspect ONE owned/known option contract by its UUID: metadata, live Greeks, fill history (bought/sold/price/date/qty), tax-timing note, and the buy/sell handoff. The 'click the contract, read everything, trade from there' flow.")
  .argument("<option_instrument_id>", "the option contract UUID (from 'options enumerate' / 'options holdings')")
  .option("--account <account_number>", "pin the contract link to an account")
  .option("--json", "emit JSON")
  .action(async (optionId: string, opts: { account?: string; json?: boolean }) => {
    const id = optionId.replace(/_L\d+$/i, "").trim(); // tolerate the web _L1 leg suffix
    const meta = await brokerageGetJson(OPTION_INSTRUMENT_URL, { "0": id });
    const mark = (await brokerageGetJson(MARKETDATA_OPTIONS_URL, { ids: id })).results?.[0] ?? {};
    // Fills: pull filled orders on this chain, keep only legs that reference THIS contract.
    let fills: any[] = [];
    if (meta.chain_id) {
      const orders = (await brokerageGetJson(OPTIONS_ORDERS_GET_URL, {}, { chain_ids: meta.chain_id, states: "filled" })).results ?? [];
      for (const o of orders) {
        for (const leg of o.legs ?? []) {
          if (!String(leg.option ?? "").includes(id)) continue;
          for (const ex of leg.executions ?? []) {
            fills.push({ side: leg.side, positionEffect: leg.position_effect, quantity: num(ex.quantity), price: num(ex.price), timestamp: ex.timestamp, orderId: o.id });
          }
        }
      }
      fills.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    }
    // Tax-timing: ONLY flag when a still-open buy is within ~30 days of the 1-year short→long line
    // (or already long-term). Usually silent — holding period rarely matters and shouldn't be raised.
    let taxNote: string | undefined;
    const firstOpen = fills.find((f) => f.positionEffect === "open" && f.side === "buy");
    if (firstOpen?.timestamp) {
      const held = Math.floor((Date.parse("2026-06-04T00:00:00Z") - Date.parse(firstOpen.timestamp)) / 86400000);
      const toLT = 365 - held;
      if (toLT > 0 && toLT <= 30) taxNote = `Held ${held}d — ${toLT}d short of the 1-year long-term capital-gains line (crosses ~${new Date(Date.parse(firstOpen.timestamp) + 366 * 86400000).toISOString().slice(0, 10)}). Closing after that date taxes the gain at long-term rates.`;
    }
    const link = `https://robinhood.com/options/${id}${opts.account ? `?account_number=${opts.account}` : ""}`;
    const out = {
      optionInstrumentId: id,
      symbol: meta.chain_symbol, strike: num(meta.strike_price), type: meta.type, expiration: meta.expiration_date, state: meta.state, chainId: meta.chain_id,
      quote: { bid: num(mark.bid_price), ask: num(mark.ask_price), mark: num(mark.adjusted_mark_price), last: num(mark.last_trade_price), ivPct: num(mark.implied_volatility) * 100 },
      greeks: { delta: num(mark.delta), gamma: num(mark.gamma), theta: num(mark.theta), vega: num(mark.vega), rho: num(mark.rho) },
      openInterest: num(mark.open_interest), volume: num(mark.volume),
      fills, taxNote, link,
      handoff: "Sell-to-close: options/orders/ {side:sell, position_effect:close}. Buy-to-open: {side:buy, position_effect:open}. Dry-run via 'options strategy-quote', live needs both write gates."
    };
    if (opts.json) { printJson(out); return; }
    process.stdout.write(`${out.symbol} $${out.strike.toFixed(2)}${String(out.type)[0].toUpperCase()} exp ${out.expiration} (${out.state})\n`);
    process.stdout.write(`  quote: bid ${usd(out.quote.bid)} / ask ${usd(out.quote.ask)} / mark ${usd(out.quote.mark)} / last ${usd(out.quote.last)} / IV ${Number.isFinite(out.quote.ivPct) ? out.quote.ivPct.toFixed(0) + "%" : "—"}\n`);
    process.stdout.write(`  greeks: Δ ${out.greeks.delta.toFixed(3)} Γ ${out.greeks.gamma.toFixed(4)} Θ ${out.greeks.theta.toFixed(3)} ν ${out.greeks.vega.toFixed(3)} ρ ${out.greeks.rho.toFixed(3)}  | OI ${out.openInterest} vol ${out.volume}\n`);
    if (fills.length) {
      process.stdout.write(`  fills (${fills.length}):\n`);
      for (const f of fills) process.stdout.write(`    ${f.side}/${f.positionEffect} ${f.quantity} @ $${f.price.toFixed(2)}  ${String(f.timestamp).slice(0, 19)}\n`);
    } else process.stdout.write(`  fills: none on this chain\n`);
    if (taxNote) process.stdout.write(`  ⚠️  tax: ${taxNote}\n`);
    process.stdout.write(`  link: ${link}\n`);
  });

// --- All held option contracts across accounts, with UUIDs + links (the enumeration deliverable) ---
options
  .command("holdings")
  .description("List EVERY held option contract across your accounts (or one) with its UUID, strike/expiry, live bid/ask/last, quantity, and contract link. The all-accounts owned-contract map.")
  .option("--account <account_number>", "limit to one account (default: all trading accounts)")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; json?: boolean }) => {
    let accounts: string[];
    if (opts.account) accounts = [opts.account];
    else {
      const owned = await loadOwnedAccounts();
      accounts = owned ? [...owned.numbers] : [];
      if (!owned) throw new Error("Could not list accounts (transfer/accounts lookup failed).");
    }
    const labels = (await loadOwnedAccounts())?.labels ?? new Map();
    const all: any[] = [];
    for (const acct of accounts) {
      const positions = (await brokerageGetJson(AGG_POSITIONS_URL, {}, { account_numbers: acct, nonzero: "true" })).results ?? [];
      const rows = positions.map((p: any) => ({ acct, oid: String((p.legs?.[0]?.option ?? "").split("/options/instruments/")[1] ?? "").replace(/\//g, ""), symbol: p.symbol, qty: num(p.quantity), avg: num(p.average_open_price), strategy: p.strategy }));
      const marks = await fetchOptionMarks(rows.map((r: any) => r.oid).filter(Boolean));
      for (const r of rows) {
        const m = marks.get(r.oid) ?? {};
        all.push({ account: r.acct, accountLabel: labels.get(r.acct) ?? "", symbol: r.symbol, optionInstrumentId: r.oid, qty: r.qty, avgOpen: r.avg, strategy: r.strategy, bid: num(m.bid_price), ask: num(m.ask_price), last: num(m.last_trade_price), link: `https://robinhood.com/options/${r.oid}?account_number=${r.acct}` });
      }
    }
    if (opts.json) { printJson({ count: all.length, holdings: all }); return; }
    let lastAcct = "";
    for (const h of all) {
      if (h.account !== lastAcct) { process.stdout.write(`\n${h.account} (${h.accountLabel}) — ${all.filter((x) => x.account === h.account).length} contracts\n`); lastAcct = h.account; }
      process.stdout.write(`  ${h.symbol.padEnd(6)} qty ${String(h.qty).padStart(3)}  bid ${usd(h.bid)}/ask ${usd(h.ask)}  ${h.optionInstrumentId}\n`);
    }
    process.stdout.write(`\n${all.length} contracts across ${accounts.length} account(s).\n`);
  });

options
  .command("strategy-quote")
  .description("Resolve strategy legs, read live bid/ask/Greeks, and build a dry-run limit order body")
  .argument("<strategyId>", "strategy id, e.g. call-credit-spread or iron-condor")
  .requiredOption("--account <account_number>", "selected Robinhood account_number")
  .requiredOption("--symbol <symbol>", "underlying ticker, e.g. DRAM")
  .requiredOption("--expiration <date>", "YYYY-MM-DD expiration")
  .option("--leg <id=strike>", "leg strike assignment; repeatable, e.g. --leg short_call=100", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--param <name=value>", "extra dry-run order template parameter; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--quantity <n>", "strategy contract quantity", "1")
  .option("--time-in-force <tif>", "Robinhood time_in_force", "gfd")
  .option("--pricing-mode <mode>", "natural, mid, safe-sell-probe, or safe-buy-probe", "mid")
  .option("--limit-price <price>", "override computed limit price in the dry-run body")
  .option("--ref-id <uuid>", "ref_id for the dry-run body; default random UUID")
  .option("--json", "emit JSON")
  .action(
    async (
      strategyId: string,
      opts: {
        account: string;
        symbol: string;
        expiration: string;
        leg?: string[];
        param?: string[];
        quantity?: string;
        timeInForce?: string;
        pricingMode?: OptionsStrategyPricingMode;
        limitPrice?: string;
        refId?: string;
        json?: boolean;
      }
    ) => {
      const workflow = loadOptionsStrategyWorkflows().find((candidate) => candidate.id === strategyId);
      if (!workflow) throw new Error(`No options strategy workflow matched id: ${strategyId}`);
      if (workflow.legs.some((leg) => leg.optionType === "stock")) {
        throw new Error(`${workflow.id} includes a stock leg; strategy-quote currently resolves option legs only.`);
      }

      const symbol = opts.symbol.toUpperCase();
      const account = opts.account;
      const expiration = opts.expiration;
      const quantity = opts.quantity ?? "1";
      const timeInForce = opts.timeInForce ?? "gfd";
      const refId = opts.refId ?? randomUUID();
      const templateParams = parseParamAssignments(opts.param);
      const legAssignments = { ...templateParams, ...parseParamAssignments(opts.leg) };
      const warnings: string[] = [];

      const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
      if (!instrument) throw new Error(`No equity instrument found for ${symbol}.`);
      const fallbackChainId = instrument.tradable_chain_id;
      if (!fallbackChainId) throw new Error(`${symbol} has no tradable options chain.`);
      const chainId = await resolveChainIdForAccount(symbol, account, String(fallbackChainId), warnings);
      const expirations: string[] = (await brokerageGetJson(OPTIONS_CHAIN_URL, { id: chainId })).expiration_dates ?? [];
      if (expirations.length > 0 && !expirations.includes(expiration)) {
        throw new Error(`${symbol} chain does not list ${expiration}. First expirations: ${expirations.slice(0, 12).join(", ")}`);
      }

      const instrumentsByExpirationAndType = new Map<string, any[]>();
      const legExpirations = new Map<string, string>();
      for (const leg of workflow.legs) {
        legExpirations.set(leg.id, expirationForLeg(leg, expiration, legAssignments));
      }
      const missingExpirations = [...new Set([...legExpirations.values()])].filter((date) => expirations.length > 0 && !expirations.includes(date));
      if (missingExpirations.length > 0) {
        throw new Error(`${symbol} chain does not list requested leg expiration(s): ${missingExpirations.join(", ")}. First expirations: ${expirations.slice(0, 12).join(", ")}`);
      }
      const neededExpirationTypes = [
        ...new Set(
          workflow.legs
            .filter((leg) => leg.optionType !== "stock")
            .map((leg) => `${legExpirations.get(leg.id) ?? expiration}|${leg.optionType}`)
        )
      ];
      for (const key of neededExpirationTypes) {
        const [legExpiration, type] = key.split("|") as [string, "call" | "put"];
        const data = await brokerageGetJson(
          OPTIONS_INSTRUMENTS_URL,
          { chain_id: chainId, expiration_dates: legExpiration, type },
          { account_number: account }
        );
        instrumentsByExpirationAndType.set(key, Array.isArray(data.results) ? data.results : []);
      }

      const resolvedLegs = workflow.legs.map((leg) => {
        const strike = strikeForLeg(leg, legAssignments);
        const legExpiration = legExpirations.get(leg.id) ?? expiration;
        if (!strike) {
          throw new Error(
            `Missing strike for ${leg.id}. Use --leg ${leg.id}=<strike> or --leg ${leg.strikeRole}=<strike>.`
          );
        }
        const instruments = instrumentsByExpirationAndType.get(`${legExpiration}|${leg.optionType}`) ?? [];
        const match = instruments.find((row) => sameStrike(row?.strike_price, strike));
        if (!match) {
          throw new Error(
            `No ${leg.optionType} strike ${strike} for ${symbol} ${legExpiration}. Available ${leg.optionType} strikes: ${summarizeAvailableStrikes(instruments)}`
          );
        }
        const id = optionInstrumentId(match);
        if (!id) throw new Error(`Matched ${leg.id} but could not read its option instrument id.`);
        return {
          template: leg,
          strike,
          expiration: legExpiration,
          optionInstrumentId: id,
          optionInstrumentUrl: `https://api.robinhood.com/options/instruments/${id}/`
        };
      });

      const ids = resolvedLegs.map((leg) => leg.optionInstrumentId);
      const marks = await fetchOptionMarks(ids);
      const pricingLegs = resolvedLegs.map((leg) => {
        const mark = marks.get(leg.optionInstrumentId) ?? {};
        return {
          id: leg.template.id,
          action: leg.template.action,
          ratioQuantity: leg.template.ratioQuantity,
          bid: mark.bid_price,
          ask: mark.ask_price,
          mark: mark.adjusted_mark_price ?? mark.mark_price,
          last: mark.last_trade_price,
          delta: mark.delta,
          gamma: mark.gamma,
          theta: mark.theta,
          vega: mark.vega,
          rho: mark.rho
        };
      });
      const preferredDirection = (workflow.orderTemplate as any)?.direction === "credit" ? "credit" : (workflow.orderTemplate as any)?.direction === "debit" ? "debit" : undefined;
      const pricing = buildOptionsStrategyPricingSummary({
        legs: pricingLegs,
        mode: opts.pricingMode ?? "mid",
        preferredDirection
      });
      const computedLimitPrice = finiteNumber(opts.limitPrice ?? pricing.limitPrice);
      if (!Number.isFinite(computedLimitPrice) || computedLimitPrice < 0) {
        throw new Error(
          `Could not compute a usable limit price. ${pricing.warnings.length > 0 ? pricing.warnings.join(" ") : "No bid/ask/mark/last quote was available."}`
        );
      }

      const ratios = resolvedLegs.map((leg) => String(leg.template.ratioQuantity));
      const quoteTypes = resolvedLegs.map((leg) => (leg.template.action === "sell" ? "short" : "long"));
      const orderSides = resolvedLegs.map((leg) => leg.template.action);
      const strategyQuote = await fetchStrategyQuote(ids, ratios, quoteTypes, warnings);
      const strategyQuoteUrl = new URL(MARKETDATA_OPTIONS_STRATEGY_QUOTES_URL);
      strategyQuoteUrl.searchParams.set("ids", ids.join(","));
      strategyQuoteUrl.searchParams.set("ratios", ratios.join(","));
      strategyQuoteUrl.searchParams.set("types", quoteTypes.join(","));
      strategyQuoteUrl.searchParams.set("include_all_sessions", "true");

      const orderParams: Record<string, string> = {
        ...templateParams,
        account_number: account,
        symbol,
        chain_id: chainId,
        expiration,
        leg_expirations: resolvedLegs.map((leg) => `${leg.template.id}:${leg.expiration}`).join(","),
        strategy_legs: resolvedLegs.map((leg) => `${leg.template.action}:${leg.template.ratioQuantity}:${leg.optionInstrumentId}`).join(","),
        strategy_ids: ids.join(","),
        ratios: ratios.join(","),
        types: quoteTypes.join(","),
        order_sides: orderSides.join(","),
        roll_direction: pricing.direction,
        limit_price: computedLimitPrice.toFixed(2),
        quantity,
        time_in_force: timeInForce,
        ref_id: refId
      };
      for (const leg of resolvedLegs) {
        if (leg.template.optionPlaceholder) orderParams[leg.template.optionPlaceholder] = leg.optionInstrumentId;
        orderParams[`${leg.template.id}_option_id`] = leg.optionInstrumentId;
        orderParams[leg.template.id] = leg.strike;
        orderParams[leg.template.strikeRole] = leg.strike;
        orderParams[`${leg.template.id}_expiration`] = leg.expiration;
        orderParams[`${leg.template.strikeRole}_expiration`] = leg.expiration;
      }
      const orderPlan = buildOptionsStrategyOrderPlan(workflow, orderParams);
      const allWarnings = [...warnings, ...pricing.warnings, ...orderPlan.warnings];
      const output = {
        mode: "dry_run",
        sent: false,
        strategy: {
          id: workflow.id,
          title: workflow.title,
          direction: pricing.direction,
          definedRisk: workflow.definedRisk,
          aggressiveness: workflow.aggressiveness
        },
        accountContext: { accountNumber: account, symbol, chainId, expiration, legExpirations: Object.fromEntries(resolvedLegs.map((leg) => [leg.template.id, leg.expiration])) },
        resolvedLegs: resolvedLegs.map((leg, index) => ({
          id: leg.template.id,
          action: leg.template.action,
          optionType: leg.template.optionType,
          strike: finiteNumber(leg.strike),
          expiration: leg.expiration,
          ratioQuantity: leg.template.ratioQuantity,
          positionEffect: leg.template.positionEffect,
          optionInstrumentId: leg.optionInstrumentId,
          optionInstrumentUrl: leg.optionInstrumentUrl,
          greeks: {
            delta: finiteNumber(pricingLegs[index]?.delta),
            gamma: finiteNumber(pricingLegs[index]?.gamma),
            theta: finiteNumber(pricingLegs[index]?.theta),
            vega: finiteNumber(pricingLegs[index]?.vega),
            rho: finiteNumber(pricingLegs[index]?.rho)
          },
          quote: pricing.legs[index]
        })),
        strategyQuoteUrl: strategyQuoteUrl.toString(),
        strategyQuote,
        pricing: {
          ...pricing,
          limitPrice: computedLimitPrice,
          limitPriceSource: opts.limitPrice ? "override" : opts.pricingMode ?? "mid"
        },
        order: orderPlan.order,
        missingParams: orderPlan.missingParams,
        reviewContract: orderPlan.reviewContract,
        warnings: allWarnings
      };

      if (opts.json) {
        printJson(output);
        return;
      }
      process.stdout.write(`${workflow.title} (${workflow.id}) — dry-run only\n`);
      process.stdout.write(`account: ${account}  symbol: ${symbol}  expiration: ${expiration}  direction: ${pricing.direction}\n\n`);
      printTable(
        output.resolvedLegs.map((leg) => ({
          leg: leg.id,
          side: leg.action,
          type: leg.optionType,
          strike: Number.isFinite(leg.strike) ? leg.strike.toFixed(2) : String(leg.strike),
          exp: leg.expiration,
          bid: usd(leg.quote.bid),
          ask: usd(leg.quote.ask),
          mark: usd(leg.quote.mark),
          natural: usd(leg.quote.naturalUnitPrice),
          mid: usd(leg.quote.midUnitPrice),
          delta: Number.isFinite(leg.greeks.delta) ? leg.greeks.delta.toFixed(2) : "—"
        })),
        ["leg", "side", "type", "strike", "exp", "bid", "ask", "mark", "natural", "mid", "delta"]
      );
      process.stdout.write(
        `\nnet natural: ${pricing.direction === "credit" ? "credit" : "debit"} ${usd(pricing.naturalPrice)}  ` +
          `net mid: ${usd(pricing.midPrice)}  limit: ${usd(computedLimitPrice)} (${output.pricing.limitPriceSource})\n`
      );
      process.stdout.write(`strategy quote: ${strategyQuote ? "returned" : "not returned; using leg math"}\n`);
      process.stdout.write(`\norder body (not sent):\n${JSON.stringify(orderPlan.order, null, 2)}\n`);
      for (const warning of allWarnings) process.stderr.write(`warning: ${warning}\n`);
      if (orderPlan.missingParams.length > 0) process.stderr.write(`missing params: ${orderPlan.missingParams.join(", ")}\n`);
    }
  );

options
  .command("roll-plan")
  .description("Resolve a close leg and later open leg, quote both from live bid/ask, and emit dry-run roll orders")
  .requiredOption("--account <account_number>", "selected Robinhood account_number")
  .requiredOption("--symbol <symbol>", "underlying ticker, e.g. DRAM")
  .requiredOption("--type <call|put>", "option type to roll")
  .requiredOption("--close-expiration <date>", "expiration date for the leg being closed")
  .requiredOption("--close-strike <strike>", "strike for the leg being closed")
  .requiredOption("--open-expiration <date>", "expiration date for the replacement leg")
  .requiredOption("--open-strike <strike>", "strike for the replacement leg")
  .option("--close-side <buy|sell>", "side for the close leg", "sell")
  .option("--open-side <buy|sell>", "side for the open leg", "buy")
  .option("--close-pricing-mode <mode>", "natural, mid, safe-sell-probe, or safe-buy-probe", "safe-sell-probe")
  .option("--open-pricing-mode <mode>", "natural, mid, safe-sell-probe, or safe-buy-probe", "mid")
  .option("--quantity <n>", "strategy contract quantity", "1")
  .option("--time-in-force <tif>", "Robinhood time_in_force", "gfd")
  .option("--cash-account", "stage the open leg for the next business day after rechecking settled cash")
  .option("--json", "emit JSON")
  .action(
    async (opts: {
      account: string;
      symbol: string;
      type: "call" | "put";
      closeExpiration: string;
      closeStrike: string;
      openExpiration: string;
      openStrike: string;
      closeSide?: "buy" | "sell";
      openSide?: "buy" | "sell";
      closePricingMode?: SingleLegPricingMode;
      openPricingMode?: SingleLegPricingMode;
      quantity?: string;
      timeInForce?: string;
      cashAccount?: boolean;
      json?: boolean;
    }) => {
      const symbol = opts.symbol.toUpperCase();
      const optionType = opts.type === "put" ? "put" : "call";
      const closeSide = opts.closeSide === "buy" ? "buy" : "sell";
      const openSide = opts.openSide === "sell" ? "sell" : "buy";
      const closePricingMode = opts.closePricingMode ?? "safe-sell-probe";
      const openPricingMode = opts.openPricingMode ?? "mid";
      const quantity = opts.quantity ?? "1";
      const timeInForce = opts.timeInForce ?? "gfd";
      const closeBundle = await resolveExactContractLinkBundle({
        account: opts.account,
        symbol,
        expiration: opts.closeExpiration,
        optionType,
        side: closeSide,
        strike: opts.closeStrike,
        positionEffect: "close",
        source: "robinhood-cli-roll-close"
      });
      const openBundle = await resolveExactContractLinkBundle({
        account: opts.account,
        symbol,
        expiration: opts.openExpiration,
        optionType,
        side: openSide,
        strike: opts.openStrike,
        positionEffect: "open",
        source: "robinhood-cli-roll-open"
      });
      const closeLimit = singleLegLimitFromBundle(closeBundle, closePricingMode);
      const openLimit = singleLegLimitFromBundle(openBundle, openPricingMode);
      if (!Number.isFinite(closeLimit)) throw new Error(`Could not compute close-leg limit from ${closePricingMode}.`);
      if (!Number.isFinite(openLimit)) throw new Error(`Could not compute open-leg limit from ${openPricingMode}.`);
      const closeOptionUrl = closeBundle.resolvedContract?.optionInstrumentUrl;
      const openOptionUrl = openBundle.resolvedContract?.optionInstrumentUrl;
      if (!closeOptionUrl || !openOptionUrl) throw new Error("Roll resolution did not return both option instrument URLs.");
      const closeOrder = buildSingleLegDryRunOrder({
        account: opts.account,
        optionInstrumentUrl: closeOptionUrl,
        side: closeSide,
        positionEffect: "close",
        quantity,
        timeInForce,
        limitPrice: closeLimit,
        refId: randomUUID()
      });
      const openOrder = buildSingleLegDryRunOrder({
        account: opts.account,
        optionInstrumentUrl: openOptionUrl,
        side: openSide,
        positionEffect: "open",
        quantity,
        timeInForce,
        limitPrice: openLimit,
        refId: randomUUID()
      });
      const closeCredit = closeSide === "sell" ? closeLimit : -closeLimit;
      const openCredit = openSide === "sell" ? openLimit : -openLimit;
      const net = optionMoney(closeCredit + openCredit);
      const output = {
        mode: "dry_run",
        sent: false,
        strategy: {
          id: opts.cashAccount ? "kosher-roll" : "manual-two-leg-roll",
          title: opts.cashAccount ? "Cash-account delayed option roll" : "Manual option roll",
          optionType,
          direction: net >= 0 ? "credit" : "debit"
        },
        accountContext: {
          accountNumber: opts.account,
          symbol,
          closeExpiration: opts.closeExpiration,
          openExpiration: opts.openExpiration
        },
        closeLeg: {
          side: closeSide,
          positionEffect: "close",
          strike: finiteNumber(opts.closeStrike),
          expiration: opts.closeExpiration,
          pricingMode: closePricingMode,
          limitPrice: optionMoney(closeLimit),
          bundle: closeBundle
        },
        openLeg: {
          side: openSide,
          positionEffect: "open",
          strike: finiteNumber(opts.openStrike),
          expiration: opts.openExpiration,
          pricingMode: openPricingMode,
          limitPrice: optionMoney(openLimit),
          bundle: openBundle
        },
        net: {
          estimatedLimitNet: net,
          direction: net >= 0 ? "credit" : "debit",
          note: "Computed from selected dry-run limit controls, not a fill guarantee."
        },
        orders: {
          closeOrder,
          openOrder: opts.cashAccount
            ? {
                ...openOrder,
                notBeforeDate: nextBusinessDay(),
                requiresFreshChecks: [
                  "settled cash or option buying power after the close leg",
                  "fresh bid/ask/mark/Greeks for the open leg",
                  "same account_number and intended symbol/expiration/strike"
                ]
              }
            : openOrder
        },
        warnings: [
          "Dry-run only; no close or open order was sent.",
          "For cash accounts, do not assume sell proceeds are settled for the open leg on the same day.",
          "Requote before any live order. A far safe-sell-probe limit is intentionally away from the market."
        ]
      };
      if (opts.json) {
        printJson(output);
        return;
      }
      process.stdout.write(`${output.strategy.title} (${output.strategy.id}) — dry-run only\n`);
      process.stdout.write(
        `close: ${closeSide} ${symbol} ${opts.closeExpiration} ${opts.closeStrike} ${optionType} @ ${usd(closeLimit)} (${closePricingMode})\n`
      );
      process.stdout.write(
        `open:  ${openSide} ${symbol} ${opts.openExpiration} ${opts.openStrike} ${optionType} @ ${usd(openLimit)} (${openPricingMode})\n`
      );
      process.stdout.write(`net: ${output.net.direction} ${usd(Math.abs(net))}\n`);
      if (opts.cashAccount) process.stdout.write(`cash-account open leg not before: ${(output.orders.openOrder as any).notBeforeDate}\n`);
      process.stdout.write(`\nclose order (not sent):\n${JSON.stringify(closeOrder, null, 2)}\n`);
      process.stdout.write(`\nopen order (not sent):\n${JSON.stringify(output.orders.openOrder, null, 2)}\n`);
      for (const warning of output.warnings) process.stderr.write(`warning: ${warning}\n`);
    }
  );

options
  .command("expirations")
  .description("List the available option expiration dates for a symbol (live read)")
  .argument("<symbol>", "underlying ticker, e.g. MRVL")
  .option("--json", "emit JSON")
  .action(async (symbolArg: string, opts: { json?: boolean }) => {
    const symbol = symbolArg.toUpperCase();
    const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
    if (!instrument) throw new Error(`No equity instrument found for ${symbol}.`);
    const chainId = instrument.tradable_chain_id;
    if (!chainId) throw new Error(`${symbol} has no tradable options chain.`);
    const expirations: string[] = (await brokerageGetJson(OPTIONS_CHAIN_URL, { id: chainId })).expiration_dates ?? [];
    if (opts.json) {
      printJson({ symbol, expirations });
      return;
    }
    if (expirations.length === 0) {
      process.stdout.write(`${symbol} has no listed expirations.\n`);
      return;
    }
    process.stdout.write(`${symbol} — ${expirations.length} expirations:\n${expirations.join("\n")}\n`);
  });

program.addCommand(options);

// --- Quote / positions / watchlist: read-only convenience commands ---
// Same engine + map as everything else. Like `options`, these print prices and
// percentages but never a summed account/position dollar total, so output stays
// safe to screenshot.
const POSITIONS_URL = "https://api.robinhood.com/positions/";
const DISCOVERY_LISTS_URL = "https://api.robinhood.com/discovery/lists/";

// Batch instrument-id -> quote lookup, chunked to keep URLs bounded.
async function fetchQuotes(instrumentIds: string[]): Promise<Map<string, any>> {
  const quotes = new Map<string, any>();
  const chunkSize = 40;
  for (let i = 0; i < instrumentIds.length; i += chunkSize) {
    const data = await brokerageGetJson(MARKETDATA_QUOTES_URL, { ids: instrumentIds.slice(i, i + chunkSize).join(",") });
    for (const row of data.results ?? []) {
      if (row?.instrument_id) quotes.set(row.instrument_id, row);
    }
  }
  return quotes;
}

const quoteLast = (quote: any): number => num(quote?.last_trade_price ?? quote?.last_extended_hours_trade_price);

program
  .command("quote")
  .description("Live quote for one or more symbols (last, day change, bid/ask). Read.")
  .argument("<symbols...>", "one or more tickers, e.g. MRVL NVDA AAPL")
  .option("--json", "emit JSON")
  .action(async (symbols: string[], opts: { json?: boolean }) => {
    const resolved = await Promise.all(
      symbols.map(async (raw) => {
        const symbol = raw.toUpperCase();
        const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
        return instrument ? { symbol, instrumentId: instrument.id, name: instrument.simple_name ?? instrument.name } : { symbol, instrumentId: undefined, name: undefined };
      })
    );
    const ids = resolved.map((entry) => entry.instrumentId).filter((id): id is string => Boolean(id));
    const quotes = await fetchQuotes(ids);
    const rows = resolved.map((entry) => {
      const quote = entry.instrumentId ? quotes.get(entry.instrumentId) : undefined;
      const last = quoteLast(quote);
      const prevClose = num(quote?.previous_close ?? quote?.adjusted_previous_close);
      return {
        symbol: entry.symbol,
        last,
        dayPct: percentChange(prevClose, last),
        bid: num(quote?.bid_price),
        ask: num(quote?.ask_price),
        found: Boolean(quote)
      };
    });
    if (opts.json) {
      printJson(rows);
      return;
    }
    printTable(
      rows.map((row) => ({
        symbol: row.symbol,
        last: row.found ? usd(row.last) : "not found",
        day: pct(row.dayPct),
        bid: usd(row.bid),
        ask: usd(row.ask)
      })),
      ["symbol", "last", "day", "bid", "ask"]
    );
  });

// Account-aware capability reader: lists every account and annotates what each
// account TYPE can and cannot do, so an agent states constraints (e.g. a cash
// account cannot roll on margin) before planning a write. Read-only.
function accountCapabilities(account: Record<string, any>): {
  canMarginBorrow: boolean;
  canRollOnMargin: boolean;
  canNakedShort: boolean;
  note: string;
} {
  const type = String(account?.type ?? "").toLowerCase();
  const brokType = String(account?.brokerage_account_type ?? "").toLowerCase();
  const isIra = brokType.includes("ira") || brokType.includes("roth") || type.includes("ira") || type.includes("roth");
  const isMargin = type === "margin" && !isIra;
  const isCash = type === "cash" || (!isMargin && !isIra);
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
      note: "Margin: can borrow, roll, and run spreads/shorts that need buying power. Watch the PDT rule (<$25k equity -> <=3 day trades/5 sessions) and maintenance margin."
    };
  }
  return {
    canMarginBorrow: false,
    canRollOnMargin: false,
    canNakedShort: false,
    note: "Cash: buy/sell, cash-secured puts, covered calls, and debit spreads only. No margin borrowing, no naked/undefined-risk shorts, and no margin rolls — rolling is limited to closing then re-opening with SETTLED cash (T+1; watch good-faith violations)."
  };
}

program
  .command("accounts")
  .description("List all accounts with type and account-aware capabilities (cash vs margin vs IRA). Read.")
  .option("--json", "emit JSON")
  .action(async (opts: { json?: boolean }) => {
    // transfer/accounts is the COMPLETE account graph (the plain accounts/ endpoint
    // under-reports); accounts/?default_to_all_accounts=true carries the real
    // cash/margin type for the accounts it returns. Merge both, and mark any
    // account whose type the API does not return as unverified (conservative).
    const graph = await brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/");
    const graphRows: Record<string, any>[] = Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? (graph as any) : [];
    const typed = await tryBrokerageGetJson("https://api.robinhood.com/accounts/?default_to_all_accounts=true");
    const typedRows: Record<string, any>[] = typed.ok && Array.isArray((typed.data as any)?.results) ? (typed.data as any).results : [];
    const typeByNum = new Map<string, Record<string, any>>();
    for (const a of typedRows) if (a?.account_number) typeByNum.set(String(a.account_number), a);

    const brokerage = graphRows.filter((r) => {
      const t = String(r?.type ?? "").toLowerCase();
      return !r?.is_external && t !== "ach" && Boolean(r?.account_number);
    });
    const rows = brokerage.map((g) => {
      const num = String(g.account_number);
      const transferType = String(g?.type ?? "").toLowerCase(); // rhs | ira_roth | ...
      const isIra = transferType.includes("ira") || transferType.includes("roth");
      const detail = typeByNum.get(num) ?? {};
      const realType = String(detail.type ?? "").toLowerCase(); // cash | margin (when present)
      const verified = isIra || realType === "cash" || realType === "margin";
      const acct: Record<string, any> = { ...detail };
      if (isIra) acct.brokerage_account_type = "ira_roth";
      const caps = accountCapabilities(acct);
      const cls = isIra ? "ira" : realType || "unverified";
      return {
        accountNumber: num,
        class: cls,
        verified,
        nickname: g.account_name ?? g.display_title,
        portfolioCash: detail.portfolio_cash,
        buyingPower: detail.buying_power,
        canMarginBorrow: verified ? caps.canMarginBorrow : false,
        canRollOnMargin: verified ? caps.canRollOnMargin : false,
        canNakedShort: verified ? caps.canNakedShort : false,
        capabilityNote: verified
          ? caps.note
          : "Type not returned by the accounts endpoint — treat conservatively (no margin/roll/naked) until verified via the web UI or accounts/?default_to_all_accounts=true."
      };
    });
    if (opts.json) {
      printJson(rows);
      return;
    }
    printTable(
      rows.map((row) => ({
        account: row.accountNumber,
        class: row.class,
        cash: usd(num(row.portfolioCash)),
        margin: row.canMarginBorrow ? "yes" : "no",
        roll: row.canRollOnMargin ? "yes" : "no",
        naked: row.canNakedShort ? "yes" : "no"
      })),
      ["account", "class", "cash", "margin", "roll", "naked"]
    );
    for (const row of rows) process.stdout.write(`\n${row.accountNumber} (${row.class}): ${row.capabilityNote}\n`);
  });

// Unified account history: /account/history in the web app aggregates several
// sources client-side (there is no single transactions endpoint). This command
// merges equity orders, options orders, crypto orders, and ACH transfers into one
// time-sorted, date-filtered view. Read-only.
program
  .command("history")
  .description("Unified transaction history (equity + options + crypto orders + ACH transfers), newest first. Read.")
  .option("--days <n>", "include the last N days (default 3)", "3")
  .option("--account <account_number>", "filter equity/options to one account")
  .option("--json", "emit JSON")
  .action(async (opts: { days?: string; account?: string; json?: boolean }) => {
    const days = Math.max(1, Number(opts.days ?? "3"));
    const cutoffMs = Date.now() - days * 86400000;
    const inWindow = (ts: unknown): boolean => {
      const t = Date.parse(String(ts ?? ""));
      return Number.isFinite(t) && t >= cutoffMs;
    };
    const events: Array<{ time: string; kind: string; summary: string; state: string }> = [];
    const acctQuery = opts.account ? `?account_numbers=${encodeURIComponent(opts.account)}` : "";

    const eq = await tryBrokerageGetJson(`https://api.robinhood.com/orders/${opts.account ? `?account_number=${encodeURIComponent(opts.account)}` : ""}`);
    if (eq.ok) for (const r of ((eq.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "equity", summary: `${r.side ?? "?"} ${r.quantity ?? "?"} @ ${r.average_price ?? r.price ?? "?"}`, state: String(r.state ?? "?") });
    }
    const op = await tryBrokerageGetJson(`https://api.robinhood.com/options/orders/${acctQuery}`);
    if (op.ok) for (const r of ((op.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "option", summary: `${r.chain_symbol ?? "?"} ${r.opening_strategy ?? r.closing_strategy ?? ""} ${r.direction ? `(${r.direction})` : ""} ${r.quantity ?? ""} @ ${r.price ?? "?"}`.trim(), state: String(r.state ?? "?") });
    }
    const cx = await tryBrokerageGetJson("https://nummus.robinhood.com/orders/");
    if (cx.ok) for (const r of ((cx.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "crypto", summary: `${r.side ?? "?"} ${r.quantity ?? "?"} @ ${r.average_price ?? r.price ?? "?"}`, state: String(r.state ?? "?") });
    }
    const ach = await tryBrokerageGetJson("https://api.robinhood.com/ach/transfers/");
    if (ach.ok) for (const r of ((ach.data as any)?.results ?? [])) {
      const t = r.updated_at ?? r.created_at;
      if (inWindow(t)) events.push({ time: String(t), kind: "transfer", summary: `${r.direction ?? "?"} ${r.amount ?? "?"}`, state: String(r.state ?? "?") });
    }
    events.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    if (opts.json) { printJson(events); return; }
    if (events.length === 0) { process.stdout.write(`No transactions in the last ${days} day(s).\n`); return; }
    printTable(
      events.map((e) => ({ when: e.time.slice(0, 19).replace("T", " "), type: e.kind, state: e.state, detail: e.summary })),
      ["when", "type", "state", "detail"]
    );
    process.stdout.write(`\n${events.length} transaction(s) in the last ${days} day(s).\n`);
  });

const stock = new Command("stock").description("Stock/ETF detail reads from Robinhood stock pages");

stock
  .command("profile")
  .description("Read stock-page quote, description, fundamentals, shorting/borrow, and optional account context")
  .argument("<symbol>", "ticker, e.g. DRAM")
  .option("--account <account_number>", "include account-scoped buying power and margin reads")
  .option("--json", "emit JSON")
  .action(async (symbolArg: string, opts: { account?: string; json?: boolean }) => {
    const symbol = symbolArg.toUpperCase();
    const instrument = (await brokerageGetJson(INSTRUMENTS_SYMBOL_URL, { symbol })).results?.[0];
    if (!instrument) throw new Error(`No equity instrument found for ${symbol}.`);
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
    if (opts.account) {
      const buyingPower = await tryBrokerageGetJson(INSTRUMENT_BUYING_POWER_URL, { id: opts.account, uuid: instrumentId });
      if (buyingPower.ok) accountReads.instrumentBuyingPower = buyingPower.data;
      else accountWarnings.push(`instrument buying power unavailable: ${buyingPower.error}`);
      const margin = await tryBrokerageGetJson(INSTRUMENT_MARGIN_REQUIREMENTS_URL, { uuid: instrumentId }, { account_number: opts.account });
      if (margin.ok) accountReads.marginRequirements = margin.data;
      else accountWarnings.push(`margin requirements unavailable: ${margin.error}`);
    }

    const last = quoteLast(quote);
    const previousClose = num(quote.previous_close ?? quote.adjusted_previous_close);
    const output = {
      symbol,
      name: instrument.simple_name ?? instrument.name,
      instrumentId,
      instrumentUrl: instrument.url,
      stockPageUrl: `https://robinhood.com/stocks/${symbol}${opts.account ? `?account_number=${encodeURIComponent(opts.account)}` : ""}`,
      type: instrument.type,
      tradeable: instrument.tradeable,
      tradability: instrument.tradability,
      fractionalTradability: instrument.fractional_tradability,
      shortSellingTradability: instrument.short_selling_tradability,
      tradableChainId: instrument.tradable_chain_id,
      listDate: instrument.list_date,
      country: instrument.country,
      quote: {
        last,
        previousClose,
        dayPct: percentChange(previousClose, last),
        bid: num(quote.bid_price),
        ask: num(quote.ask_price),
        bidSize: num(quote.bid_size),
        askSize: num(quote.ask_size),
        lastExtendedHours: num(quote.last_extended_hours_trade_price)
      },
      fundamentals: {
        description: fundamentals.description,
        marketCap: num(fundamentals.market_cap),
        peRatio: num(fundamentals.pe_ratio),
        pbRatio: num(fundamentals.pb_ratio),
        dividendYield: num(fundamentals.dividend_yield),
        open: num(fundamentals.open),
        high: num(fundamentals.high),
        low: num(fundamentals.low),
        volume: num(fundamentals.volume),
        averageVolume: num(fundamentals.average_volume),
        averageVolume30Days: num(fundamentals.average_volume_30_days),
        high52Weeks: num(fundamentals.high_52_weeks),
        low52Weeks: num(fundamentals.low_52_weeks),
        sector: fundamentals.sector,
        industry: fundamentals.industry,
        ceo: fundamentals.ceo,
        headquartersCity: fundamentals.headquarters_city,
        headquartersState: fundamentals.headquarters_state,
        yearFounded: fundamentals.year_founded,
        distributionFrequency: fundamentals.distribution_frequency,
        exDividendDate: fundamentals.ex_dividend_date,
        dividendPerShare: num(fundamentals.dividend_per_share)
      },
      shorting: shorting
        ? {
            borrowRate: num(shorting.fee),
            dailyFee: num(shorting.daily_fee),
            inventoryRange: shorting.inventory_range,
            feeTimestamp: shorting.fee_timestamp,
            inventoryTimestamp: shorting.inventory_timestamp
          }
        : undefined,
      accountContext: opts.account ? { accountNumber: opts.account, ...accountReads } : undefined,
      warnings: [
        ...(fundamentalsResult.ok ? [] : [`fundamentals unavailable: ${fundamentalsResult.error}`]),
        ...(shortingResult.ok ? [] : [`shorting unavailable: ${shortingResult.error}`]),
        ...accountWarnings
      ]
    };

    if (opts.json) {
      printJson(output);
      return;
    }
    process.stdout.write(`${output.symbol} — ${output.name}\n`);
    process.stdout.write(`last: ${usd(output.quote.last)} (${pct(output.quote.dayPct)})  bid/ask: ${usd(output.quote.bid)} / ${usd(output.quote.ask)}\n`);
    process.stdout.write(`market cap/AUM: ${compactNumber(output.fundamentals.marketCap)}  P/E: ${Number.isFinite(output.fundamentals.peRatio) ? output.fundamentals.peRatio.toFixed(2) : "—"}  P/B: ${Number.isFinite(output.fundamentals.pbRatio) ? output.fundamentals.pbRatio.toFixed(2) : "—"}\n`);
    process.stdout.write(`52w: ${usd(output.fundamentals.low52Weeks)} - ${usd(output.fundamentals.high52Weeks)}  avg vol: ${compactNumber(output.fundamentals.averageVolume)}\n`);
    if (output.shorting) {
      process.stdout.write(`shorting: ${output.shortSellingTradability ?? "unknown"}  borrow: ${Number.isFinite(output.shorting.borrowRate) ? `${output.shorting.borrowRate.toFixed(2)}%` : "—"}  inventory: ${output.shorting.inventoryRange ?? "—"}\n`);
    }
    if (output.fundamentals.description) process.stdout.write(`\n${output.fundamentals.description}\n`);
    for (const warning of output.warnings) process.stderr.write(`warning: ${warning}\n`);
  });

program.addCommand(stock);

program
  .command("positions")
  .description("Your open equity positions ranked by unrealized return (live read). Per-share and % only — no totals.")
  .option("--sort <key>", "sort by: return (default) or symbol", "return")
  .option("--account <number>", "account number to query (default: all accounts)")
  .option("--json", "emit JSON")
  .action(async (opts: { sort?: string; account?: string; json?: boolean }) => {
    const query: Record<string, string> = { nonzero: "true" };
    if (opts.account) query.account_number = opts.account;
    const data = await brokerageGetJson(POSITIONS_URL, {}, query);
    const held = (Array.isArray(data.results) ? data.results : []).filter((position: any) => num(position.quantity) > 0);
    if (held.length === 0) {
      process.stdout.write("No open equity positions.\n");
      return;
    }
    const quotes = await fetchQuotes(held.map((position: any) => position.instrument_id).filter(Boolean));
    let rows = held.map((position: any) => {
      const last = quoteLast(quotes.get(position.instrument_id));
      const avgCost = num(position.average_buy_price);
      return {
        symbol: position.symbol,
        qty: num(position.quantity),
        avgCost,
        last,
        returnPct: percentChange(avgCost, last)
      };
    });
    rows = rows.sort((a: any, b: any) =>
      opts.sort === "symbol"
        ? String(a.symbol).localeCompare(String(b.symbol))
        : (Number.isFinite(b.returnPct) ? b.returnPct : -Infinity) - (Number.isFinite(a.returnPct) ? a.returnPct : -Infinity)
    );
    if (opts.json) {
      printJson(rows);
      return;
    }
    if (opts.account) process.stdout.write(`Account ${opts.account}\n`);
    printTable(
      rows.map((row: any) => ({
        symbol: row.symbol,
        qty: Number.isInteger(row.qty) ? row.qty : row.qty.toFixed(4),
        avgCost: usd(row.avgCost),
        last: usd(row.last),
        return: pct(row.returnPct)
      })),
      ["symbol", "qty", "avgCost", "last", "return"]
    );
    const winners = rows.filter((row: any) => Number.isFinite(row.returnPct) && row.returnPct > 0).length;
    process.stdout.write(`\n${held.length} positions — ${winners} green, ${held.length - winners} red.\n`);
  });

const watchlist = new Command("watchlist").description("Inspect your custom watchlists (read)");

watchlist
  .command("list")
  .description("List your custom watchlists and their sizes (live read)")
  .option("--json", "emit JSON")
  .action(async (opts: { json?: boolean }) => {
    const data = await brokerageGetJson(DISCOVERY_LISTS_URL, {}, { owner_type: "custom" });
    const lists = Array.isArray(data.results) ? data.results : [];
    const rows = lists
      .map((list: any) => ({
        name: list.display_name,
        items: num(list.item_count),
        emoji: list.icon_emoji ?? "",
        id: list.id
      }))
      .sort((a: any, b: any) => (Number.isFinite(b.items) ? b.items : -1) - (Number.isFinite(a.items) ? a.items : -1));
    if (opts.json) {
      printJson(rows);
      return;
    }
    if (rows.length === 0) {
      process.stdout.write("No custom watchlists.\n");
      return;
    }
    printTable(
      rows.map((row: any) => ({ name: row.name, items: Number.isFinite(row.items) ? row.items : "—", emoji: row.emoji, id: row.id })),
      ["name", "items", "emoji", "id"]
    );
  });

program.addCommand(watchlist);

const crypto = new Command("crypto").description("Inspect and sign official Robinhood Crypto API requests");

crypto
  .command("routes")
  .description("List official Crypto OpenAPI paths")
  .option("--json", "emit JSON")
  .action((options: { json?: boolean }) => {
    const routes = listCryptoRoutes();
    if (options.json) {
      printJson({ count: routes.length, routes });
      return;
    }
    printTable(
      routes.map((route) => ({
        methods: (route.methods ?? []).join(",").toUpperCase(),
        path: route.path,
        operationIds: route.operationIds.join(",")
      })),
      ["methods", "path", "operationIds"]
    );
  });

crypto
  .command("sign")
  .description("Generate official Crypto API auth headers without sending a request")
  .requiredOption("--api-key <key>", "Robinhood Crypto API key")
  .requiredOption("--private-key-b64 <key>", "base64 Ed25519 private key seed")
  .requiredOption("--path <path>", "request path including query string")
  .option("--method <method>", "HTTP method", "GET")
  .option("--timestamp <seconds>", "Unix timestamp seconds", String(Math.floor(Date.now() / 1000)))
  .option("--body <body>", "exact body string to sign", "")
  .option("--json", "emit JSON")
  .action((options: { apiKey: string; privateKeyB64: string; path: string; method: string; timestamp: string; body: string; json?: boolean }) => {
    const headers = signCryptoRequest({
      apiKey: options.apiKey,
      privateKeyBase64: options.privateKeyB64,
      timestamp: options.timestamp,
      path: options.path,
      method: options.method,
      body: options.body
    });
    if (options.json) {
      printJson(headers);
      return;
    }
    process.stdout.write(`x-api-key: ${headers["x-api-key"]}\n`);
    process.stdout.write(`x-timestamp: ${headers["x-timestamp"]}\n`);
    process.stdout.write(`x-signature: ${headers["x-signature"]}\n`);
  });

crypto
  .command("plan")
  .description("Build a dry-run plan for an official Robinhood Crypto API route")
  .argument("<query>", "exact official Crypto URL or URL substring")
  .option("--method <method>", "override inferred HTTP method")
  .option("--param <name=value>", "replace a route placeholder; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--query-param <name=value>", "append or replace query-string value; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--body <body>", "exact request body string")
  .option("--body-json <json>", "JSON request body")
  .option("--json", "emit JSON")
  .action(
    (
      query: string,
      options: {
        method?: string;
        param?: string[];
        queryParam?: string[];
        body?: string;
        bodyJson?: string;
        json?: boolean;
      }
    ) => {
      const matches = filterRobinhoodRoutes(loadRobinhoodRoutes(), { host: "trading.robinhood.com", query });
      const route = selectRouteByQueryAndMethod(matches, query, options.method);
      if (!route) {
        throw new Error(`No official Crypto route matched: ${query}`);
      }
      const plan = planCryptoRequest({
        route,
        method: options.method,
        params: parseParamAssignments(options.param),
        query: parseParamAssignments(options.queryParam),
        body: parseBodyString(options),
        dryRun: true
      });
      if (options.json) {
        printJson(plan);
        return;
      }
      process.stdout.write(`${plan.method} ${plan.path}\n`);
      process.stdout.write(`${plan.command}\n`);
      for (const warning of plan.warnings) {
        process.stderr.write(`warning: ${warning}\n`);
      }
      if (plan.missingParams.length > 0) {
        process.stderr.write(`missing params: ${plan.missingParams.join(", ")}\n`);
      }
    }
  );

crypto
  .command("execute")
  .description("Execute an official Robinhood Crypto API request. Reads run live; writes (orders/cancels) are dry-run by default and require --live-write plus ROBINHOOD_ALLOW_LIVE_WRITE=1. Uses ROBINHOOD_CRYPTO_API_KEY and ROBINHOOD_CRYPTO_PRIVATE_KEY_B64.")
  .argument("<query>", "exact official Crypto URL or URL substring")
  .option("--method <method>", "override inferred HTTP method")
  .option("--param <name=value>", "replace a route placeholder; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--query-param <name=value>", "append or replace query-string value; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--body <body>", "exact request body string")
  .option("--body-json <json>", "JSON request body")
  .option("--dry-run", "print execution plan without sending")
  .option("--live-write", "permit a live write (also requires ROBINHOOD_ALLOW_LIVE_WRITE=1)")
  .option("--full", "print full response body instead of bounded preview")
  .option("--json", "emit JSON")
  .action(
    async (
      query: string,
      options: {
        method?: string;
        param?: string[];
        queryParam?: string[];
        body?: string;
        bodyJson?: string;
        dryRun?: boolean;
        liveWrite?: boolean;
        full?: boolean;
        json?: boolean;
      }
    ) => {
      const matches = filterRobinhoodRoutes(loadRobinhoodRoutes(), { host: "trading.robinhood.com", query });
      const route = selectRouteByQueryAndMethod(matches, query, options.method);
      if (!route) {
        throw new Error(`No official Crypto route matched: ${query}`);
      }
      const gate = resolveLiveWriteGate({
        risk: route.risk,
        method: options.method,
        dryRun: Boolean(options.dryRun),
        liveWrite: Boolean(options.liveWrite)
      });
      if (gate.forcedDryRun && gate.reason) {
        process.stderr.write(`${gate.reason}\n`);
      }
      const effectiveDryRun = Boolean(options.dryRun) || gate.forcedDryRun;
      const body = parseBodyString(options);
      const plan = planCryptoRequest({
        route,
        method: options.method,
        params: parseParamAssignments(options.param),
        query: parseParamAssignments(options.queryParam),
        body,
        dryRun: effectiveDryRun
      });
      const result = await executeCryptoRequest(plan, {
        dryRun: effectiveDryRun,
        body,
        fullBody: Boolean(options.full)
      });
      if (options.json) {
        printJson(result);
        return;
      }
      process.stdout.write(`${result.status} ${result.statusText} ${result.method} ${result.url}\n`);
      process.stdout.write(result.body ? `${result.body}\n` : "");
    }
  );

program.addCommand(crypto);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
