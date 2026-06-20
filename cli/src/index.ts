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
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  computeAutopilot,
  computeCalendar,
  computeExposure,
  computeIncome,
  computeRisk,
  computeWhatIf,
  computeNews,
  computeRatings,
  computeEarnings,
  computeMovers,
  computeOptionsEvents,
  buildAccountContextUrl,
  buildOptionsContractLinkBundle,
  buildOptionsContractNavigationPlan,
  buildOptionsStrategyPricingSummary,
  buildOptionsStrategyOrderPlan,
  classifyMoneyness,
  collarSanity,
  selectRouteByQueryAndMethod,
  brokerageGetJson,
  brokerageGetAllResults,
  loadOwnedAccounts,
  assertAccountOwned as assertOwnedAccount,
  fetchOptionMarks,
  fetchQuotes,
  computePortfolioPnl,
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
  downloadDocuments,
  getMarginHealth,
  tryBrokerageGetJson,
  gatedBrokerageWrite,
  watchlistMutateItems,
  createWatchlist,
  getWatchlistItems,
  buyWatchlistBasket,
  logTrade,
  placeEquityOrder,
  getOrderStatus,
  extractOrderId,
  cancelOrder,
  listOpenOrders,
  panicCancelAll,
  runPretradeChecks,
  buildOptionsClosePlan,
  accountCapabilities,
  computeWheelState,
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
  buildEndpointDirectory,
  ENDPOINT_DOMAINS,
  describeRoute,
  noMatchHint,
  loadRecipes,
  filterRecipes,
  readOptionsOrderFlow,
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
  accountFromWriteRequest,
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

// Help-only credit line — must never print on normal or --json command output.
program.addHelpText("after", "\nby zayd @ zayd.wtf");

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
  .command("directory")
  .description("By-domain endpoint directory: intent → route + first-class command + response fields")
  .option("--domain <domain>", `filter to one domain (${ENDPOINT_DOMAINS.join(", ")})`)
  .option("--query <text>", "substring filter against URL")
  .option("--with-fields", "include the full response field list per endpoint")
  .option("--json", "emit JSON")
  .action((options: { domain?: any; query?: string; withFields?: boolean; json?: boolean }) => {
    const directory = buildEndpointDirectory({ domain: options.domain, query: options.query, withFields: options.withFields });
    if (options.json) {
      printJson(directory);
      return;
    }
    const cov = directory.fieldsCoverage;
    process.stdout.write(`Endpoint directory — ${directory.totalRoutes} routes | fields: ${cov.verified} verified, ${cov.inferred} inferred, ${cov.undocumented} undocumented\n\n`);
    for (const group of directory.domains) {
      process.stdout.write(`▸ ${group.domain.toUpperCase()} (${group.routeCount})\n`);
      printTable(
        group.entries.map((entry) => ({
          risk: entry.risk,
          methods: entry.methods.join(","),
          command: entry.command ?? "—",
          fields: entry.fieldCount > 0 ? `${entry.fieldCount} (${entry.fieldsSource})` : "—",
          url: entry.url
        })),
        ["risk", "methods", "command", "fields", "url"]
      );
      process.stdout.write("\n");
    }
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

// Shared planning actions — registered under BOTH `api-map options-*` (original names) and the
// consolidated `options` group (`options strategies` / `options plan`) so planning + live options
// commands live together. One action body, no duplication.
function runOptionsStrategies(options: {
  category?: string;
  aggressiveness?: string;
  definedRisk?: boolean;
  undefinedRisk?: boolean;
  query?: string;
  json?: boolean;
}): void {
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

function runOptionsStrategyPlan(id: string, options: { param?: string[]; json?: boolean }): void {
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
}

const paramCollector = (value: string, previous: string[] = []): string[] => [...previous, value];

apiMap
  .command("options-strategies")
  .description("List options strategy workflow templates with payoff and Greek posture (alias: `options strategies`)")
  .option("--category <category>", "filter by category")
  .option("--aggressiveness <level>", "conservative, moderate, or aggressive")
  .option("--defined-risk", "only defined-risk strategies")
  .option("--undefined-risk", "only undefined-risk strategies")
  .option("--query <text>", "substring filter")
  .option("--json", "emit JSON")
  .action(runOptionsStrategies);

apiMap
  .command("options-strategy-plan")
  .description("Build a dry-run options order body template for a strategy workflow (alias: `options plan`)")
  .argument("<id>", "strategy id, e.g. iron-condor")
  .option("--param <name=value>", "fill a strategy placeholder; repeatable", paramCollector)
  .option("--json", "emit JSON")
  .action(runOptionsStrategyPlan);

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

program
  .command("recipes")
  .description("Intent → the one command to run. Maps a plain-English goal to the verified CLI command + MCP tool.")
  .argument("[query]", "optional free-text filter (intent, trigger phrase, command)")
  .option("--json", "emit JSON")
  .action((query: string | undefined, options: { json?: boolean }) => {
    const recipes = filterRecipes(loadRecipes(), query);
    if (options.json) {
      printJson({ count: recipes.length, recipes });
      return;
    }
    if (recipes.length === 0) {
      process.stdout.write(`No recipe matched "${query}". Run \`recipes\` with no filter to see them all.\n`);
      return;
    }
    for (const r of recipes) {
      process.stdout.write(`▸ ${r.intent}\n`);
      process.stdout.write(`    run:   ${r.command}\n`);
      process.stdout.write(`    mcp:   ${r.mcpTool}   [${r.risk}]\n`);
      if (r.notes) process.stdout.write(`    note:  ${r.notes}\n`);
      process.stdout.write("\n");
    }
  });

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
      throw new Error(noMatchHint(query));
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
  .command("describe")
  .description("Self-describing route card: what it needs (tokens/query keys), what it returns (fields), and the command that drives it")
  .argument("<query>", "exact URL or URL substring")
  .option("--method <method>", "disambiguate by HTTP method")
  .option("--json", "emit JSON")
  .action((query: string, options: { method?: string; json?: boolean }) => {
    const desc = describeRoute(query, options.method);
    if (options.json) {
      printJson(desc);
      return;
    }
    if (!desc.resolved) {
      if (desc.ambiguous?.length) {
        process.stdout.write(`"${query}" is AMBIGUOUS — ${desc.ambiguous.length} routes match. Be more specific:\n`);
        for (const u of desc.ambiguous) process.stdout.write(`  - ${u}\n`);
      } else {
        process.stdout.write(`No route matched "${query}".\n`);
        if (desc.suggestions?.length) {
          process.stdout.write(`Did you mean:\n`);
          for (const u of desc.suggestions) process.stdout.write(`  - ${u}\n`);
        }
      }
      return;
    }
    process.stdout.write(`${(desc.methods ?? []).join(",")} ${desc.url}\n`);
    process.stdout.write(`  risk:      ${desc.risk}\n`);
    process.stdout.write(`  command:   ${desc.command ?? "— (use brokerage execute)"}\n`);
    process.stdout.write(`  tokens:    ${desc.requiredTokens?.length ? desc.requiredTokens.map((t) => `{${t}}`).join(", ") : "none"}\n`);
    process.stdout.write(`  queryKeys: ${desc.queryKeys?.length ? desc.queryKeys.join(", ") : "none"}\n`);
    const fieldLabel = desc.fields?.length ? `${desc.fields.length} (${desc.fieldsSource}, ${desc.fieldsShape ?? "object"})` : `none (${desc.fieldsSource ?? "undocumented"})`;
    process.stdout.write(`  fields:    ${fieldLabel}\n`);
    if (desc.fields?.length) process.stdout.write(`             ${desc.fields.join(", ")}\n`);
    for (const w of desc.warnings ?? []) process.stderr.write(`  warning:   ${w}\n`);
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
      throw new Error(noMatchHint(query));
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
  .description("Execute a brokerage/account request. Reads run live; writes are dry-run by default and require ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional). Uses ROBINHOOD_BROKERAGE_TOKEN or ROBINHOOD_COOKIE.")
  .argument("<query>", "exact URL or URL substring")
  .option("--method <method>", "override inferred HTTP method")
  .option("--param <name=value>", "replace a route placeholder; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--query-param <name=value>", "append or replace a URL query-string value; repeatable", (value: string, previous: string[] = []) => [
    ...previous,
    value
  ])
  .option("--body-json <json>", "JSON request body")
  .option("--dry-run", "print execution plan without sending")
  .option("--live-write", "optional back-compat no-op; the live-write gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--full", "print full response body instead of bounded preview")
  .option("--json", "emit JSON")
  .action(async (query: string, options: { method?: string; param?: string[]; queryParam?: string[]; bodyJson?: string; dryRun?: boolean; liveWrite?: boolean; full?: boolean; json?: boolean }) => {
    const matches = filterBrokerageRoutes(loadBrokerageRoutes(), { query });
    const route = selectRouteByQueryAndMethod(matches, query, options.method);
    if (!route) {
      throw new Error(noMatchHint(query));
    }
    const reqParams = parseParamAssignments(options.param);
    const reqBody = parseJsonBody(options.bodyJson);
    const gate = resolveLiveWriteGate({
      risk: route.risk,
      method: options.method,
      dryRun: Boolean(options.dryRun),
      liveWrite: Boolean(options.liveWrite),
      accountNumber: accountFromWriteRequest(reqBody, reqParams)
    });
    if (gate.forcedDryRun && gate.reason) {
      process.stderr.write(`${gate.reason}\n`);
    }
    const effectiveDryRun = Boolean(options.dryRun) || gate.forcedDryRun;
    const plan = planBrokerageRequest({
      route,
      method: options.method,
      params: reqParams,
      query: parseParamAssignments(options.queryParam),
      body: reqBody,
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
  .description("Equity buy: --dollars (fractional/market) or --shares (whole; OTC auto-limit). Web order body. Dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional).")
  .requiredOption("--account <account_number>", "brokerage account number")
  .option("--dollars <amount>", "dollar-notional fractional buy (market, regular hours only)")
  .option("--shares <qty>", "share quantity (whole shares for OTC names)")
  .option("--limit <price>", "explicit limit price; else market with ask collar (OTC forces a limit at the ask)")
  .option("--tif <gfd|gtc>", "time in force", "gfd")
  .option("--dry-run", "print plan/body, send nothing")
  .option("--live", "send live (requires ROBINHOOD_ALLOW_LIVE_WRITE=1); without it the order is dry-run — matches the top-level `buy`")
  .option("--force", "skip the pending-duplicate-order check")
  .option("--live-write", "optional back-compat no-op; the live-write gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (symbol: string, opts: { account: string; dollars?: string; shares?: string; limit?: string; tif?: string; dryRun?: boolean; live?: boolean; force?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (!opts.dollars && !opts.shares) throw new Error("Pass --dollars <amt> or --shares <qty>.");
    if (opts.dollars && opts.shares) throw new Error("Pass only one of --dollars or --shares.");
    if (opts.dollars && !(Number(opts.dollars) > 0)) throw new Error(`--dollars must be a positive number (got "${opts.dollars}").`);
    if (opts.shares && !(Number(opts.shares) > 0)) throw new Error(`--shares must be a positive number (got "${opts.shares}").`);
    if (opts.limit && !(Number(opts.limit) > 0)) throw new Error(`--limit must be a positive number (got "${opts.limit}").`);
    const acctLabel = await assertOwnedAccount(opts.account);
    // §2.2 — route through the SHARED engine so this matches the top-level `buy`/`sell` and the
    // MCP tools: dedup, ref_id idempotency, 429 retry, account-lock + notional caps, trading-log,
    // and post-send order-history evidence. (Was an inline body build with no dedup/evidence.)
    const r = await placeEquityOrder({
      symbol,
      accountNumber: opts.account,
      side: "buy",
      amount: opts.dollars ? Number(opts.dollars) : undefined,
      shares: opts.shares ? Number(opts.shares) : undefined,
      limitPrice: opts.limit ? Number(opts.limit) : undefined,
      liveWrite: Boolean(opts.live) && !opts.dryRun,
      force: Boolean(opts.force)
    });

    if (opts.json) {
      printJson({ symbol: r.symbol, account: opts.account, accountLabel: acctLabel, shares: r.shares, estimatedPrice: r.estimatedPrice, estimatedTotal: r.estimatedTotal, type: r.type, otcAutoLimit: r.otcAutoLimit, dollarBased: r.dollarBased, session: r.session, sessionWarning: r.sessionWarning, dryRun: r.dryRun, live: r.live, refId: r.refId, orderId: r.orderId, state: r.state, httpStatus: r.httpStatus, evidence: r.evidence });
      return;
    }

    const mode = r.dryRun ? "DRY-RUN" : "LIVE";
    const sizing = r.dollarBased ? `$${r.estimatedTotal.toFixed(2)} (dollar-based ≈ ${r.shares.toFixed(6)} sh)` : `${r.shares.toFixed(6)} sh ≈ $${r.estimatedTotal.toFixed(2)}`;
    const acctTag = `…${opts.account.slice(-4)}${acctLabel ? ` (${acctLabel})` : ""}`; // privacy: mask to last-4 (PR #15)
    process.stdout.write(`${mode} ${r.type} buy: ${r.symbol} ${sizing}${r.otcAutoLimit ? " (OTC auto-limit)" : ""} @ ~$${r.estimatedPrice.toFixed(2)}  acct=${acctTag}${r.session ? `  [${r.session}]` : ""}\n`);
    if (r.sessionWarning) process.stdout.write(`⚠️  ${r.sessionWarning}\n`);
    if (r.dryRun) process.stdout.write("Add ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute.\n");
    else process.stdout.write(`Status: ${r.httpStatus}  id=${r.orderId ?? "?"}  state=${r.state ?? "?"}\n`);
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

// Generic env-gated brokerage write. Pass the EXACT templated URL (with {placeholders}) so the
// resolver matches one route and the ambiguity guard can't fire. Dry-run by default; a live send
// needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional). Returns status + the (dry-run or live) body.
// gatedBrokerageWrite is imported from ./lib.js — shared write executor (CLI + MCP).

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

const recurring = new Command("recurring").description("Manage recurring investment schedules (list / resume / pause / create / edit / end)");

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
  .description("Resume paused recurring buys. Live write — needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional) (else dry-run).")
  .option("--id <id>", "schedule id to resume; repeatable", collectId, [])
  .option("--all", "resume ALL currently-paused schedules")
  .option("--account <num>", "limit --all to one account number")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (options: { id?: string[]; all?: boolean; account?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) =>
    runRecurringSet("active", options)
  );

recurring
  .command("pause")
  .description("Pause active recurring buys. Live write — needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional) (else dry-run).")
  .option("--id <id>", "schedule id to pause; repeatable", collectId, [])
  .option("--all", "pause ALL currently-active schedules")
  .option("--account <num>", "limit --all to one account number")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (options: { id?: string[]; all?: boolean; account?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) =>
    runRecurringSet("paused", options)
  );

recurring
  .command("create")
  .description("Create a recurring investment schedule (PROVEN write). Dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional).")
  .requiredOption("--account <account_number>", "account number")
  .requiredOption("--symbol <ticker>", "equity ticker to invest in")
  .requiredOption("--amount <usd>", "dollar amount per cycle")
  .option("--frequency <weekly|biweekly|monthly>", "cadence", "weekly")
  .option("--start-date <YYYY-MM-DD>", "first investment date (default: tomorrow)")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
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
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
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
  .description("End/delete a recurring schedule (PATCH state=deleted). Dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch).")
  .requiredOption("--id <schedule_id>", "schedule id to end")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
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
// (capability map docs/account-settings-capability-map-2026-06-03.md). Every write env-gated.
const DRIP_ACCOUNT_URL = "https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/";
const DRIP_INSTRUMENT_URL = "https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/{instrument_id}/";
const OPTION_SETTINGS_URL = "https://api.robinhood.com/options/option_settings/{account_number}/";
const MARGIN_SETTINGS_URL = "https://api.robinhood.com/settings/margin/{account_number}/";
const SWEEP_STATE_URL = "https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/";
const STOCK_LENDING_URL = "https://bonfire.robinhood.com/slip/{account_number}/status/";

const settings = new Command("settings").description("Read/write account settings: DRIP, trade-on-expiration, PDT protection, cash sweep, stock lending. Writes env-gated.");

settings
  .command("show")
  .description("Read all settings for an account (DRIP, options trade-on-expiration, margin/PDT-protection, cash sweep, stock lending). Live read.")
  .requiredOption("--account <account_number>", "account number")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; json?: boolean }) => {
    const label = await assertOwnedAccount(opts.account);
    const get = async (url: string) => { try { return await brokerageGetJson(url, { account_number: opts.account }); } catch (e) { return { error: (e as Error).message.slice(0, 60) }; } };
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
  .description("Toggle dividend reinvestment (DRIP). Account-wide, or per-stock with --instrument. Env-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--enable", "turn DRIP on")
  .option("--disable", "turn DRIP off")
  .option("--instrument <instrument_id>", "scope to one stock (per-instrument DRIP)")
  .option("--dry-run", "plan only")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; enable?: boolean; disable?: boolean; instrument?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.enable === opts.disable) throw new Error("Pass exactly one of --enable / --disable.");
    await assertOwnedAccount(opts.account);
    const url = opts.instrument ? DRIP_INSTRUMENT_URL : DRIP_ACCOUNT_URL;
    const params: Record<string, string> = { account_number: opts.account };
    if (opts.instrument) params.instrument_id = opts.instrument;
    await writeFlag(() => gatedBrokerageWrite({ url, method: "PATCH", params, body: { drip_enabled: Boolean(opts.enable) }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `DRIP ${opts.enable ? "enable" : "disable"}${opts.instrument ? ` (instrument ${opts.instrument})` : " (account-wide)"} ${opts.account}`);
  });

settings
  .command("expiration")
  .description("Toggle 'trade on expiration' for options. Env-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--enable", "enable trading on expiration")
  .option("--disable", "disable trading on expiration")
  .option("--dry-run", "plan only")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; enable?: boolean; disable?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.enable === opts.disable) throw new Error("Pass exactly one of --enable / --disable.");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: OPTION_SETTINGS_URL, method: "PATCH", params: { account_number: opts.account }, body: { trading_on_expiration_state: opts.enable ? "enabled" : "disabled" }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `trade-on-expiration ${opts.enable ? "enabled" : "disabled"} ${opts.account}`);
  });

settings
  .command("pdt")
  .description("Toggle PDT (pattern-day-trade) protection. Env-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--on", "enable PDT protection")
  .option("--off", "disable PDT protection")
  .option("--dry-run", "plan only")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; on?: boolean; off?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.on === opts.off) throw new Error("Pass exactly one of --on / --off.");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: MARGIN_SETTINGS_URL, method: "PUT", params: { account_number: opts.account }, body: { day_trades_protection: Boolean(opts.on) }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `PDT-protection ${opts.on ? "on" : "off"} ${opts.account}`);
  });

