import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const distRoot = resolve(repoRoot, "cli", "dist");

// Knowledge is a runtime CLI feature. Documentation is not: ship only the five
// pages that runtime help and safety/doctor guidance link to. Historical audits,
// captures, templates, and generated research remain repository-only.
const knowledgeDestination = resolve(distRoot, "knowledge");
await rm(knowledgeDestination, { recursive: true, force: true });
await cp(resolve(repoRoot, "knowledge"), knowledgeDestination, {
  recursive: true,
  filter: (path) => !path.endsWith(".DS_Store"),
});
const docsDestination = resolve(distRoot, "docs");
await rm(docsDestination, { recursive: true, force: true });
await mkdir(docsDestination, { recursive: true });
for (const file of [
  "README.md",
  "auth.md",
  "cli-mcp-architecture.md",
  "financial-tools-reference.md",
  "write-operations.md",
]) {
  await cp(resolve(repoRoot, "docs", file), resolve(docsDestination, file));
}

const authScripts = [
  "refresh-auth.sh",
  "auth_session.py",
  "select-auth-candidate.py",
  "extract-auth-cdp.py",
  "extract-auth-leveldb.py",
  "extract-auth-safari.py",
];
const scriptDestination = resolve(distRoot, "scripts");
await rm(scriptDestination, { recursive: true, force: true });
await mkdir(scriptDestination, { recursive: true });
for (const file of authScripts) {
  await cp(resolve(repoRoot, "scripts", file), resolve(scriptDestination, file));
}
