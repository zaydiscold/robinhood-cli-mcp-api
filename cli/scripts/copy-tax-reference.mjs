import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const source = resolve(repoRoot, "knowledge", "tax-reference.json");
const destination = resolve(repoRoot, "cli", "dist", "knowledge", "tax-reference.json");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