settings
  .command("lending")
  .description("Toggle stock lending (SLIP). Env-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--enable", "enable stock lending")
  .option("--disable", "disable stock lending")
  .option("--dry-run", "plan only")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; enable?: boolean; disable?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (opts.enable === opts.disable) throw new Error("Pass exactly one of --enable / --disable.");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: STOCK_LENDING_URL, method: "PUT", params: { account_number: opts.account }, body: { is_enabled: Boolean(opts.enable), was_ever_enabled: true }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `stock-lending ${opts.enable ? "enable" : "disable"} ${opts.account}`);
  });

settings
  .command("sweep")
  .description("Cash sweep enrollment. --disable unenrolls (proven). Enroll requires a separate agreement-sign flow — not automated. Env-gated.")
  .requiredOption("--account <account_number>", "account number")
  .option("--disable", "unenroll from cash sweep")
  .option("--dry-run", "plan only")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (opts: { account: string; disable?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    if (!opts.disable) throw new Error("Only --disable (unenroll) is automated. Enrolling needs the agreement-sign flow (see capability map).");
    await assertOwnedAccount(opts.account);
    await writeFlag(() => gatedBrokerageWrite({ url: SWEEP_STATE_URL, method: "POST", params: { account_number: opts.account }, body: { sweep_enrollment_action: "unenroll" }, dryRun: opts.dryRun, liveWrite: opts.liveWrite }), opts.json, `cash-sweep unenroll ${opts.account}`);
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
// brokerageGetJson + tryBrokerageGetJson are imported from ./lib.js — shared with the MCP server.

// Owned-account validation + the account-graph loader now live in lib.ts (shared with the order
// engine and the MCP surface, so the #1 money-loss guard can't protect one front-end and miss
// another). `assertOwnedAccount` here is the imported `assertAccountOwned`; `loadOwnedAccounts` is
// the shared loader. See lib.ts "Shared account-graph + marketdata helpers".

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

interface OpenOptionPosition {
  symbol: string;
  name: string;
  averageOpenPrice: number;
  quantity: number;
  optionId: string;
  accountNumber: string;
}

async function loadOpenOptionPositions(): Promise<OpenOptionPosition[]> {
  // The bare aggregate_positions endpoint silently defaults to ONE account (the wrong-account trap).
  // Enumerate the full owned graph and read per-account in parallel so every contract in every
  // account shows up; fall back to the bare read only if the graph lookup fails.
  let results: any[] = [];
  const owned = await loadOwnedAccounts();
  if (owned && owned.numbers.size > 0) {
    const perAcct = await Promise.all([...owned.numbers].map(async (acct) => {
      try { return (await brokerageGetJson(AGG_POSITIONS_URL, {}, { account_numbers: acct, nonzero: "true" })).results ?? []; }
      catch { return []; }
    }));
    results = perAcct.flat();
  } else {
    const data = await brokerageGetJson(AGG_POSITIONS_URL);
    results = Array.isArray(data.results) ? data.results : [];
  }
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
      optionId,
      accountNumber: String(position.account_number ?? "")
    });
  }
  return open;
}

// fetchOptionMarks + fetchQuotes are imported from lib.ts (shared, chunked marketdata fetchers).

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

  const instruments: any[] = await brokerageGetAllResults(
    OPTIONS_INSTRUMENTS_URL,
    { chain_id: chainId, expiration_dates: input.expiration, type: input.optionType },
    { account_number: account }
  );
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
  .description("Open option positions ranked in DOLLARS (live read): per-contract value, unrealized $ P&L, day $ change, account, return %, delta.")
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
        const m = marks.get(position.optionId) ?? {};
        const mark = num(m.adjusted_mark_price);
        const prev = num(m.previous_close_price);
        const delta = num(m.delta);
        const valueUsd = Number.isFinite(mark) ? mark * 100 * position.quantity : Number.NaN;
        const entryPer = position.averageOpenPrice / 100;
        return {
          contract: position.name,
          acct: position.accountNumber ? `…${position.accountNumber.slice(-4)}` : "—",
          qty: position.quantity,
          entry: entryPer,
          mark,
          valueUsd,
          // Unrealized $ = (mark − entry) × 100 × qty; day $ = (mark − previous close) × 100 × qty.
          plUsd: Number.isFinite(mark) ? (mark - entryPer) * 100 * position.quantity : Number.NaN,
          dayUsd: Number.isFinite(mark) && Number.isFinite(prev) ? (mark - prev) * 100 * position.quantity : Number.NaN,
          returnPct: optionReturnPct(position.averageOpenPrice, mark),
          delta
        };
      })
      // Dollars, not percents: rank by unrealized $ P&L so a $6 lot can't outrank a $1,600 call.
      .sort((a, b) => (Number.isFinite(b.plUsd) ? b.plUsd : -Infinity) - (Number.isFinite(a.plUsd) ? a.plUsd : -Infinity));
    if (opts.json) {
      printJson(rows);
      return;
    }
    printTable(
      rows.map((row) => ({
        contract: row.contract,
        acct: row.acct,
        qty: row.qty,
        entry: usd(row.entry),
        mark: usd(row.mark),
        value_usd: usd(row.valueUsd),
        pl_usd: usd(row.plUsd),
        day_usd: usd(row.dayUsd),
        return: pct(row.returnPct),
        delta: Number.isFinite(row.delta) ? row.delta.toFixed(2) : "—"
      })),
      ["contract", "acct", "qty", "entry", "mark", "value_usd", "pl_usd", "day_usd", "return", "delta"]
    );
    const sum = (xs: number[]) => xs.filter(Number.isFinite).reduce((s, x) => s + x, 0);
    process.stdout.write(`\nTOTAL: value ${usd(sum(rows.map((r) => r.valueUsd)))} | unrealized ${usd(sum(rows.map((r) => r.plUsd)))} | day ${usd(sum(rows.map((r) => r.dayUsd)))}\n`);
    if (rows.every((r) => !Number.isFinite(r.dayUsd) || r.dayUsd === 0))
      process.stdout.write(`NOTE: day $ reads $0 between sessions (options haven't traded yet today) — use \`portfolio\` for last-session attribution.\n`);
  });

