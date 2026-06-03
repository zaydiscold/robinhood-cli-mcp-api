#!/usr/bin/env node
// rh-get.mjs <url> — authenticated GET against any Robinhood endpoint, using the
// repo .env token + web-app headers. Read-only utility for API-terrain mapping and
// chain/quote exploration when a URL's query shape doesn't fit the route map.
// Prints parsed JSON to stdout. Example:
//   node scripts/rh-get.mjs "https://api.robinhood.com/options/instruments/?chain_id=...&expiration_dates=2026-12-18&type=call&state=active"

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
(function loadEnv() {
  const p = join(REPO, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
})();

const headers = {
  accept: "application/json, text/plain, */*",
  "user-agent": process.env.ROBINHOOD_USER_AGENT ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  origin: "https://robinhood.com",
  referer: "https://robinhood.com/",
  "x-robinhood-api-version": process.env.ROBINHOOD_API_VERSION ?? "1.431.4",
  "x-robinhood-web-app-version": process.env.ROBINHOOD_WEB_APP_VERSION ?? "2026.23.2025+43f8dad0de15",
  "x-hyper-ex": "enabled",
};
if (process.env.ROBINHOOD_BROKERAGE_TOKEN) headers.authorization = `Bearer ${process.env.ROBINHOOD_BROKERAGE_TOKEN}`;
if (process.env.ROBINHOOD_COOKIE) headers.cookie = process.env.ROBINHOOD_COOKIE;

const url = process.argv[2];
if (!url) { process.stderr.write("usage: rh-get.mjs <url>\n"); process.exit(1); }
const res = await fetch(url, { headers });
const text = await res.text();
process.stderr.write(`${res.status} ${url}\n`);
try { process.stdout.write(JSON.stringify(JSON.parse(text), null, 2) + "\n"); }
catch { process.stdout.write(text + "\n"); }
