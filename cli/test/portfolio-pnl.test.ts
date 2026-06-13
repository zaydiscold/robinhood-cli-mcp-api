import { describe, expect, it } from "vitest";
import { computePortfolioPnl } from "../src/lib.js";

// Golden-fixture tests for the portfolio P&L engine. These pin the metric DEFINITIONS so a future
// api-map/refactor can't silently re-break them (e.g. the equity_previous_close="0" bug we already fixed).
// computePortfolioPnl takes injectable fetchers (getJson/getAll) — we feed frozen responses, no network.

interface Fix {
  accounts: any;
  portfolios: Record<string, any>;
  positions: Record<string, any[]>;
  optionPositions: Record<string, any[]>;
  quotes: any;
  optionMarks: any;
  throwOnQuotes?: boolean;
}

function deps(fix: Fix) {
  const getJson = async (url: string, params: any = {}) => {
    if (url.includes("transfer/accounts")) return fix.accounts;
    if (url.includes("portfolios/{account_number}")) return fix.portfolios[params.account_number];
    if (url.includes("marketdata/quotes")) { if (fix.throwOnQuotes) throw new Error("503"); return fix.quotes; }
    if (url.includes("marketdata/options")) return fix.optionMarks;
    throw new Error("unexpected getJson " + url);
  };
  const getAll = async (url: string, _params: any = {}, query: any = {}) => {
    if (url.includes("aggregate_positions")) return fix.optionPositions[query.account_numbers] ?? [];
    if (url.includes("positions/")) return fix.positions[query.account_number] ?? [];
    throw new Error("unexpected getAll " + url);
  };
  return { getJson, getAll };
}

// Two accounts: 111 (down) and 222 (up). 111 holds equity AAA + option BBB. equity_previous_close is "0"
// on both (the per-account trap) → the engine MUST use adjusted_equity_previous_close.
const base = (): Fix => ({
  accounts: { results: [
    { type: "rhs", account_number: "111", account_name: "Acct A" },
    { type: "ira_roth", account_number: "222", account_name: "Roth" }
  ] },
  portfolios: {
    "111": { equity: "1000", extended_hours_equity: "990", adjusted_equity_previous_close: "1100", equity_previous_close: "0" },
    "222": { equity: "2000", extended_hours_equity: "1990", adjusted_equity_previous_close: "1900", equity_previous_close: "0" }
  },
  positions: { "111": [{ symbol: "AAA", instrument_id: "iidA", quantity: "10" }], "222": [] },
  optionPositions: { "111": [{ symbol: "BBB", detail_display_name: "$5 Call 1/1", legs: [{ option_id: "oidB" }], quantity: "1" }], "222": [] },
  quotes: { results: [{ instrument_id: "iidA", last_trade_price: "95", last_extended_hours_trade_price: "94", adjusted_previous_close: "100" }] },
  optionMarks: { results: [{ instrument_id: "oidB", adjusted_mark_price: "4.0", previous_close_price: "5.0", last_trade_price: "4.2" }] }
});

describe("computePortfolioPnl — metric definitions (golden fixtures)", () => {
  it("computes per-account day Δ = equity − adjusted_equity_previous_close (ignoring equity_previous_close='0')", async () => {
    const r = await computePortfolioPnl({}, deps(base()));
    const a111 = r.accounts.find((a: any) => a.accountNumber === "111");
    const a222 = r.accounts.find((a: any) => a.accountNumber === "222");
    expect(a111.dayChangeUsd).toBe(-100);          // 1000 − 1100 (adjusted, NOT the "0" raw field)
    expect(a222.dayChangeUsd).toBe(100);           // 2000 − 1900
    expect(a111.label).toBe("Acct A");             // RH account_name surfaced
  });

  it("computes per-account after-hours Δ = extended_hours_equity − equity (NOT vs prev close)", async () => {
    const r = await computePortfolioPnl({}, deps(base()));
    expect(r.accounts.find((a: any) => a.accountNumber === "111").afterHoursChangeUsd).toBe(-10); // 990 − 1000
    expect(r.totals.afterHoursChangeUsd).toBe(-20);                                                // −10 + −10
    expect(r.afterHoursActive).toBe(true);
  });

  it("totals: equity summed, day nets across accounts", async () => {
    const r = await computePortfolioPnl({}, deps(base()));
    expect(r.totals.equityUsd).toBe(3000);
    expect(r.totals.dayChangeUsd).toBe(0);         // −100 + 100
    expect(r.complete).toBe(true);
  });

  it("per-position drivers: equity = qty×(last−adjPrevClose) for day, qty×(ext−last) for AH", async () => {
    const r = await computePortfolioPnl({}, deps(base()));
    const aaa = r.byPosition.find((d: any) => d.symbol === "AAA");
    expect(aaa.dayChangeUsd).toBe(-50);            // 10 × (95 − 100)
    expect(aaa.afterHoursChangeUsd).toBe(-10);     // 10 × (94 − 95)
  });

  it("option day = (mark−prevClose)×100×qty; option AFTER-HOURS = 0 (options don't print AH)", async () => {
    const r = await computePortfolioPnl({}, deps(base()));
    const bbb = r.byPosition.find((d: any) => d.symbol === "BBB");
    expect(bbb.dayChangeUsd).toBe(-100);           // (4.0 − 5.0) × 100 × 1
    expect(bbb.afterHoursChangeUsd).toBe(0);       // NOT (mark − last) mid-drift
  });

  it("reconciliation: residual = top-line − driver sum; mispricedPositions = 0 when all priced", async () => {
    const r = await computePortfolioPnl({}, deps(base()));
    expect(r.reconciliation.driverDayChangeUsd).toBe(-150);  // −50 (AAA) + −100 (BBB)
    expect(r.reconciliation.totalsDayChangeUsd).toBe(0);
    expect(r.reconciliation.residualUsd).toBe(150);          // 0 − (−150)
    expect(r.reconciliation.mispricedPositions).toBe(0);
  });

  it("degrades (not crashes) when the quotes batch fails: top-line intact, warned, position mispriced", async () => {
    const fix = base(); fix.throwOnQuotes = true;
    const r = await computePortfolioPnl({}, deps(fix));
    expect(r.totals.dayChangeUsd).toBe(0);                   // top-line still computed from portfolios/
    expect(r.complete).toBe(false);                          // a degrade marks incomplete
    expect(r.warnings.some((w: string) => /quotes batch failed/i.test(w))).toBe(true);
    const aaa = r.byPosition.find((d: any) => d.symbol === "AAA");
    expect(Number.isNaN(aaa.dayChangeUsd)).toBe(true);       // unpriced
    expect(r.reconciliation.mispricedPositions).toBeGreaterThanOrEqual(1);
  });

  it("scopes to one account when accountNumber given; throws on an unowned account", async () => {
    const r = await computePortfolioPnl({ accountNumber: "111" }, deps(base()));
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0].accountNumber).toBe("111");
    await expect(computePortfolioPnl({ accountNumber: "999" }, deps(base()))).rejects.toThrow(/not one of your trading accounts/);
  });
});

// Zayd Khan // cold // www.zayd.wtf