options
  .command("order-flow")
  .description("Pre-trade options context (live reads): options buying power (per account), the fee schedule, and collateral requirements")
  .option("--account <account_number>", "account for options buying power (per-account)")
  .option("--chain-id <chain_id>", "chain id for chain-level collateral (else order-level collateral)")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; chainId?: string; json?: boolean }) => {
    const flow = await readOptionsOrderFlow({ accountNumber: opts.account, chainId: opts.chainId });
    if (opts.json) {
      printJson(flow);
      return;
    }
    if (flow.buyingPower) {
      const bp = flow.buyingPower;
      process.stdout.write(`Options buying power (…${String(opts.account).slice(-4)}): ${usd(num(bp.options_buying_power ?? bp.buying_power ?? bp.amount))}\n`);
    }
    if (flow.fees) {
      const f = flow.fees;
      process.stdout.write(`Options fees: ${JSON.stringify(f).slice(0, 200)}\n`);
    }
    if (flow.collateral) {
      process.stdout.write(`Collateral: ${JSON.stringify(flow.collateral).slice(0, 200)}\n`);
    }
    for (const w of flow.warnings) process.stderr.write(`warning: ${w}\n`);
    process.stdout.write(`\nNote: the options/orders/review PREVIEW is a POST — run it via \`brokerage execute "options/orders/review" --method POST\` (gated) until a live pass confirms it is non-mutating.\n`);
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
      await brokerageGetAllResults(OPTIONS_INSTRUMENTS_URL, { chain_id: chainId, expiration_dates: expiration, type });
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
        await brokerageGetAllResults(OPTIONS_INSTRUMENTS_URL, { chain_id: chainId, expiration_dates: expiration, type });
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
      handoff: "Sell-to-close: options/orders/ {side:sell, position_effect:close}. Buy-to-open: {side:buy, position_effect:open}. Dry-run via 'options strategy-quote', live needs the ROBINHOOD_ALLOW_LIVE_WRITE=1 switch."
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

// Consolidated planning commands under `options` (same actions as `api-map options-*`, kept there
// as aliases). Puts strategy catalog + planning next to the live options commands.
options
  .command("strategies")
  .description("List options strategy templates with payoff + Greek posture (same as `api-map options-strategies`)")
  .option("--category <category>", "filter by category")
  .option("--aggressiveness <level>", "conservative, moderate, or aggressive")
  .option("--defined-risk", "only defined-risk strategies")
  .option("--undefined-risk", "only undefined-risk strategies")
  .option("--query <text>", "substring filter")
  .option("--json", "emit JSON")
  .action(runOptionsStrategies);

options
  .command("plan")
  .description("Dry-run options order-body template for a strategy id (same as `api-map options-strategy-plan`)")
  .argument("<id>", "strategy id, e.g. iron-condor")
  .option("--param <name=value>", "fill a strategy placeholder; repeatable", paramCollector)
  .option("--json", "emit JSON")
  .action(runOptionsStrategyPlan);

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
        const legInstruments = await brokerageGetAllResults(
          OPTIONS_INSTRUMENTS_URL,
          { chain_id: chainId, expiration_dates: legExpiration, type },
          { account_number: account }
        );
        instrumentsByExpirationAndType.set(key, legInstruments);
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
        ],
        // Kosher rolls outlive the session — hand back the literal ledger command so the staged
        // open leg survives into the next one (rolls.md; `roll-ledger list` at session start).
        recordTip: opts.cashAccount
          ? `node cli/dist/index.js roll-ledger add --symbol ${symbol} --account ${opts.account} --closed "${quantity}x ${symbol} $${opts.closeStrike} ${optionType} ${opts.closeExpiration} ${closeSide}-to-close @ $${optionMoney(closeLimit)} (order-id: fill in once the close fills)" --open-intent "${openSide}-to-open ${symbol} $${opts.openStrike} ${optionType} ${opts.openExpiration} — fresh quote on the open day" --earliest ${nextBusinessDay()}`
          : undefined
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
      if (output.recordTip) {
        process.stdout.write(`\ntip: record this staged roll so the next session picks up the open leg (sessions die between the two days):\n  ${output.recordTip}\n`);
      }
      const pendingRolls = listPendingRolls();
      if (pendingRolls.length) process.stdout.write(`\n⏳ ${pendingRolls.length} pending kosher roll(s) — run roll-ledger list\n`);
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

// ── options close: dry-run close plan for an OPEN position (sell-to-close / buy-to-close) ──
// Zayd Khan // cold // www.zayd.wtf
options
  .command("close")
  .description("Build the DRY-RUN close order for an open option position: finds the position across accounts, derives sell-to-close (long) or buy-to-close (short) from its direction, quotes live bid/ask, computes a tick-rounded mid limit, and emits the exact gated send command. Never sends; position_effect is always close.")
  .argument("<symbol>", "underlying ticker, e.g. NVDA")
  .option("-a, --account <number>", "Limit to one account (disambiguator)")
  .option("--strike <k>", "Strike (disambiguator)")
  .option("--expiration <date>", "Expiration YYYY-MM-DD (disambiguator)")
  .option("--type <type>", "Option type: call or put (disambiguator)")
  .option("-q, --quantity <n>", "Contracts to close (default: full position)")
  .option("--json", "emit JSON")
  .action(async (symbolArg: string, opts: any) => {
    if (opts.type && opts.type !== "call" && opts.type !== "put") throw new Error(`--type must be call or put (got "${opts.type}")`);
    const r = await buildOptionsClosePlan({
      symbol: symbolArg,
      accountNumber: opts.account,
      strike: opts.strike != null ? Number(opts.strike) : undefined,
      expiration: opts.expiration,
      optionType: opts.type,
      quantity: opts.quantity != null ? Number(opts.quantity) : undefined
    });
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), ...r });
      return;
    }
    if (r.needsDisambiguation) {
      process.stdout.write(`${r.symbol}: ${r.matched ?? r.candidates.length} position(s) match — disambiguate with --account/--strike/--expiration${opts.type ? "" : "/--type"}:\n`);
      printTable(
        r.candidates.map((c: any) => ({
          account: `…${c.accountNumber.slice(-4)}`,
          dir: c.positionType || c.strategy,
          type: c.optionType ?? "?",
          strike: c.strike ?? "?",
          exp: c.expiration ?? "?",
          qty: c.quantity,
          avg: usd(c.averageOpenPrice),
          legs: c.multiLeg ? "multi" : "single"
        })),
        ["account", "dir", "type", "strike", "exp", "qty", "avg", "legs"]
      );
      process.stdout.write(`\n${r.hint}\n`);
      return;
    }
    if (r.multiLeg) {
      process.stdout.write(`${r.symbol}: matched a MULTI-LEG position (${r.position.strategy}) — ${r.hint}\n`);
      return;
    }
    const p = r.position;
    process.stdout.write(`DRY RUN ${r.action}: ${r.symbol} $${p.strike} ${p.optionType} ${p.expiration} ×${r.dryRunBody.quantity}  acct=…${p.accountNumber.slice(-4)}\n`);
    process.stdout.write(`position: ${p.positionType} ${p.quantity} contract(s) @ avg ${usd(p.averageOpenPrice)}\n`);
    process.stdout.write(`quote: bid ${usd(r.quote.bid)} / ask ${usd(r.quote.ask)} (mark ${usd(r.quote.mark)}) → mid limit ${usd(r.quote.midLimit)}${r.quote.tick ? ` (tick $${r.quote.tick})` : ""}\n`);
    process.stdout.write(`leg: ${r.orientation.side} / position_effect=${r.orientation.positionEffect} / direction=${r.orientation.direction}\n`);
    process.stdout.write(`\norder body (NOT sent):\n${JSON.stringify(r.dryRunBody, null, 2)}\n`);
    process.stdout.write(`\ndry-run it:   ${r.commands.dryRun}\n`);
    process.stdout.write(`gated send:   ${r.commands.gatedSend}\n`);
    process.stdout.write(`\n${r.note}\n`);
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
  });

program.addCommand(options);

// --- Quote / positions / watchlist: read-only convenience commands ---
// Same engine + map as everything else. Like `options`, these print prices and
// percentages but never a summed account/position dollar total, so output stays
// safe to screenshot.
const POSITIONS_URL = "https://api.robinhood.com/positions/";
const DISCOVERY_LISTS_URL = "https://api.robinhood.com/discovery/lists/";

// Batch instrument-id -> quote lookup, chunked to keep URLs bounded.
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
// accountCapabilities moved to lib.ts (shared with the pretrade engine) — imported above.

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
    // The bulk accounts/ endpoints omit some owned accounts entirely (live: 2 of 5 returned). For any
    // account in the transfer graph but missing from the typed list, fall back to the per-account
    // detail endpoint so type/cash/BP are real instead of "unverified". Reads in parallel, degrade per-account.
    await Promise.all(brokerage
      .filter((g) => !typeByNum.has(String(g.account_number)))
      .map(async (g) => {
        const num = String(g.account_number);
        const one = await tryBrokerageGetJson("https://api.robinhood.com/accounts/{account_number}/", { account_number: num });
        if (one.ok && (one.data as any)?.account_number) typeByNum.set(num, one.data as Record<string, any>);
      }));
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
        nickname: row.nickname || "—",
        class: row.class,
        cash: usd(num(row.portfolioCash)),
        buying_power: usd(num(row.buyingPower)),
        margin: row.canMarginBorrow ? "yes" : "no",
        roll: row.canRollOnMargin ? "yes" : "no",
        naked: row.canNakedShort ? "yes" : "no"
      })),
      ["account", "nickname", "class", "cash", "buying_power", "margin", "roll", "naked"]
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
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), events }); return; }
    process.stdout.write(`as of ${new Date().toISOString()}\n`);
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
    process.stdout.write(`as of ${new Date().toISOString()}\n`);
    printTable(
      rows.map((row: any) => ({
        symbol: row.symbol,
        qty: Number.isInteger(row.qty) ? row.qty : row.qty.toFixed(4),
        last: usd(row.last),
        value: usd((row.qty || 0) * (row.last || 0)),
        avgCost: usd(row.avgCost),
        return: pct(row.returnPct)
      })),
      ["symbol", "qty", "last", "value", "avgCost", "return"]
    );
    const winners = rows.filter((row: any) => Number.isFinite(row.returnPct) && row.returnPct > 0).length;
    process.stdout.write(`\n${held.length} positions — ${winners} green, ${held.length - winners} red.\n`);
  });

// ── portfolio: one-call P&L across ALL accounts — DOLLARS, day vs after-hours, by underlying ──
// The composed answer to "how am I down?". The compute lives in lib.computePortfolioPnl (shared with
// the MCP robinhood_portfolio tool); this command is a thin renderer over its structured result.
//   after-hours Δ = extended_hours_equity − equity         (NOT − previous_close; that's the full day)
//   day Δ         = equity − adjusted_equity_previous_close (equity_previous_close is "0" per-account)
program
  .command("portfolio")
  .aliases(["pnl", "snapshot"])
  .description("Portfolio P&L across ALL accounts in DOLLARS: per-account day Δ + after-hours Δ, with drivers rolled up by underlying. Answers 'how am I down today / after hours and which names'. Live read.")
  .option("--by <dimension>", "roll-up: underlying | account | position", "underlying")
  .option("--window <window>", "day | after-hours | both", "both")
  .option("--after-hours", "shorthand for --window after-hours")
  .option("--day", "shorthand for --window day")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--top <n>", "limit ranked drivers (0 = all)", "12")
  .option("--json", "emit JSON")
  .action(async (opts: any) => {
    const window = opts.afterHours ? "after-hours" : opts.day ? "day" : (opts.window || "both");
    if (!["underlying", "account", "position"].includes(opts.by)) throw new Error(`--by must be underlying|account|position (got "${opts.by}")`);
    if (!["day", "after-hours", "both"].includes(window)) throw new Error(`--window must be day|after-hours|both (got "${window}")`);
    const top = Number.isFinite(Number(opts.top)) ? Number(opts.top) : 0;
    // Shared engine — identical code path to the MCP robinhood_portfolio tool (alignment invariant).
    const r = await computePortfolioPnl({ by: opts.by, window: window as any, accountNumber: opts.account, top: 0 });

    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }

    process.stdout.write(`Portfolio P&L — ${r.accounts.length} account(s) — window: ${window}\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n`);
    if (r.dayWindow?.note) process.stdout.write(`NOTE: ${r.dayWindow.note}\n`);
    process.stdout.write(`\n`);
    printTable(
      r.accounts.map((a: any) => ({ account: `${a.label} (…${String(a.accountNumber).slice(-4)})`, equity: usd(a.equityUsd), buying_power: usd(a.buyingPower), day_change_usd: usd(a.dayChangeUsd), afterhrs_change_usd: usd(a.afterHoursChangeUsd) }))
        .concat([{ account: r.complete ? "TOTAL" : `TOTAL (partial — ${r.accounts.filter((a: any) => a.partial).length} acct read failed)`, equity: usd(r.totals.equityUsd), buying_power: "", day_change_usd: usd(r.totals.dayChangeUsd), afterhrs_change_usd: usd(r.totals.afterHoursChangeUsd) }]),
      ["account", "equity", "buying_power", "day_change_usd", "afterhrs_change_usd"]
    );

    if (opts.by !== "account") {
      const wv = (x: any) => window === "after-hours" ? (Number.isFinite(x.afterHoursChangeUsd) ? x.afterHoursChangeUsd : 0)
        : window === "day" ? (Number.isFinite(x.dayChangeUsd) ? x.dayChangeUsd : 0)
        : (Number.isFinite(x.dayChangeUsd) ? x.dayChangeUsd : 0) + (Number.isFinite(x.afterHoursChangeUsd) ? x.afterHoursChangeUsd : 0);
      const ranked = (opts.by === "position" ? r.byPosition : r.byUnderlying).filter((x: any) => wv(x) < 0); // lib already sorted ascending by window
      const shown = top > 0 ? ranked.slice(0, top) : ranked;
      if (shown.length) {
        process.stdout.write(`\nBleeding most (by ${opts.by === "position" ? "position" : "underlying"}, ranked in $, ${window === "both" ? "day+AH combined" : window}):\n`);
        printTable(
          shown.map((x: any) => opts.by === "position"
            ? { name: x.name, acct: `…${String(x.accountNumber).slice(-4)}`, mkt_value_usd: usd(x.marketValueUsd), day_change_usd: usd(x.dayChangeUsd), afterhrs_change_usd: usd(x.afterHoursChangeUsd) }
            : { underlying: x.symbol, where: `${x.kinds.join("+")} ×${x.accounts.length}`, mkt_value_usd: usd(x.marketValueUsd), day_change_usd: usd(x.dayChangeUsd), afterhrs_change_usd: usd(x.afterHoursChangeUsd) }),
          opts.by === "position" ? ["name", "acct", "mkt_value_usd", "day_change_usd", "afterhrs_change_usd"] : ["underlying", "where", "mkt_value_usd", "day_change_usd", "afterhrs_change_usd"]
        );
      } else {
        process.stdout.write(window === "after-hours" && !r.afterHoursActive
          ? `\nAfter-hours Δ ≈ $0 across accounts — likely a regular session; per-name after-hours needs a live extended session.\n`
          : `\nNo losers in the ${window} window.\n`);
      }
    }
    const mp = r.reconciliation.mispricedPositions;
    process.stdout.write(`\nDrivers explain ${usd(r.reconciliation.driverDayChangeUsd)} of the ${usd(r.totals.dayChangeUsd)} day move; residual ${usd(r.reconciliation.residualUsd)} = cash / dividends / transfers / option-vs-equity timing${mp ? ` (${mp} position(s) could not be priced)` : ""}. After-hours shown is EQUITY only (options don't print after-hours).\n`);
    const warns = [...(r.warnings ?? []), ...r.accounts.flatMap((a: any) => a.warnings)];
    if (warns.length) process.stdout.write(`${warns.map((w: string) => "⚠️  " + w).join("\n")}\n`);
  });

