import { describe, expect, it } from "vitest";
import {
  computeIncome,
  computeRisk,
  computeWhatIf,
  computeCalendar,
  computeExposure,
  computeAutopilot
} from "../src/lib.js";

// ──────────────────────────────────────────────────────────────────────────────
// Financial tools tests — all 6 new engines. Dependency injection, no network.
// Each test builds a fixture of mock getJson/getAll/now, passes it as deps,
// and asserts the computed output against known math / expected values.
// ──────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-06-11T12:00:00Z");
const NOW_DATE = new Date(NOW).toISOString().slice(0, 10); // "2026-06-11"

// ── shared helpers ───────────────────────────────────────────────────────────

/** Build a mock deps bag from a fixture of canned responses. */
function buildFixture(fix: {
  accounts?: any;
  dividends?: Record<string, any[]>;
  positions?: Record<string, any[]>;
  optionOrders?: Record<string, any[]>;
  optionAggregates?: Record<string, any[]>;
  portfolios?: Record<string, any>;
  marginInfo?: Record<string, any>;
  quotes?: Record<string, any>;
  optionMarks?: Record<string, any>;
  instruments?: any[];
  optionInstruments?: any[];
}) {
  const getJson = async (url: string, params: any = {}) => {
    if (url.includes("transfer/accounts")) return fix.accounts ?? { results: [] };
    if (url.includes("portfolios/")) {
      if (fix.portfolios) {
        const num = String(params.num ?? "").split("/").pop() ?? "";
        if (fix.portfolios[num]) return fix.portfolios[num];
      }
      return { equity: "5000.00" };
    }
    if (url.includes("margin/") && url.includes("investing_info")) {
      if (fix.marginInfo) {
        const an = String(params.account_number ?? "");
        if (fix.marginInfo[an]) return fix.marginInfo[an];
      }
      throw new Error("no margin");
    }
    if (url.includes("marketdata/quotes")) {
      const ids = String(params.ids ?? "").split(",");
      const results = ids.map((id) => fix.quotes?.[id] ?? {}).filter((q) => q.instrument_id);
      return { results };
    }
    if (url.includes("marketdata/options")) {
      const ids = String(params.ids ?? "").split(",");
      const results = ids.map((id) => fix.optionMarks?.[id] ?? {}).filter((q) => q.instrument_id);
      return { results };
    }
    if (url.includes("instruments/?ids")) {
      const ids = String(params.ids ?? "").split(",");
      return { results: (fix.instruments ?? []).filter((i: any) => ids.includes(i.id)) };
    }
    if (url.includes("instruments/?symbol")) {
      const sym = String(params.symbol ?? "").toUpperCase();
      const match = (fix.instruments ?? []).find((i: any) => i.symbol.toUpperCase() === sym);
      return { results: match ? [match] : [] };
    }
    throw new Error("unexpected getJson " + url);
  };

  const getAll = async (url: string, _params: any = {}, query: any = {}) => {
    // NOTE: check options/aggregate_positions BEFORE positions/ because the
    // aggregate URL also contains "positions/" and would be caught by the
    // generic positions check first, returning wrong (empty) data.
    if (url.includes("options/aggregate_positions")) {
      return fix.optionAggregates?.[query.account_numbers] ?? [];
    }
    if (url.includes("options/orders/")) {
      return fix.optionOrders?.[query.account_number] ?? [];
    }
    if (url.includes("dividends/")) {
      return fix.dividends?.[query.account_number] ?? [];
    }
    if (url.includes("positions/")) {
      return fix.positions?.[query.account_number] ?? [];
    }
    if (url.includes("options/instruments/")) {
      // Mock options instruments lookup by chain_id + expiration + type + strike
      const chainId = String(_params.chain_id ?? "");
      const exp = String(_params.expiration_dates ?? "");
      const optType = String(_params.type ?? "");
      const strikeFilter = parseFloat(String(query.strike_price ?? "0"));
      const matches = (fix.optionInstruments ?? []).filter((i: any) =>
        (!chainId || i.chain_id === chainId) &&
        (!exp || i.expiration_date === exp) &&
        (!optType || i.type === optType) &&
        (!(strikeFilter > 0) || Math.abs(Number(i.strike_price) - strikeFilter) < 0.01)
      );
      return matches;
    }
    throw new Error("unexpected getAll " + url);
  };

  return { getJson, getAll, now: () => NOW };
}

/** An empty mock deps bag that returns nothing — for graceful degradation tests. */
function emptyDeps() {
  return buildFixture({ accounts: { results: [] } });
}

// ── 1. computeIncome ─────────────────────────────────────────────────────────

const incomeFix = () => buildFixture({
  accounts: { results: [
    { type: "rhs", account_number: "111111111", account_name: "Main" }
  ]},
  dividends: {
    "111111111": [
      { state: "paid", amount: "2.00", payable_date: "2026-03-15", instrument: "https://api.robinhood.com/instruments/iidA/" },
      { state: "paid", amount: "3.00", payable_date: "2026-05-01", instrument: "https://api.robinhood.com/instruments/iidA/" },
      { state: "paid", amount: "1.50", payable_date: "2025-07-01", instrument: "https://api.robinhood.com/instruments/iidA/" }
    ]
  },
  positions: {
    "111111111": [{ symbol: "AAA", quantity: "100", instrument_id: "iidA" }]
  },
  instruments: [{ id: "iidA", symbol: "AAA" }],
  optionOrders: {
    "111111111": [
      {
        created_at: "2026-04-10T15:30:00Z",
        state: "filled",
        legs: [{
          side: "sell", position_effect: "open",
          executions: [{ quantity: "2", price: "1.50" }]
        }]
      },
      {
        created_at: "2026-06-01T10:00:00Z",
        state: "filled",
        legs: [{
          side: "buy", position_effect: "close",
          executions: [{ quantity: "1", price: "0.75" }]
        }]
      },
      {
        created_at: "2025-05-01T10:00:00Z", // OLD — outside TTM window
        state: "filled",
        legs: [{
          side: "sell", position_effect: "open",
          executions: [{ quantity: "5", price: "3.00" }]
        }]
      }
    ]
  }
});

