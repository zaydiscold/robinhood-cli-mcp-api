#!/usr/bin/env node

import { readFileSync } from "node:fs";

const equityBatch = readFileSync(new URL("./equity-buy.mjs", import.meta.url), "utf8");
const optionSmoke = readFileSync(new URL("./live-order-smoke.mjs", import.meta.url), "utf8");
const findings = [];

if (!equityBatch.includes("placeEquityOrder")) {
  findings.push("scripts/equity-buy.mjs must delegate to placeEquityOrder");
}
if (/\bfetch\s*\(/.test(equityBatch) || /api\.robinhood\.com\/orders\//.test(equityBatch)) {
  findings.push("scripts/equity-buy.mjs must not contain a direct brokerage write client");
}
if (/\bfetch\s*\(/.test(optionSmoke) || /api\.robinhood\.com\/options\/orders\//.test(optionSmoke)) {
  findings.push("scripts/live-order-smoke.mjs must not contain a direct brokerage write client");
}
if (!optionSmoke.includes("has been retired")) {
  findings.push("scripts/live-order-smoke.mjs must remain a non-sending retirement shim");
}

if (findings.length) {
  console.error("Shared write-boundary check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Shared write-boundary check passed.");