// ── buying-power: standalone per-account buying power breakdown (CLI + MCP parity) ──
program
  .command("buying-power")
  .aliases(["bp"])
  .description("Per-account buying power breakdown: regular BP, intraday BP, unleveraged BP, cash, margin used/total, margin health. Answers 'what can I actually deploy right now?'. Live read.")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--json", "emit JSON")
  .action(async (opts: any) => {
    const graph = await brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/");
    const rows: any[] = Array.isArray(graph?.results) ? graph.results : Array.isArray(graph) ? graph : [];
    let accts: string[] = [];
    for (const a of rows) {
      if (a?.type !== "rhs" && a?.type !== "ira_roth") continue;
      if (!a.account_number) continue;
      accts.push(String(a.account_number));
    }
    if (opts.account) {
      if (!accts.includes(String(opts.account))) throw new Error(`Account ${opts.account} not found.`);
      accts = [String(opts.account)];
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

    if (opts.json) { printJson(results); return; }

    const labelMap = new Map<string, string>();
    for (const a of rows) labelMap.set(String(a.account_number), a.account_name || a.display_title || "");
    const label = (acct: string) => (labelMap.get(acct) || `…${acct.slice(-4)}`);

    process.stdout.write("Buying Power — per account\n");
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    printTable(
      results.filter((r: any) => !r.error).map((r: any) => ({
        account: `${label(r.accountNumber)} (…${String(r.accountNumber).slice(-4)})`,
        bp: usd(r.buyingPower),
        unleveraged_bp: usd(r.unleveragedBuyingPower),
        intraday_bp: usd(r.intradayBuyingPower),
        cash: usd(r.cash),
        margin_used: r.marginUsed != null ? usd(Math.abs(Number(r.marginUsed))) : "—",
        margin_health: Number.isFinite(r.marginHealthPct) ? `${r.marginHealthPct.toFixed(1)}%` : "—",
      })),
      ["account", "bp", "unleveraged_bp", "intraday_bp", "cash", "margin_used", "margin_health"]
    );

    const errs = results.filter((r: any) => r.error);
    if (errs.length) process.stdout.write(`\n⚠️  ${errs.length} account(s) failed: ${errs.map((e: any) => `…${String(e.accountNumber).slice(-4)}: ${e.error}`).join("; ")}\n`);
  });

// ── dividends: income engine — history, cadence, projected income, all in DOLLARS ──
program
  .command("dividends")
  .aliases(["divs"])
  .description("Dividend income engine: history, cadence, and PROJECTED income in dollars at every granularity ($/day · $/wk · $/mo · $/qtr · $/yr) — math done in-engine, do not hand-compute. Totals (all-time/YTD/12mo), per-symbol cadence (weekly/monthly/quarterly/semiannual/annual via median payable-date gap), upcoming payouts, and a projection from CURRENT holdings only (sold payers don't project). Live read.")
  .option("--upcoming", "show upcoming (pending / not-yet-paid) payouts")
  .option("--by-month", "show the last 12 months of received income by month")
  .option("--symbol <symbol>", "scope to one symbol")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--json", "emit JSON")
  .action(async (opts: { upcoming?: boolean; byMonth?: boolean; symbol?: string; account?: string; json?: boolean }) => {
    // Shared engine — identical code path to the MCP robinhood_dividends tool (alignment invariant).
    const r = await computeDividends({ accountNumber: opts.account, symbol: opts.symbol });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }

    process.stdout.write(`Dividends — ${r.accountsScanned.length} account(s)${r.symbol ? ` — ${r.symbol}` : ""}\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    process.stdout.write(`Received: ${usd(r.totals.allTimeUsd)} all-time · ${usd(r.totals.ytdUsd)} YTD · ${usd(r.totals.last12moUsd)} last 12 months\n\n`);

    if (opts.upcoming) {
      if (!r.upcoming.length) { process.stdout.write("No upcoming payouts on record.\n"); return; }
      printTable(
        r.upcoming.map((u: any) => ({ symbol: u.symbol, amount: usd(u.amountUsd), payable: u.payableDate ?? "—", ex_date: u.exDividendDate ?? "—", state: u.state, acct: `…${String(u.account).slice(-4)}` })),
        ["symbol", "amount", "payable", "ex_date", "state", "acct"]
      );
      process.stdout.write(`\n${r.upcoming.length} upcoming payout(s), ${usd(r.upcoming.reduce((s: number, u: any) => s + (Number.isFinite(u.amountUsd) ? u.amountUsd : 0), 0))} total.\n`);
    } else if (opts.byMonth) {
      printTable(r.byMonth.map((m: any) => ({ month: m.month, received: usd(m.totalUsd) })), ["month", "received"]);
    } else {
      if (r.bySymbol.length) {
        printTable(
          r.bySymbol.map((s: any) => ({
            symbol: s.symbol, total: usd(s.totalUsd), payouts: s.count, last: usd(s.lastAmountUsd),
            last_payable: s.lastPayableDate ?? "—", cadence: s.cadence, annualized: usd(s.annualizedUsd), held: s.currentlyHeld ? "yes" : "no"
          })),
          ["symbol", "total", "payouts", "last", "last_payable", "cadence", "annualized", "held"]
        );
      } else {
        process.stdout.write("No dividend history found.\n");
      }
      const p = r.projection;
      process.stdout.write(`\nProjected income: ${usd(p.dailyUsd)}/day · ${usd(p.weeklyUsd)}/wk · ${usd(p.monthlyUsd)}/mo · ${usd(p.quarterlyUsd)}/qtr · ${usd(p.annualUsd)}/yr from ${p.projectedSymbols.length} current holding(s)${p.excludedSoldSymbols.length ? ` (sold payers excluded: ${p.excludedSoldSymbols.join(", ")})` : ""}.\n`);
      if (r.upcoming.length) process.stdout.write(`${r.upcoming.length} upcoming payout(s) pending — run \`dividends --upcoming\`.\n`);
    }
    if (r.warnings.length) process.stdout.write(`${r.warnings.map((w: string) => "⚠️  " + w).join("\n")}\n`);
  });

// ── documents: statements, trade confirms, and the tax-season one-shot ──
const documents = new Command("documents").description(
  "Account documents: statements, trade confirms, and tax forms across all accounts. The tax-season one-shot: `documents download --type 1099 --year 2025` grabs every 1099 (incl 1099_crypto, 1099r_roth) for tax year 2025 in one command. Type is prefix-matched; tax-form years are TAX years (a 1099 dated Feb 2026 is tax year 2025). Reads + local downloads only."
);

documents
  .command("list")
  .description("List documents (newest first) with type, date, tax/statement year, account, and download URL. --type is prefix-matched (1099 catches 1099_crypto + 1099r_roth); --year is the tax year for tax forms, calendar year otherwise.")
  .option("--type <type>", "1099 | 1099_crypto | 1099r_roth | 5498_roth | account_statement | trade_confirm (prefix match)")
  .option("--year <yyyy>", "tax year for tax forms; calendar year for statements/confirms")
  .option("--account <number>", "scope to one account")
  .option("--json", "emit JSON")
  .action(async (opts: { type?: string; year?: string; account?: string; json?: boolean }) => {
    const r = await listDocuments({ type: opts.type, year: opts.year, accountNumber: opts.account });
    if (opts.json) { printJson(r); return; }
    if (!r.count) { process.stdout.write("No documents match those filters.\n"); return; }
    printTable(
      r.documents.map((d) => ({ date: d.date, year: d.year, type: d.type, acct: `…${d.accountLast4}`, file: d.filetype })),
      ["date", "year", "type", "acct", "file"]
    );
    process.stdout.write(`\n${r.count} document(s): ${Object.entries(r.byType).map(([t, c]) => `${t}×${c}`).join(", ")}.\n`);
    process.stdout.write("Download with: documents download [--type T] [--year YYYY] [--account N] [--limit N]\n");
  });

documents
  .command("download")
  .description("Download matching documents to local/documents/ (gitignored). The tax-season one-shot: `documents download --type 1099 --year 2025` = every 1099 (brokerage + crypto + Roth) for tax year 2025, named <year>-<type>-<acct last4>-<date>.<ext>.")
  .option("--type <type>", "document type, prefix-matched (1099 catches all 1099 variants)")
  .option("--year <yyyy>", "tax year for tax forms; calendar year otherwise")
  .option("--account <number>", "scope to one account")
  .option("--limit <n>", "download at most N (newest first)")
  .option("--json", "emit JSON")
  .action(async (opts: { type?: string; year?: string; account?: string; limit?: string; json?: boolean }) => {
    const r = await downloadDocuments({ type: opts.type, year: opts.year, accountNumber: opts.account, limit: opts.limit ? Number(opts.limit) : undefined });
    if (opts.json) { printJson(r); return; }
    for (const f of r.downloaded) process.stdout.write(`saved ${f.file} (${f.bytes.toLocaleString("en-US")} bytes)\n`);
    for (const f of r.failures) process.stdout.write(`FAILED ${f.file}: ${f.error}\n`);
    process.stdout.write(`\n${r.downloaded.length} document(s) saved to ${r.directory}${r.skipped ? ` (${r.skipped} more matched — raise --limit)` : ""}${r.failures.length ? `; ${r.failures.length} failed` : ""}.\n`);
  });

program.addCommand(documents);

