import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const routesPath = resolve(root, "api-map/brokerage-routes.json");
const outPath = resolve(root, "api-map/markdown/brokerage-routes.md");
const routes = JSON.parse(await readFile(routesPath, "utf8"));

const byRisk = routes.reduce((acc, route) => {
  acc[route.risk] = (acc[route.risk] ?? 0) + 1;
  return acc;
}, {});

const lines = [
  "# Robinhood Brokerage Route Map",
  "",
  "Source: reverse-engineered routes plus sanitized authenticated Chrome/CDP captures through 2026-05-27.",
  "",
  "Personal repo semantics: mapped routes can be executed live with caller-owned `ROBINHOOD_BROKERAGE_TOKEN` or `ROBINHOOD_COOKIE`. Pass `--dry-run` when you want a non-sending test plan.",
  "",
  `Current count: ${routes.length} route templates.`,
  `Risk counts: ${Object.entries(byRisk).sort(([a], [b]) => a.localeCompare(b)).map(([risk, count]) => `${risk}=${count}`).join(", ")}.`,
  "",
  "Per-endpoint files are generated in `api-map/markdown/endpoints/`. Each starts with `Mutation: yes` or `Mutation: no`.",
  "",
  "| Risk | Methods | Categories | Host | Source | Route template |",
  "|---|---|---|---|---|---|"
];

for (const route of routes) {
  lines.push(
    `| ${route.risk} | ${(route.methods ?? []).join(",") || "inferred"} | ${(route.categories ?? []).join(", ") || "uncategorized"} | ${route.host} | ${route.source ?? "community-seed"} | \`${route.url}\` |`
  );
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${lines.join("\n")}\n`);
console.error(`wrote ${outPath}`);
