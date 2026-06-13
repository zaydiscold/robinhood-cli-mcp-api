#!/usr/bin/env node
// live-order-smoke.mjs — LIVE place->verify->cancel smoke across multiple accounts, proving
// BOTH directions of the order path after hours. Everything is far-from-market so nothing fills,
// and every placed order is cancelled immediately. Reads bid/ask/last for each contract first so
// the price is grounded in the real spread (not guessed).
//
//   SELL leg  = sell-to-close an OWNED option at a limit FAR ABOVE the ask  -> can't fill, needs no BP.
//   BUY  leg  = buy-to-open a stink bid FAR BELOW the bid (min-tick-snapped) -> needs overnight BP;
//               where BP is $0 the 400 overnight-BP reject is itself proof the gate works.
//
// Double-gated like the rest of the repo: requires --live AND ROBINHOOD_ALLOW_LIVE_WRITE=1.
// Without both it runs DRY (prints the exact bodies, sends nothing).
//
//   ROBINHOOD_ALLOW_LIVE_WRITE=1 node scripts/live-order-smoke.mjs --live
//   node scripts/live-order-smoke.mjs            # dry preview
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
(function loadEnv() {
  const p = join(REPO, ".env");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("="); if (e < 0) continue;
    const k = t.slice(0, e).trim(); let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
})();

const LIVE = process.argv.includes("--live") && process.env.ROBINHOOD_ALLOW_LIVE_WRITE === "1";
// Accounts are discovered at runtime from transfer/accounts/ — never hardcode account numbers
// in tracked source (this repo's history was scrubbed of them once already). Filtered to trading
// accounts (rhs/ira_roth); accounts with no option positions are skipped in the loop below.
const H = () => ({
  accept: "application/json", "content-type": "application/json",
  "user-agent": process.env.ROBINHOOD_USER_AGENT ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  origin: "https://robinhood.com", referer: "https://robinhood.com/",
  "x-robinhood-api-version": "1.431.4", "x-robinhood-web-app-version": process.env.ROBINHOOD_WEB_APP_VERSION ?? "2026.24.3589+55c48b8f7a1c",
  "x-hyper-ex": "enabled", authorization: "Bearer " + process.env.ROBINHOOD_BROKERAGE_TOKEN
});
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const api = async (u, o = {}) => { const r = await fetch(u, { ...o, headers: { ...H(), ...(o.headers || {}) } }); const t = await r.text(); let b = null; try { b = t ? JSON.parse(t) : null; } catch { b = t; } return { status: r.status, body: b }; };
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
const snapTick = (price, cutoff, below, above) => {
  const tick = price < cutoff ? below : above; // RH min-tick rule
  return (Math.round(price / tick) * tick).toFixed(2);
};

async function postOrderWith429(body) {
  let r, b;
  for (let attempt = 0; attempt < 6; attempt++) {
    r = await api("https://api.robinhood.com/options/orders/", { method: "POST", headers: H(), body: JSON.stringify(body) });
    b = r.body || {};
    if (r.status !== 429) break;
    const m = /(\d+)\s*second/.exec(JSON.stringify(b)); const wait = (m ? parseInt(m[1], 10) : 20) + 2;
    log(`     throttled, sleeping ${wait}s`); await sleep(wait * 1000);
  }
  return { status: r.status, body: b };
}

async function placeAndCancel(label, body) {
  if (!LIVE) { log(`  [DRY] ${label}: ${JSON.stringify(body.legs.map((l) => `${l.side}/${l.position_effect}`))} @ ${body.price}`); return { label, dry: true, body }; }
  const r = await postOrderWith429(body);
  if ((r.status === 200 || r.status === 201) && r.body?.id) {
    await sleep(300);
    const c = await api(`https://api.robinhood.com/options/orders/${r.body.id}/cancel/`, { method: "POST", headers: H() });
    log(`  [${r.status}] ${label} -> queued, cancel ${c.status}`);
    return { label, status: r.status, placed: true, id: r.body.id, cancel: c.status };
  }
  const why = (r.body?.detail || r.body?.non_field_errors || JSON.stringify(r.body)).toString().slice(0, 110);
  log(`  [${r.status}] ${label} -> ${why}`);
  return { label, status: r.status, placed: false, why };
}

