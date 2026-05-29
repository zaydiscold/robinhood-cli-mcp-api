import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const routesPath = resolve(root, "api-map/brokerage-routes.json");
const outPath = resolve(root, "api-map/openapi/robinhood-brokerage.openapi.json");

const riskRank = {
  read: 0,
  "sensitive-read": 1,
  "write-safe": 2,
  "write-mutate": 3,
  "write-or-sensitive": 4,
  destructive: 5
};

const routes = JSON.parse(await readFile(routesPath, "utf8"));

function normalizePath(pathname) {
  let autoParam = 0;
  return pathname
    .replace(/\{(\d+)\}/g, "{param_$1}")
    .replace(/\{\}/g, () => `{param_${autoParam++}}`);
}

function operationMethods(route) {
  if (route.methods?.length) return route.methods.map((method) => method.toLowerCase());
  if (route.risk === "destructive" || route.risk === "write-or-sensitive" || route.risk === "write-mutate" || route.risk === "write-safe") return ["post"];
  return ["get"];
}

function operationId(pathname, method) {
  const slug = pathname
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `brokerage_${method}_${slug || "root"}`;
}

function titleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function pathParams(pathname) {
  const params = [];
  const seen = new Set();
  for (const match of pathname.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    params.push({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
      description: `Route placeholder ${name}. Mapped route name; live verification should replace with a semantic parameter name when known.`
    });
  }
  return params;
}

function queryParams(templates, queryKeys) {
  const params = new Set(queryKeys);
  for (const template of templates) {
    const parsed = new URL(template);
    for (const name of parsed.searchParams.keys()) params.add(name);
  }
  return [...params].sort().map((name) => ({
    name,
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Observed query key from route templates or sanitized browser capture; values are intentionally not stored."
  }));
}

const grouped = new Map();
for (const route of routes) {
  const parsed = new URL(route.url);
  const path = normalizePath(decodeURIComponent(parsed.pathname));
  for (const method of operationMethods(route)) {
    const key = `${method} ${path}`;
    const existing =
      grouped.get(key) ??
      {
        method,
        path,
        hosts: new Set(),
        categories: new Set(),
        risk: route.risk,
        templates: [],
        queryKeys: new Set(),
        sources: new Set(),
        seenOn: new Set()
      };
    existing.hosts.add(route.host);
    for (const category of route.categories ?? []) {
      existing.categories.add(category);
    }
    for (const queryKey of route.queryKeys ?? []) {
      existing.queryKeys.add(queryKey);
    }
    for (const source of String(route.source ?? "community-seed").split(";").map((value) => value.trim()).filter(Boolean)) {
      existing.sources.add(source);
    }
    for (const label of route.seenOn ?? []) {
      existing.seenOn.add(label);
    }
    if ((riskRank[route.risk] ?? 0) > (riskRank[existing.risk] ?? 0)) {
      existing.risk = route.risk;
    }
    existing.templates.push(route.url);
    grouped.set(key, existing);
  }
}

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Robinhood Brokerage API Map",
    version: "0.1.0",
    description:
      "Personal Robinhood brokerage/account API map from reverse-engineered routes and sanitized authenticated browser capture. This repo can execute live with caller-owned auth; pass dryRun/--dry-run for non-sending tests."
  },
  servers: [
    { url: "https://api.robinhood.com" },
    { url: "https://nummus.robinhood.com" },
    { url: "https://bonfire.robinhood.com" },
    { url: "https://minerva.robinhood.com" },
    { url: "https://phoenix.robinhood.com" }
  ],
  tags: [
    ...new Set(routes.flatMap((route) => (route.categories?.length ? route.categories : ["uncategorized"])))
  ]
    .sort()
    .map((name) => ({ name, description: `${titleCase(name)} routes from the brokerage route map.` })),
  paths: {}
};

for (const group of [...grouped.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
  const categories = [...group.categories].sort();
  const params = [...pathParams(group.path), ...queryParams(group.templates, group.queryKeys)];
  spec.paths[group.path] ??= {};
  spec.paths[group.path][group.method] = {
    operationId: operationId(group.path, group.method),
    summary: `${titleCase(categories[0] ?? "uncategorized")} brokerage route`,
    description:
      `Personal route map entry. Risk: ${group.risk}. ` +
      "Live execution requires ROBINHOOD_BROKERAGE_TOKEN or ROBINHOOD_COOKIE. Use dryRun/--dry-run to avoid sending.",
    tags: categories.length ? categories : ["uncategorized"],
    parameters: params,
    responses: {
      "200": {
        description: "Response shape not yet live-verified.",
        content: {
          "application/json": {
            schema: {}
          }
        }
      }
    },
    "x-robinhood-risk": group.risk,
    "x-robinhood-hosts": [...group.hosts].sort(),
    "x-robinhood-route-templates": group.templates,
    "x-robinhood-sources": [...group.sources].sort(),
    "x-robinhood-seen-on": [...group.seenOn].sort()
  };
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(spec, null, 2)}\n`);
console.error(`wrote ${outPath}`);
console.error(`brokerage routes=${routes.length} openapi paths=${Object.keys(spec.paths).length} operations=${grouped.size}`);
