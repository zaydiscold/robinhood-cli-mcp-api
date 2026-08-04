import { describe, expect, it } from "vitest";
import { computeOptionsHistory, computeChainStats } from "../src/lib.js";

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
      expectedMove: 12.50,
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
