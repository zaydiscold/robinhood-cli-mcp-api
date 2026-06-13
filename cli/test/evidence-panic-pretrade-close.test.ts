import { describe, expect, it } from "vitest";
import {
  verifyOrderEvidence,
  cancelOrder,
  placeEquityOrder,
  listOpenOrders,
  panicCancelAll,
  isOpenOrderState,
  OPEN_ORDER_STATES,
  runPretradeChecks,
  closeLegOrientation,
  buildOptionsClosePlan
} from "../src/lib.js";

// Golden-behavior tests for the 2026-06-11 safety rails: post-send order-history EVIDENCE in code
// (failure mode #20 — a lone 201 is not proof), the shared equity/options cancel path, the panic
// cancel-all sweep, the read-only pretrade checklist, and the options close planner. All deps
// injected — no network, and (by construction) nothing here can ever send a live write.

const NOW = Date.parse("2026-06-11T16:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

// ───────────────────────────── verifyOrderEvidence ─────────────────────────────

describe("verifyOrderEvidence — order history is the only proof", () => {
  it("confirms when the re-read returns a record (equity URL)", async () => {
    const urls: string[] = [];
    const deps = { getJson: async (url: string, params: any) => { urls.push(url); return { id: params["0"], state: "queued" }; } };
    const r = await verifyOrderEvidence("ord-1", "equity", deps);
    expect(r).toMatchObject({ confirmed: true, id: "ord-1", state: "queued" });
    expect(r.warning).toBeUndefined();
    expect(urls[0]).toBe("https://api.robinhood.com/orders/{0}/");
  });

  it("uses the OPTIONS order route for kind=options and accepts a full URL input", async () => {
    const urls: string[] = [];
    const deps = { getJson: async (url: string) => { urls.push(url); return { id: "opt-9", state: "cancelled" }; } };
    const r = await verifyOrderEvidence("https://api.robinhood.com/options/orders/opt-9/", "options", deps);
    expect(urls[0]).toBe("https://api.robinhood.com/options/orders/{0}/");
    expect(r.confirmed).toBe(true);
  });

  it("a re-read with NO order record is unconfirmed with a loud warning", async () => {
    const deps = { getJson: async () => ({}) };
    const r = await verifyOrderEvidence("ord-2", "equity", deps);
    expect(r.confirmed).toBe(false);
    expect(r.warning).toMatch(/EVIDENCE UNCONFIRMED/);
    expect(r.warning).toMatch(/order history/);
  });

  it("a FAILED re-read is unconfirmed with a loud warning — never throws", async () => {
    const deps = { getJson: async () => { throw new Error("503 down"); } };
    const r = await verifyOrderEvidence("ord-3", "options", deps);
    expect(r.confirmed).toBe(false);
    expect(r.warning).toMatch(/EVIDENCE UNCONFIRMED/);
    expect(r.warning).toMatch(/503 down/);
  });
});

// ───────────────────────────── placeEquityOrder evidence ─────────────────────────────

describe("placeEquityOrder — post-send evidence", () => {
  function deps(fix: { writeResult: any; rereadOrder?: any; rereadThrows?: boolean }) {
    return {
      now: () => NOW,
      getJson: async (url: string) => {
        if (url.includes("instruments/?symbol")) return { results: [{ id: "iid-1", symbol: "AAPL", fractional_tradability: "tradable" }] };
        if (url.includes("marketdata/quotes")) return { results: [{ last_trade_price: "100.00" }] };
        if (url === "https://api.robinhood.com/orders/") return { results: [] };
        if (url === "https://api.robinhood.com/orders/{0}/") {
          if (fix.rereadThrows) throw new Error("history unavailable");
          return fix.rereadOrder ?? {};
        }
        throw new Error(`unexpected url: ${url}`);
      },
      write: async () => fix.writeResult,
      log: async () => {}
    };
  }

  it("live 2xx + id → evidence confirmed from the order-history re-read", async () => {
    const d = deps({
      writeResult: { status: 201, dryRun: false, body: JSON.stringify({ id: "ord-1", state: "unconfirmed" }) },
      rereadOrder: { id: "ord-1", state: "queued" }
    });
    const r = await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true }, d);
    expect(r.evidence).toMatchObject({ confirmed: true, id: "ord-1", state: "queued" });
  });

  it("live 2xx but the re-read FAILS → confirmed:false + loud warning (never silent)", async () => {
    const d = deps({
      writeResult: { status: 201, dryRun: false, body: JSON.stringify({ id: "ord-1", state: "queued" }) },
      rereadThrows: true
    });
    const r = await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true }, d);
    expect(r.evidence?.confirmed).toBe(false);
    expect(r.evidence?.warning).toMatch(/EVIDENCE UNCONFIRMED/);
  });

  it("live non-2xx → unconfirmed evidence, no re-read attempted as proof", async () => {
    const d = deps({ writeResult: { status: 400, dryRun: false, body: JSON.stringify({ detail: "rejected" }) } });
    const r = await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true }, d);
    expect(r.evidence?.confirmed).toBe(false);
    expect(r.evidence?.warning).toMatch(/400/);
  });

  it("dry-run carries NO evidence (nothing was sent, nothing to verify)", async () => {
    const d = deps({ writeResult: { status: 0, dryRun: true, body: "{}" } });
    const r = await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10 }, d);
    expect(r.dryRun).toBe(true);
    expect(r.evidence).toBeUndefined();
  });
});