// ── margin: am I borrowing, how much, at what rate, billed when ──
program
  .command("margin")
  .description("Margin health: am I borrowing, how much, at what rate, billed when — plus margin available, buying power with margin, and projected intraday BP, per account. Accounts without margin data are skipped silently. Live read.")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; json?: boolean }) => {
    // Shared engine — identical code path to the MCP robinhood_margin tool (alignment invariant).
    const r = await getMarginHealth(opts.account);
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    if (!r.accounts.length) {
      process.stdout.write(`No margin data on any scanned account (${r.scanned.join(", ")}).\n`);
      return;
    }
    process.stdout.write(`Margin health — ${r.accounts.length} of ${r.scanned.length} account(s) report margin\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    printTable(
      r.accounts.map((a) => ({
        account: `${a.label} (…${a.accountNumber.slice(-4)})`,
        borrowed: usd(a.borrowedUsd),
        rate: Number.isFinite(a.marginInterestRatePct) ? `${a.marginInterestRatePct.toFixed(2)}%` : "—",
        next_billing: a.nextBillingDate ?? "—",
        margin_available: usd(a.marginAvailableUsd),
        bp_with_margin: usd(a.buyingPowerWithMarginUsd),
        intraday_bp: usd(a.projectedIntradayBpUsd)
      })),
      ["account", "borrowed", "rate", "next_billing", "margin_available", "bp_with_margin", "intraday_bp"]
    );
    process.stdout.write("\n");
    for (const a of r.accounts) {
      const who = `…${a.accountNumber.slice(-4)}`;
      process.stdout.write(a.borrowedUsd > 0
        ? `${who} is borrowing ${usd(a.borrowedUsd)} at ${Number.isFinite(a.marginInterestRatePct) ? a.marginInterestRatePct.toFixed(2) : "?"}%${a.nextBillingDate ? ` — next billed ${a.nextBillingDate}` : ""}.\n`
        : `${who} is not borrowing on margin${Number.isFinite(a.marginAvailableUsd) && a.marginAvailableUsd > 0 ? ` (${usd(a.marginAvailableUsd)} margin available)` : ""}.\n`);
    }
    if (r.skipped.length) process.stdout.write(`\n${r.skipped.length} account(s) without margin data: ${r.skipped.join(", ")}.\n`);
  });

// ── review: FILM-STUDY MODE — study what worked, attach lessons, revisit best/worst trades ──
const review = new Command("review").description(
  "Film-study mode (the athlete-watching-tape loop): pair your FILLED orders into round trips and show what each trade actually MADE or LOST in dollars — entry/exit, hold days, win rate, best and worst performances — with your own trade-notes.md lessons attached to the trades they reference. Study what worked, write down why, revisit it before the next trade. Read-only against the account; `review note` appends to trade-notes.md (a local file, not the brokerage)."
);

review
  .option("--days <n>", "look-back window in days (default 90)", "90")
  .option("--symbol <symbol>", "scope to one underlying, e.g. HPE")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--json", "emit JSON")
  .action(async (opts: { days?: string; symbol?: string; account?: string; json?: boolean }) => {
    // Shared engine — identical code path to the MCP robinhood_review tool (alignment invariant).
    const r = await computeTradeReview({ days: Number(opts.days ?? "90"), symbol: opts.symbol, accountNumber: opts.account });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }

    process.stdout.write(`Trade review — last ${r.days} day(s), ${r.accountsScanned.length} account(s)${opts.symbol ? ` — ${opts.symbol.toUpperCase()}` : ""}\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    if (r.roundTrips.length) {
      printTable(
        r.roundTrips.map((t) => ({
          trade: t.contract ?? t.symbol,
          dir: t.direction,
          qty: t.quantity,
          pnl_usd: usd(t.realizedPnlUsd),
          hold_days: Number.isFinite(t.holdDays) ? t.holdDays : "—",
          entry: usd(t.entryUsd),
          exit: usd(t.exitUsd),
          acct: `…${t.account.slice(-4)}`,
          notes: t.notes.length ? `${t.notes.length}×📝` : ""
        })),
        ["trade", "dir", "qty", "pnl_usd", "hold_days", "entry", "exit", "acct", "notes"]
      );
    } else {
      process.stdout.write("No completed round trips in the window.\n");
    }
    const s = r.summary;
    const fmtBest = (t: typeof s.bestTrade) => (t ? `${t.contract ?? t.symbol} ${t.realizedPnlUsd >= 0 ? "+" : "-"}$${Math.abs(t.realizedPnlUsd).toFixed(2)}` : "—");
    process.stdout.write(`\n${s.roundTrips} round trip(s): ${s.winners}W/${s.losers}L${Number.isFinite(s.winRatePct) ? ` (${s.winRatePct.toFixed(1)}% win)` : ""}, ${s.totalRealizedUsd >= 0 ? "+" : "-"}$${Math.abs(s.totalRealizedUsd).toFixed(2)} net; best ${fmtBest(s.bestTrade)}, worst ${fmtBest(s.worstTrade)}${Number.isFinite(s.avgHoldDays) ? `; avg hold ${s.avgHoldDays}d` : ""}.\n`);
    if (s.openLegs) process.stdout.write(`${s.openLegs} open/unmatched leg(s) excluded from round-trip math (flagged openLeg — still open or the other side filled outside the window).\n`);
    const annotated = r.roundTrips.filter((t) => t.notes.length);
    if (annotated.length) {
      process.stdout.write(`\nFilm-study notes:\n`);
      for (const t of annotated) {
        for (const note of t.notes) process.stdout.write(`  ${t.contract ?? t.symbol} · ${note.when} | ${note.ref}\n    ${note.note.split("\n").join("\n    ")}\n`);
      }
    }
    process.stdout.write(`\nAttach a lesson: review note <ref> "<text>"  (ref = order id, symbol, or symbol+date)\n`);
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
  });

review
  .command("note")
  .description("Append a film-study note to repo-root trade-notes.md. ref = order id, symbol, or symbol+date (freeform); `review` attaches it to matching trades by ref. Local file write only — never touches the account.")
  .argument("<ref>", "order id, symbol, or symbol+date the note refers to")
  .argument("<text...>", "the note text (quote it)")
  .option("--json", "emit JSON")
  .action((ref: string, textParts: string[], opts: { json?: boolean }) => {
    const r = addTradeNote({ ref, note: textParts.join(" ") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`noted → ${r.file}\n${r.entry}`);
  });

program.addCommand(review);

// ── hotlist: operator-maintained ticker watchlist (hotlist.md) + live quotes ──
program
  .command("hotlist")
  .description("Quote the operator's hotlist (repo-root hotlist.md — one `TICKER — thesis` per line, agents read it on finance tasks alongside ball-knowledge.md): live last, day $ and % change, and the thesis for every listed ticker. Headers/blank/example-marked lines are ignored. Live read.")
  .option("--json", "emit JSON")
  .action(async (opts: { json?: boolean }) => {
    // Shared engine — identical code path to the MCP robinhood_hotlist tool (alignment invariant).
    const r = await computeHotlist();
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    if (!r.count) {
      // The engine's only warning in this state repeats this same message — don't double-print.
      process.stdout.write("hotlist.md has no active entries — add lines like `NVDA — ai capex thesis` (example-marked lines are ignored).\n");
      return;
    } else {
      printTable(
        r.rows.map((row) => ({
          ticker: row.symbol,
          last: row.found ? usd(row.lastUsd) : "not found",
          day_usd: Number.isFinite(row.dayChangeUsd) ? `${row.dayChangeUsd >= 0 ? "+" : "-"}$${Math.abs(row.dayChangeUsd).toFixed(2)}` : "—",
          day_pct: pct(row.dayChangePct),
          thesis: row.thesis ?? "—"
        })),
        ["ticker", "last", "day_usd", "day_pct", "thesis"]
      );
    }
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
  });

// ── knowledge: the operator knowledge library (knowledge/ + playbooks + docs/ index) ──
// Zayd Khan // cold // www.zayd.wtf
program
  .command("knowledge")
  .argument("[id]", "module id to print (basename without .md), e.g. wheel, rolling, broker-call")
  .description("Operator knowledge library. No arg → the index: every knowledge/ module + playbook with its when-to-load routing hint, plus the docs/ deep-dive index (titles only). With <id> → print that module in full. Shared engine with the MCP robinhood_knowledge tool. Local file read; never calls the brokerage.")
  .option("--json", "emit JSON")
  .action((id: string | undefined, opts: { json?: boolean }) => {
    // Shared engine — identical code path to the MCP robinhood_knowledge tool (alignment invariant).
    if (id) {
      const mod = readKnowledge(id);
      if (opts.json) { printJson(mod); return; }
      process.stdout.write(mod.content.endsWith("\n") ? mod.content : `${mod.content}\n`);
      return;
    }
    const entries = listKnowledge();
    if (opts.json) { printJson({ count: entries.length, entries }); return; }
    const modules = entries.filter((e) => e.kind !== "doc");
    const docs = entries.filter((e) => e.kind === "doc");
    process.stdout.write(`Knowledge library — ${modules.length} operating module(s), ${docs.length} deep-dive doc(s)\n\n`);
    printTable(
      modules.map((e) => ({
        id: e.id,
        kind: e.kind,
        when_to_load: e.whenToLoad ? (e.whenToLoad.length > 88 ? `${e.whenToLoad.slice(0, 88)}…` : e.whenToLoad) : "—"
      })),
      ["id", "kind", "when_to_load"]
    );
    process.stdout.write(`\nDeep-dive docs (same reader): ${docs.map((d) => d.id).join(", ")}\n`);
    process.stdout.write(`\nRead one: knowledge <id>   (e.g. knowledge wheel)\n`);
  });

// ── roll-ledger: pending cash-account (kosher) roll intents — rolls.md bookkeeping ──
// Zayd Khan // cold // www.zayd.wtf
const rollLedger = new Command("roll-ledger").description(
  "Pending kosher-roll ledger (repo-root rolls.md). A cash-account roll is a TWO-DAY trade — close today, open next business day with settled cash — and sessions die between the legs; this ledger carries the staged intent across them. `list` (default) shows what's pending, `add` records a staged roll, `done <symbol>` removes the entry once the open leg fills (and logs the completion to trading-log.md). Local markdown bookkeeping only — order history remains the only proof either leg executed."
);

rollLedger
  .command("list", { isDefault: true })
  .description("List every pending kosher-roll intent (the example entry is ignored). Default subcommand.")
  .option("--json", "emit JSON")
  .action((opts: { json?: boolean }) => {
    const rolls = listPendingRolls();
    if (opts.json) { printJson({ count: rolls.length, rolls: rolls.map(({ block: _b, ...rest }) => rest) }); return; }
    if (!rolls.length) {
      process.stdout.write("No pending kosher rolls. Stage one with `roll-ledger add --symbol <SYM> ...` (or take the tip line from `options roll-plan --cash-account`).\n");
      return;
    }
    printTable(
      rolls.map((r) => ({
        symbol: r.symbol,
        opened: r.opened,
        earliest_open: r.earliestOpenDate ?? "—",
        account: r.account ?? "—",
        closed_leg: r.closedLeg ?? "—",
        open_intent: r.openIntent ?? "—"
      })),
      ["symbol", "opened", "earliest_open", "account", "closed_leg", "open_intent"]
    );
    process.stdout.write(`\n${rolls.length} pending roll(s). When an open leg fills: roll-ledger done <symbol> — order history is the proof, this file is just the thread.\n`);
  });

rollLedger
  .command("add")
  .description("Record a staged cash-account roll: the closed leg (done today) + the open-leg intent (next business day). Appends to rolls.md.")
  .requiredOption("--symbol <symbol>", "underlying ticker, e.g. F")
  .option("--account <number>", "account it lives in (stored masked to last-4)")
  .option("--closed <desc>", 'closed leg: contract, qty, price, order-id — e.g. "1x F $11p 6/12 BTC @ $0.18, order-id abc123"')
  .option("--open-intent <desc>", "intended open leg: expiration/strike/type + target price or 'fresh quote Monday'")
  .option("--earliest <date>", "earliest open date YYYY-MM-DD (next business day after the close)")
  .option("--note <text>", "anything the next session should know")
  .option("--json", "emit JSON")
  .action((opts: { symbol: string; account?: string; closed?: string; openIntent?: string; earliest?: string; note?: string; json?: boolean }) => {
    const r = addPendingRoll({
      symbol: opts.symbol,
      account: opts.account,
      closedLeg: opts.closed,
      openIntent: opts.openIntent,
      earliestOpenDate: opts.earliest,
      notes: opts.note
    });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`staged → ${r.file}\n${r.entry}`);
  });

rollLedger
  .command("done")
  .description('Mark a pending roll complete (open leg filled, or plan dropped): removes the entry from rolls.md and appends the completion to trading-log.md. Disambiguate duplicates with "SYMBOL YYYY-MM-DD".')
  .argument("<symbol...>", 'symbol of the completed roll (optionally "SYMBOL YYYY-MM-DD")')
  .option("--json", "emit JSON")
  .action((symbolParts: string[], opts: { json?: boolean }) => {
    const r = completePendingRoll(symbolParts.join(" "));
    const log = appendRollCompletionLog(r.removed);
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), file: r.file, removed: { ...r.removed, block: undefined }, remaining: r.remaining, tradingLog: log.file });
      return;
    }
    process.stdout.write(`cleared ${r.removed.symbol} (staged ${r.removed.opened}) from ${r.file} — ${r.remaining} pending roll(s) remain.\n`);
    process.stdout.write(`completion logged → ${log.file}\n`);
    process.stdout.write(`Reminder: order history is the only proof the open leg executed — verify with \`orders open\` / order-status if you haven't.\n`);
  });

