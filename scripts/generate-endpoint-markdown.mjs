import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const routesPath = resolve(root, "api-map/robinhood-routes.json");
const outDir = resolve(root, "api-map/markdown/endpoints");

function slugFor(route) {
  const parsed = new URL(route.url);
  const methods = (route.methods ?? ["GET"]).join("-").toLowerCase();
  const path = parsed.pathname
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${methods}-${parsed.hostname.replace(/[^a-z0-9]+/gi, "-")}-${path || "home"}`.slice(0, 180);
}

function mutates(route) {
  return ["write-safe", "write-mutate", "write-or-sensitive", "destructive"].includes(route.risk);
}

const routes = JSON.parse(await readFile(routesPath, "utf8"));
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const usedSlugs = new Map();
for (const route of routes) {
  const parsed = new URL(route.url);
  const baseSlug = slugFor(route);
  const seen = usedSlugs.get(baseSlug) ?? 0;
  usedSlugs.set(baseSlug, seen + 1);
  const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;
  const content = `# ${(route.methods ?? ["GET"]).join(", ")} ${parsed.pathname}

Mutation: ${mutates(route) ? "yes" : "no"}
Risk: ${route.risk}

Host: ${route.host}
Categories: ${(route.categories ?? []).join(", ") || "uncategorized"}
Source: ${route.source ?? "community-seed"}
Operation ID: ${route.operationId ?? "n/a"}

Route template:

\`\`\`text
${route.url}
\`\`\`
`;
  await writeFile(resolve(outDir, `${slug}.md`), content);
}
