import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const brokerageRoutesPath = resolve(root, "api-map/brokerage-routes.json");
const cryptoSpecPath = resolve(root, "api-map/openapi/robinhood-crypto.openapi.json");
const brokerageSpecPath = resolve(root, "api-map/openapi/robinhood-brokerage.openapi.json");
const routesOutPath = resolve(root, "api-map/robinhood-routes.json");
const openapiOutPath = resolve(root, "api-map/openapi/robinhood-unified.openapi.json");
const markdownOutPath = resolve(root, "api-map/markdown/robinhood-routes.md");

const httpMethods = ["get", "post", "put", "patch", "delete"];

function cryptoRisk(path, method) {
  const lower = path.toLowerCase();
  if (method === "post" && lower.includes("/cancel/")) return "destructive";
  if (method === "post") return "write-mutate";
  if (lower.includes("/trading/accounts") || lower.includes("/trading/holdings") || lower.includes("/trading/orders")) {
    return "sensitive-read";
  }
  return "read";
}

function cryptoCategories(path, method) {
  const categories = ["crypto", "official"];
  if (path.includes("/marketdata/")) categories.push("marketdata");
  if (path.includes("/trading/")) categories.push("trading");
  if (path.includes("/orders/")) categories.push(method === "post" ? "orders-write" : "orders");
  if (path.includes("/accounts/")) categories.push("accounts");
  if (path.includes("/holdings/")) categories.push("holdings");
  if (path.includes("/trading_pairs/")) categories.push("trading-pairs");
  return categories;
}

function extractQueryKeys(operation) {
  return (operation.parameters ?? [])
    .filter((param) => param?.in === "query" && param.name)
    .map((param) => param.name)
    .sort();
}

function cryptoRoutesFromSpec(spec) {
  const routes = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of httpMethods) {
      const operation = item?.[method];
      if (!operation) continue;
      routes.push({
        url: `https://trading.robinhood.com${path}`,
        host: "trading.robinhood.com",
        categories: cryptoCategories(path, method),
        risk: cryptoRisk(path, method),
        methods: [method.toUpperCase()],
        source: "official-crypto-openapi",
        seenOn: ["official-robinhood-crypto-docs"],
        queryKeys: extractQueryKeys(operation),
        operationId: operation.operationId,
        summary: operation.summary
      });
    }
  }
  return routes.sort((a, b) => a.url.localeCompare(b.url) || a.methods[0].localeCompare(b.methods[0]));
}

function mergeSpecs(cryptoSpec, brokerageSpec) {
  const unified = {
    openapi: "3.1.0",
    info: {
      title: "Robinhood Unified API Map",
      version: "0.1.0",
      description:
        "Combined Robinhood map: official Robinhood Crypto Trading OpenAPI plus browser-backed brokerage/account route map. Crypto operations should use official Ed25519 signing; brokerage/account routes use caller-owned web/brokerage auth."
    },
    servers: [
      { url: "https://trading.robinhood.com", description: "Official Robinhood Crypto Trading API" },
      { url: "https://api.robinhood.com", description: "Browser-backed brokerage/account API surface" },
      { url: "https://bonfire.robinhood.com", description: "Browser-backed Robinhood web API surface" },
      { url: "https://nummus.robinhood.com", description: "Browser-backed crypto/account web API surface" },
      { url: "https://cashier.robinhood.com" },
      { url: "https://dora.robinhood.com" },
      { url: "https://identi.robinhood.com" },
      { url: "https://minerva.robinhood.com" },
      { url: "https://phoenix.robinhood.com" }
    ],
    tags: [],
    paths: {}
  };

  const tagNames = new Set();
  for (const tag of [...(cryptoSpec.tags ?? []), ...(brokerageSpec.tags ?? [])]) {
    if (tag?.name && !tagNames.has(tag.name)) {
      tagNames.add(tag.name);
      unified.tags.push(tag);
    }
  }

  for (const [path, item] of Object.entries(cryptoSpec.paths ?? {})) {
    unified.paths[path] = structuredClone(item);
    for (const method of httpMethods) {
      if (!unified.paths[path]?.[method]) continue;
      unified.paths[path][method]["x-robinhood-source"] = "official-crypto-openapi";
      unified.paths[path][method]["x-robinhood-risk"] = cryptoRisk(path, method);
      unified.paths[path][method]["x-robinhood-hosts"] = ["trading.robinhood.com"];
      unified.paths[path][method].servers = [{ url: "https://trading.robinhood.com" }];
    }
  }

  for (const [path, item] of Object.entries(brokerageSpec.paths ?? {})) {
    unified.paths[path] ??= {};
    for (const method of httpMethods) {
      if (!item?.[method]) continue;
      const operation = structuredClone(item[method]);
      operation["x-robinhood-source"] = operation["x-robinhood-source"] ?? "brokerage-browser-map";
      unified.paths[path][method] = operation;
    }
  }

  return unified;
}