// ───────────────────────────── cancelOrder ─────────────────────────────

describe("cancelOrder — shared equity/options cancel with evidence", () => {
  function deps(fix: { writeResult: any; rereadOrder?: any; rereadThrows?: boolean }) {
    const calls = { writes: [] as any[], rereads: [] as string[] };
    return {
      calls,
      deps: {
        write: async (opts: any) => { calls.writes.push(opts); return fix.writeResult; },
        getJson: async (url: string) => {
          calls.rereads.push(url);
          if (fix.rereadThrows) throw new Error("history down");
          return fix.rereadOrder ?? {};
        }
      }
    };
  }

  it("defaults to dry-run: gated write called with dryRun, no evidence re-read", async () => {
    const { deps: d, calls } = deps({ writeResult: { status: 0, dryRun: true, reason: "Live write blocked", body: "{}" } });
    const r = await cancelOrder({ idOrUrl: "ord-1" }, d);
    expect(calls.writes[0]).toMatchObject({ url: "https://api.robinhood.com/orders/{0}/cancel/", method: "POST", dryRun: true, liveWrite: false, params: { "0": "ord-1" } });
    expect(r.dryRun).toBe(true);
    expect(r.evidence).toBeUndefined();
    expect(calls.rereads).toHaveLength(0);
  });

  it("kind=options hits the options cancel route and the options evidence route", async () => {
    const { deps: d, calls } = deps({
      writeResult: { status: 200, dryRun: false, body: JSON.stringify({ state: "cancelled" }) },
      rereadOrder: { id: "opt-1", state: "cancelled" }
    });
    const r = await cancelOrder({ idOrUrl: "opt-1", kind: "options", liveWrite: true }, d);
    expect(calls.writes[0].url).toBe("https://api.robinhood.com/options/orders/{0}/cancel/");
    expect(calls.rereads[0]).toBe("https://api.robinhood.com/options/orders/{0}/");
    expect(r.evidence).toMatchObject({ confirmed: true, state: "cancelled" });
    expect(r.evidence?.warning).toBeUndefined();
  });

  it("a live 2xx whose re-read is NOT cancelled warns (may have filled first)", async () => {
    const { deps: d } = deps({
      writeResult: { status: 200, dryRun: false, body: "{}" },
      rereadOrder: { id: "ord-1", state: "filled" }
    });
    const r = await cancelOrder({ idOrUrl: "ord-1", liveWrite: true }, d);
    expect(r.evidence?.confirmed).toBe(true);
    expect(r.evidence?.warning).toMatch(/filled before the cancel/);
  });

  it("a live non-2xx cancel is unconfirmed with a warning", async () => {
    const { deps: d, calls } = deps({ writeResult: { status: 403, dryRun: false, body: JSON.stringify({ detail: "cannot cancel" }) } });
    const r = await cancelOrder({ idOrUrl: "ord-1", liveWrite: true }, d);
    expect(r.evidence?.confirmed).toBe(false);
    expect(r.evidence?.warning).toMatch(/403/);
    expect(calls.rereads).toHaveLength(0);
  });

  it("a failed evidence re-read after a live cancel is loud, not silent", async () => {
    const { deps: d } = deps({ writeResult: { status: 200, dryRun: false, body: "{}" }, rereadThrows: true });
    const r = await cancelOrder({ idOrUrl: "ord-1", liveWrite: true }, d);
    expect(r.evidence?.confirmed).toBe(false);
    expect(r.evidence?.warning).toMatch(/EVIDENCE UNCONFIRMED/);
  });
});

