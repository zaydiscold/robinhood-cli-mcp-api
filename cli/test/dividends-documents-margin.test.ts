import { describe, expect, it } from "vitest";
import {
  computeDividends,
  detectDividendCadence,
  documentFilename,
  documentYear,
  getMarginHealth,
  listDocuments
} from "../src/lib.js";

// Golden-fixture tests for the dividends / documents / margin engines (shared CLI + MCP per the
// alignment invariant). These pin the money math an agent must NOT hand-compute: cadence detection
// from payable-date gaps, held-vs-sold projection exclusion, tax-year derivation + filename
// construction for documents, and silent per-account degradation for margin. All deps injected —
// no network.

const NOW = Date.parse("2026-06-11T12:00:00Z");

// ── cadence detection ───────────────────────────────────────────────────────────────────────────

describe("detectDividendCadence — median payable-date gap", () => {
  it("classifies weekly (~5-9d gaps — QDTE-style income ETFs must not drop out of the projection)", () => {
    const r = detectDividendCadence(["2026-05-15", "2026-05-22", "2026-05-29", "2026-06-05"]);
    expect(r.cadence).toBe("weekly");
    expect(r.periodsPerYear).toBe(52);
  });

  it("classifies monthly (~25-35d gaps)", () => {
    const r = detectDividendCadence(["2026-01-15", "2026-02-13", "2026-03-16", "2026-04-15"]);
    expect(r.cadence).toBe("monthly");
    expect(r.periodsPerYear).toBe(12);
  });

  it("classifies quarterly (~80-100d gaps)", () => {
    const r = detectDividendCadence(["2025-03-15", "2025-06-14", "2025-09-15", "2025-12-15"]);
    expect(r.cadence).toBe("quarterly");
    expect(r.periodsPerYear).toBe(4);
  });

  it("classifies semiannual (~170-190d gaps)", () => {
    const r = detectDividendCadence(["2025-01-10", "2025-07-10", "2026-01-09"]);
    expect(r.cadence).toBe("semiannual");
    expect(r.periodsPerYear).toBe(2);
  });

  it("classifies annual (~350-380d gaps)", () => {
    const r = detectDividendCadence(["2024-03-01", "2025-03-01", "2026-03-01"]);
    expect(r.cadence).toBe("annual");
    expect(r.periodsPerYear).toBe(1);
  });

  it("classifies irregular when gaps fit no band, and when fewer than 2 dates exist", () => {
    expect(detectDividendCadence(["2025-01-01", "2025-02-20", "2025-08-01"]).cadence).toBe("irregular");
    expect(detectDividendCadence(["2025-01-01"]).cadence).toBe("irregular");
    expect(detectDividendCadence([]).periodsPerYear).toBe(0);
    expect(detectDividendCadence([null, undefined, "not-a-date"]).cadence).toBe("irregular");
  });

  it("uses the MEDIAN so one outlier gap (suspension/special) doesn't flip a quarterly payer", () => {
    // gaps ≈ 273, 91, 91 — median 91 → still quarterly
    const r = detectDividendCadence(["2024-12-16", "2025-09-15", "2025-12-15", "2026-03-16"]);
    expect(r.cadence).toBe("quarterly");
  });

  it("dedupes duplicate payable dates (two accounts paid the same day ≠ a 0-day gap)", () => {
    const r = detectDividendCadence(["2026-01-15", "2026-01-15", "2026-02-15", "2026-03-15"]);
    expect(r.cadence).toBe("monthly");
  });
});

// ── dividends engine ────────────────────────────────────────────────────────────────────────────

interface DivFix {
  accounts: any;
  dividends: Record<string, any[]>;
  positions: Record<string, any[]>;
  instruments: any[];
  throwDividendsFor?: string;
}

function divDeps(fix: DivFix) {
  const getJson = async (url: string, params: any = {}) => {
    if (url.includes("transfer/accounts")) return fix.accounts;
    if (url.includes("instruments/?ids")) {
      const ids = String(params.ids ?? "").split(",");
      return { results: fix.instruments.filter((i) => ids.includes(i.id)) };
    }
    throw new Error("unexpected getJson " + url);
  };
  const getAll = async (url: string, _params: any = {}, query: any = {}) => {
    if (url.includes("dividends/")) {
      if (fix.throwDividendsFor === query.account_number) throw new Error("503 dividends down");
      return fix.dividends[query.account_number] ?? [];
    }
    if (url.includes("positions/")) return fix.positions[query.account_number] ?? [];
    throw new Error("unexpected getAll " + url);
  };
  return { getJson, getAll, now: () => NOW };
}

