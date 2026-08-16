import { describe, expect, it } from "vitest";
import {
  computeOptionExposureAnalytics,
  optionPositionSide,
  calendarDaysUntil,
  computeOptionsHistory,
  computeChainStats,
  computeOptionsSnapshot,
} from "../src/lib.js";

describe("computeOptionExposureAnalytics", () => {
  it("computes calendar days to expiration from a deterministic as-of", () => {
    expect(calendarDaysUntil("2026-08-20", "2026-08-15T20:00:00-07:00")).toBe(5);
    expect(calendarDaysUntil("2026-08-14", "2026-08-15T20:00:00-07:00")).toBe(-1);
    expect(Number.isNaN(calendarDaysUntil("2026-02-31", "2026-02-15T20:00:00-08:00"))).toBe(true);
    expect(Number.isNaN(calendarDaysUntil("", "2026-08-15T20:00:00-07:00"))).toBe(true);
  });

  it("separates intrinsic and extrinsic value and reports delta-dollar capital elasticity", () => {
    const result = computeOptionExposureAnalytics({
      type: "call",
      strike: 55,
      spot: 100,
      optionPrice: 50,
      entryPremiumPerShare: 52,
      delta: 0.8,
      gamma: 0.01,
      theta: -0.1,
      impliedVolatility: 0.4,
      daysToExpiration: 365,
      contracts: 2,
    });

    expect(result.intrinsicValuePerShare).toBe(45);
    expect(result.extrinsicValuePerShare).toBe(5);
    expect(result.intrinsicPctOfPremium).toBe(90);
    expect(result.extrinsicPctOfPremium).toBe(10);
    expect(result.positionValueUsd).toBe(10_000);
    expect(result.deltaShares).toBe(160);
    expect(result.deltaDollars).toBe(16_000);
    expect(result.elasticity).toBe(1.6);
    expect(result.absoluteElasticity).toBe(1.6);
    expect(result.premiumPerDeltaDollar).toBe(0.625);
    expect(result.extrinsicPerDeltaDollar).toBe(0.0625);
    expect(result.markBreakEvenAtExpiration).toBe(105);
    expect(result.costBasisBreakEvenAtExpiration).toBe(107);
    expect(result.underlyingMovePctToMarkBreakEven).toBe(5);
    expect(result.expectedMovePctToExpiration).toBe(40);
    expect(result.breakEvenToExpectedMoveRatio).toBe(0.125);
    expect(result.thetaUsdPerDay).toBe(-20);
    expect(result.thetaPctOfPremiumPerDay).toBe(-0.2);
    expect(result.gammaPnlForOnePctMoveUsd).toBe(1);
    expect(result.gammaToThetaOnePctMoveRatio).toBe(0.05);
    expect(result.diagnostics).toEqual({
      favorable: ["intrinsic_backing_present", "high_delta_response", "low_theta_burn"],
      unfavorable: [],
      notEvaluated: [
        "bid_ask_spread_unavailable",
        "vega_unavailable",
        "open_interest_unavailable",
        "volume_unavailable",
      ],
    });
    expect(result.warnings).toEqual([]);
  });

  it("surfaces why high elasticity can still be a fragile option", () => {
    const result = computeOptionExposureAnalytics({
      type: "call",
      strike: 120,
      spot: 100,
      optionPrice: 2,
      entryPremiumPerShare: 3,
      delta: 0.25,
      gamma: 0.03,
      theta: -0.08,
      vega: 0.12,
      impliedVolatility: 0.9,
      bid: 1.7,
      ask: 2.3,
      openInterest: 20,
      volume: 3,
      daysToExpiration: 5,
    });

    expect(result.elasticity).toBe(12.5);
    expect(result.extrinsicPctOfPremium).toBe(100);
    expect(result.extrinsicPerDeltaDollar).toBe(0.08);
    expect(result.expectedMovePctToExpiration).toBe(10.533703);
    expect(result.breakEvenToExpectedMoveRatio).toBe(2.088534);
    expect(result.gammaPnlForOnePctMoveUsd).toBe(1.5);
    expect(result.gammaToThetaOnePctMoveRatio).toBe(0.1875);
    expect(result.spreadPctOfMark).toBe(30);
    expect(result.daysToExpiration).toBe(5);
    expect(result.diagnostics.favorable).toEqual(["high_local_elasticity"]);
    expect(result.diagnostics.unfavorable).toEqual([
      "no_intrinsic_backing",
      "low_delta_response",
      "high_theta_burn",
      "large_expiration_break_even_move",
      "near_expiration",
      "wide_bid_ask_spread",
      "low_open_interest",
      "low_volume",
      "high_elasticity_fragile_extrinsic_premium",
    ]);
    expect(result.diagnostics.notEvaluated).toEqual([]);
  });

  it("keeps put direction signed while exposing absolute leverage", () => {
    const result = computeOptionExposureAnalytics({
      type: "put",
      strike: 110,
      spot: 100,
      optionPrice: 15,
      delta: -0.6,
    });

    expect(result.intrinsicValuePerShare).toBe(10);
    expect(result.extrinsicValuePerShare).toBe(5);
    expect(result.deltaDollars).toBe(-6_000);
    expect(result.elasticity).toBe(-4);
    expect(result.absoluteElasticity).toBe(4);
    expect(result.markBreakEvenAtExpiration).toBe(95);
    expect(result.underlyingMovePctToMarkBreakEven).toBe(-5);
  });

  it("returns explicit not-evaluated warnings instead of fake leverage on stale inputs", () => {
    const result = computeOptionExposureAnalytics({
      type: "call",
      strike: 100,
      spot: 0,
      optionPrice: 0,
      delta: Number.NaN,
    });

    expect(Number.isNaN(result.deltaDollars)).toBe(true);
    expect(Number.isNaN(result.elasticity)).toBe(true);
    expect(result.warnings).toContain("spot_unavailable");
    expect(result.warnings).toContain("option_price_unavailable");
    expect(result.warnings).toContain("delta_unavailable");
  });

  it("keeps null market-data fields unavailable instead of classifying them as zero", () => {
    const result = computeOptionExposureAnalytics({
      type: "call",
      strike: 100,
      spot: 100,
      optionPrice: 2,
      delta: 0.5,
      gamma: null as unknown as number,
      theta: null as unknown as number,
      vega: null as unknown as number,
      impliedVolatility: null as unknown as number,
      bid: null as unknown as number,
      ask: null as unknown as number,
      openInterest: null as unknown as number,
      volume: null as unknown as number,
      daysToExpiration: null as unknown as number,
    });

    for (const value of [
      result.gamma,
      result.vega,
      result.impliedVolatility,
      result.bid,
      result.ask,
      result.openInterest,
      result.volume,
      result.daysToExpiration,
      result.thetaUsdPerDay,
      result.expectedMovePctToExpiration,
      result.breakEvenToExpectedMoveRatio,
      result.gammaPnlForOnePctMoveUsd,
      result.gammaToThetaOnePctMoveRatio,
    ]) {
      expect(Number.isNaN(value)).toBe(true);
    }
    expect(result.diagnostics.notEvaluated).toEqual(
      expect.arrayContaining([
        "days_to_expiration_unavailable",
        "theta_unavailable",
        "bid_ask_spread_unavailable",
        "implied_volatility_unavailable",
        "gamma_unavailable",
        "vega_unavailable",
        "open_interest_unavailable",
        "volume_unavailable",
      ]),
    );
    expect(result.diagnostics.unfavorable).not.toEqual(
      expect.arrayContaining([
        "near_expiration",
        "low_open_interest",
        "low_volume",
        "low_theta_burn",
      ]),
    );
  });

  it("signs short holdings' value, delta dollars, theta, and gamma P&L opposite a long holding", () => {
    const result = computeOptionExposureAnalytics({
      type: "call",
      strike: 100,
      spot: 110,
      optionPrice: 12,
      delta: 0.6,
      gamma: 0.02,
      theta: -0.1,
      contracts: 2,
      positionSide: "short",
    });

    expect(result.positionValueUsd).toBe(-2_400);
    expect(result.deltaDollars).toBe(-13_200);
    expect(result.thetaUsdPerDay).toBe(20);
    expect(result.gammaPnlForOnePctMoveUsd).toBe(-2.42);
  });

  it("derives holding side from the aggregate-position leg before strategy fallback", () => {
    expect(optionPositionSide({ legs: [{ position_type: "short" }], strategy: "long_call" })).toBe(
      "short",
    );
    expect(optionPositionSide({ legs: [{}], strategy: "long_call" })).toBe("long");
    expect(optionPositionSide({ legs: [{}], strategy: "short_put" })).toBe("short");
    expect(optionPositionSide({ legs: [{}], strategy: "straddle" })).toBeUndefined();
  });
});