// ───────────────────────────── open-order enumeration ─────────────────────────────

const ACCOUNTS_GRAPH = {
  results: [
    { type: "rhs", account_number: "111100001111", account_name: "main" },
    { type: "ira_roth", account_number: "222200002222", account_name: "roth" },
    { type: "ach", account_number: "999900009999", account_name: "bank" } // non-trading: excluded
  ]
};

function openOrdersGetJson(fix: {
  equityByAcct?: Record<string, any[]>;
  optionsByAcct?: Record<string, any[]>;
  instruments?: any[];
  equityThrowsFor?: string;
}) {
  const queries: Array<{ url: string; query: any }> = [];
  const getJson = async (url: string, _params: any = {}, query: any = {}) => {
    queries.push({ url, query });
    if (url.includes("transfer/accounts")) return ACCOUNTS_GRAPH;
    if (url === "https://api.robinhood.com/orders/") {
      if (fix.equityThrowsFor && query.account_numbers === fix.equityThrowsFor) throw new Error("equity list down");
      return { results: fix.equityByAcct?.[query.account_numbers] ?? [] };
    }
    if (url === "https://api.robinhood.com/options/orders/") return { results: fix.optionsByAcct?.[query.account_numbers] ?? [] };
    if (url.includes("instruments/?ids")) return { results: fix.instruments ?? [] };
    throw new Error(`unexpected url: ${url}`);
  };
  return { getJson, queries };
}

describe("isOpenOrderState / OPEN_ORDER_STATES", () => {
  it("open states are open; terminal states are not; unknown states count as open (safer for panic)", () => {
    for (const s of OPEN_ORDER_STATES) expect(isOpenOrderState(s)).toBe(true);
    for (const s of ["filled", "cancelled", "rejected", "failed", "expired", "voided", "FILLED"]) expect(isOpenOrderState(s)).toBe(false);
    expect(isOpenOrderState("some_new_state")).toBe(true);
    expect(isOpenOrderState(undefined)).toBe(false);
    expect(isOpenOrderState("")).toBe(false);
  });
});

