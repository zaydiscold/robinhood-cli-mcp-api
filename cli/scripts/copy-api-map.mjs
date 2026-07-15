import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const source = resolve(repoRoot, "api-map");
const dest = resolve(repoRoot, "cli/dist/api-map");
const lock = resolve(repoRoot, "cli/dist/.api-map-copy.lock");
const staging = resolve(repoRoot, `cli/dist/.api-map-${process.pid}-${Date.now()}`);

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function acquireLock() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(lock);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await wait(25);
    }
  }

  throw new Error(`Timed out waiting for API-map copy lock: ${lock}`);
}

await cp(source, staging, { recursive: true });
await acquireLock();

try {
  await rm(dest, { recursive: true, force: true });
  await rename(staging, dest);
} finally {
  await rm(staging, { recursive: true, force: true });
  await rm(lock, { recursive: true, force: true });
}

// Zayd Khan // cold // www.zayd.wtf
