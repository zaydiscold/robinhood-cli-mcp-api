#!/usr/bin/env node
// validate-strategies.mjs : matrix-test of options strategy leg-topologies via the real
// options/orders/ endpoint: place a far-from-/valid limit (GTC) then confirm 201 + echoed legs then
// request cancellation and verify the resulting state. A live order can fill before cancellation. Builds order bodies for
// a wide strategy set across multiple expirations.
//
// Double-gated like the rest of the repo: LIVE place+cancel requires BOTH --live AND
// ROBINHOOD_ALLOW_LIVE_WRITE=1. Without both it runs DRY (prints the exact bodies, sends nothing).
//   node scripts/validate-strategies.mjs [SYMBOL=AAPL] [ACCOUNT=<ACCOUNT_NUMBER>]                  # dry preview
//   ROBINHOOD_ALLOW_LIVE_WRITE=1 node scripts/validate-strategies.mjs AAPL <ACCOUNT_NUMBER> --live  # live
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { isLiveWriteEnabled } from "./lib/live-gate.mjs";
import { gatedBrokerageWrite, cancelOrder, operatorDataRoot } from "../cli/dist/lib.js";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
(function () {
  const p = join(REPO, ".env");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e < 0) continue;
    const k = t.slice(0, e).trim();
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
})();
const LIVE = isLiveWriteEnabled();
const positionals = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SYM = (positionals[0] || "AAPL").toUpperCase();
const ACCT = positionals[1] || "";
const api = async (u, o = {}) => {
  const r = await fetch(u, o);
  const t = await r.text();
  let b = null;
  try {
    b = t ? JSON.parse(t) : null;
  } catch {
    b = t;
  }
  return { status: r.status, body: b };
};
const oUrl = (id) => `https://api.robinhood.com/options/instruments/${id}/`;
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