describe("listOpenOrders — enumeration + filtering", () => {
  const eqOrder = (over: any = {}) => ({
    id: "eq-1", side: "buy", quantity: "2", price: "10.00", type: "limit", state: "queued",
    time_in_force: "gtc", created_at: hoursAgo(3), instrument_id: "9f6b6e9e-1111-2222-3333-444455556666", ...over
  });
  const optOrder = (over: any = {}) => ({
    id: "op-1", chain_symbol: "NVDA", direction: "debit", opening_strategy: "long_call",
    quantity: "1", price: "1.50", state: "confirmed", time_in_force: "gfd", created_at: hoursAgo(1), ...over
  });

  it("scans every trading account, merges equity + options, resolves tickers, computes age", async () => {
    const { getJson, queries } = openOrdersGetJson({
      equityByAcct: { "111100001111": [eqOrder()] },
      optionsByAcct: { "222200002222": [optOrder()] },
      instruments: [{ id: "9f6b6e9e-1111-2222-3333-444455556666", symbol: "MRVL" }]
    });
    const r = await listOpenOrders({}, { getJson, now: () => NOW });
    expect(r.accountsScanned).toEqual(["111100001111", "222200002222"]);
    expect(r.orders).toHaveLength(2);
    const eq = r.orders.find((o) => o.kind === "equity")!;
    expect(eq).toMatchObject({ symbol: "MRVL", state: "queued", timeInForce: "gtc", price: 10, ageHours: 3 });
    expect(eq.cancelCommand).toMatch(/cancel -i eq-1 --kind equity/);
    const op = r.orders.find((o) => o.kind === "options")!;
    expect(op).toMatchObject({ symbol: "NVDA", state: "confirmed", notionalUsd: 150 });
    expect(op.cancelCommand).toMatch(/--kind options/);
    // server-side filters actually requested
    expect(queries.some((q) => q.url.endsWith("/orders/") && q.query.is_closed === "false")).toBe(true);
    expect(queries.some((q) => q.url.endsWith("/options/orders/") && String(q.query.states).includes("queued"))).toBe(true);
  });

  it("drops terminal states even if the server returns them", async () => {
    const { getJson } = openOrdersGetJson({
      equityByAcct: { "111100001111": [eqOrder({ state: "filled" }), eqOrder({ id: "eq-2", state: "partially_filled" })] }
    });
    const r = await listOpenOrders({}, { getJson, now: () => NOW });
    expect(r.orders.map((o) => o.id)).toEqual(["eq-2"]);
  });

  it("scopes to one account and rejects an unowned one", async () => {
    const { getJson, queries } = openOrdersGetJson({ equityByAcct: {}, optionsByAcct: {} });
    const r = await listOpenOrders({ accountNumber: "222200002222" }, { getJson, now: () => NOW });
    expect(r.accountsScanned).toEqual(["222200002222"]);
    expect(queries.filter((q) => q.url.endsWith("/orders/")).every((q) => q.query.account_numbers === "222200002222")).toBe(true);
    await expect(listOpenOrders({ accountNumber: "000000000000" }, { getJson, now: () => NOW })).rejects.toThrow(/not one of your trading accounts/);
  });

  it("a per-account read failure degrades to a warning, never kills the sweep", async () => {
    const { getJson } = openOrdersGetJson({
      equityThrowsFor: "111100001111",
      optionsByAcct: { "222200002222": [optOrder()] }
    });
    const r = await listOpenOrders({}, { getJson, now: () => NOW });
    expect(r.orders).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes("equity open-orders read failed"))).toBe(true);
  });
});

// ───────────────────────────── panicCancelAll ─────────────────────────────