// ── Options Contract Historicals ──
// Test the shared engine behind `options history` CLI + `robinhood_options_history` MCP.
// Response shape validated against live 2026-08-02 proof:
// GET https://api.robinhood.com/marketdata/options/historicals/{0}/?interval=5minute&span=day
// → { bounds, data_points, interval, open_price, previous_close_price, span, ... }

describe("computeOptionsHistory", () => {
  const getJson = (async (url: string, params: Record<string, string> = {}) => {
    if (url.includes("options/historicals")) {
      return {
        bounds: { begins_at: "2026-08-02T13:30:00Z", ends_at: "2026-08-02T20:00:00Z" },
        data_points: [
          {
            begins_at: "2026-08-02T13:30:00Z",
            open_price: "1.23",
            close_price: "1.25",
            high_price: "1.26",
            low_price: "1.22",
            volume: 50,
            session: "reg",
          },
          {
            begins_at: "2026-08-02T13:35:00Z",
            open_price: "1.25",
            close_price: "1.22",
            high_price: "1.27",
            low_price: "1.21",
            volume: 35,
            session: "reg",
          },
        ],
        interval: "5minute",
        open_price: "1.20",
        previous_close_price: "1.19",
        span: "day",
        instrument_id: "opt-abc123",
        symbol: "AAPL",
      };
    }
    throw new Error(`unexpected ${url}`);
  }) as any;

  it("returns normalized historical data points for a contract", async () => {
    const r = await computeOptionsHistory(
      { contractId: "opt-abc123", interval: "5minute", span: "day" },
      { getJson },
    );
    expect(r.contractId).toBe("opt-abc123");
    expect(r.interval).toBe("5minute");
    expect(r.span).toBe("day");
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toMatchObject({
      open: 1.23,
      close: 1.25,
      high: 1.26,
      low: 1.22,
      volume: 50,
    });
    expect(r.openPrice).toBe(1.2);
    expect(r.previousClosePrice).toBe(1.19);
  });

  it("accepts a full contract URL and extracts the id", async () => {
    const r = await computeOptionsHistory(
      {
        contractId: "https://api.robinhood.com/options/instruments/opt-def456/",
        interval: "hour",
        span: "week",
      },
      { getJson },
    );
    expect(r.contractId).toBe("opt-def456");
  });

  it("validates interval is one of the allowed values", async () => {
    await expect(
      computeOptionsHistory(
        { contractId: "opt-abc", interval: "1day" as any, span: "day" },
        { getJson },
      ),
    ).rejects.toThrow(/interval must be one of/);
  });

  it("validates span is one of the allowed values", async () => {
    await expect(
      computeOptionsHistory(
        { contractId: "opt-abc", interval: "5minute", span: "month" as any },
        { getJson },
      ),
    ).rejects.toThrow(/span must be one of/);
  });

  it("caps data points to the configured limit (default 100)", async () => {
    const manyPoints = Array.from({ length: 120 }, (_, i) => ({
      begins_at: `2026-08-02T${String(13 + Math.floor(i / 12)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`,
      open_price: "1.00",
      close_price: "1.00",
      high_price: "1.00",
      low_price: "1.00",
      volume: 1,
      session: "reg",
    }));
    const bigJson = async () => ({
      bounds: {},
      data_points: manyPoints,
      interval: "5minute",
      open_price: "1.00",
      previous_close_price: "1.00",
      span: "day",
      instrument_id: "opt-abc",
      symbol: "TEST",
    });
    const r = await computeOptionsHistory(
      { contractId: "opt-abc", interval: "5minute", span: "day", maxPoints: 100 },
      { getJson: bigJson as any },
    );
    expect(r.points).toHaveLength(100);
    expect(r.truncated).toBe(true);
    expect(r.totalPoints).toBe(120);
  });

  it("rejects non-integer, zero, and oversized point limits", async () => {
    for (const maxPoints of [0, 1.5, 501]) {
      await expect(
        computeOptionsHistory({ contractId: "opt-abc", maxPoints }, { getJson }),
      ).rejects.toThrow(/maxPoints must be an integer from 1 through 500/);
    }
  });
});