program.addCommand(rollLedger);

// Zayd Khan // cold // www.zayd.wtf

// ── buy: simple market/limit order — one command, no raw JSON needed ──
program
  .command("buy")
  .aliases(["order"])
  .description("Place an equity order. Market buys are fractional. Dry-run by default; pass --live and set ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute.")
  .requiredOption("-s, --symbol <symbol>", "Ticker symbol")
  .requiredOption("-a, --account <number>", "Account number")
  .option("-m, --amount <dollars>", "Dollar amount (notional) — alternative to --shares")
  .option("-q, --shares <number>", "Share quantity — alternative to --amount")
  .option("-p, --price <number>", "Limit price (omit for market order)")
  .option("--live", "Send live (requires ROBINHOOD_ALLOW_LIVE_WRITE=1)")
  .option("--force", "Skip duplicate order check")
  .option("--json", "emit JSON")
  .action(async (opts: any) => {
    // Validation, OTC/fractional guard, quote check, dedup, ref_id, gates, and trade logging
    // all live in the shared engine — identical behavior to the MCP robinhood_buy tool.
    const r = await placeEquityOrder({
      symbol: opts.symbol,
      accountNumber: opts.account,
      side: "buy",
      amount: opts.amount ? Number(opts.amount) : undefined,
      shares: opts.shares ? Number(opts.shares) : undefined,
      limitPrice: opts.price ? Number(opts.price) : undefined,
      liveWrite: Boolean(opts.live),
      force: Boolean(opts.force)
    });

    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), symbol: opts.symbol, account: opts.account, shares: r.shares, estimatedPrice: r.estimatedPrice, estimatedTotal: r.estimatedTotal, type: r.type, dollarBased: r.dollarBased, session: r.session, sessionWarning: r.sessionWarning, live: r.live, refId: r.refId, result: r.result });
      return;
    }

    const mode = r.dryRun ? "DRY RUN" : "LIVE";
    const sizing = r.dollarBased ? `$${r.estimatedTotal.toFixed(2)} (dollar-based ≈ ${r.shares.toFixed(6)} sh)` : `${r.shares.toFixed(6)} sh ≈ $${r.estimatedTotal.toFixed(2)}`;
    process.stdout.write(`${mode} ${r.type} buy: ${r.symbol} ${sizing} @ ~$${r.estimatedPrice.toFixed(2)}  acct=…${String(opts.account).slice(-4)}${r.session ? `  [${r.session}]` : ""}\n`);
    if (r.sessionWarning) process.stdout.write(`⚠️  ${r.sessionWarning}\n`);
    if (r.dryRun) process.stdout.write("Add ROBINHOOD_ALLOW_LIVE_WRITE=1 (--live optional) to execute.\n");
    else process.stdout.write(`Status: ${r.httpStatus}  id=${r.orderId ?? "?"}  state=${r.state ?? "?"}\n`);
  });

// ── sell: mirror of buy for closing/reducing positions ──
program
  .command("sell")
  .description("Place an equity sell order. Market sells are fractional. Dry-run by default; pass --live and set ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute.")
  .requiredOption("-s, --symbol <symbol>", "Ticker symbol")
  .requiredOption("-a, --account <number>", "Account number")
  .option("-m, --amount <dollars>", "Dollar amount (notional) — alternative to --shares")
  .option("-q, --shares <number>", "Share quantity — alternative to --amount")
  .option("-p, --price <number>", "Limit price (omit for market order)")
  .option("--live", "Send live (requires ROBINHOOD_ALLOW_LIVE_WRITE=1)")
  .option("--force", "Skip duplicate order check")
  .option("--json", "emit JSON")
  .action(async (opts: any) => {
    // Same shared engine as `buy` and the MCP robinhood_sell tool — only the side differs.
    const r = await placeEquityOrder({
      symbol: opts.symbol,
      accountNumber: opts.account,
      side: "sell",
      amount: opts.amount ? Number(opts.amount) : undefined,
      shares: opts.shares ? Number(opts.shares) : undefined,
      limitPrice: opts.price ? Number(opts.price) : undefined,
      liveWrite: Boolean(opts.live),
      force: Boolean(opts.force)
    });

    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), symbol: opts.symbol, account: opts.account, shares: r.shares, estimatedPrice: r.estimatedPrice, estimatedTotal: r.estimatedTotal, type: r.type, dollarBased: r.dollarBased, session: r.session, sessionWarning: r.sessionWarning, live: r.live, refId: r.refId, result: r.result });
      return;
    }

    const mode = r.dryRun ? "DRY RUN" : "LIVE";
    const sizing = r.dollarBased ? `$${r.estimatedTotal.toFixed(2)} (dollar-based ≈ ${r.shares.toFixed(6)} sh)` : `${r.shares.toFixed(6)} sh ≈ $${r.estimatedTotal.toFixed(2)}`;
    process.stdout.write(`${mode} ${r.type} sell: ${r.symbol} ${sizing} @ ~$${r.estimatedPrice.toFixed(2)}  acct=…${String(opts.account).slice(-4)}${r.session ? `  [${r.session}]` : ""}\n`);
    if (r.sessionWarning) process.stdout.write(`⚠️  ${r.sessionWarning}\n`);
    if (r.dryRun) process.stdout.write("Add ROBINHOOD_ALLOW_LIVE_WRITE=1 (--live optional) to execute.\n");
    else process.stdout.write(`Status: ${r.httpStatus}  id=${r.orderId ?? "?"}  state=${r.state ?? "?"}\n`);
  });

// ── cancel: cancel a pending order by ID (equity or options) ──
// Zayd Khan // cold // www.zayd.wtf
program
  .command("cancel")
  .description("Cancel a pending order by ID (equity or options). Dry-run by default; pass --live and set ROBINHOOD_ALLOW_LIVE_WRITE=1 to execute. Live cancels re-read the order from order history (evidence).")
  .requiredOption("-i, --id <order_id>", "Order ID or URL to cancel")
  .option("-k, --kind <kind>", "Order kind: equity (default) or options", "equity")
  .option("--live", "Send live (requires ROBINHOOD_ALLOW_LIVE_WRITE=1)")
  .option("--force", "Skip duplicate order check")
  .option("--json", "emit JSON")
  .action(async (opts: any) => {
    const kind = String(opts.kind ?? "equity").toLowerCase();
    if (kind !== "equity" && kind !== "options") throw new Error(`--kind must be equity or options (got "${opts.kind}")`);
    // Shared engine (cancelOrder in lib.ts) — same path as MCP robinhood_cancel and `panic`:
    // gated write + post-cancel order-history evidence re-read on live sends.
    const r = await cancelOrder({ idOrUrl: opts.id, kind, liveWrite: Boolean(opts.live) });
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), ...r });
      return;
    }
    const mode = r.dryRun ? "DRY RUN" : "LIVE";
    process.stdout.write(`${mode} cancel (${r.kind}): ${r.orderId}  status=${r.httpStatus}\n`);
    if (r.dryRun) process.stdout.write("Nothing was sent. Add ROBINHOOD_ALLOW_LIVE_WRITE=1 (--live optional) to execute.\n");
    if (r.evidence) {
      process.stdout.write(`evidence: confirmed=${r.evidence.confirmed} state=${r.evidence.state ?? "?"}\n`);
      if (r.evidence.warning) process.stdout.write(`⚠️  ${r.evidence.warning}\n`);
    }
  });

// ── orders: open/pending order views across all accounts ──
// Zayd Khan // cold // www.zayd.wtf
const ordersCmd = new Command("orders").description("Order views across all owned accounts");

ordersCmd
  .command("open")
  .description("All open/pending equity + options orders across accounts, symbol-resolved, with age, TIF, limit price, and the cancel command for each. Read-only.")
  .option("-a, --account <number>", "Limit to one account")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; json?: boolean }) => {
    const r = await listOpenOrders({ accountNumber: opts.account });
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), ...r });
      return;
    }
    process.stdout.write(`Open orders across ${r.accountsScanned.length} account(s): ${r.orders.length}\n`);
    if (r.orders.length > 0) {
      printTable(
        r.orders.map((o) => ({
          kind: o.kind,
          symbol: o.symbol,
          detail: o.description,
          state: o.state,
          tif: o.timeInForce ?? "—",
          limit: Number.isFinite(o.price) ? `$${o.price.toFixed(2)}` : "mkt",
          age_h: o.ageHours ?? "—",
          account: `…${o.accountNumber.slice(-4)}`,
          id: o.id.slice(0, 8)
        })),
        ["kind", "symbol", "detail", "state", "tif", "limit", "age_h", "account", "id"]
      );
      process.stdout.write("\nCancel any of these (dry-run by default):\n");
      for (const o of r.orders) process.stdout.write(`  ${o.cancelCommand}\n`);
    } else {
      process.stdout.write("No open/pending orders — nothing is working in the market right now.\n");
    }
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
  });

program.addCommand(ordersCmd);

// ── panic: enumerate and cancel EVERY open order across all accounts (env-gated per cancel) ──
// Zayd Khan // cold // www.zayd.wtf
program
  .command("panic")
  .description("Cancel-all: list every open/pending equity+options order across ALL accounts and cancel each (each cancel individually env-gated). DRY-RUN by default — shows the would-cancel list and sends NOTHING; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (the single switch; --live-write optional).")
  .option("-a, --account <number>", "Limit to one account")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; liveWrite?: boolean; json?: boolean }) => {
    const r = await panicCancelAll({ accountNumber: opts.account, liveWrite: Boolean(opts.liveWrite) });
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), ...r });
      return;
    }
    process.stdout.write(`PANIC ${r.dryRun ? "(DRY RUN — nothing sent)" : "(LIVE)"} — ${r.summary}\n`);
    if (r.orders.length > 0) {
      printTable(
        r.orders.map((o) => ({
          kind: o.kind,
          symbol: o.symbol,
          detail: o.description,
          state: o.state,
          account: `…${o.accountNumber.slice(-4)}`,
          cancel: o.cancel.dryRun ? "WOULD CANCEL" : `${o.cancel.httpStatus}${o.cancel.evidence ? ` (${o.cancel.evidence.confirmed ? `confirmed:${o.cancel.evidence.state}` : "UNCONFIRMED"})` : ""}`
        })),
        ["kind", "symbol", "detail", "state", "account", "cancel"]
      );
      for (const o of r.orders) {
        if (o.cancel.evidence?.warning) process.stdout.write(`⚠️  ${o.symbol} ${o.id.slice(0, 8)}: ${o.cancel.evidence.warning}\n`);
        if (o.cancel.error) process.stdout.write(`⚠️  ${o.symbol} ${o.id.slice(0, 8)}: cancel failed — ${o.cancel.error}\n`);
      }
    }
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
  });

// ── pretrade: PASS/WARN/BLOCK preflight checklist before building any order (read-only) ──
// Zayd Khan // cold // www.zayd.wtf
program
  .command("pretrade")
  .description("Pre-trade preflight: account class, buying power (incl. the overnight-BP-for-GTC note), options BP/collateral, chain min-tick vs --limit-price, OTC/fractional guard, contract existence. READ-ONLY — never POSTs. Summary: CLEAR TO BUILD ORDER or BLOCKED.")
  .requiredOption("-a, --account <number>", "Account number to preflight")
  .option("-s, --symbol <symbol>", "Underlying symbol (enables chain/OTC checks)")
  .option("--chain-id <id>", "Options chain id (skips the symbol→chain resolution)")
  .option("--strike <k>", "Strike (with --expiration and --type, verifies the exact contract exists)")
  .option("--expiration <date>", "Expiration YYYY-MM-DD")
  .option("--type <type>", "Option type: call or put")
  .option("--limit-price <p>", "Intended limit price (enables the min-tick check)")
  .option("--json", "emit JSON")
  .action(async (opts: any) => {
    if (opts.type && opts.type !== "call" && opts.type !== "put") throw new Error(`--type must be call or put (got "${opts.type}")`);
    const r = await runPretradeChecks({
      accountNumber: opts.account,
      symbol: opts.symbol,
      chainId: opts.chainId,
      strike: opts.strike != null ? Number(opts.strike) : undefined,
      expiration: opts.expiration,
      optionType: opts.type,
      limitPrice: opts.limitPrice != null ? Number(opts.limitPrice) : undefined
    });
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), ...r });
      return;
    }
    process.stdout.write(`Pre-trade preflight — account …${String(opts.account).slice(-4)}${r.accountClass ? ` (${r.accountClass})` : ""}  [read-only; nothing sent]\n\n`);
    printTable(
      r.checks.map((c) => ({ check: c.id, status: c.status, detail: c.detail.length > 110 ? `${c.detail.slice(0, 107)}...` : c.detail })),
      ["check", "status", "detail"]
    );
    for (const c of r.checks) {
      if (c.detail.length > 110) process.stdout.write(`\n${c.id} [${c.status}]: ${c.detail}\n`);
    }
    process.stdout.write(`\n${r.clear ? "✅" : "⛔"} ${r.summary}\n${r.note}\n`);
  });

