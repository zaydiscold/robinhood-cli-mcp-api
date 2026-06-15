#!/usr/bin/env node
// equity-buy.mjs — place live equity buys via the Robinhood WEB order body.
//
// This is the durable, tested engine for dollar/share equity buys. It exists
// because the working web order shape (order_form_version: 7 + dollar_based_amount
// + live bid/ask collar) kept getting reconstructed by hand in throwaway /tmp
// scripts and lost. It centralizes: instrument resolution (search-grounded),
// the OTC / fractional-eligibility guard (so "$3 of RNECY" fails loudly instead
// of malforming an order), the live collar, clean stderr/stdout separation, and
// a JSON receipt. Reads are live; writes are DRY-RUN unless --live is passed.
//
// Usage:
//   node scripts/equity-buy.mjs --preflight
//   node scripts/equity-buy.mjs --account <ACCOUNT_NUMBER> --symbol ARKG --dollars 5 [--live]
//   node scripts/equity-buy.mjs --accounts <ACCOUNT_NUMBER>,<ACCOUNT_NUMBER>,<ACCOUNT_NUMBER> --symbol ARKG --dollars 5 [--live]
//   node scripts/equity-buy.mjs --account <ACCOUNT_NUMBER> --all-positions --dollars 3 [--live]
//   node scripts/equity-buy.mjs --account <ACCOUNT_NUMBER> --symbol RNECY --shares 1 [--live]   (OTC -> auto limit)
//
// Auth: ROBINHOOD_BROKERAGE_TOKEN (and optional ROBINHOOD_COOKIE / ROBINHOOD_CSRF)
// from the repo .env. Versions/UA overridable via env (see WEB_HEADERS).

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- .env loader (explicit env wins) ---
function loadEnv() {
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
}
loadEnv();

const TOKEN = process.env.ROBINHOOD_BROKERAGE_TOKEN;
const COOKIE = process.env.ROBINHOOD_COOKIE;
const CSRF = process.env.ROBINHOOD_CSRF || process.env.ROBINHOOD_CSRF_TOKEN;

// Present as the Robinhood WEB app — clears the equity-order client-version gate.
function webHeaders(json = false) {
  const h = {
    accept: "application/json, text/plain, */*",
    "user-agent": process.env.ROBINHOOD_USER_AGENT ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    origin: "https://robinhood.com",
    referer: "https://robinhood.com/",
    "x-robinhood-api-version": process.env.ROBINHOOD_API_VERSION ?? "1.431.4",
    "x-robinhood-web-app-version": process.env.ROBINHOOD_WEB_APP_VERSION ?? "2026.24.3589+55c48b8f7a1c", // keep in sync with cli/src/lib.ts; refresh via scripts/scrape-web-app-version.mjs
    "x-hyper-ex": "enabled",
  };
  if (TOKEN) h.authorization = `Bearer ${TOKEN}`;
  if (COOKIE) h.cookie = COOKIE;
  if (CSRF) h["x-csrftoken"] = CSRF;
  if (json) h["content-type"] = "application/json";
  return h;
}

const log = (...a) => process.stderr.write(a.join(" ") + "\n"); // human chatter -> stderr
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}
const get = (url) => api(url, { headers: webHeaders(false) });
const post = (url, obj) => api(url, { method: "POST", headers: webHeaders(true), body: JSON.stringify(obj) });

// --- resolution + quotes ---
async function resolveInstrument(symbol) {
  const r = await get(`https://api.robinhood.com/instruments/?symbol=${encodeURIComponent(symbol)}`);
  const inst = r.body?.results?.[0];
  if (!inst) throw new Error(`no instrument for ${symbol}`);
  return inst; // .id, .fractional_tradability, .tradability, .otc_market_tier, .tradable, .symbol
}
async function quote(instrumentId) {
  const r = await get(`https://api.robinhood.com/marketdata/quotes/?ids=${instrumentId}`);
  return r.body?.results?.[0] ?? {};
}

function baseBody({ account, instrumentId, symbol, q }) {
  return {
    account: `https://api.robinhood.com/accounts/${account}/`,
    instrument: `https://api.robinhood.com/instruments/${instrumentId}/`,
    symbol,
    time_in_force: "gfd",
    trigger: "immediate",
    side: "buy",
    position_effect: "open",
    market_hours: "regular_hours",
    order_form_version: 7,
    ask_price: q.ask_price,
    bid_price: q.bid_price,
    bid_ask_timestamp: q.updated_at || new Date().toISOString(),
    ref_id: randomUUID(),
  };
}