// ── Options Chain Stats ──
// Test the shared engine behind `options chain-stats` CLI + `robinhood_options_chain_stats` MCP.
// Response shape validated against live 2026-08-02 proof:
// GET https://api.robinhood.com/marketdata/options/chains/stats/v1/{0}/
// → expirations with atm_iv_by_date + expected_move_by_date

describe("computeChainStats", () => {
  const makeGetJson = (chainId?: string) => {
    return (async (url: string, params: Record<string, string> = {}) => {
      if (url.includes("chains/stats")) {
        return {
          data: {
            atm_iv_by_date: {
              "2026-08-07": "0.3521",
              "2026-08-14": "0.3678",
            },
            expected_move_by_date: {
              "2026-08-07": "12.50",
              "2026-08-14": "18.75",
            },
            underlying_mic: "XNAS",
            open_hours_open: "09:30:00",
            open_hours_close: "16:00:00",
            updated_at: "2026-08-02T14:30:00Z",
          },
        };
      }
      // resolving chain_id from symbol (for --symbol mode)
      if (url.includes("instruments/?symbol")) {
        const sym = params.symbol ?? "";
        if (sym === "NOPE") return { results: [{}] };
        return {
          results: [{ id: "iid-1", tradable_chain_id: chainId ?? "chain-abc", symbol: sym }],
        };
      }
      throw new Error(`unexpected ${url}`);
    }) as any;
  };

  it("uses the mapped chain-stats route placeholder", async () => {
    const getJson = async (url: string, params: Record<string, string>) => {
      expect(url).toBe("https://api.robinhood.com/marketdata/options/chains/stats/v1/{uuid}/");
      expect(params).toEqual({ uuid: "chain-abc" });
      return { data: {} };
    };
    await computeChainStats({ chainId: "chain-abc" }, { getJson: getJson as any });
  });

  it("returns expiration rows with ATM IV and expected move", async () => {
    const r = await computeChainStats({ chainId: "chain-abc" }, { getJson: makeGetJson() });
    expect(r.chainId).toBe("chain-abc");
    expect(r.expirations).toHaveLength(2);
    expect(r.expirations[0]).toMatchObject({
      expirationDate: "2026-08-07",
      atmIv: 0.3521,
      expectedMove: 12.5,
    });
    expect(r.expirations[1].atmIv).toBe(0.3678);
    expect(r.underlyingMic).toBe("XNAS");
    expect(r.openHoursOpen).toBe("09:30:00");
    expect(r.openHoursClose).toBe("16:00:00");
  });

  it("unwraps the live nested envelope and current underlying expected-move field", async () => {
    const getJson = async () => ({
      status: "success",
      data: {
        status: "success",
        data: {
          chain_id: "chain-live",
          chain_symbol: "TSLA",
          atm_iv_by_date: { "2026-08-07": "0.42" },
          underlying_expected_move_by_date: { "2026-08-07": "15.25" },
          days_to_expiration_by_date: { "2026-08-07": 3 },
          underlying_price: "300.00",
          underlying_type: "stock",
          updated_at: "2026-08-04T09:00:00Z",
        },
      },
    });
    const r = await computeChainStats({ chainId: "chain-live" }, { getJson: getJson as any });
    expect(r.symbol).toBe("TSLA");
    expect(r.expirations).toEqual([
      expect.objectContaining({ expirationDate: "2026-08-07", atmIv: 0.42, expectedMove: 15.25 }),
    ]);
  });

  it("resolves chain_id from a symbol", async () => {
    const r = await computeChainStats({ symbol: "AAPL" }, { getJson: makeGetJson("chain-abc") });
    expect(r.chainId).toBe("chain-abc");
    expect(r.symbol).toBe("AAPL");
  });

  it("throws when neither chainId nor symbol is provided", async () => {
    await expect(computeChainStats({}, { getJson: makeGetJson() })).rejects.toThrow(
      /chainId or symbol/,
    );
  });

  it("throws when symbol has no tradable chain", async () => {
    await expect(computeChainStats({ symbol: "NOPE" }, { getJson: makeGetJson() })).rejects.toThrow(
      /No options chain/,
    );
  });

  it("parses numeric values from string responses", async () => {
    const r = await computeChainStats({ chainId: "chain-abc" }, { getJson: makeGetJson() });
    expect(typeof r.expirations[0].atmIv).toBe("number");
    expect(typeof r.expirations[0].expectedMove).toBe("number");
  });

  it("handles empty stats response gracefully", async () => {
    const empty = async () => ({ data: {} });
    const r = await computeChainStats({ chainId: "chain-abc" }, { getJson: empty as any });
    expect(r.expirations).toHaveLength(0);
  });
});

