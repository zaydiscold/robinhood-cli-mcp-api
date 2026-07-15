import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sanitizeCapture } from "./lib/cdp-capture.mjs";

const [inputArg, outputArg, surfaceArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error(
    "usage: node scripts/sanitize-cdp-capture.mjs <raw-capture.json> <sanitized-output.json> [surface-label]",
  );
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const capture = JSON.parse(await readFile(inputPath, "utf8"));
const sanitized = sanitizeCapture(capture, { defaultSurface: surfaceArg });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
console.error(
  `input requests=${capture.requests?.length ?? capture.networkRequests?.length ?? capture.entries?.length ?? 0}`,
);
console.error(`sanitized routes=${sanitized.routeIndex.length}`);
console.error(`output=${outputPath}`);