// ── order: check status of a single order by ID ──
program
  .command("order-status")
  .aliases(["status"])
  .description("Check status of a single order by ID or URL. Shows symbol, side, quantity, price, state, fills.")
  .requiredOption("-i, --id <order_id>", "Order ID or full URL")
  .option("--json", "emit JSON")
  .action(async (opts: any) => {
    // getOrderStatus resolves the instrument UUID to a real ticker (order GETs carry no symbol).
    const data = await getOrderStatus(opts.id);
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), ...data });
      return;
    }
    const o = data;
    const sym = o.symbol ?? "?";
    process.stdout.write(`${o.side?.toUpperCase() ?? "?"} ${sym}  ${o.cumulative_quantity ?? "0"} sh  @ $${Number(o.average_price ?? o.price ?? 0).toFixed(2)}  state=${o.state ?? "?"}\n`);
    process.stdout.write(`id: ${o.id}\n`);
    process.stdout.write(`created: ${o.created_at}\n`);
    if (o.executions?.length) {
      process.stdout.write(`fills: ${o.executions.length}  total_notional: ${o.total_notional?.amount ?? "?"}\n`);
    }
  });

// ── wheel: where am I in the Wheel, and what's the next leg? (evidence-based, read-only) ──
program
  .command("wheel")
  .argument("[symbol]", "Underlying to inspect (omit to scan every wheel-relevant symbol)")
  .description("Wheel status from account evidence: shares + short puts (CSP) + short calls (CC) per account, the stage, and the literal next-leg dry-run command. Read-only.")
  .option("-a, --account <number>", "Limit to one account")
  .option("--json", "emit JSON")
  .action(async (symbol: string | undefined, opts: any) => {
    const r = await computeWheelState({ symbol, accountNumber: opts.account });
    if (opts.json) {
      printJson({ generatedAt: new Date().toISOString(), ...r });
      return;
    }
    process.stdout.write(`Wheel status — ${r.states.length} position(s) across ${r.accountsScanned.length} account(s)\n`);
    for (const s of r.states) {
      const acct = s.account ? `…${String(s.account).slice(-4)}${s.accountLabel ? ` (${s.accountLabel})` : ""}` : s.accountLabel;
      process.stdout.write(`\n${s.symbol} — ${acct}\n`);
      process.stdout.write(`  stage: ${s.stage}\n`);
      process.stdout.write(`  ${s.summary}\n`);
      process.stdout.write(`  next: ${s.nextLeg.action}\n`);
      process.stdout.write(`        ${s.nextLeg.rationale}\n`);
      if (s.nextLeg.command) process.stdout.write(`  run:  ${s.nextLeg.command}\n`);
      for (const b of s.blockers) process.stdout.write(`  ⚠️  ${b}\n`);
    }
    for (const note of r.notes) process.stdout.write(`\n⚠️  ${note}\n`);
    process.stdout.write(`\nBackground: ${r.reference} — ${r.disclaimer}\n`);
    // Pending kosher rolls are two-day trades that outlive sessions — surface them wherever rolling context appears.
    const pendingRolls = listPendingRolls();
    if (pendingRolls.length) process.stdout.write(`\n⏳ ${pendingRolls.length} pending kosher roll(s) — run roll-ledger list\n`);
  });

// ── income: combined income engine (dividends + option premium) ──
program
  .command("income")
  .description("Combined income engine: dividends + option premium net of debits, broken down by month, with TTM total, monthly average, and projected annual run-rate. Math done in-engine — do not hand-compute. Live read.")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--year <yyyy>", "focus on a year (default: current year)")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; year?: string; json?: boolean }) => {
    const r = await computeIncome({ accountNumber: opts.account, year: opts.year ? Number(opts.year) : undefined });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`Combined Income — ${r.accountsScanned.length} account(s) — ${r.year}\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    process.stdout.write(`TTM: ${usd(r.ttmTotalUsd)} total (divs ${usd(r.dividendsTtmUsd)} + premium ${usd(r.optionPremiumTtmUsd)})\n`);
    process.stdout.write(`Monthly avg: ${usd(r.monthlyAverageUsd)} · projected annual: ${usd(r.projectedAnnualRunRateUsd)}\n\n`);
    if (r.monthlyBreakdown.length) {
      printTable(
        r.monthlyBreakdown.map((m) => ({ month: m.month, dividends: usd(m.dividendsUsd), premium: usd(m.optionPremiumUsd), total: usd(m.totalUsd) })),
        ["month", "dividends", "premium", "total"]
      );
    } else {
      process.stdout.write("No income data for this period.\n");
    }
    if (r.warnings.length) process.stdout.write(`${r.warnings.map((w: string) => "⚠️  " + w).join("\n")}\n`);
    if (r.notes?.length) process.stdout.write(`\n📝 ${r.notes.join("\n")}\n`);
  });

// ── risk: portfolio risk scanner ──
program
  .command("risk")
  .description("Portfolio risk scanner: max loss per position, ITM assignment exposure, undercovered short legs, margin-call distance, and concentration warnings (>20% in one symbol). Live read.")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; json?: boolean }) => {
    const r = await computeRisk({ accountNumber: opts.account });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`Portfolio Risk — ${r.accountsScanned.length} account(s)\n`);
    process.stdout.write(`Equity: ${usd(r.totalEquityUsd)} · Borrowed: ${usd(r.totalBorrowedUsd)}`);
    if (r.marginCallDistancePct !== null) process.stdout.write(` · Margin-call buffer: ${r.marginCallDistancePct.toFixed(1)}%`);
    process.stdout.write(`\nas of ${new Date().toISOString()}\n\n`);
    if (r.concentrationWarnings.length) {
      process.stdout.write("CONCENTRATION WARNINGS:\n");
      for (const c of r.concentrationWarnings) process.stdout.write(`  ⚠️ ${c.message}\n`);
      process.stdout.write("\n");
    }
    if (r.positions.length) {
      printTable(
        r.positions.map((p) => ({
          kind: p.kind, symbol: p.symbol, desc: p.description.slice(0, 50), side: p.side, qty: p.quantity,
          mktVal: usd(p.marketValueUsd), maxLoss: p.maxLossUsd !== null ? usd(p.maxLossUsd) : "unlimited",
          itmRisk: p.itmExpirationRisk ? "⚠️" : "", undercovered: p.undercoveredShortLegs || "",
          acct: `…${p.account.slice(-4)}`
        })),
        ["kind", "symbol", "desc", "side", "qty", "mktVal", "maxLoss", "itmRisk", "undercovered", "acct"]
      );
    } else {
      process.stdout.write("No open positions.\n");
    }
    if (r.warnings.length) process.stdout.write(`${r.warnings.map((w: string) => "⚠️  " + w).join("\n")}\n`);
  });

// ── whatif: greeks scenario calculator ──
program
  .command("whatif")
  .description("Greeks scenario calculator: apply spot ±X%, IV ±N%, T - N days, rate ±P% to portfolio Greeks and compute estimated P&L per position and total. Live read.")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--spot-pct <pct>", "spot change in % (e.g. +5 or -3)", "0")
  .option("--iv-pct <pct>", "IV change in % points (e.g. +10 or -5)", "0")
  .option("--days <n>", "days of theta decay", "0")
  .option("--rate-change-pct <pct>", "rate change in % points (rho sensitivity)", "0")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; spotPct?: string; ivPct?: string; days?: string; rateChangePct?: string; json?: boolean }) => {
    const r = await computeWhatIf({
      accountNumber: opts.account, spotPct: Number(opts.spotPct ?? "0"),
      ivPct: Number(opts.ivPct ?? "0"), days: Number(opts.days ?? "0"),
      rateChangePct: Number(opts.rateChangePct ?? "0")
    });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    const s = r.scenario;
    process.stdout.write(`What-If Scenario — ${r.accountsScanned.length} account(s)\n`);
    process.stdout.write(`Spot ${s.spotChangePct >= 0 ? "+" : ""}${s.spotChangePct}% · IV ${s.ivChangePct >= 0 ? "+" : ""}${s.ivChangePct}% · T-${s.daysPassed}d · Rate Δ ${s.rateChangePct >= 0 ? "+" : ""}${s.rateChangePct}%\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    process.stdout.write(`Estimated P&L: ${usd(r.totalEstimatedPnlUsd)}\n`);
    process.stdout.write(`  delta: ${usd(r.greekDecomposition.deltaUsd)} · gamma: ${usd(r.greekDecomposition.gammaUsd)} · theta: ${usd(r.greekDecomposition.thetaUsd)} · vega: ${usd(r.greekDecomposition.vegaUsd)} · rho: ${usd(r.greekDecomposition.rhoUsd)}\n\n`);
    if (r.perPosition.length) {
      printTable(
        r.perPosition.map((p) => ({
          symbol: p.symbol, desc: p.description.slice(0, 40), estPnl: usd(p.estimatedPnlUsd),
          mktVal: usd(p.marketValueUsd), delta: p.netDelta.toFixed(0), gamma: p.netGamma.toFixed(1),
          theta: p.netTheta.toFixed(1), vega: p.netVega.toFixed(1)
        })),
        ["symbol", "desc", "estPnl", "mktVal", "delta", "gamma", "theta", "vega"]
      );
    } else {
      process.stdout.write("No option positions to scenario-model.\n");
    }
    if (r.warnings.length) process.stdout.write(`${r.warnings.map((w: string) => "⚠️  " + w).join("\n")}\n`);
  });