// AAA: monthly payer, STILL HELD (acct 111). BBB: quarterly payer, SOLD (held nowhere).
// AAA also has a pending payout (upcoming) and a voided record (must count nowhere).
const divBase = (): DivFix => ({
  accounts: { results: [
    { type: "rhs", account_number: "111", account_name: "Main" },
    { type: "ira_roth", account_number: "222", account_name: "Roth" }
  ] },
  positions: { "111": [{ symbol: "AAA", quantity: "10" }], "222": [] },
  instruments: [{ id: "iidA", symbol: "AAA" }, { id: "iidB", symbol: "BBB" }],
  dividends: {
    "111": [
      { state: "paid", amount: "1.00", payable_date: "2026-03-16", instrument: "https://api.robinhood.com/instruments/iidA/" },
      { state: "reinvested", amount: "1.00", payable_date: "2026-04-15", instrument: "https://api.robinhood.com/instruments/iidA/" },
      { state: "paid", amount: "1.20", payable_date: "2026-05-15", instrument: "https://api.robinhood.com/instruments/iidA/" },
      { state: "pending", amount: "1.20", payable_date: "2026-06-20", ex_dividend_date: "2026-06-12", instrument: "https://api.robinhood.com/instruments/iidA/" },
      { state: "voided", amount: "99.00", payable_date: "2026-01-15", instrument: "https://api.robinhood.com/instruments/iidA/" }
    ],
    "222": [
      { state: "paid", amount: "5.00", payable_date: "2024-12-16", instrument: "https://api.robinhood.com/instruments/iidB/" },
      { state: "paid", amount: "5.00", payable_date: "2025-09-15", instrument: "https://api.robinhood.com/instruments/iidB/" },
      { state: "paid", amount: "5.00", payable_date: "2025-12-15", instrument: "https://api.robinhood.com/instruments/iidB/" },
      { state: "paid", amount: "5.00", payable_date: "2026-03-16", instrument: "https://api.robinhood.com/instruments/iidB/" }
    ]
  }
});

describe("computeDividends — totals, cadence, and the held-vs-sold projection rule", () => {
  it("totals count paid + reinvested (DRIP is income), never voided or pending", async () => {
    const r = await computeDividends({}, divDeps(divBase()));
    expect(r.totals.allTimeUsd).toBe(23.2);   // AAA 3.20 + BBB 20.00; voided 99 and pending 1.20 excluded
    expect(r.totals.ytdUsd).toBe(8.2);        // 2026: AAA 3.20 + BBB 5.00
    expect(r.totals.last12moUsd).toBe(18.2);  // cutoff 2025-06-11: drops BBB 2024-12-16
  });

  it("per-symbol cadence + annualized: AAA monthly ×12, BBB quarterly ×4 (most recent amount)", async () => {
    const r = await computeDividends({}, divDeps(divBase()));
    const aaa = r.bySymbol.find((s: any) => s.symbol === "AAA");
    const bbb = r.bySymbol.find((s: any) => s.symbol === "BBB");
    expect(aaa.cadence).toBe("monthly");
    expect(aaa.annualizedUsd).toBe(14.4);     // 1.20 (freshest, the pending one) × 12
    expect(aaa.currentlyHeld).toBe(true);
    expect(bbb.cadence).toBe("quarterly");
    expect(bbb.annualizedUsd).toBe(20);       // 5.00 × 4
    expect(bbb.currentlyHeld).toBe(false);
  });

  it("projection sums HELD symbols only — the sold quarterly payer is listed, not counted", async () => {
    const r = await computeDividends({}, divDeps(divBase()));
    expect(r.projection.annualUsd).toBe(14.4);     // AAA only; BBB's $20/yr must NOT inflate this
    expect(r.projection.monthlyUsd).toBe(1.2);
    expect(r.projection.quarterlyUsd).toBe(3.6);
    expect(r.projection.projectedSymbols).toEqual(["AAA"]);
    expect(r.projection.excludedSoldSymbols).toEqual(["BBB"]);
    expect(r.projection.method).toMatch(/CURRENTLY HELD/);
  });

  it("projection granularity: $/day = annual/365 and $/wk = annual/52, alongside mo/qtr/yr", async () => {
    const r = await computeDividends({}, divDeps(divBase()));
    expect(r.projection.dailyUsd).toBe(0.04);      // 14.4 / 365 = 0.0394… → 0.04
    expect(r.projection.weeklyUsd).toBe(0.28);     // 14.4 / 52  = 0.2769… → 0.28
    expect(r.projection.monthlyUsd).toBe(1.2);
    expect(r.projection.quarterlyUsd).toBe(3.6);
    expect(r.projection.annualUsd).toBe(14.4);
    expect(r.projection.method).toMatch(/dailyUsd = annualUsd\/365/);
  });

  it("upcoming surfaces the pending payout with its payable/ex dates", async () => {
    const r = await computeDividends({}, divDeps(divBase()));
    expect(r.upcoming).toHaveLength(1);
    expect(r.upcoming[0]).toMatchObject({ symbol: "AAA", amountUsd: 1.2, payableDate: "2026-06-20", state: "pending" });
  });

  it("scopes by symbol, and degrades (not crashes) when one account's dividends read fails", async () => {
    const only = await computeDividends({ symbol: "bbb" }, divDeps(divBase()));
    expect(only.bySymbol.map((s: any) => s.symbol)).toEqual(["BBB"]);
    expect(only.totals.allTimeUsd).toBe(20);

    const fix = divBase(); fix.throwDividendsFor = "222";
    const r = await computeDividends({}, divDeps(fix));
    expect(r.totals.allTimeUsd).toBe(3.2);    // AAA still computed
    expect(r.warnings.some((w: string) => /dividends read failed \(…222\)/.test(w))).toBe(true);
  });
});