(async () => {
  const inst = (await api(`https://api.robinhood.com/instruments/?symbol=${SYM}`)).body.results[0];
  const spot = Number(
    (await api(`https://api.robinhood.com/marketdata/quotes/?ids=${inst.id}`)).body.results[0]
      .last_trade_price,
  );
  const chain = inst.tradable_chain_id;
  const allExps = (await api(`https://api.robinhood.com/options/chains/${chain}/`)).body
    .expiration_dates;
  // pick expirations: nearest (~0DTE), ~monthly, far (~LEAP)
  const pick = [0, Math.min(6, allExps.length - 1), allExps.length - 1];
  const exps = [...new Set(pick.map((i) => allExps[i]))];
  // enumerate call+put per chosen expiration -> maps[exp]={call:{k:id},put:{k:id}}, plus sorted strikes
  const maps = {};
  let strikes = [];
  for (const exp of exps) {
    maps[exp] = { call: {}, put: {} };
    for (const type of ["call", "put"]) {
      const rows =
        (
          await api(
            `https://api.robinhood.com/options/instruments/?chain_id=${chain}&expiration_dates=${exp}&type=${type}&state=active`,
          )
        ).body.results || [];
      for (const r of rows) maps[exp][type][Number(r.strike_price)] = r.id;
    }
    const ks = Object.keys(maps[exp].call)
      .map(Number)
      .sort((a, b) => a - b);
    if (ks.length > strikes.length) strikes = ks;
  }
  const atm = strikes.reduce(
    (p, c) => (Math.abs(c - spot) < Math.abs(p - spot) ? c : p),
    strikes[0],
  );
  const ai = strikes.indexOf(atm);
  const K = (off) => strikes[Math.max(0, Math.min(strikes.length - 1, ai + off))];
  const leg = (exp, off, type, side, ratio = 1) => {
    const id = maps[exp][type][K(off)];
    return id
      ? { option: oUrl(id), position_effect: "open", ratio_quantity: ratio, side, option_id: id }
      : null;
  };
  // strategy specs: name, direction, legs(builder given expiration index e -> array)
  const S = (name, dir, fn) => ({ name, dir, fn });
  const strat = [
    S("long call", "debit", (e) => [leg(e, 0, "call", "buy")]),
    S("long put", "debit", (e) => [leg(e, 0, "put", "buy")]),
    S("short call (naked)", "credit", (e) => [leg(e, 2, "call", "sell")]),
    S("short put / CSP", "credit", (e) => [leg(e, -2, "put", "sell")]),
    S("call debit spread", "debit", (e) => [leg(e, 0, "call", "buy"), leg(e, 2, "call", "sell")]),
    S("call credit spread", "credit", (e) => [leg(e, 0, "call", "sell"), leg(e, 2, "call", "buy")]),
    S("put credit spread", "credit", (e) => [leg(e, 0, "put", "sell"), leg(e, -2, "put", "buy")]),
    S("put debit spread", "debit", (e) => [leg(e, 0, "put", "buy"), leg(e, -2, "put", "sell")]),
    S("long straddle", "debit", (e) => [leg(e, 0, "call", "buy"), leg(e, 0, "put", "buy")]),
    S("long strangle", "debit", (e) => [leg(e, 2, "call", "buy"), leg(e, -2, "put", "buy")]),
    S("iron condor", "credit", (e) => [
      leg(e, -2, "put", "sell"),
      leg(e, -4, "put", "buy"),
      leg(e, 2, "call", "sell"),
      leg(e, 4, "call", "buy"),
    ]),
    S("iron butterfly", "credit", (e) => [
      leg(e, 0, "call", "sell"),
      leg(e, 0, "put", "sell"),
      leg(e, 2, "call", "buy"),
      leg(e, -2, "put", "buy"),
    ]),
    S("call butterfly", "debit", (e) => [
      leg(e, -2, "call", "buy"),
      leg(e, 0, "call", "sell", 2),
      leg(e, 2, "call", "buy"),
    ]),
    S("broken-wing butterfly", "debit", (e) => [
      leg(e, -2, "call", "buy"),
      leg(e, 0, "call", "sell", 2),
      leg(e, 4, "call", "buy"),
    ]),
    S("call ratio (1x2)", "credit", (e) => [
      leg(e, 0, "call", "buy"),
      leg(e, 3, "call", "sell", 2),
    ]),
    S("jade lizard", "credit", (e) => [
      leg(e, -2, "put", "sell"),
      leg(e, 2, "call", "sell"),
      leg(e, 4, "call", "buy"),
    ]),
    S("collar/risk-reversal", "credit", (e) => [
      leg(e, -2, "put", "buy"),
      leg(e, 2, "call", "sell"),
    ]),
  ];
  const place = async (dir, legs) => {
    if (!legs || legs.some((l) => !l)) return { skip: "strike/expiry missing" };
    const price = dir === "debit" ? "0.01" : "0.50";
    const body = {
      account: `https://api.robinhood.com/accounts/${ACCT}/`,
      direction: dir,
      legs: legs.map((l) => ({
        side: l.side,
        option: l.option,
        position_effect: l.position_effect,
        ratio_quantity: l.ratio_quantity,
      })),
      type: "limit",
      time_in_force: "gtc",
      trigger: "immediate",
      price,
      quantity: "1",
      ref_id: randomUUID(),
    };
    if (!LIVE) {
      return {
        status: "DRY",
        placed: false,
        dryRun: true,
        legs: body.legs.length,
        why: "dry-run (not sent) : pass --live + ROBINHOOD_ALLOW_LIVE_WRITE=1",
        body,
      };
    }
    journal({ phase: "intent", refId: body.ref_id, body });
    let placed;
    try {
      placed = await gatedBrokerageWrite({
        url: "https://api.robinhood.com/options/orders/",
        method: "POST",
        body,
        dryRun: false,
        liveWrite: true,
        accountNumber: ACCT,
        fullBody: true,
        logContext: `strategy validation: ${SYM}`,
      });
    } catch {
      return {
        status: "unknown",
        placed: false,
        stop: true,
        refId: body.ref_id,
        why: "Submission failed or is uncertain. Reconcile account orders before another attempt.",
      };
    }
    let b = placed.body || {};
    if (typeof b === "string") {
      try {
        b = JSON.parse(b);
      } catch {}
    }
    if ((placed.status === 200 || placed.status === 201) && b?.id) {
      // Preserve the accepted order identifier before attempting cancellation.
      let receiptFailed = false;
      try {
        journal({
          phase: "accepted",
          refId: body.ref_id,
          orderId: String(b.id),
          status: placed.status,
        });
      } catch {
        receiptFailed = true;
      }
      let cancelled;
      try {
        cancelled = await cancelOrder({
          idOrUrl: String(b.id),
          kind: "options",
          accountNumber: ACCT,
          dryRun: false,
          liveWrite: true,
          logContext: `strategy validation cancel: ${SYM}`,
        });
      } catch {
        return {
          status: placed.status,
          placed: true,
          orderId: String(b.id),
          cancelled: false,
          stop: true,
          why: "Cancellation could not be confirmed; reconcile the recorded order before continuing.",
        };
      }
      const cancellationSucceeded =
        cancelled.evidence?.confirmed === true && cancelled.evidence.state === "cancelled";
      return {
        status: placed.status,
        placed: true,
        orderId: String(b.id),
        legs: (b.legs || []).length,
        cancel: cancelled.httpStatus,
        cancelled: cancellationSucceeded,
        evidence: cancelled.evidence,
        stop: !cancellationSucceeded || receiptFailed,
        why: receiptFailed
          ? "Receipt update failed; stop after cancellation and inspect the pre-send intent."
          : cancellationSucceeded
            ? undefined
            : "Order is not confirmed cancelled. Stop and reconcile before continuing.",
      };
    }
    return {
      status: placed.status,
      placed: false,
      stop: true,
      why: (b?.detail || b?.non_field_errors || JSON.stringify(b)).toString().slice(0, 90),
    };
  };
  const receipts = [];
  const receiptDir = join(operatorDataRoot(), "local", "order-receipts");
  mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const receiptPath = join(receiptDir, `strategy-validation-${SYM}-${Date.now()}.json`);
  const journalEntries = [];
  function journal(entry) {
    journalEntries.push(entry);
    const temporary = `${receiptPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ receipts, journal: journalEntries }, null, 2), {
        mode: 0o600,
      });
      renameSync(temporary, receiptPath);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  log(
    `${SYM} spot ${spot} | acct ${ACCT} | expirations: ${exps.join(", ")} | mode: ${LIVE ? "LIVE (place+cancel)" : "DRY-RUN (bodies only, nothing sent)"}`,
  );
  // single-expiration strategies: run on nearest (0DTE-ish) + a monthly to cover date range
  const singleExps = [exps[0], exps[Math.min(1, exps.length - 1)]];
  for (const exp of [...new Set(singleExps)]) {
    log(`\n: exp ${exp} :`);
    for (const st of strat) {
      const r = await place(st.dir, st.fn(exp));
      if (r.skip) {
        log(`  SKIP ${st.name}: ${r.skip}`);
        continue;
      }
      log(
        `  [${r.status}] ${st.name}${r.placed ? ` OK (${r.legs} legs, cancel ${r.cancel})` : `  ${r.why}`}`,
      );
      receipts.push({ exp, strategy: st.name, ...r });
      journal({ phase: "result", strategy: st.name });
      if (r.stop) {
        log(`  STOP ${st.name}: ${r.why}`);
        throw new Error(
          `Cancellation failed for accepted strategy-validation order; receipt retained for reconciliation.`,
        );
      }
      if (LIVE) await new Promise((x) => setTimeout(x, 3000));
    }
  }
  // multi-expiration: calendar + diagonal (PMCC)
  if (exps.length >= 2) {
    const near = exps[0],
      far = exps[exps.length - 1];
    log(`\n: multi-exp (near ${near} / far ${far}) :`);
    const cal = [leg(near, 0, "call", "sell"), leg(far, 0, "call", "buy")];
    const pmcc = [leg(far, -6, "call", "buy"), leg(near, 2, "call", "sell")]; // deep-ITM far + OTM near
    for (const [nm, lg] of [
      ["call calendar", cal],
      ["PMCC / diagonal", pmcc],
    ]) {
      const r = await place("debit", lg);
      if (r.skip) {
        log(`  SKIP ${nm}: ${r.skip}`);
        continue;
      }
      log(
        `  [${r.status}] ${nm}${r.placed ? ` OK (${r.legs} legs, cancel ${r.cancel})` : `  ${r.why}`}`,
      );
      receipts.push({ exp: `${near}/${far}`, strategy: nm, ...r });
      journal({ phase: "result", strategy: nm });
      if (r.stop) {
        log(`  STOP ${nm}: ${r.why}`);
        throw new Error(
          `Cancellation failed for accepted strategy-validation order; receipt retained for reconciliation.`,
        );
      }
      if (LIVE) await new Promise((x) => setTimeout(x, 3000));
    }
  }
  const okN = receipts.filter((r) => r.placed).length;
  log(
    LIVE
      ? `\n=== ${okN}/${receipts.length} placed (structure response received); cancellation status is recorded per receipt and only successful cancellations are marked cancelled ===`
      : `\n=== ${receipts.length} dry-run body plans built; zero orders sent ===`,
  );
  journal({ phase: "complete" });
})().catch((e) => {
  log("FATAL " + (e.stack || e));
  process.exitCode = 1;
});

// Zayd Khan // cold // www.zayd.wtf