describe("panicCancelAll — dry-run default, per-cancel gating, evidence", () => {
  const fixtures = () => openOrdersGetJson({
    equityByAcct: { "111100001111": [{ id: "eq-1", side: "buy", quantity: "1", price: "5.00", type: "limit", state: "queued", time_in_force: "gtc", created_at: hoursAgo(2), instrument_id: "9f6b6e9e-1111-2222-3333-444455556666" }] },
    optionsByAcct: { "222200002222": [{ id: "op-1", chain_symbol: "NVDA", direction: "debit", opening_strategy: "long_call", quantity: "1", price: "1.00", state: "queued", time_in_force: "gfd", created_at: hoursAgo(1) }] },
    instruments: [{ id: "9f6b6e9e-1111-2222-3333-444455556666", symbol: "MRVL" }]
  });

  it("DRY RUN by default: full would-cancel list, every cancel dryRun, nothing counted as cancelled", async () => {
    const { getJson } = fixtures();
    const writes: any[] = [];
    const write = async (opts: any) => { writes.push(opts); return { status: 0, dryRun: true, reason: "Live write blocked", body: "{}" }; };
    const r = await panicCancelAll({}, { getJson, write: write as any, now: () => NOW });
    expect(r.dryRun).toBe(true);
    expect(r.found).toBe(2);
    expect(r.cancelled).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.orders.every((o) => o.cancel.dryRun)).toBe(true);
    expect(r.summary).toMatch(/DRY RUN/);
    expect(r.summary).toMatch(/nothing was sent/i);
    // each cancel still went through the gated write path, dry-run, with the panic logContext
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.dryRun === true && w.liveWrite === false)).toBe(true);
    expect(writes.every((w) => String(w.logContext).startsWith("panic cancel-all"))).toBe(true);
    expect(writes.map((w) => w.url)).toEqual([
      "https://api.robinhood.com/options/orders/{0}/cancel/", // newest first (options order is younger)
      "https://api.robinhood.com/orders/{0}/cancel/"
    ]);
  });

  it("live mode counts cancelled with per-cancel evidence; one failure never stops the sweep", async () => {
    const { getJson: baseGetJson } = fixtures();
    const getJson = async (url: string, params: any = {}, query: any = {}) => {
      if (url === "https://api.robinhood.com/orders/{0}/") return { id: params["0"], state: "cancelled" };
      if (url === "https://api.robinhood.com/options/orders/{0}/") return { id: params["0"], state: "cancelled" };
      return baseGetJson(url, params, query);
    };
    let first = true;
    const write = async () => {
      if (first) { first = false; return { status: 200, dryRun: false, body: JSON.stringify({ state: "cancelled" }) }; }
      return { status: 403, dryRun: false, body: JSON.stringify({ detail: "cannot cancel" }) };
    };
    const r = await panicCancelAll({ liveWrite: true }, { getJson: getJson as any, write: write as any, now: () => NOW });
    expect(r.dryRun).toBe(false);
    expect(r.found).toBe(2);
    expect(r.cancelled).toBe(1);
    expect(r.failed).toBe(1);
    const ok = r.orders.find((o) => Number(o.cancel.httpStatus) === 200)!;
    expect(ok.cancel.evidence).toMatchObject({ confirmed: true, state: "cancelled" });
    const bad = r.orders.find((o) => Number(o.cancel.httpStatus) === 403)!;
    expect(bad.cancel.evidence?.confirmed).toBe(false);
  });

  it("no open orders → says so and sends nothing", async () => {
    const { getJson } = openOrdersGetJson({ equityByAcct: {}, optionsByAcct: {} });
    const writes: any[] = [];
    const write = async (opts: any) => { writes.push(opts); return { status: 0, dryRun: true, body: "{}" }; };
    const r = await panicCancelAll({}, { getJson, write: write as any, now: () => NOW });
    expect(r.found).toBe(0);
    expect(r.summary).toMatch(/No open\/pending orders/);
    expect(writes).toHaveLength(0);
  });

  it("a throwing cancel is recorded as failed and the sweep continues", async () => {
    const { getJson } = fixtures();
    let calls = 0;
    const write = async () => {
      calls++;
      if (calls === 1) throw new Error("route resolver exploded");
      return { status: 0, dryRun: true, body: "{}" };
    };
    const r = await panicCancelAll({}, { getJson, write: write as any, now: () => NOW });
    expect(r.found).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.orders.some((o) => o.cancel.error?.includes("exploded"))).toBe(true);
  });
});

// ───────────────────────────── pretrade ─────────────────────────────