// ── Research-grade bulk options snapshot ──
// One shared engine must power CLI + MCP so large-chain enumeration returns the
// same full quote/Greeks/liquidity contract instead of the CLI's former 3-field
// quote subset and MCP's metadata-only subset.
describe("computeOptionsSnapshot", () => {
  const instrumentRows = [
    { id: "c95", type: "call", strike_price: "95", expiration_date: "2026-09-18", state: "active" },
    {
      id: "c100",
      type: "call",
      strike_price: "100",
      expiration_date: "2026-09-18",
      state: "active",
    },
    {
      id: "p100",
      type: "put",
      strike_price: "100",
      expiration_date: "2026-09-18",
      state: "active",
    },
  ];
  const marks: Record<string, any> = {
    c95: {
      instrument_id: "c95",
      bid_price: "8",
      ask_price: "8.4",
      adjusted_mark_price: "8.2",
      last_trade_price: "8.1",
      previous_close_price: "7.9",
      delta: "0.70",
      gamma: "0.02",
      theta: "-0.08",
      vega: "0.12",
      rho: "0.04",
      implied_volatility: "0.40",
      volume: 20,
      open_interest: 100,
    },
    c100: {
      instrument_id: "c100",
      bid_price: "5",
      ask_price: "5.2",
      adjusted_mark_price: "5.1",
      last_trade_price: "5.0",
      previous_close_price: "4.9",
      delta: "0.52",
      gamma: "0.03",
      theta: "-0.10",
      vega: "0.15",
      rho: "0.03",
      implied_volatility: "0.45",
      volume: 50,
      open_interest: 200,
    },
    p100: {
      instrument_id: "p100",
      bid_price: "4.8",
      ask_price: "5.0",
      adjusted_mark_price: "4.9",
      last_trade_price: "4.85",
      previous_close_price: "4.7",
      delta: "-0.48",
      gamma: "0.03",
      theta: "-0.09",
      vega: "0.14",
      rho: "-0.03",
      implied_volatility: "0.47",
      volume: 80,
      open_interest: 300,
    },
  };
  const getJson = async (url: string, params: Record<string, string> = {}) => {
    if (url.includes("instruments/?symbol"))
      return { results: [{ id: "eq1", symbol: "TEST", tradable_chain_id: "chain1" }] };
    if (url.includes("options/chains/")) return { expiration_dates: ["2026-09-18", "2026-10-16"] };
    if (url.includes("marketdata/quotes"))
      return { results: [{ instrument_id: "eq1", last_trade_price: "101" }] };
    if (url.includes("marketdata/options"))
      return {
        results: String(params.ids)
          .split(",")
          .map((id) => marks[id])
          .filter(Boolean),
      };
    throw new Error(`unexpected getJson ${url}`);
  };
  const getAll = async (_url: string, params: Record<string, string>) =>
    instrumentRows.filter(
      (row) => row.type === params.type && row.expiration_date === params.expiration_dates,
    );

  it("returns complete quote, Greeks, liquidity, moneyness, and spread fields", async () => {
    const r = await computeOptionsSnapshot(
      { symbol: "test", expiration: "2026-09-18", type: "both" },
      { getJson: getJson as any, getAll: getAll as any },
    );
    expect(r.symbol).toBe("TEST");
    expect(r.contracts).toHaveLength(3);
    expect(r.contracts[1]).toMatchObject({
      optionInstrumentId: "c100",
      type: "call",
      strike: 100,
      bid: 5,
      ask: 5.2,
      mark: 5.1,
      last: 5,
      previousClose: 4.9,
      spread: 0.2,
      spreadPct: expect.any(Number),
      delta: 0.52,
      gamma: 0.03,
      theta: -0.1,
      vega: 0.15,
      rho: 0.03,
      impliedVolatility: 0.45,
      impliedVolatilityPct: 45,
      volume: 50,
      openInterest: 200,
      moneyness: "ITM",
      exposureAnalytics: expect.objectContaining({
        intrinsicValuePerShare: 1,
        extrinsicValuePerShare: 4.1,
        positionValueUsd: 510,
        deltaShares: 52,
        deltaDollars: 5252,
        elasticity: expect.closeTo(10.298039, 5),
        markBreakEvenAtExpiration: 105.1,
      }),
    });
  });

  it("aggregates put/call liquidity and identifies concentration", async () => {
    const r = await computeOptionsSnapshot(
      { symbol: "TEST", expiration: "2026-09-18", type: "both" },
      { getJson: getJson as any, getAll: getAll as any },
    );
    expect(r.summary).toMatchObject({
      contractCount: 3,
      callCount: 2,
      putCount: 1,
      totalVolume: 150,
      totalOpenInterest: 600,
      putCallVolumeRatio: 80 / 70,
      putCallOpenInterestRatio: 1,
      highestOpenInterest: { optionInstrumentId: "p100", openInterest: 300 },
      highestVolume: { optionInstrumentId: "p100", volume: 80 },
    });
    expect(r.summary.byExpiration).toEqual([
      expect.objectContaining({
        expiration: "2026-09-18",
        contractCount: 3,
        callVolume: 70,
        putVolume: 80,
        callOpenInterest: 300,
        putOpenInterest: 300,
        atmStrike: 100,
        atmCallIv: 0.45,
        atmPutIv: 0.47,
        atmIvSkew: 0.02,
        atmStraddleMark: 10,
        atmStraddleExpectedMovePct: expect.closeTo(9.90099, 4),
      }),
    ]);
  });

  it("supports bounded all-expiration enumeration and reports truncation explicitly", async () => {
    const r = await computeOptionsSnapshot(
      { symbol: "TEST", expiration: "all", type: "call", maxExpirations: 1 },
      { getJson: getJson as any, getAll: getAll as any },
    );
    expect(r.expirationsRequested).toEqual(["2026-09-18"]);
    expect(r.availableExpirationCount).toBe(2);
    expect(r.truncatedExpirations).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/bounded/i);
  });
});