// Build the order body, applying the OTC / fractional guard.
function buildOrder({ account, inst, q, dollars, shares }) {
  const frac = inst.fractional_tradability; // 'tradable' | 'position_closing_only' | 'untradable'
  // OTC signal mirrors the CLI: otc_market_tier populated, the (correctly-spelled) tradability flag,
  // or fractional being close-only. NOTE: the API field is `tradability`, NOT `tradeability`.
  const otc = Boolean(inst.otc_market_tier) || (inst.tradability && inst.tradability !== "tradable") || frac === "position_closing_only";
  const body = baseBody({ account, instrumentId: inst.id, symbol: inst.symbol, q });

  if (dollars != null) {
    if (frac !== "tradable") {
      return { skip: `fractional not tradable (fractional_tradability=${frac}); use --shares for whole shares` };
    }
    body.type = "market";
    body.dollar_based_amount = { amount: Number(dollars).toFixed(2), currency_code: "USD" };
    return { body, kind: `$${Number(dollars).toFixed(2)} dollar/market` };
  }

  // shares path
  if (otc) {
    // OTC names reject market orders ("traded on the OTC market") — use a marketable limit at the ask.
    body.type = "limit";
    body.price = q.ask_price;
    body.quantity = String(shares);
    return { body, kind: `${shares}sh limit @ ${q.ask_price} (OTC)` };
  }
  body.type = "market";
  body.price = q.ask_price; // collar
  body.quantity = String(shares);
  return { body, kind: `${shares}sh market (collar ${q.ask_price})` };
}

async function placeOne({ account, symbol, dollars, shares, live }) {
  const inst = await resolveInstrument(symbol);
  const q = await quote(inst.id);
  const built = buildOrder({ account, inst, q, dollars, shares });
  if (built.skip) {
    return { account, symbol, status: "SKIP", reason: built.skip };
  }
  if (!live) {
    return { account, symbol, status: "DRY_RUN", kind: built.kind, body: built.body };
  }
  // Retry on 429 using RH's server-directed backoff. A 429 means the order was
  // NOT placed, so reusing the SAME ref_id across retries is idempotent-safe.
  let res, b;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await post("https://api.robinhood.com/orders/", built.body);
    b = res.body || {};
    if (res.status !== 429) break;
    const msg = JSON.stringify(b);
    const m = /(\d+)\s*second/.exec(msg);
    const wait = (m ? parseInt(m[1], 10) : 30) + 2;
    log(`   throttled on ${symbol}, sleeping ${wait}s (attempt ${attempt + 1})`);
    await sleep(wait * 1000);
  }
  return {
    account, symbol, status: res.status, kind: built.kind,
    id: b.id, state: b.state, fill: b.cumulative_quantity,
    reject: b.reject_reason || b.non_field_errors || b.detail || null,
    ref_id: built.body.ref_id,
  };
}

async function preflight() {
  if (!TOKEN && !COOKIE) { log("PREFLIGHT: FAIL — no ROBINHOOD_BROKERAGE_TOKEN or ROBINHOOD_COOKIE in .env"); process.exit(2); }
  const r = await get("https://api.robinhood.com/accounts/?default_to_all_accounts=true");
  if (r.status !== 200) {
    log(`PREFLIGHT: FAIL — accounts/ returned ${r.status}. Token likely expired; run scripts/refresh-auth.sh.`);
    process.exit(2);
  }
  const accts = (r.body?.results || []).map((a) => `${a.account_number}(${a.brokerage_account_type}/${a.type})`);
  // The bulk accounts/ endpoint under-reports (live 2026-06-11: 2 of 5). The COMPLETE owned-account
  // graph is bonfire transfer/accounts/ — report both so the subset is never mistaken for the whole.
  let totalOwned = null;
  try {
    const g = await get("https://bonfire.robinhood.com/transfer/accounts/");
    const rows = (g.body?.results || []).filter((x) => x?.account_number && !x?.is_external && String(x?.type || "").toLowerCase() !== "ach");
    if (rows.length) totalOwned = rows.length;
  } catch { /* graph read is best-effort; the bulk result above already proves auth */ }
  log(`PREFLIGHT: OK — auth live, ${accts.length} typed account(s) from bulk endpoint${totalOwned ? ` of ${totalOwned} owned total (run \`accounts\` for the full list)` : ""}: ${accts.join(", ")}`);
  return true;
}

async function nonzeroPositions(account) {
  const r = await get(`https://api.robinhood.com/positions/?account_number=${account}&nonzero=true`);
  const results = r.body?.results || [];
  // resolve instrument ids -> symbols in batches
  const ids = results.map((p) => p.instrument.split("/").filter(Boolean).pop());
  const symById = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    const ir = await get(`https://api.robinhood.com/instruments/?ids=${batch}`);
    for (const inst of ir.body?.results || []) symById[inst.id] = inst.symbol;
  }
  return ids.map((id) => symById[id]).filter(Boolean);
}