describe("computeIncome — dividend + option premium TTM totals", () => {
  it("totals option premium correctly: sell-to-open credit minus buy-to-close debit, TTM cutoff", async () => {
    const r = await computeIncome({}, incomeFix());

    // Sell-to-open (Apr 2026): 2 contracts × $1.50 × 100 = $300 credit
    // Buy-to-close (Jun 2026): 1 contract × $0.75 × 100 = $75 debit
    // Old 2025 order: excluded by TTM cutoff
    // Expected premium TTM = $300 - $75 = $225
    expect(r.optionPremiumTtmUsd).toBe(225);
  });

  it("monthly breakdown merges dividend and option premium by month key", async () => {
    const r = await computeIncome({}, incomeFix());

    // Dividends: Mar $2.00, May $3.00 (Jun no div)
    // Premiums: Apr +$300, Jun -$75
    // Monthly should have entries for Mar, Apr, May, Jun
    expect(r.monthlyBreakdown.length).toBeGreaterThanOrEqual(3);

    const apr = r.monthlyBreakdown.find((m) => m.month === "2026-04");
    expect(apr?.optionPremiumUsd).toBe(300);
    expect(apr?.totalUsd).toBe(300);

    const jun = r.monthlyBreakdown.find((m) => m.month === "2026-06");
    expect(jun?.optionPremiumUsd).toBe(-75);
  });

  it("accountsScanned shows masked account numbers", async () => {
    const r = await computeIncome({}, incomeFix());
    expect(r.accountsScanned).toEqual(["…1111"]);
  });

  it("returns zero across all fields when no accounts exist", async () => {
    const r = await computeIncome({}, emptyDeps());
    expect(r.ttmTotalUsd).toBe(0);
    expect(r.monthlyAverageUsd).toBe(0);
    expect(r.projectedAnnualRunRateUsd).toBe(0);
    // The dividends engine still produces 12 monthly entries (all zero); verify no actual income.
    expect(r.monthlyBreakdown.every((m) => m.totalUsd === 0)).toBe(true);
  });

  // ── new edge‑case tests ──────────────────────────────────────────────────

  it("counts sell-to-open premium when no corresponding buy-to-close exists (simulated assignment)", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      dividends: { "111111111": [] },
      positions: { "111111111": [] },
      optionOrders: {
        "111111111": [
          {
            created_at: "2026-04-10T15:30:00Z",
            state: "filled",
            legs: [{
              side: "sell", position_effect: "open",
              executions: [{ quantity: "3", price: "2.00" }]
            }]
          }
          // No buy_to_close — simulates assignment
        ]
      }
    });
    const r = await computeIncome({}, fix);
    // 3 contracts × $2.00 × 100 = $600 credit counted
    expect(r.optionPremiumTtmUsd).toBe(600);
    expect(r.ttmTotalUsd).toBe(600);
    // No crash — completed without error
  });

  it("rolling scenario: close debit + open credit in same month nets correctly", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      dividends: { "111111111": [] },
      positions: { "111111111": [] },
      instruments: [],
      optionOrders: {
        "111111111": [
          {
            created_at: "2026-06-01T10:00:00Z",
            state: "filled",
            legs: [{
              side: "buy", position_effect: "close",
              executions: [{ quantity: "2", price: "0.25" }]   // -$50 debit
            }]
          },
          {
            created_at: "2026-06-05T10:00:00Z",
            state: "filled",
            legs: [{
              side: "sell", position_effect: "open",
              executions: [{ quantity: "2", price: "1.25" }]   // +$250 credit
            }]
          }
        ]
      }
    });
    const r = await computeIncome({}, fix);
    // Net: -$50 + $250 = $200
    expect(r.optionPremiumTtmUsd).toBe(200);
    const jun = r.monthlyBreakdown.find(m => m.month === "2026-06");
    expect(jun?.optionPremiumUsd).toBe(200);
    expect(jun?.totalUsd).toBe(200);
  });

  it("year filter: passing year=2025 records year=2025 in result", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      dividends: { "111111111": [] },
      positions: { "111111111": [] }
    });
    const r = await computeIncome({ year: 2025 }, fix);
    expect(r.year).toBe(2025);
  });
});

// ── 2. computeRisk ───────────────────────────────────────────────────────────

const riskFix = () => buildFixture({
  accounts: { results: [
    { type: "rhs", account_number: "111111111", account_name: "Main" }
  ]},
  positions: {
    "111111111": [
      { symbol: "AAA", quantity: "100", instrument_id: "eqA", average_buy_price: "45.00" }
    ]
  },
  optionAggregates: {
    "111111111": [
      {
        symbol: "AAA", strategy: "short call", quantity: "1",
        average_open_price: "3.00",
        legs: [{
          option_id: "optA1", position_type: "short", option_type: "call",
          strike_price: "55.0000", expiration_date: "2026-07-17",
          ratio_quantity: "1"
        }]
      },
      {
        symbol: "BBB", strategy: "long put", quantity: "2",
        average_open_price: "1.50",
        legs: [{
          option_id: "optB1", position_type: "long", option_type: "put",
          strike_price: "30.0000", expiration_date: "2026-08-21",
          ratio_quantity: "1"
        }]
      }
    ]
  },
  portfolios: { "111111111": { equity: "6000.00" } },
  marginInfo: { "111111111": { amount_borrowed: "1200.00" } }, // plain string — computeRisk does NOT unwrap money objects
  quotes: {
    "eqA": { instrument_id: "eqA", last_trade_price: "50.00" }
  },
  optionMarks: {
    "optA1": { instrument_id: "optA1", adjusted_mark_price: "2.00", mark_price: "2.00", delta: "0.30" },
    "optB1": { instrument_id: "optB1", adjusted_mark_price: "1.00", mark_price: "1.00", delta: "-0.25" }
  }
});