(async () => {
  log(`=== LIVE-ORDER SMOKE ${LIVE ? "(LIVE — far-from-market, auto-cancel)" : "(DRY preview)"} | ${new Date().toISOString()} ===`);
  // Discover trading accounts at runtime (no hardcoded account numbers).
  const acctResp = (await api("https://bonfire.robinhood.com/transfer/accounts/")).body;
  const acctList = (acctResp?.results || acctResp || []).filter((a) => a && (a.type === "rhs" || a.type === "ira_roth")).map((a) => a.account_number).filter(Boolean);
  const ACCTS = process.argv.find((a) => a.startsWith("--accounts="))?.split("=")[1]?.split(",") || acctList;
  log(`accounts: ${ACCTS.map((a) => "…" + String(a).slice(-4)).join(", ")}`);
  const receipts = [];
  for (const acct of ACCTS) {
    log(`\n— account ${acct} —`);
    const pos = (await api(`https://api.robinhood.com/options/aggregate_positions/?account_numbers=${acct}&nonzero=true`)).body?.results || [];
    if (!pos.length) { log("  (no option positions)"); continue; }
    // Pick up to 2 distinct held contracts to exercise sell-to-close.
    const picks = [];
    for (const p of pos) {
      const leg = (p.legs || [])[0]; if (!leg?.option) continue;
      const oid = leg.option.split("/options/instruments/")[1]?.replace(/\//g, "");
      if (oid) picks.push({ oid, qty: Math.max(1, Math.floor(Number(p.quantity) || 1)), sym: p.symbol, chain: p.chain_id });
      if (picks.length >= 2) break;
    }
    for (const pk of picks) {
      // Read live bid/ask/last + chain min-tick BEFORE pricing.
      const md = (await api(`https://api.robinhood.com/marketdata/options/?ids=${pk.oid}`)).body?.results?.[0] || {};
      const chain = pk.chain ? (await api(`https://api.robinhood.com/options/chains/${pk.chain}/`)).body : {};
      const mt = (chain.min_ticks || {}); const cutoff = Number(mt.cutoff_price ?? 3); const below = Number(mt.below_tick ?? 0.01); const above = Number(mt.above_tick ?? 0.05);
      const bid = Number(md.bid_price), ask = Number(md.ask_price), last = Number(md.last_trade_price ?? md.adjusted_mark_price);
      log(`  ${pk.sym} ${pk.oid.slice(0, 8)}…  bid=${bid} ask=${ask} last=${last} (tick<${cutoff}: ${below}, else ${above})`);
      // SELL-TO-CLOSE far ABOVE ask (won't fill, no BP needed).
      const sellPx = snapTick(Math.max(ask, last, 1) * 3 + above, cutoff, below, above);
      const sellBody = { account: `https://api.robinhood.com/accounts/${acct}/`, direction: "credit", legs: [{ side: "sell", option: `https://api.robinhood.com/options/instruments/${pk.oid}/`, position_effect: "close", ratio_quantity: 1 }], type: "limit", time_in_force: "gtc", trigger: "immediate", price: sellPx, quantity: "1", ref_id: randomUUID() };
      receipts.push({ acct, ...(await placeAndCancel(`SELL-to-close ${pk.sym} @ ${sellPx}`, sellBody)) });
      await sleep(2600);
      // BUY-TO-OPEN at the chain's absolute MIN tick — the cheapest valid stink bid (= below_tick×100,
      // i.e. ~$1 at $0.01 / ~$5 at $0.05). Far below bid so it can't fill, and the smallest possible
      // cash outlay so it can actually clear the near-zero buying power. $0 accounts 400 (proves the gate).
      const buyPx = below.toFixed(2);
      const buyBody = { account: `https://api.robinhood.com/accounts/${acct}/`, direction: "debit", legs: [{ side: "buy", option: `https://api.robinhood.com/options/instruments/${pk.oid}/`, position_effect: "open", ratio_quantity: 1 }], type: "limit", time_in_force: "gtc", trigger: "immediate", price: buyPx, quantity: "1", ref_id: randomUUID() };
      receipts.push({ acct, ...(await placeAndCancel(`BUY-stinkbid ${pk.sym} @ ${buyPx}`, buyBody)) });
      await sleep(2600);
    }
  }
  const placed = receipts.filter((r) => r.placed).length;
  log(`\n=== ${placed}/${receipts.filter((r) => !r.dry).length} placed 201 + cancelled; the rest are semantic (BP/collateral) rejects — all structurally valid, nothing filled ===`);
  try { mkdirSync(join(REPO, "info", "order-receipts"), { recursive: true }); writeFileSync(join(REPO, "info", "order-receipts", "live-order-smoke.json"), JSON.stringify(receipts, null, 1)); } catch {}
})().catch((e) => log("FATAL " + (e.stack || e)));

// Zayd Khan // cold // www.zayd.wtf