// --- arg parse ---
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const val = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const live = flag("live");

(async () => {
  if (flag("preflight")) { await preflight(); return; }

  // always preflight before any write batch
  await preflight();

  const dollars = val("dollars");
  const shares = val("shares");
  const symbol = val("symbol");
  let accounts = [];
  if (val("accounts")) accounts = val("accounts").split(",").map((s) => s.trim()).filter(Boolean);
  else if (val("account")) accounts = [val("account")];

  const receipts = [];
  // We are an agentic manager, NOT an HFT script. Robinhood's web order endpoint
  // burst-limits fractional orders (~9 then a ~48s cooldown) and will never
  // tolerate hammering. Pace deliberately and lean on server-directed 429 backoff.
  const delayMs = val("delay") != null ? Number(val("delay")) : 2500;

  // Build the job list: {account, symbol}
  let jobs = [];
  if (flag("all-positions")) {
    const account = val("account");
    const syms = await nonzeroPositions(account);
    jobs = syms.map((s) => ({ account, symbol: s }));
    log(`all-positions: ${syms.length} holdings in ${account} -> $${dollars} each (${live ? "LIVE" : "DRY-RUN"})`);
  } else if (val("symbols")) {
    const account = val("account");
    jobs = val("symbols").split(",").map((s) => s.trim()).filter(Boolean).map((s) => ({ account, symbol: s }));
    log(`symbols: ${jobs.length} in ${account} -> ${dollars != null ? "$" + dollars : shares + "sh"} each (${live ? "LIVE" : "DRY-RUN"})`);
  } else {
    jobs = accounts.map((account) => ({ account, symbol }));
  }

  for (let i = 0; i < jobs.length; i++) {
    const { account, symbol: sym } = jobs[i];
    try {
      receipts.push(await placeOne({ account, symbol: sym, dollars: dollars != null ? dollars : null, shares: shares != null ? shares : null, live }));
    } catch (e) {
      receipts.push({ account, symbol: sym, status: "ERROR", reason: String(e.message || e) });
    }
    // Fail fast: once the account is out of buying power, stop hammering — every
    // remaining order would just reject. (RH says "You can only purchase 0 shares"
    // or "Not enough buying power.")
    const last = receipts[receipts.length - 1];
    const rj = JSON.stringify(last?.reject || "");
    if (live && (rj.includes("purchase 0 shares") || rj.includes("Not enough buying power"))) {
      log(`  STOP: account ${last.account} out of buying power after ${receipts.filter((r) => r.status === 201).length} fills — skipping ${jobs.length - i - 1} remaining.`);
      break;
    }
    if (live && i < jobs.length - 1) await sleep(delayMs);
  }

  // human summary -> stderr; machine receipt -> stdout
  for (const r of receipts) {
    const tag = r.status === 201 || r.status === "filled" ? "OK " : r.status === "SKIP" ? "SKIP" : r.status === "DRY_RUN" ? "DRY" : "!! ";
    log(`  ${tag} ${r.symbol} acct=${r.account} ${r.kind || ""} -> ${r.status} ${r.id ? "id=" + r.id : ""} ${r.state || ""} ${r.reject ? "REJECT=" + JSON.stringify(r.reject) : ""} ${r.reason || ""}`);
  }
  // Receipts carry real account numbers + order IDs -> write into the gitignored
  // info/ tree, never the tracked proofs/ dir.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(REPO, "info", "order-receipts");
  try { mkdirSync(outDir, { recursive: true }); } catch {}
  const logPath = join(outDir, `equity-buy-${stamp}.json`);
  try { writeFileSync(logPath, JSON.stringify(receipts, null, 2)); log(`receipt: ${logPath}`); } catch {}
  process.stdout.write(JSON.stringify(receipts, null, 2) + "\n");
})().catch((e) => { log("FATAL " + (e.stack || e)); process.exit(1); });

// Zayd Khan // cold // www.zayd.wtf