// ── calendar: event calendar ──
program
  .command("calendar")
  .description("Event calendar: upcoming option expirations, ex-dividend dates, and earnings dates (if available). Sorted by date with assignment-risk flags. Live read.")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--days <n>", "look-ahead in days (default: 30)", "30")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; days?: string; json?: boolean }) => {
    const r = await computeCalendar({ accountNumber: opts.account, days: Number(opts.days ?? "30") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`Event Calendar — next ${r.days} day(s) — ${r.accountsScanned.length} account(s)\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    if (r.events.length) {
      printTable(
        r.events.map((e) => ({
          date: e.date, type: e.type, symbol: e.symbol, detail: e.detail.slice(0, 60),
          risk: e.assignmentRisk ? "⚠️ ASSIGN" : ""
        })),
        ["date", "type", "symbol", "detail", "risk"]
      );
    } else {
      process.stdout.write("No upcoming events in this window.\n");
    }
    if (r.warnings.length) process.stdout.write(`${r.warnings.map((w: string) => "⚠️  " + w).join("\n")}\n`);
  });

// ── Signal & event reads (Phase 3): news / ratings / earnings / movers / options-events ──
// First-class wrappers over the midlands + marketdata signal layer the docs reference but which were
// previously reachable only via raw brokerage execute (no ?query= support). All live reads, no gate.
program
  .command("news <symbol>")
  .description("Latest per-ticker news (source + headline + link). Live read.")
  .option("--limit <n>", "max articles", "15")
  .option("--json", "emit JSON")
  .action(async (symbol: string, opts: { limit?: string; json?: boolean }) => {
    const r = await computeNews({ symbol, limit: Number(opts.limit ?? "15") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`News — ${r.symbol} (${r.count})\n\n`);
    if (!r.articles.length) { process.stdout.write("No recent news.\n"); return; }
    for (const a of r.articles) {
      process.stdout.write(`• ${a.title}\n  ${a.source}${a.publishedAt ? ` · ${a.publishedAt.slice(0, 10)}` : ""}  ${a.url}\n`);
    }
  });

program
  .command("ratings <symbol>")
  .description("Analyst ratings: buy/hold/sell counts, consensus, and rationale texts. Live read.")
  .option("--limit <n>", "max rating texts", "12")
  .option("--json", "emit JSON")
  .action(async (symbol: string, opts: { limit?: string; json?: boolean }) => {
    const r = await computeRatings({ symbol, limit: Number(opts.limit ?? "12") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    const s = r.summary;
    process.stdout.write(`Ratings — ${r.symbol}: consensus ${r.consensus.toUpperCase()}  (buy ${s.buy} · hold ${s.hold} · sell ${s.sell})\n\n`);
    for (const t of r.ratings) process.stdout.write(`• [${t.type}] ${t.text}\n`);
  });

program
  .command("earnings <symbol>")
  .description("Earnings history/calendar: per-quarter EPS estimate vs actual (surprise), report date + timing, call replay. Live read.")
  .option("--limit <n>", "max quarters", "8")
  .option("--json", "emit JSON")
  .action(async (symbol: string, opts: { limit?: string; json?: boolean }) => {
    const r = await computeEarnings({ symbol, limit: Number(opts.limit ?? "8") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`Earnings — ${r.symbol}\n\n`);
    if (!r.reports.length) { process.stdout.write("No earnings data.\n"); return; }
    printTable(
      r.reports.map((e) => ({
        period: `${e.year} Q${e.quarter}`,
        date: e.reportDate,
        timing: e.timing,
        est: Number.isFinite(e.epsEstimate) ? e.epsEstimate.toFixed(2) : "—",
        actual: Number.isFinite(e.epsActual) ? e.epsActual.toFixed(2) : "—",
        surprise: e.surprise == null ? "—" : (e.surprise >= 0 ? "+" : "") + e.surprise.toFixed(2)
      })),
      ["period", "date", "timing", "est", "actual", "surprise"]
    );
  });

program
  .command("movers")
  .description("S&P 500 top movers (symbol + day move% + price), direction up|down. Live read.")
  .option("--direction <up|down>", "gainers (up) or losers (down)", "up")
  .option("--limit <n>", "max names", "10")
  .option("--json", "emit JSON")
  .action(async (opts: { direction?: string; limit?: string; json?: boolean }) => {
    const direction = opts.direction === "down" ? "down" : "up";
    const r = await computeMovers({ direction, limit: Number(opts.limit ?? "10") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`S&P 500 Movers — ${direction === "up" ? "Gainers" : "Losers"} (${r.count})\n\n`);
    printTable(
      r.movers.map((m) => ({
        symbol: m.symbol,
        move: Number.isFinite(m.movementPct) ? `${m.movementPct >= 0 ? "+" : ""}${m.movementPct.toFixed(2)}%` : "—",
        price: Number.isFinite(m.price) ? usd(m.price) : "—"
      })),
      ["symbol", "move", "price"]
    );
  });

program
  .command("options-events")
  .description("Options corporate events: expirations, assignments, exercises (the feed behind options P&L + assignment tracking). Live read.")
  .option("--account <number>", "scope to one account (default: all)")
  .option("--limit <n>", "max events", "25")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; limit?: string; json?: boolean }) => {
    const r = await computeOptionsEvents({ accountNumber: opts.account, limit: Number(opts.limit ?? "25") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`Options Events (${r.count})\n\n`);
    if (!r.events.length) { process.stdout.write("No options events.\n"); return; }
    printTable(
      r.events.map((e) => ({
        date: e.date, type: e.type, symbol: e.symbol || "—", dir: e.direction,
        qty: Number.isFinite(e.quantity) ? String(e.quantity) : "—",
        cash: usd(e.cash), state: e.state, acct: "…" + e.account.slice(-4)
      })),
      ["date", "type", "symbol", "dir", "qty", "cash", "state", "acct"]
    );
  });

// ── exposure: concentration & net greeks ──
program
  .command("exposure")
  .description("Concentration & Net Greeks: concentration by underlying (% of portfolio per symbol, flag >20%), plus portfolio-wide net Greeks (delta/gamma/theta/vega/rho). Live read.")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; json?: boolean }) => {
    const r = await computeExposure({ accountNumber: opts.account });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`Exposure — ${r.accountsScanned.length} account(s) · equity ${usd(r.totalEquityUsd)}\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    process.stdout.write("Portfolio Net Greeks:\n");
    const g = r.netGreeks;
    process.stdout.write(`  delta: ${g.delta.toFixed(1)} · gamma: ${g.gamma.toFixed(1)} · theta: ${g.theta.toFixed(2)} · vega: ${g.vega.toFixed(2)} · rho: ${g.rho.toFixed(2)}\n\n`);
    if (r.concentration.length) {
      process.stdout.write("Concentration by Underlying:\n");
      printTable(
        r.concentration.map((c) => ({
          symbol: c.symbol, mktVal: usd(c.marketValueUsd), weight: `${c.weightPct.toFixed(1)}%`,
          flag: c.flag ? ">20% ⚠️" : ""
        })),
        ["symbol", "mktVal", "weight", "flag"]
      );
    } else {
      process.stdout.write("No positions.\n");
    }
    if (r.warnings.length) process.stdout.write(`${r.warnings.map((w: string) => "⚠️  " + w).join("\n")}\n`);
  });

// ── autopilot: automated roll management ──
program
  .command("autopilot")
  .description("Autopilot: scan all open short options approaching expiration (default: 7 days), compute potential roll candidates, emit dry-run order bodies. Read-only (never places orders).")
  .option("--account <number>", "scope to one account (default: all owned)")
  .option("--days <n>", "look-ahead window in days (default: 7)", "7")
  .option("--json", "emit JSON")
  .action(async (opts: { account?: string; days?: string; json?: boolean }) => {
    const r = await computeAutopilot({ accountNumber: opts.account, days: Number(opts.days ?? "7") });
    if (opts.json) { printJson({ generatedAt: new Date().toISOString(), ...r }); return; }
    process.stdout.write(`Autopilot — next ${r.lookaheadDays} day(s) — ${r.accountsScanned.length} account(s)\n`);
    process.stdout.write(`as of ${new Date().toISOString()}\n\n`);
    if (r.candidates.length) {
      for (const c of r.candidates) {
        process.stdout.write(`${c.symbol} ${c.type} $${c.strike} exp ${c.expiration} (${c.dte}d)${c.itmBy !== null ? ` — ${c.itmBy > 0 ? `ITM by $${c.itmBy.toFixed(2)}` : `OTM by $${Math.abs(c.itmBy).toFixed(2)}`}` : ""}\n`);
        process.stdout.write(`  ${c.rollCandidate.message}\n`);
        process.stdout.write(`  close: ${c.dryRunOrder.close.action} [${c.dryRunOrder.close.leg}]\n`);
        process.stdout.write(`  open:  ${c.dryRunOrder.open.action} [${c.dryRunOrder.open.leg}]\n\n`);
      }
      process.stdout.write(`${r.candidates.length} candidate(s). These are dry-run only — nothing was sent. To execute, use the brokerage execute command with ROBINHOOD_ALLOW_LIVE_WRITE=1.\n`);
    } else {
      process.stdout.write("No short options approaching expiration in this window.\n");
    }
    if (r.warnings.length) process.stdout.write(`${r.warnings.map((w: string) => "⚠️  " + w).join("\n")}\n`);
  });

const watchlist = new Command("watchlist").description("Inspect (read) and edit (add/remove/create, env-gated) your custom watchlists");

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

watchlist
  .command("add <list> <symbols...>")
  .description("Add tickers to a custom watchlist (by name or id). Dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional).")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (list: string, symbols: string[], opts: { dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    const out = await watchlistMutateItems({ list, symbols, operation: "create", dryRun: opts.dryRun, liveWrite: opts.liveWrite });
    if (out.result.dryRun && out.result.reason) process.stderr.write(`${out.result.reason}\n`);
    if (opts.json) { printJson({ list: out.list, operation: "add", items: out.items, dryRun: out.result.dryRun, status: out.result.status, body: out.result.body }); return; }
    process.stdout.write(`${out.result.dryRun ? "DRY-RUN" : out.result.status} add ${out.items.map((i) => i.symbol).join(", ")} -> "${out.list.display_name}" (${out.list.id})\n`);
    if (out.result.body) process.stdout.write(`${out.result.body}\n`);
  });

watchlist
  .command("remove <list> <symbols...>")
  .description("Remove tickers from a custom watchlist (by name or id). Dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional).")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (list: string, symbols: string[], opts: { dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    const out = await watchlistMutateItems({ list, symbols, operation: "delete", dryRun: opts.dryRun, liveWrite: opts.liveWrite });
    if (out.result.dryRun && out.result.reason) process.stderr.write(`${out.result.reason}\n`);
    if (opts.json) { printJson({ list: out.list, operation: "remove", items: out.items, dryRun: out.result.dryRun, status: out.result.status, body: out.result.body }); return; }
    process.stdout.write(`${out.result.dryRun ? "DRY-RUN" : out.result.status} remove ${out.items.map((i) => i.symbol).join(", ")} <- "${out.list.display_name}" (${out.list.id})\n`);
    if (out.result.body) process.stdout.write(`${out.result.body}\n`);
  });

watchlist
  .command("create <name>")
  .description("Create a new custom watchlist. Dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional).")
  .option("--emoji <emoji>", "icon emoji for the list")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (name: string, opts: { emoji?: string; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    const out = await createWatchlist({ displayName: name, iconEmoji: opts.emoji, dryRun: opts.dryRun, liveWrite: opts.liveWrite });
    if (out.result.dryRun && out.result.reason) process.stderr.write(`${out.result.reason}\n`);
    if (opts.json) { printJson({ displayName: name, dryRun: out.result.dryRun, status: out.result.status, body: out.result.body }); return; }
    process.stdout.write(`${out.result.dryRun ? "DRY-RUN" : out.result.status} create watchlist "${name}"${opts.emoji ? ` ${opts.emoji}` : ""}\n`);
    if (out.result.body) process.stdout.write(`${out.result.body}\n`);
  });

watchlist
  .command("items <list>")
  .description("List a custom watchlist's tickers resolved live — symbol, price, and an equity-buyable flag (by name or id). Read.")
  .option("--json", "emit JSON")
  .action(async (list: string, opts: { json?: boolean }) => {
    const { list: wl, items } = await getWatchlistItems(list);
    if (opts.json) { printJson({ list: wl, items }); return; }
    process.stdout.write(`"${wl.display_name}" (${wl.id}) — ${items.length} item(s); ${items.filter((i) => i.tradable).length} equity-buyable\n`);
    printTable(
      items.map((i) => ({ symbol: i.symbol ?? "—", price: i.price ?? "—", type: i.object_type, buyable: i.tradable ? "yes" : "no", name: i.name ?? "" })),
      ["symbol", "price", "type", "buyable", "name"]
    );
  });

watchlist
  .command("buy <list>")
  .description("Buy $<amount> of EACH equity-buyable ticker in a custom watchlist (BP-aware basket). Dry-run by default; live needs ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional).")
  .requiredOption("--account <number>", "account number to buy into")
  .option("--amount <dollars>", "dollars per ticker (Robinhood minimum $1.00)", "1")
  .option("--limit <n>", "cap the number of tickers attempted")
  .option("--delay <ms>", "pace between live sends (429 burst guard)", "2500")
  .option("--force", "skip per-order dedup + the after-hours fractional pre-flight guard")
  .option("--dry-run", "plan only, send nothing")
  .option("--live-write", "optional (back-compat); gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
  .option("--json", "emit JSON")
  .action(async (list: string, opts: { account: string; amount?: string; limit?: string; delay?: string; force?: boolean; dryRun?: boolean; liveWrite?: boolean; json?: boolean }) => {
    const out = await buyWatchlistBasket({
      list,
      amount: Number(opts.amount ?? "1"),
      accountNumber: opts.account,
      limit: opts.limit ? Number(opts.limit) : undefined,
      delayMs: opts.delay ? Number(opts.delay) : undefined,
      force: opts.force,
      dryRun: opts.dryRun,
      liveWrite: opts.liveWrite
    });
    if (opts.json) { printJson(out); return; }
    const tag = out.dryRun ? "DRY-RUN" : "LIVE";
    process.stdout.write(`${tag} basket buy $${out.amountPerTicker.toFixed(2)} × each → ${out.account} — "${out.list.display_name}"\n`);
    process.stdout.write(`items ${out.counts.items} | tradable ${out.counts.tradable} | attempted ${out.counts.attempted} | placed ${out.counts.placed} | skipped ${out.counts.skipped} | failed ${out.counts.failed} | blocked ${out.counts.blocked}${out.buyingPower !== undefined ? ` | BP $${out.buyingPower.toFixed(2)}` : ""}\n`);
    printTable(
      out.legs.map((l) => ({ symbol: l.symbol, status: l.status, total: l.estimatedTotal != null ? `$${l.estimatedTotal.toFixed(2)}` : "—", note: (l.reason ?? l.sessionWarning ?? "").slice(0, 80) })),
      ["symbol", "status", "total", "note"]
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
  .description("Execute an official Robinhood Crypto API request. Reads run live; writes (orders/cancels) are dry-run by default and require ROBINHOOD_ALLOW_LIVE_WRITE=1 (single switch; --live-write optional). Uses ROBINHOOD_CRYPTO_API_KEY and ROBINHOOD_CRYPTO_PRIVATE_KEY_B64.")
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
  .option("--live-write", "optional back-compat no-op; the live-write gate is ROBINHOOD_ALLOW_LIVE_WRITE=1")
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

// Zayd Khan // cold // www.zayd.wtf
