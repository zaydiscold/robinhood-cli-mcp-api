import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const routesPath = resolve(root, "api-map/brokerage-routes.json");
const outPath = resolve(root, "api-map/curl/brokerage-route-templates.sh");
const routes = JSON.parse(await readFile(routesPath, "utf8"));

const lines = [
  "# Robinhood brokerage route curl notes",
  "",
  "# These templates are commented. The personal CLI is preferred for live sends",
  "# because it emits risk warnings and supports --dry-run.",
  ""
];

for (const route of routes) {
  const method = (route.methods?.[0] ?? (route.risk.startsWith("write") || route.risk === "destructive" ? "POST" : "GET")).toUpperCase();
  lines.push(`# ${route.risk} ${method} ${route.url}`);
  lines.push(`# curl -sS -X ${method} -H 'Authorization: Bearer <REDACTED>' '${route.url}'`);
  lines.push("");
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${lines.join("\n")}`);
console.error(`wrote ${outPath}`);