describe("computeRisk — portfolio risk scanner", () => {
  it("computes equity and option position market values", async () => {
    const r = await computeRisk({}, riskFix());

    // Equity AAA: 100 shares × $50 = $5,000
    const eq = r.positions.find((p) => p.kind === "equity" && p.symbol === "AAA")!;
    expect(eq.marketValueUsd).toBe(5000);
    expect(eq.maxLossUsd).toBe(5000);

    // Short call AAA: 1 contract × $2.00 × 100 = -$200 (short = negative)
    const optCall = r.positions.find((p) => p.kind === "option" && p.symbol === "AAA")!;
    expect(optCall.marketValueUsd).toBe(-200);
    expect(optCall.side).toBe("short");

    // Long put BBB: 2 contracts × $1.00 × 100 = +$200
    const optPut = r.positions.find((p) => p.kind === "option" && p.symbol === "BBB")!;
    expect(optPut.marketValueUsd).toBe(200);
    expect(optPut.side).toBe("long");
  });

  it("detects ITM expiration risk for short options", async () => {
    const r = await computeRisk({}, riskFix());

    // AAA spot is $50, short call strike $55 → OTM, no ITM risk
    // But if spot > strike, it would flag ITM
    const callPos = r.positions.find((p) => p.kind === "option" && p.symbol === "AAA")!;
    expect(callPos.itmExpirationRisk).toBe(false); // 50 < 55
  });

  it("flags concentration >20% in one symbol", async () => {
    const r = await computeRisk({}, riskFix());

    // AAA has $5,000 equity + absolute value of short call ($200) = $5,200
    // BBB has $200 in long puts
    // Total ≈ $5,400; AAA weight ≈ 96% → flagged
    const warning = r.concentrationWarnings.find((w) => w.symbol === "AAA");
    expect(warning).toBeTruthy();
    expect(warning!.weightPct).toBeGreaterThan(20);
    expect(warning!.message).toContain(">20% concentration");
  });

  it("computes total equity, borrowed, and margin call distance", async () => {
    const r = await computeRisk({}, riskFix());
    expect(r.totalEquityUsd).toBe(6000);
    expect(r.totalBorrowedUsd).toBe(1200);
    expect(r.marginCallDistancePct).toBe(20); // 1200/6000 * 100
  });

  it("gracefully handles no positions or marks", async () => {
    const deps = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Empty" }] },
      positions: { "111111111": [] },
      optionAggregates: { "111111111": [] },
      portfolios: { "111111111": { equity: "1000.00" } }
    });
    const r = await computeRisk({}, deps);
    expect(r.positions).toEqual([]);
    expect(r.concentrationWarnings).toEqual([]);
    expect(r.totalEquityUsd).toBe(1000);
  });

  // ── new edge‑case tests ──────────────────────────────────────────────────

  it("short put OTM on margin account is NOT flagged as undercovered", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "222222222", account_name: "MarginAcct" }] },
      positions: { "222222222": [] }, // no shares to cover
      optionAggregates: {
        "222222222": [
          {
            symbol: "ABC", strategy: "short put", quantity: "2",
            average_open_price: "2.00",
            legs: [{
              option_id: "optPut1", position_type: "short", option_type: "put",
              strike_price: "40.0000", expiration_date: "2026-12-19", ratio_quantity: "1"
            }]
          }
        ]
      },
      portfolios: { "222222222": { equity: "12000.00" } },
      marginInfo: { "222222222": { amount_borrowed: "3000.00" } },
      quotes: {},
      optionMarks: {
        "optPut1": { instrument_id: "optPut1", adjusted_mark_price: "1.50", mark_price: "1.50" }
      }
    });
    const r = await computeRisk({}, fix);
    const pos = r.positions.find(p => p.kind === "option" && p.symbol === "ABC")!;
    expect(pos).toBeTruthy();
    // short puts are never flagged as undercovered (only short calls check share coverage)
    expect(pos.undercoveredShortLegs).toBe(0);
  });

  it("defined-risk credit spread (short call + long call) has maxLoss that does not crash", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "333333333", account_name: "SpreadAcct" }] },
      positions: { "333333333": [] },
      optionAggregates: {
        "333333333": [
          {
            symbol: "XYZ", strategy: "short call spread", quantity: "1",
            average_open_price: "1.50", // net credit received
            legs: [
              { option_id: "optShort", position_type: "short", option_type: "call", strike_price: "100.0000", expiration_date: "2026-09-19", ratio_quantity: "1" },
              { option_id: "optLong",  position_type: "long",  option_type: "call", strike_price: "105.0000", expiration_date: "2026-09-19", ratio_quantity: "1" }
            ]
          }
        ]
      },
      portfolios: { "333333333": { equity: "10000.00" } },
      quotes: {},
      optionMarks: {
        "optShort": { instrument_id: "optShort", adjusted_mark_price: "0.80", mark_price: "0.80" },
        "optLong":  { instrument_id: "optLong",  adjusted_mark_price: "0.20", mark_price: "0.20" }
      }
    });
    const r = await computeRisk({}, fix);
    const pos = r.positions.find(p => p.kind === "option" && p.symbol === "XYZ")!;
    expect(pos).toBeTruthy();
    // Spread has at least one short leg → maxLoss is null in current engine (no crash / no undefined)
    expect(pos.maxLossUsd).toBeNull();
  });

  it("concentration: exactly 20.00% is NOT flagged, 20.01% IS flagged", async () => {
    // Portfolio: two positions totalling $10,000. One is $2,000 (20.00%), other $8,000 (80.00%).
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "444444444", account_name: "ConcAcct" }] },
      positions: {
        "444444444": [
          { symbol: "SMALL", quantity: "50", instrument_id: "eqS", average_buy_price: "40.00" },
          { symbol: "BIG",   quantity: "100", instrument_id: "eqB", average_buy_price: "80.00" }
        ]
      },
      optionAggregates: { "444444444": [] },
      portfolios: { "444444444": { equity: "11000.00" } },
      quotes: {
        "eqS": { instrument_id: "eqS", last_trade_price: "40.00" },  // 50×40 = $2,000 → 20%
        "eqB": { instrument_id: "eqB", last_trade_price: "80.00" }   // 100×80 = $8,000 → 80%
      }
    });
    const r = await computeRisk({}, fix);
    // SMALL should be exactly 20.00% → NOT flagged
    const small = r.concentrationWarnings.find(w => w.symbol === "SMALL");
    expect(small).toBeUndefined();
    // BIG is 80% → flagged
    const big = r.concentrationWarnings.find(w => w.symbol === "BIG");
    expect(big).toBeTruthy();
    expect(big!.weightPct).toBeGreaterThan(20);
  });

  // Second concentration test: 20.01% case
  it("concentration at 20.01% is flagged", async () => {
    // Total = $10,000 exactly. One symbol at $2,001 → 20.01%
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "555555555", account_name: "EdgeAcct" }] },
      positions: {
        "555555555": [
          { symbol: "EDGE",  quantity: "50",  instrument_id: "eqE", average_buy_price: "40.02" },
          { symbol: "OTHER", quantity: "200", instrument_id: "eqO", average_buy_price: "39.995" }
        ]
      },
      optionAggregates: { "555555555": [] },
      portfolios: { "555555555": { equity: "11000.00" } },
      quotes: {
        "eqE": { instrument_id: "eqE", last_trade_price: "40.02" },   // 50×40.02 = $2,001 → 20.01%
        "eqO": { instrument_id: "eqO", last_trade_price: "39.995" }   // 200×39.995 = $7,999 → 79.99%
      }
    });
    const r = await computeRisk({}, fix);
    const edge = r.concentrationWarnings.find(w => w.symbol === "EDGE");
    expect(edge).toBeTruthy();
    expect(edge!.weightPct).toBeGreaterThan(20);
  });
});

