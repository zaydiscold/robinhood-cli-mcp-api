import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const files = ["tax-reference.json", "tax-strategies.json"];

for (const file of files) {
  const source = resolve(repoRoot, "knowledge", file);
  const destination = resolve(repoRoot, "cli", "dist", "knowledge", file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