function riskCounts(routes) {
  return routes.reduce((acc, route) => {
    acc[route.risk] = (acc[route.risk] ?? 0) + 1;
    return acc;
  }, {});
}

function markdownRows(routes) {
  return routes.map((route) => {
    const mutation = ["write-safe", "write-mutate", "write-or-sensitive", "destructive"].includes(route.risk) ? "yes" : "no";
    return `| ${mutation} | ${route.risk} | ${(route.methods ?? []).join(",") || "inferred"} | ${(route.categories ?? []).join(", ")} | ${route.host} | ${route.source ?? "brokerage-browser-map"} | \`${route.url}\` |`;
  });
}

const brokerageRoutes = JSON.parse(await readFile(brokerageRoutesPath, "utf8"));
const cryptoSpec = JSON.parse(await readFile(cryptoSpecPath, "utf8"));
const brokerageSpec = JSON.parse(await readFile(brokerageSpecPath, "utf8"));
const cryptoRoutes = cryptoRoutesFromSpec(cryptoSpec);
const unifiedRoutes = [...cryptoRoutes, ...brokerageRoutes].sort((a, b) => a.host.localeCompare(b.host) || a.url.localeCompare(b.url));
const unifiedSpec = mergeSpecs(cryptoSpec, brokerageSpec);

await mkdir(dirname(routesOutPath), { recursive: true });
await mkdir(dirname(openapiOutPath), { recursive: true });
await mkdir(dirname(markdownOutPath), { recursive: true });
await writeFile(routesOutPath, `${JSON.stringify(unifiedRoutes, null, 2)}\n`);
await writeFile(openapiOutPath, `${JSON.stringify(unifiedSpec, null, 2)}\n`);

const counts = riskCounts(unifiedRoutes);
const markdown = [
  "# Robinhood Unified Route Map",
  "",
  "Source: official Robinhood Crypto Trading OpenAPI plus sanitized authenticated Chrome/CDP brokerage/account route captures through 2026-05-27.",
  "",
  "Crypto operations are official Robinhood-published endpoints and should use Ed25519 signing. Brokerage/account operations are browser-backed route-map entries and use caller-owned brokerage token or browser cookie auth.",
  "",
  `Current count: ${unifiedRoutes.length} route entries.`,
  `Official Crypto route entries: ${cryptoRoutes.length}.`,
  `Brokerage/account route entries: ${brokerageRoutes.length}.`,
  `Risk counts: ${Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([risk, count]) => `${risk}=${count}`).join(", ")}.`,
  "",
  "Per-endpoint files are generated in `api-map/markdown/endpoints/`. Each starts with `Mutation: yes` or `Mutation: no`.",
  "",
  "| Mutation | Risk | Methods | Categories | Host | Source | Route template |",
  "|---|---|---|---|---|---|---|",
  ...markdownRows(unifiedRoutes)
].join("\n");

await writeFile(markdownOutPath, `${markdown}\n`);
console.error(`wrote ${routesOutPath}`);
console.error(`wrote ${openapiOutPath}`);
console.error(`wrote ${markdownOutPath}`);
console.error(`unified routes=${unifiedRoutes.length} crypto=${cryptoRoutes.length} brokerage=${brokerageRoutes.length}`);