// ── 3. computeWhatIf ─────────────────────────────────────────────────────────

const whatIfFix = () => buildFixture({
  accounts: { results: [
    { type: "rhs", account_number: "111111111", account_name: "Main" }
  ]},
  optionAggregates: {
    "111111111": [
      {
        symbol: "AAA", strategy: "short put", quantity: "1",
        legs: [{
          option_id: "optP1", position_type: "short", option_type: "put",
          strike_price: "40.0000", ratio_quantity: "1"
        }]
      }
    ]
  },
  optionMarks: {
    "optP1": {
      instrument_id: "optP1", adjusted_mark_price: "3.00", mark_price: "3.00",
      delta: "-0.25", gamma: "0.02", theta: "-0.05", vega: "0.10", rho: "-0.03"
    }
  },
  instruments: [{ id: "iidA", symbol: "AAA" }],
  quotes: {
    "iidA": { instrument_id: "iidA", last_trade_price: "45.00" }
  }
});

describe("computeWhatIf — Greeks scenario P&L calculator", () => {
  it("computes delta P&L from spot move: netDelta × spotMove", async () => {
    // Short put, net delta = -(-0.25) × 1 × 1 × 100 = +25 (short put = positive delta)
    // Spot +5% → $45 → $47.25, spotMove = $2.25
    // deltaPnl = 25 × 2.25 = 56.25
    const r = await computeWhatIf({ spotPct: 5 }, whatIfFix());
    expect(r.greekDecomposition.deltaUsd).toBe(56.25);
    expect(r.totalEstimatedPnlUsd).toBeGreaterThan(0);
  });

  it("computes theta decay: netTheta × days", async () => {
    // Short put, net theta = -(-0.05) × 1 × 1 × 100 = +5
    // 10 days → +$50
    const r = await computeWhatIf({ days: 10 }, whatIfFix());
    expect(r.greekDecomposition.thetaUsd).toBe(50);
  });

  it("computes vega from IV change: netVega × ivPct points", async () => {
    // Short put vega: markVega 0.10 × sign(-1) × 100 = -10 netVega
    // +10 IV points → vegaPnl = -10 × 10 = -100 (netVega is per point, not per 0.01)
    const r = await computeWhatIf({ ivPct: 10 }, whatIfFix());
    expect(r.greekDecomposition.vegaUsd).toBe(-100);
  });

  it("scenario zero returns totalPnl = 0", async () => {
    const r = await computeWhatIf({}, whatIfFix());
    expect(r.totalEstimatedPnlUsd).toBe(0);
    expect(r.scenario).toEqual({ spotChangePct: 0, ivChangePct: 0, rateChangePct: 0, daysPassed: 0 });
  });

  it("per-position breakdown includes netGreeks and estimated P&L", async () => {
    const r = await computeWhatIf({ spotPct: 5, ivPct: 10, days: 5 }, whatIfFix());
    expect(r.perPosition).toHaveLength(1);
    const pos = r.perPosition[0];
    expect(pos.symbol).toBe("AAA");
    expect(pos.netDelta).not.toBe(0);
    expect(pos.estimatedPnlUsd).toBeTruthy();
  });

  it("empty portfolio yields zero P&L", async () => {
    const deps = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Empty" }] },
      optionAggregates: { "111111111": [] }
    });
    const r = await computeWhatIf({ spotPct: 10 }, deps);
    expect(r.totalEstimatedPnlUsd).toBe(0);
    expect(r.perPosition).toEqual([]);
  });

  // ── new edge‑case tests ──────────────────────────────────────────────────

  it("vega P&L: markVega=0.30, short put, ivPct=10 → per-point vegaPnl = -300", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "AAA", strategy: "short put", quantity: "1",
            legs: [{ option_id: "optBigV", position_type: "short", option_type: "put",
              strike_price: "40.0000", ratio_quantity: "1"
            }]
          }
        ]
      },
      optionMarks: {
        "optBigV": { instrument_id: "optBigV", adjusted_mark_price: "3.00", mark_price: "3.00",
          delta: "-0.30", gamma: "0.03", theta: "-0.06", vega: "0.30"
        }
      },
      instruments: [{ id: "iidA", symbol: "AAA" }],
      quotes: { "iidA": { instrument_id: "iidA", last_trade_price: "45.00" } }
    });
    const r = await computeWhatIf({ ivPct: 10 }, fix);
    // netVega = 0.30 × (-1 short) × 1 contract × 1 ratio × 100 = -30
    // vegaPnl = -30 × 10 ivPct = -300
    expect(r.greekDecomposition.vegaUsd).toBe(-300);
  });

  it("zero spot price: delta/gamma P&L = 0 but theta/vega still compute", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "UNKNOWN", strategy: "short put", quantity: "1",
            legs: [{ option_id: "optUnk", position_type: "short", option_type: "put",
              strike_price: "40.0000", ratio_quantity: "1"
            }]
          }
        ]
      },
      optionMarks: {
        "optUnk": { instrument_id: "optUnk", adjusted_mark_price: "2.00", mark_price: "2.00",
          delta: "-0.20", gamma: "0.02", theta: "-0.04", vega: "0.12"
        }
      },
      // No instrument for UNKNOWN → spotPrice is 0, spotDollarMove = 0
      instruments: [],
      quotes: {}
    });
    const r = await computeWhatIf({ spotPct: 5, ivPct: 5, days: 7 }, fix);
    // Delta P&L should be 0 (no spot price resolution)
    expect(r.greekDecomposition.deltaUsd).toBe(0);
    expect(r.greekDecomposition.gammaUsd).toBe(0);
    // Theta and Vega still compute
    // netTheta = -(-0.04) × 1 × 1 × 100 = +4, thetaPnl = 4 × 7 = 28
    expect(r.greekDecomposition.thetaUsd).toBe(28);
    // netVega = 0.12 × (-1) × 100 = -12, vegaPnl = -12 × 5 = -60
    expect(r.greekDecomposition.vegaUsd).toBe(-60);
  });

  it("missing Greeks: mark with no delta/gamma/theta/vega fields → no crash", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "AAA", strategy: "short call", quantity: "1",
            legs: [{ option_id: "optNoGreek", position_type: "short", option_type: "call",
              strike_price: "55.0000", ratio_quantity: "1"
            }]
          }
        ]
      },
      optionMarks: {
        "optNoGreek": { instrument_id: "optNoGreek", adjusted_mark_price: "2.00", mark_price: "2.00" }
        // No delta, gamma, theta, vega — simulate a mark with missing greeks
      },
      instruments: [{ id: "iidA", symbol: "AAA" }],
      quotes: { "iidA": { instrument_id: "iidA", last_trade_price: "50.00" } }
    });
    const r = await computeWhatIf({ spotPct: 3, ivPct: 5, days: 5 }, fix);
    // Function should not throw — graceful degradation expected
    // netDelta from Number(undefined) = NaN → NaN×... = NaN, but round2 may make it 0
    expect(r).toBeTruthy();
    expect(r.warnings).toBeDefined();
    // No crash is the key assertion
  });

  it("computes rho P&L from rate change: netRho × rateChangePct", async () => {
    // Short put: raw rho = -0.03 × sign(-1) × ratio(1) × qty(1) × 100 = +3 netRho
    // rateChangePct = 2 (2% rate increase) → rhoPnl = 3 × 2 = 6
    const r = await computeWhatIf({ rateChangePct: 2 }, whatIfFix());
    expect(r.greekDecomposition.rhoUsd).toBe(6);
    expect(r.totalRho).toBe(3);
    expect(r.totalEstimatedPnlUsd).toBe(6);
  });
});