describe("runPretradeChecks — read-only PASS/WARN/BLOCK checklist", () => {
  function pretradeGetJson(fix: {
    detailType?: string;
    minTicks?: any;
    instrument?: any;
    bpThrows?: boolean;
  } = {}) {
    const posts: string[] = [];
    const getJson = async (url: string) => {
      if (url.includes("transfer/accounts")) return ACCOUNTS_GRAPH;
      if (url.includes("buying_power_breakdown")) {
        if (fix.bpThrows) throw new Error("bp endpoint down");
        return { buying_power: "1500.00", intraday_buying_power: "3000.00" };
      }
      if (url === "https://api.robinhood.com/accounts/{account_number}/") return { type: fix.detailType ?? "margin", account_number: "111100001111" };
      if (url.includes("instruments/?symbol")) return { results: [fix.instrument ?? { id: "iid-1", tradable_chain_id: "chain-1", fractional_tradability: "tradable" }] };
      if (url.includes("options_buying_power")) return { options_buying_power: "900.00" };
      if (url.includes("options/fees")) return { fee: "0.04" };
      if (url.includes("collateral")) return { collateral: [] };
      if (url === "https://api.robinhood.com/options/chains/{id}/") return { min_ticks: fix.minTicks ?? { below_tick: "0.05", above_tick: "0.10", cutoff_price: "3.00" } };
      throw new Error(`unexpected url: ${url}`);
    };
    const getAll = async () => [{ id: "opt-30c", strike_price: "30.0000" }];
    return { getJson, getAll, posts };
  }

  const byId = (r: any, id: string) => r.checks.find((c: any) => c.id === id);

  it("BLOCKs an unowned account (wrong-account risk)", async () => {
    const { getJson, getAll } = pretradeGetJson();
    const r = await runPretradeChecks({ accountNumber: "000000000000" }, { getJson: getJson as any, getAll: getAll as any });
    expect(byId(r, "account").status).toBe("BLOCK");
    expect(r.clear).toBe(false);
    expect(r.summary).toMatch(/^BLOCKED/);
  });

  it("full happy path: account/BP/options-BP/collateral/min-tick/contract PASS → CLEAR TO BUILD ORDER", async () => {
    const { getJson, getAll } = pretradeGetJson();
    const r = await runPretradeChecks(
      { accountNumber: "111100001111", symbol: "HPE", strike: 30, expiration: "2026-06-26", optionType: "call", limitPrice: 0.05 },
      { getJson: getJson as any, getAll: getAll as any }
    );
    expect(byId(r, "account").status).toBe("PASS");
    expect(byId(r, "account").detail).toMatch(/class=margin/);
    expect(byId(r, "buying-power").status).toBe("PASS");
    expect(byId(r, "buying-power").detail).toMatch(/OVERNIGHT/);
    expect(byId(r, "options-buying-power").status).toBe("PASS");
    expect(byId(r, "collateral").status).toBe("PASS");
    expect(byId(r, "min-tick").status).toBe("PASS");
    expect(byId(r, "contract").status).toBe("PASS");
    expect(byId(r, "contract").detail).toMatch(/opt-30c/);
    expect(byId(r, "otc-fractional").status).toBe("PASS");
    expect(r.clear).toBe(true);
    expect(r.summary).toBe("CLEAR TO BUILD ORDER");
    expect(r.note).toMatch(/READ-ONLY/);
  });

  it("min-tick BLOCK: $0.01 on a $0.05-below-cutoff chain (the ARKG trap)", async () => {
    const { getJson, getAll } = pretradeGetJson();
    const r = await runPretradeChecks(
      { accountNumber: "111100001111", symbol: "ARKG", limitPrice: 0.01 },
      { getJson: getJson as any, getAll: getAll as any }
    );
    expect(byId(r, "min-tick").status).toBe("BLOCK");
    expect(byId(r, "min-tick").detail).toMatch(/min tick/i);
    expect(r.clear).toBe(false);
    expect(r.summary).toMatch(/BLOCKED: min-tick/);
  });

  it("contract BLOCK when the strike is not listed", async () => {
    const { getJson, getAll } = pretradeGetJson();
    const r = await runPretradeChecks(
      { accountNumber: "111100001111", symbol: "HPE", strike: 31.5, expiration: "2026-06-26", optionType: "call" },
      { getJson: getJson as any, getAll: getAll as any }
    );
    expect(byId(r, "contract").status).toBe("BLOCK");
  });

  it("OTC/non-fractional symbol WARNs that dollar orders are impossible", async () => {
    const { getJson, getAll } = pretradeGetJson({ instrument: { id: "iid-otc", fractional_tradability: "position_closing_only", otc_market_tier: "otc" } });
    const r = await runPretradeChecks({ accountNumber: "111100001111", symbol: "RNECY" }, { getJson: getJson as any, getAll: getAll as any });
    expect(byId(r, "otc-fractional").status).toBe("WARN");
    expect(byId(r, "otc-fractional").detail).toMatch(/IMPOSSIBLE/);
  });

  it("marketability is ALWAYS a MANUAL gated step — pretrade never POSTs", async () => {
    const { getJson, getAll } = pretradeGetJson();
    const r = await runPretradeChecks({ accountNumber: "111100001111" }, { getJson: getJson as any, getAll: getAll as any });
    const m = byId(r, "marketability");
    expect(m.status).toBe("MANUAL");
    expect(m.detail).toMatch(/manual step \(POST, gated\)/);
    expect(m.detail).toMatch(/--dry-run/);
  });

  it("checks degrade independently: a dead BP endpoint WARNs without blocking the rest", async () => {
    const { getJson, getAll } = pretradeGetJson({ bpThrows: true });
    const r = await runPretradeChecks({ accountNumber: "111100001111", symbol: "HPE" }, { getJson: getJson as any, getAll: getAll as any });
    expect(byId(r, "buying-power").status).toBe("WARN");
    expect(byId(r, "account").status).toBe("PASS");
    expect(byId(r, "options-buying-power").status).toBe("PASS");
    expect(r.clear).toBe(true);
  });

  it("IRA account class is reported with the IRA capability note", async () => {
    const { getJson, getAll } = pretradeGetJson();
    const r = await runPretradeChecks({ accountNumber: "222200002222" }, { getJson: getJson as any, getAll: getAll as any });
    expect(byId(r, "account").detail).toMatch(/class=ira/);
    expect(byId(r, "account").detail).toMatch(/no margin borrowing/i);
  });
});

