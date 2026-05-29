import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const source = resolve(repoRoot, "api-map");
const dest = resolve(repoRoot, "cli/dist/api-map");

await mkdir(dest, { recursive: true });
await cp(source, dest, { recursive: true });