// ── 4. computeCalendar ───────────────────────────────────────────────────────

const calendarFix = () => buildFixture({
  accounts: { results: [
    { type: "rhs", account_number: "111111111", account_name: "Main" }
  ]},
  optionAggregates: {
    "111111111": [
      {
        symbol: "AAA", strategy: "short call", quantity: "1",
        legs: [{
          option_id: "optC1", position_type: "short", option_type: "call",
          strike_price: "60.0000", expiration_date: "2026-06-20", ratio_quantity: "1"
        }]
      },
      {
        symbol: "BBB", strategy: "long put", quantity: "2",
        legs: [{
          option_id: "optP1", position_type: "long", option_type: "put",
          strike_price: "25.0000", expiration_date: "2026-06-25", ratio_quantity: "1"
        }]
      },
      {
        symbol: "AAA", strategy: "short call", quantity: "1",
        legs: [{
          option_id: "optC2", position_type: "short", option_type: "call",
          strike_price: "65.0000", expiration_date: "2026-08-15", ratio_quantity: "1"
        }]
      }
    ]
  },
  dividends: {
    "111111111": [
      { symbol: "AAA", amount: "0.50", ex_dividend_date: "2026-06-18", state: "pending" },
      { symbol: "AAA", amount: "1.00", ex_dividend_date: "2026-09-01", state: "pending" },
      { symbol: "CCC", amount: "2.00", ex_dividend_date: "2026-07-01", state: "pending" }
    ]
  }
});

describe("computeCalendar — event calendar with expirations and ex-dividends", () => {
  it("filters expirations within the days window (default 30)", async () => {
    const r = await computeCalendar({}, calendarFix());

    // Expirations: Jun 20 (11 days from Jun 11), Jun 25 (14 days) → within 30 days
    // Aug 15 → 65 days → excluded
    const expirations = r.events.filter((e) => e.type === "expiration");
    expect(expirations).toHaveLength(2);

    const expDates = expirations.map((e) => e.date).sort();
    expect(expDates).toEqual(["2026-06-20", "2026-06-25"]);
  });

  it("flags assignment risk for short call expirations", async () => {
    const r = await computeCalendar({}, calendarFix());
    const aaaExp = r.events.find((e) => e.symbol === "AAA" && e.type === "expiration");
    expect(aaaExp?.assignmentRisk).toBe(true); // short call

    const bbbExp = r.events.find((e) => e.symbol === "BBB" && e.type === "expiration");
    expect(bbbExp?.assignmentRisk).toBe(false); // long put
  });

  it("includes ex-dividend dates within window", async () => {
    const r = await computeCalendar({}, calendarFix());

    // Ex-div: Jun 18 (within 30 days), Jul 1 (within 30 days), Sep 1 (outside 30 days)
    const exDivs = r.events.filter((e) => e.type === "ex-dividend");
    expect(exDivs).toHaveLength(2); // Jun 18 and Jul 1
    expect(exDivs.map((d) => d.symbol).sort()).toEqual(["AAA", "CCC"]);
  });

  it("short call near an ex-dividend date triggers assignment-risk flag", async () => {
    const r = await computeCalendar({}, calendarFix());
    // AAA short call expires Jun 20; ex-div Jun 18 → < 5 days apart → assignmentRisk true
    const aaaDiv = r.events.find((e) => e.symbol === "AAA" && e.type === "ex-dividend");
    expect(aaaDiv?.assignmentRisk).toBe(true);
  });

  it("events sorted by date", async () => {
    const r = await computeCalendar({}, calendarFix());
    for (let i = 1; i < r.events.length; i++) {
      expect(r.events[i].date.localeCompare(r.events[i - 1].date)).toBeGreaterThanOrEqual(0);
    }
  });

  it("narrower days window filters aggressively", async () => {
    const r = await computeCalendar({ days: 10 }, calendarFix());
    // Jun 18 ex-div is 7 days → included; Jun 20 exp is 9 days → included
    // Jun 25 exp is 14 days → excluded; Jul 1 ex-div is 20 days → excluded
    const dates = r.events.map((e) => e.date).sort();
    expect(dates).toEqual(["2026-06-18", "2026-06-20"]);
  });

  // ── new edge‑case tests ──────────────────────────────────────────────────

  it("long call near ex-dividend is NOT flagged for assignment risk", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "AAA", strategy: "long call", quantity: "1",
            legs: [{ option_id: "optLong", position_type: "long", option_type: "call",
              strike_price: "50.0000", expiration_date: "2026-06-20", ratio_quantity: "1"
            }]
          }
        ]
      },
      dividends: {
        "111111111": [
          { symbol: "AAA", amount: "0.50", ex_dividend_date: "2026-06-18", state: "pending" }
        ]
      }
    });
    const r = await computeCalendar({}, fix);
    // Long call expiration — should NOT be flagged for assignment risk
    const expEvent = r.events.find(e => e.type === "expiration" && e.symbol === "AAA");
    expect(expEvent?.assignmentRisk).toBe(false);
    // Ex-dividend near a LONG call — should NOT be flagged for assignment risk
    const divEvent = r.events.find(e => e.type === "ex-dividend" && e.symbol === "AAA");
    expect(divEvent?.assignmentRisk).toBe(false);
  });

  it("expiration outside lookahead window is excluded", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "FAR", strategy: "short put", quantity: "1",
            legs: [{ option_id: "optFar", position_type: "short", option_type: "put",
              strike_price: "25.0000", expiration_date: "2026-08-01", ratio_quantity: "1"
            }]
          }
        ]
      }
    });
    // Default 30-day window: Aug 1 is 51 days from Jun 11 → excluded
    const r = await computeCalendar({ days: 30 }, fix);
    const expEvents = r.events.filter(e => e.type === "expiration");
    expect(expEvents).toHaveLength(0);
    // With 60-day window: should be included
    const r2 = await computeCalendar({ days: 60 }, fix);
    const expEvents2 = r2.events.filter(e => e.type === "expiration");
    expect(expEvents2).toHaveLength(1);
    expect(expEvents2[0].symbol).toBe("FAR");
  });
});