// ───────────────────────────── options close ─────────────────────────────

describe("closeLegOrientation — direction → side/effect mapping (the whole point)", () => {
  it("long → sell-to-close (credit)", () => {
    expect(closeLegOrientation("long")).toEqual({ side: "sell", positionEffect: "close", direction: "credit" });
  });
  it("short → buy-to-close (debit)", () => {
    expect(closeLegOrientation("short")).toEqual({ side: "buy", positionEffect: "close", direction: "debit" });
  });
  it("unknown direction throws instead of guessing", () => {
    expect(() => closeLegOrientation("mystery")).toThrow(/cannot infer/i);
  });
});

describe("buildOptionsClosePlan — dry-run close plans", () => {
  const aggPosition = (over: any = {}) => ({
    symbol: "NVDA", strategy: "long_call", quantity: "2.0000", average_open_price: "150.0000",
    legs: [{ option_id: "opt-uuid-1", position_type: "long", option_type: "call", strike_price: "180.0000", expiration_date: "2026-12-18" }],
    ...over
  });

  function closeGetters(fix: {
    positionsByAcct?: Record<string, any[]>;
    mark?: any;
    minTicks?: any;
  }) {
    const getJson = async (url: string, params: any = {}) => {
      if (url.includes("transfer/accounts")) return ACCOUNTS_GRAPH;
      if (url.includes("marketdata/options")) return { results: [fix.mark ?? { bid_price: "10.00", ask_price: "10.50", adjusted_mark_price: "10.25" }] };
      if (url === "https://api.robinhood.com/options/instruments/{0}/") return { chain_id: "chain-1" };
      if (url === "https://api.robinhood.com/options/chains/{id}/") return { min_ticks: fix.minTicks ?? { below_tick: "0.01", above_tick: "0.05", cutoff_price: "3.00" } };
      throw new Error(`unexpected url: ${url}`);
    };
    const getAll = async (_url: string, _params: any, query: any) => fix.positionsByAcct?.[query.account_numbers] ?? [];
    return { getJson, getAll };
  }

  it("long call → sell-to-close body with position_effect=close, credit, tick-rounded mid", async () => {
    const { getJson, getAll } = closeGetters({ positionsByAcct: { "111100001111": [aggPosition()] } });
    const r = await buildOptionsClosePlan({ symbol: "nvda" }, { getJson: getJson as any, getAll: getAll as any });
    expect(r.needsDisambiguation).toBe(false);
    expect(r.action).toBe("sell-to-close");
    expect(r.orientation).toEqual({ side: "sell", positionEffect: "close", direction: "credit" });
    expect(r.dryRunBody).toMatchObject({
      account: "https://api.robinhood.com/accounts/111100001111/",
      direction: "credit",
      type: "limit",
      quantity: "2",
      price: "10.25" // mid of 10.00/10.50, on the $0.05 above-cutoff tick
    });
    expect(r.dryRunBody.legs[0]).toEqual({
      side: "sell",
      option: "https://api.robinhood.com/options/instruments/opt-uuid-1/",
      position_effect: "close",
      ratio_quantity: 1
    });
    expect(r.dryRunBody.ref_id).toMatch(/[0-9a-f-]{36}/);
    expect(r.commands.gatedSend).toMatch(/--live-write/);
    expect(r.commands.gatedSend).toMatch(/ROBINHOOD_ALLOW_LIVE_WRITE=1/);
    expect(r.note).toMatch(/nothing was sent/i);
  });

  it("short put → buy-to-close (debit) — never inferred as an open", async () => {
    const pos = aggPosition({ strategy: "short_put", legs: [{ option_id: "opt-uuid-2", position_type: "short", option_type: "put", strike_price: "100.0000", expiration_date: "2026-07-17" }] });
    const { getJson, getAll } = closeGetters({ positionsByAcct: { "222200002222": [pos] } });
    const r = await buildOptionsClosePlan({ symbol: "NVDA" }, { getJson: getJson as any, getAll: getAll as any });
    expect(r.action).toBe("buy-to-close");
    expect(r.dryRunBody.direction).toBe("debit");
    expect(r.dryRunBody.legs[0]).toMatchObject({ side: "buy", position_effect: "close" });
  });

  it("multiple matches require disambiguation and list the candidates", async () => {
    const second = aggPosition({ legs: [{ option_id: "opt-uuid-3", position_type: "long", option_type: "call", strike_price: "200.0000", expiration_date: "2026-12-18" }] });
    const { getJson, getAll } = closeGetters({ positionsByAcct: { "111100001111": [aggPosition(), second] } });
    const r = await buildOptionsClosePlan({ symbol: "NVDA" }, { getJson: getJson as any, getAll: getAll as any });
    expect(r.needsDisambiguation).toBe(true);
    expect(r.matched).toBe(2);
    expect(r.hint).toMatch(/--account\/--strike\/--expiration/);
    // a strike disambiguator resolves it
    const one = await buildOptionsClosePlan({ symbol: "NVDA", strike: 200 }, { getJson: getJson as any, getAll: getAll as any });
    expect(one.needsDisambiguation).toBe(false);
    expect(one.position.optionId).toBe("opt-uuid-3");
  });

  it("no open position throws (close never opens)", async () => {
    const { getJson, getAll } = closeGetters({ positionsByAcct: {} });
    await expect(buildOptionsClosePlan({ symbol: "NVDA" }, { getJson: getJson as any, getAll: getAll as any }))
      .rejects.toThrow(/never opens/);
  });

  it("multi-leg positions are flagged, not auto-closed", async () => {
    const spread = aggPosition({
      strategy: "call_debit_spread",
      legs: [
        { option_id: "l1", position_type: "long", option_type: "call", strike_price: "180.0000", expiration_date: "2026-12-18" },
        { option_id: "l2", position_type: "short", option_type: "call", strike_price: "190.0000", expiration_date: "2026-12-18" }
      ]
    });
    const { getJson, getAll } = closeGetters({ positionsByAcct: { "111100001111": [spread] } });
    const r = await buildOptionsClosePlan({ symbol: "NVDA" }, { getJson: getJson as any, getAll: getAll as any });
    expect(r.multiLeg).toBe(true);
    expect(r.hint).toMatch(/strategy-quote/);
  });

  it("rejects a close quantity larger than the position", async () => {
    const { getJson, getAll } = closeGetters({ positionsByAcct: { "111100001111": [aggPosition()] } });
    await expect(buildOptionsClosePlan({ symbol: "NVDA", quantity: 5 }, { getJson: getJson as any, getAll: getAll as any }))
      .rejects.toThrow(/invalid for a position of 2/);
  });
});

// made with love by Zayd Khan / cold @ www.zayd.wtf