// ── documents: tax-year derivation + filename construction + filters ───────────────────────────

describe("documentYear — tax forms map to their TAX year (issue year − 1)", () => {
  it("1099 variants and 5498 are tax-year shifted; statements/confirms are calendar-year", () => {
    expect(documentYear("1099", "2026-02-11")).toBe("2025");        // live-verified: Feb 2026 1099 = tax year 2025
    expect(documentYear("1099_crypto", "2022-02-10")).toBe("2021");
    expect(documentYear("1099r_roth", "2026-01-22")).toBe("2025");
    expect(documentYear("5498_roth", "2026-05-12")).toBe("2025");
    expect(documentYear("account_statement", "2025-03-31")).toBe("2025");
    expect(documentYear("trade_confirm", "2026-06-10")).toBe("2026");
  });
  it("returns 'unknown' on a garbled date", () => {
    expect(documentYear("1099", "")).toBe("unknown");
  });
});

describe("documentFilename — <year>-<type>-<acct last4>-<date>.<ext>", () => {
  it("builds the canonical name and keeps the real filetype (1099s ship as pdf AND csv)", () => {
    expect(documentFilename({ type: "1099", date: "2026-02-11", year: "2025", accountLast4: "9919", filetype: "pdf" }))
      .toBe("2025-1099-9919-2026-02-11.pdf");
    expect(documentFilename({ type: "1099", date: "2026-03-04", year: "2025", accountLast4: "9919", filetype: "csv" }))
      .toBe("2025-1099-9919-2026-03-04.csv");
  });
  it("defaults to pdf and sanitizes path-hostile characters", () => {
    expect(documentFilename({ type: "trade_confirm", date: "2026-06-10", year: "2026", accountLast4: "0497", filetype: null }))
      .toBe("2026-trade_confirm-0497-2026-06-10.pdf");
    expect(documentFilename({ type: "a/b", date: "2026-06-10", year: "2026", accountLast4: "0497", filetype: "p/df" }))
      .toBe("2026-a_b-0497-2026-06-10.pdf");
  });
});