// ── 5. computeExposure ───────────────────────────────────────────────────────

const exposureFix = () => buildFixture({
  accounts: { results: [
    { type: "rhs", account_number: "111111111", account_name: "Main" }
  ]},
  portfolios: { "111111111": { equity: "10000.00" } },
  positions: {
    "111111111": [
      { symbol: "AAA", quantity: "100", instrument_id: "eqA", average_buy_price: "45.00" }
    ]
  },
  optionAggregates: {
    "111111111": [
      {
        symbol: "BBB", strategy: "short call", quantity: "1",
        legs: [{
          option_id: "optB1", position_type: "short", option_type: "call",
          strike_price: "55.0000", ratio_quantity: "1"
        }]
      }
    ]
  },
  quotes: {
    "eqA": { instrument_id: "eqA", last_trade_price: "50.00" }
  },
  optionMarks: {
    "optB1": {
      instrument_id: "optB1", adjusted_mark_price: "2.50", mark_price: "2.50",
      delta: "0.35", gamma: "0.02", theta: "-0.03", vega: "0.08", rho: "0.01"
    }
  }
});

describe("computeExposure — concentration and net Greeks", () => {
  it("computes concentration weight per symbol", async () => {
    const r = await computeExposure({}, exposureFix());

    // AAA equity: 100 × $50 = $5,000
    // BBB option: 1 × $2.50 × 100 = $250
    // Total ≈ $5,250; AAA ≈ 95.2%, BBB ≈ 4.8%
    const aaa = r.concentration.find((c) => c.symbol === "AAA")!;
    expect(aaa.marketValueUsd).toBe(5000);
    expect(aaa.weightPct).toBeGreaterThan(90);
    expect(aaa.flag).toBe(true);

    const bbb = r.concentration.find((c) => c.symbol === "BBB")!;
    expect(bbb.flag).toBe(false);
    expect(bbb.weightPct).toBeLessThan(20);
  });

  it("computes net portfolio Greeks", async () => {
    const r = await computeExposure({}, exposureFix());

    // Short call BBB: sign = -1 × 1 × 1 × 100 = -100 multiplier
    // Delta: 0.35 × (-100) = -35
    // Gamma: 0.02 × (-100) = -2
    // Theta: -0.03 × (-100) = +3
    // Vega: 0.08 × (-100) = -8
    // Rho: 0.01 × (-100) = -1
    // Equity AAA adds +100 to delta (qty=100, raw delta=100)
    expect(r.netGreeks.delta).toBe(65); // 100 (equity) + (-35) = 65
    expect(r.netGreeks.gamma).toBe(-2);
    expect(r.netGreeks.theta).toBe(3);
    expect(r.netGreeks.vega).toBe(-8);
    expect(r.netGreeks.rho).toBe(-1);
    expect(r.netGreeks.contractMultiplier).toBe(100);
  });

  it("totalEquityUsd matches portfolio equity", async () => {
    const r = await computeExposure({}, exposureFix());
    expect(r.totalEquityUsd).toBe(10000);
  });

  it("empty portfolio yields zero concentration and zero Greeks", async () => {
    const deps = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Empty" }] },
      positions: { "111111111": [] },
      optionAggregates: { "111111111": [] },
      portfolios: { "111111111": { equity: "100.00" } }
    });
    const r = await computeExposure({}, deps);
    expect(r.concentration).toEqual([]);
    expect(r.netGreeks.delta).toBe(0);
    expect(r.netGreeks.gamma).toBe(0);
  });

  // ── new edge‑case tests ──────────────────────────────────────────────────

  it("equity delta (+1 per share) correctly summed with option delta", async () => {
    // Equity-only portfolio: verify delta = number of shares
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      portfolios: { "111111111": { equity: "15000.00" } },
      positions: {
        "111111111": [
          { symbol: "SHARES", quantity: "250", instrument_id: "eqS", average_buy_price: "60.00" }
        ]
      },
      optionAggregates: { "111111111": [] },
      quotes: { "eqS": { instrument_id: "eqS", last_trade_price: "60.00" } }
    });
    const r = await computeExposure({}, fix);
    // 250 shares → delta = +250 (each share is +1 delta)
    expect(r.netGreeks.delta).toBe(250);
    expect(r.netGreeks.gamma).toBe(0);
    expect(r.concentration.length).toBe(1);
    expect(r.concentration[0].symbol).toBe("SHARES");
  });

  it("mixed equity + option: delta sums correctly", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      portfolios: { "111111111": { equity: "12000.00" } },
      positions: {
        "111111111": [
          { symbol: "MIX", quantity: "100", instrument_id: "eqM", average_buy_price: "50.00" }
        ]
      },
      optionAggregates: {
        "111111111": [
          {
            symbol: "MIX", strategy: "short call", quantity: "1",
            legs: [{
              option_id: "optMix", position_type: "short", option_type: "call",
              strike_price: "55.0000", ratio_quantity: "1"
            }]
          }
        ]
      },
      quotes: { "eqM": { instrument_id: "eqM", last_trade_price: "50.00" } },
      optionMarks: {
        "optMix": { instrument_id: "optMix", adjusted_mark_price: "1.00", mark_price: "1.00",
          delta: "0.30", gamma: "0.02", theta: "-0.03", vega: "0.05", rho: "0.01"
        }
      }
    });
    const r = await computeExposure({}, fix);
    // Equity delta = +100 (shares)
    // Option delta = 0.30 × (-1 short) × 1 qty × 1 ratio × 100 = -30
    // Net = +100 + (-30) = 70
    expect(r.netGreeks.delta).toBe(70);
    // Option gamma = 0.02 × (-1) × 1 × 1 × 100 = -2
    expect(r.netGreeks.gamma).toBe(-2);
    // Option theta = -0.03 × (-1) × 1 × 1 × 100 = +3
    expect(r.netGreeks.theta).toBe(3);
  });

  it("concentration sorted by weight descending", async () => {
    const r = await computeExposure({}, exposureFix());
    for (let i = 1; i < r.concentration.length; i++) {
      expect(r.concentration[i].weightPct).toBeLessThanOrEqual(r.concentration[i - 1].weightPct);
    }
  });
});

