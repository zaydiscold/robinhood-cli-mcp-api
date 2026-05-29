#!/usr/bin/env node
// SELF-EXTENSION PROTOCOL (read if you are an LLM/agent)
//
// If you discover a Robinhood route that is NOT in api-map/:
//   1. Add it to api-map/brokerage-routes.json or the OpenAPI map.
//   2. Classify risk conservatively.
//   3. Document discovery and auth/session evidence in docs/undocumented-surface.md.
//   4. Personal repo commands may execute live with caller-owned auth; use --dry-run for non-sending tests.

import { Command } from "commander";
import {
  executeBrokerageRequest,
  executeCryptoRequest,
  filterBrokerageRoutes,
  filterRobinhoodRoutes,
  listCryptoRoutes,
  loadBrowserRoutes,
  loadBrokerageRoutes,
  loadRobinhoodRoutes,
  parseParamAssignments,
  planBrokerageRequest,
  planCryptoRequest,
  printJson,
  printTable,
  resolveLiveWriteGate,
  signCryptoRequest,
  summarizeApiMap
} from "./lib.js";

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

function selectRouteByQueryAndMethod<T extends { url: string; methods?: string[] }>(
  matches: T[],
  query: string,
  method?: string
): T | undefined {
  const candidates = matches.filter((candidate) => candidate.url === query);
  const pool = candidates.length > 0 ? candidates : matches;
  if (method) {
    const requested = method.toUpperCase();
    return pool.find((candidate) => candidate.methods?.map((item) => item.toUpperCase()).includes(requested)) ?? pool[0];
  }
  return pool[0];
}

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
        category: route.categories.join(",") || "uncategorized",
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
        categories: route.categories.join(",") || "uncategorized",
        seenOn: route.seenOn.join(","),
        url: route.url
      })),
      ["risk", "host", "categories", "seenOn", "url"]
    );
  });

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
        category: route.categories.join(",") || "uncategorized",
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
        category: route.categories.join(",") || "uncategorized",
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

program.addCommand(brokerage);

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
        methods: route.methods.join(",").toUpperCase(),
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