describe("listDocuments — prefix type filter, tax-year filter, account filter", () => {
  const rows = [
    { id: "d1", type: "1099", date: "2026-02-11", filetype: "pdf", account: "https://api.robinhood.com/accounts/111111111/", download_url: "https://api.robinhood.com/documents/d1/download/" },
    { id: "d2", type: "1099_crypto", date: "2026-02-07", filetype: "csv", account: "https://api.robinhood.com/accounts/111111111/", download_url: "u2" },
    { id: "d3", type: "1099r_roth", date: "2026-01-22", filetype: "pdf", account: "https://api.robinhood.com/accounts/222222222/", download_url: "u3" },
    { id: "d4", type: "account_statement", date: "2025-03-31", filetype: "pdf", account: "https://api.robinhood.com/accounts/111111111/", download_url: "u4" },
    { id: "d5", type: "1099", date: "2025-02-01", filetype: "pdf", account: "https://api.robinhood.com/accounts/111111111/", download_url: "u5" }
  ];
  const deps = { getAll: async () => rows };

  it("type=1099 prefix-matches every 1099 variant — the tax-season one-shot", async () => {
    const r = await listDocuments({ type: "1099" }, deps);
    expect(r.documents.map((d) => d.id).sort()).toEqual(["d1", "d2", "d3", "d5"]);
  });

  it("type=1099 + year=2025 narrows to TAX YEAR 2025 (docs issued early 2026)", async () => {
    const r = await listDocuments({ type: "1099", year: "2025" }, deps);
    expect(r.documents.map((d) => d.id).sort()).toEqual(["d1", "d2", "d3"]);  // d5 is tax year 2024
    expect(r.byType).toEqual({ "1099": 1, "1099_crypto": 1, "1099r_roth": 1 });
  });

  it("account filter is exact; records expose accountLast4 + downloadUrl; newest first", async () => {
    const r = await listDocuments({ accountNumber: "222222222" }, deps);
    expect(r.count).toBe(1);
    expect(r.documents[0]).toMatchObject({ id: "d3", accountLast4: "2222", downloadUrl: "u3" });
    const all = await listDocuments({}, deps);
    expect(all.documents[0].id).toBe("d1");  // 2026-02-11 sorts first
  });
});

// ── margin health: money-object unwrapping + multi-account silent degradation ──────────────────

describe("getMarginHealth — multi-account scan with silent per-account degradation", () => {
  const accounts = { results: [
    { type: "rhs", account_number: "333333333", account_name: "far 9mo plus" },
    { type: "ira_roth", account_number: "222222222", account_name: "Roth IRA" },
    { type: "rhs", account_number: "111111111", account_name: "near 3mo-roll" }
  ] };
  const money = (amount: string) => ({ amount, currency_code: "USD" });
  const investingInfo: Record<string, any> = {
    "333333333": {
      amount_borrowed: money("1234.56"), margin_interest_rate: "5.0000", next_billing_date: "2026-06-12",
      margin_available: money("2000.00"), buying_power_with_margin: money("-500.00"),
      projected_intraday_buying_power: money("0.00"), margin_used_including_cash_held: money("1234.56"),
      interest_exemption_amount: money("1000.00")
    },
    "111111111": {
      amount_borrowed: money("0.00"), margin_interest_rate: "5.0000", next_billing_date: null,
      margin_available: money("0.00"), buying_power_with_margin: money("0.00"),
      projected_intraday_buying_power: money("0.00"), margin_used_including_cash_held: money("0.00"),
      interest_exemption_amount: money("1000.00")
    }
  };
  const deps = {
    getJson: async (url: string, params: any = {}) => {
      if (url.includes("transfer/accounts")) return accounts;
      if (url.includes("investing_info")) {
        const data = investingInfo[params.account_number];
        if (!data) throw new Error("404 Not Found");  // the Roth has no margin product
        return data;
      }
      throw new Error("unexpected getJson " + url);
    }
  };

  it("unwraps money objects, parses the percent string, and keeps next_billing_date nullable", async () => {
    const r = await getMarginHealth(undefined, deps);
    const borrowing = r.accounts.find((a) => a.accountNumber === "333333333")!;
    expect(borrowing.borrowedUsd).toBe(1234.56);
    expect(borrowing.marginInterestRatePct).toBe(5);
    expect(borrowing.nextBillingDate).toBe("2026-06-12");
    expect(borrowing.marginAvailableUsd).toBe(2000.00);
    expect(borrowing.buyingPowerWithMarginUsd).toBe(-500.00);
    expect(r.accounts.find((a) => a.accountNumber === "111111111")!.nextBillingDate).toBeNull();
  });

  it("a 404 account degrades SILENTLY into skipped — the other accounts still report", async () => {
    const r = await getMarginHealth(undefined, deps);
    expect(r.accounts).toHaveLength(2);
    expect(r.skipped).toEqual(["…2222"]);
    expect(r.scanned).toHaveLength(3);
    expect(r.warnings).toEqual([]);
  });

  it("scopes to one account, and throws on an unowned account number", async () => {
    const r = await getMarginHealth("333333333", deps);
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0].label).toBe("far 9mo plus");
    await expect(getMarginHealth("000000000", deps)).rejects.toThrow(/not one of your trading accounts/);
  });
});

// made with love by Zayd Khan / cold @ www.zayd.wtf