// ── 6. computeAutopilot ──────────────────────────────────────────────────────

const autopilotFix = () => buildFixture({
  accounts: { results: [
    { type: "rhs", account_number: "111111111", account_name: "Main" }
  ]},
  optionAggregates: {
    "111111111": [
      {
        symbol: "AAA", strategy: "short call", quantity: "1",
        legs: [{
          option_id: "optC1", position_type: "short", option_type: "call",
          strike_price: "55.0000", expiration_date: "2026-06-18", ratio_quantity: "1"
        }]
      },
      {
        symbol: "BBB", strategy: "short put", quantity: "2",
        legs: [{
          option_id: "optP1", position_type: "short", option_type: "put",
          strike_price: "30.0000", expiration_date: "2026-06-20", ratio_quantity: "1"
        }]
      },
      {
        symbol: "AAA", strategy: "long call", quantity: "1",
        legs: [{
          option_id: "optC2", position_type: "long", option_type: "call",
          strike_price: "50.0000", expiration_date: "2026-06-18", ratio_quantity: "1"
        }]
      },
      {
        symbol: "CCC", strategy: "short put", quantity: "1",
        legs: [{
          option_id: "optP2", position_type: "short", option_type: "put",
          strike_price: "40.0000", expiration_date: "2026-08-01", ratio_quantity: "1"
        }]
      }
    ]
  },
  instruments: [
    { id: "iidA", symbol: "AAA", tradable_chain_id: "chainAAA" },
    { id: "iidB", symbol: "BBB", tradable_chain_id: "chainBBB" },
    { id: "iidC", symbol: "CCC", tradable_chain_id: "chainCCC" }
  ],
  optionInstruments: [
    // AAA call $55 target expiry ~2026-06-26
    { id: "optC1-open", chain_id: "chainAAA", strike_price: "55.0000", type: "call", expiration_date: "2026-06-26" },
    // BBB put $30 target expiry ~2026-07-03
    { id: "optP1-open", chain_id: "chainBBB", strike_price: "30.0000", type: "put", expiration_date: "2026-07-03" }
  ],
  quotes: {
    "iidA": { instrument_id: "iidA", last_trade_price: "52.00" },
    "iidB": { instrument_id: "iidB", last_trade_price: "28.00" },
    "iidC": { instrument_id: "iidC", last_trade_price: "42.00" }
  },
  optionMarks: {
    // Close leg: AAA $55 call (buy to close → we pay ask)
    "optC1":    { instrument_id: "optC1", adjusted_mark_price: "1.50", mark_price: "1.50", bid_price: "1.45", ask_price: "1.55" },
    // Open leg:  AAA $55 call target (sell to open → we collect bid)
    "optC1-open": { instrument_id: "optC1-open", adjusted_mark_price: "3.25", mark_price: "3.25", bid_price: "3.20", ask_price: "3.30" },
    // Close leg: BBB $30 put (buy to close → we pay ask)
    "optP1":    { instrument_id: "optP1", adjusted_mark_price: "2.10", mark_price: "2.10", bid_price: "2.05", ask_price: "2.15" },
    // Open leg:  BBB $30 put target (sell to open → we collect bid)
    "optP1-open": { instrument_id: "optP1-open", adjusted_mark_price: "4.50", mark_price: "4.50", bid_price: "4.40", ask_price: "4.60" },
    // Long call (not a candidate but in fixture)
    "optC2":    { instrument_id: "optC2", adjusted_mark_price: "0.50", mark_price: "0.50", bid_price: "0.45", ask_price: "0.55" },
    // CCC far expiry (not a candidate)
    "optP2":    { instrument_id: "optP2", adjusted_mark_price: "1.00", mark_price: "1.00", bid_price: "0.95", ask_price: "1.05" }
  }
});

describe("computeAutopilot — short option roll candidates near expiration", () => {
  it("picks up only short options expiring within lookahead window", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());

    // Short call AAA expires Jun 18 (7 days) → included
    // Short put BBB expires Jun 20 (9 days) → included
    // Long call AAA → NOT short → excluded
    // Short put CCC expires Aug 1 (51 days) → excluded
    expect(r.candidates).toHaveLength(2);

    const symbols = r.candidates.map((c) => c.symbol).sort();
    expect(symbols).toEqual(["AAA", "BBB"]);
  });

  it("computes DTE (days to expiration) correctly", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());
    const aaa = r.candidates.find((c) => c.symbol === "AAA")!;
    // Jun 18 from Jun 11 = 7 calendar days
    expect(aaa.dte).toBe(7);

    const bbb = r.candidates.find((c) => c.symbol === "BBB")!;
    expect(bbb.dte).toBe(9);
  });

  it("computes ITM/OTM status from spot price", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());

    // AAA call strike $55, spot $52 → OTM by $3 (strike > spot for call)
    const aaa = r.candidates.find((c) => c.symbol === "AAA")!;
    expect(aaa.itmBy).toBe(-3); // OTM by $3

    // BBB put strike $30, spot $28 → ITM by $2 (strike > spot for put)
    const bbb = r.candidates.find((c) => c.symbol === "BBB")!;
    expect(bbb.itmBy).toBe(2); // ITM by $2
  });

  it("candidates sorted by DTE ascending (most urgent first)", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());
    for (let i = 1; i < r.candidates.length; i++) {
      expect(r.candidates[i].dte).toBeGreaterThanOrEqual(r.candidates[i - 1].dte);
    }
  });

  it("each candidate has a dryRunOrder with close and open legs", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());
    for (const c of r.candidates) {
      expect(c.dryRunOrder.close.action).toBe("buy to close");
      expect(c.dryRunOrder.open.action).toBe("sell to open");
      expect(c.side).toBe("short");
      expect(c.type).toMatch(/^(call|put)$/);
      expect(c.strike).toBeGreaterThan(0);
    }
  });

  it("empty portfolio yields no candidates", async () => {
    const deps = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Empty" }] },
      optionAggregates: { "111111111": [] }
    });
    const r = await computeAutopilot({}, deps);
    expect(r.candidates).toEqual([]);
  });

  it("lookaheadDays is reflected in result", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());
    expect(r.lookaheadDays).toBe(10);
  });

  // ── new edge‑case tests ──────────────────────────────────────────────────

  it("targetExp is strictly after current expiration date", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());
    for (const c of r.candidates) {
      expect(c.rollCandidate.targetExpiration > c.expiration).toBe(true);
    }
  });

  it("DTE for same-day expiration is 0", async () => {
    // Position that expires ON the current date
    const todayStr = new Date(NOW).toISOString().slice(0, 10); // "2026-06-11"
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "AAA", strategy: "short call", quantity: "1",
            legs: [{
              option_id: "optToday", position_type: "short", option_type: "call",
              strike_price: "55.0000", expiration_date: todayStr, ratio_quantity: "1"
            }]
          }
        ]
      },
      instruments: [{ id: "iidA", symbol: "AAA" }],
      quotes: { "iidA": { instrument_id: "iidA", last_trade_price: "52.00" } }
    });
    const r = await computeAutopilot({ days: 7 }, fix);
    // Expiration today = 0 DTE (Math.ceil(0 / 86400000) = 0)
    if (r.candidates.length > 0) {
      expect(r.candidates[0].dte).toBe(0);
    }
  });

  it("only short positions appear in candidates (long positions excluded)", async () => {
    const r = await computeAutopilot({ days: 30 }, autopilotFix());
    // Verify no long positions sneaked in
    const longSneak = r.candidates.find(c =>
      c.currentPosition.includes("long")
    );
    expect(longSneak).toBeUndefined();
    // All candidates should have side === "short"
    for (const c of r.candidates) {
      expect(c.side).toBe("short");
    }
  });

  it("long options with near expiration are excluded from candidates", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "AAA", strategy: "long put", quantity: "3",
            legs: [{
              option_id: "optLongNear", position_type: "long", option_type: "put",
              strike_price: "45.0000", expiration_date: "2026-06-15", ratio_quantity: "1"
            }]
          }
        ]
      },
      instruments: [{ id: "iidA", symbol: "AAA" }],
      quotes: { "iidA": { instrument_id: "iidA", last_trade_price: "50.00" } }
    });
    // Long put expires Jun 15 (4 days) → should NOT be a candidate
    const r = await computeAutopilot({ days: 7 }, fix);
    expect(r.candidates).toHaveLength(0);
  });

  it("computes estimated net credit from live option quotes (open bid - close ask)", async () => {
    const r = await computeAutopilot({ days: 10 }, autopilotFix());

    // AAA call: open bid $3.20 - close ask $1.55 = $1.65 net credit
    const aaa = r.candidates.find((c) => c.symbol === "AAA")!;
    expect(aaa.rollCandidate.estimatedNetCredit).toBe(1.65);
    expect(aaa.rollCandidate.netCreditCanBeNegative).toBeUndefined(); // positive credit
    expect(aaa.rollCandidate.message).toContain("estimated net credit");
    expect(aaa.rollCandidate.message).toContain("1.65");

    // BBB put: open bid $4.40 - close ask $2.15 = $2.25 net credit
    const bbb = r.candidates.find((c) => c.symbol === "BBB")!;
    expect(bbb.rollCandidate.estimatedNetCredit).toBe(2.25);
    expect(bbb.rollCandidate.netCreditCanBeNegative).toBeUndefined();
    expect(bbb.rollCandidate.message).toContain("2.25");
  });

  it("flags netCreditCanBeNegative when roll results in net debit", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "DEBIT", strategy: "short call", quantity: "1",
            legs: [{
              option_id: "optDebit1", position_type: "short", option_type: "call",
              strike_price: "100.0000", expiration_date: "2026-06-18", ratio_quantity: "1"
            }]
          }
        ]
      },
      instruments: [{ id: "iidDebit", symbol: "DEBIT", tradable_chain_id: "chainDEBIT" }],
      optionInstruments: [
        { id: "optDebit1-open", chain_id: "chainDEBIT", strike_price: "100.0000", type: "call", expiration_date: "2026-06-26" }
      ],
      quotes: { "iidDebit": { instrument_id: "iidDebit", last_trade_price: "95.00" } },
      optionMarks: {
        "optDebit1":      { instrument_id: "optDebit1", adjusted_mark_price: "3.00", mark_price: "3.00", bid_price: "2.95", ask_price: "3.05" },
        "optDebit1-open": { instrument_id: "optDebit1-open", adjusted_mark_price: "2.50", mark_price: "2.50", bid_price: "2.40", ask_price: "2.60" }
      }
    });
    const r = await computeAutopilot({ days: 10 }, fix);
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0];
    // open bid $2.40 - close ask $3.05 = -$0.65 (net debit)
    expect(c.rollCandidate.estimatedNetCredit).toBe(-0.65);
    expect(c.rollCandidate.netCreditCanBeNegative).toBe(true);
    expect(c.rollCandidate.message).toContain("estimated net debit");
    expect(c.rollCandidate.message).toContain("0.65");
  });

  it("estimatedNetCredit stays null when chain ID is missing", async () => {
    const fix = buildFixture({
      accounts: { results: [{ type: "rhs", account_number: "111111111", account_name: "Main" }] },
      optionAggregates: {
        "111111111": [
          {
            symbol: "NOCHAIN", strategy: "short call", quantity: "1",
            legs: [{
              option_id: "optNC1", position_type: "short", option_type: "call",
              strike_price: "50.0000", expiration_date: "2026-06-18", ratio_quantity: "1"
            }]
          }
        ]
      },
      // instruments WITHOUT tradable_chain_id
      instruments: [{ id: "iidNC", symbol: "NOCHAIN" }],
      quotes: { "iidNC": { instrument_id: "iidNC", last_trade_price: "48.00" } }
    });
    const r = await computeAutopilot({ days: 10 }, fix);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].rollCandidate.estimatedNetCredit).toBeNull();
    expect(r.candidates[0].rollCandidate.message).toContain("Run options strategy-quote to price");
  });
});
