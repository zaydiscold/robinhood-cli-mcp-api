import { describe, expect, it } from "vitest";
import {
  computeNews,
  computeRatings,
  computeEarnings,
  computeMovers,
  computeOptionsEvents
} from "../src/lib.js";

// Phase-3 signal/event read engines — the shared code path behind the CLI news/ratings/earnings/
// movers/options-events commands AND the matching MCP tools. Response shapes captured live
// 2026-06-19; all deps injected, zero network. Pins the shaping + the EPS null-safety guard.

describe("computeNews", () => {
  it("shapes the latest articles with source + link and honors the limit", async () => {
    const getJson = async () => ({
      results: [
        { title: "A", source: "Nasdaq", relay_url: "http://x/a", summary: "s", published_at: "2026-06-19T00:00:00Z" },
        { title: "B", source: "Reuters", relay_url: "http://x/b", published_at: "2026-06-18T00:00:00Z" },
        { title: "C", source: "WSJ", relay_url: "http://x/c" }
      ]
    });
    const r = await computeNews({ symbol: "aapl", limit: 2 }, { getJson: getJson as any });
    expect(r.symbol).toBe("AAPL");
    expect(r.count).toBe(2);
    expect(r.articles[0]).toMatchObject({ title: "A", source: "Nasdaq", url: "http://x/a" });
  });
});

describe("computeRatings", () => {
  const getJson = (async (url: string) => {
    if (url.includes("instruments/?symbol")) return { results: [{ id: "iid-1" }] };
    if (url.includes("midlands/ratings")) return {
      summary: { num_buy_ratings: 34, num_hold_ratings: 15, num_sell_ratings: 2 },
      ratings: [{ type: "buy", text: "strong", published_at: "2026-06-18T00:00:00Z" }, { type: "sell", text: "risk" }]
    };
    throw new Error(`unexpected ${url}`);
  }) as any;

  it("derives a consensus from the dominant bucket and shapes texts", async () => {
    const r = await computeRatings({ symbol: "AAPL", limit: 5 }, { getJson });
    expect(r.summary).toMatchObject({ buy: 34, hold: 15, sell: 2 });
    expect(r.consensus).toBe("buy");
    expect(r.ratings).toHaveLength(2);
  });

  it("reports consensus 'none' when there are zero ratings", async () => {
    const empty = (async (url: string) => url.includes("instruments/?symbol")
      ? { results: [{ id: "iid-1" }] }
      : { summary: { num_buy_ratings: 0, num_hold_ratings: 0, num_sell_ratings: 0 }, ratings: [] }) as any;
    const r = await computeRatings({ symbol: "AAPL" }, { getJson: empty });
    expect(r.consensus).toBe("none");
  });

  it("throws when the symbol can't be resolved to an instrument", async () => {
    const noInst = (async () => ({ results: [] })) as any;
    await expect(computeRatings({ symbol: "ZZZZ" }, { getJson: noInst })).rejects.toThrow(/No instrument/);
  });
});

describe("computeEarnings — null-safe EPS (the Number(null)===0 trap)", () => {
  const getJson = (async () => ({
    results: [
      { symbol: "AAPL", year: 2026, quarter: 3, eps: { estimate: "1.890000", actual: null }, report: { date: "2026-07-30", timing: "pm", verified: true } },
      { symbol: "AAPL", year: 2026, quarter: 2, eps: { estimate: "1.940000", actual: "2.010000" }, report: { date: "2026-04-30", timing: "pm", verified: true } }
    ]
  })) as any;

  it("treats a not-yet-reported quarter (actual=null) as pending, NOT a $0 miss", async () => {
    const r = await computeEarnings({ symbol: "AAPL" }, { getJson });
    const future = r.reports.find((x) => x.year === 2026 && x.quarter === 3)!;
    expect(future.reported).toBe(false);
    expect(Number.isNaN(future.epsActual)).toBe(true);
    expect(future.surprise).toBeNull(); // never a phantom negative surprise
  });

  it("computes surprise = actual − estimate for a reported quarter", async () => {
    const r = await computeEarnings({ symbol: "AAPL" }, { getJson });
    const past = r.reports.find((x) => x.year === 2026 && x.quarter === 2)!;
    expect(past.reported).toBe(true);
    expect(past.surprise).toBeCloseTo(0.07, 4);
  });
});

describe("computeMovers", () => {
  const getJson = (async () => ({
    results: [
      { symbol: "SNDK", price_movement: { market_hours_last_movement_pct: "11.42", market_hours_last_price: "2182.45" } },
      { symbol: "GLW", price_movement: { market_hours_last_movement_pct: "11.16", market_hours_last_price: "194.97" } }
    ]
  })) as any;

  it("shapes sp500 movers with inline pct + price, defaulting direction up", async () => {
    const r = await computeMovers({ limit: 5 }, { getJson });
    expect(r.index).toBe("sp500");
    expect(r.direction).toBe("up");
    expect(r.movers[0]).toMatchObject({ symbol: "SNDK", movementPct: 11.42, price: 2182.45 });
  });
});

describe("computeOptionsEvents", () => {
  // The option id rides in the params arg ({ "0": id }) — brokerageGetJson interpolates {0} internally,
  // so the fake must distinguish on params, NOT on the (un-substituted) URL template string.
  const getJson = (async (url: string, params: Record<string, string> = {}) => {
    if (url.includes("options/events")) return {
      results: [
        { event_date: "2026-03-20", type: "expiration", direction: "credit", quantity: "14.0000", total_cash_amount: "0", state: "confirmed", account_number: "A1", option_id: "oid-1" },
        { event_date: "2026-03-19", type: "assignment", direction: "debit", quantity: "1", total_cash_amount: "500", state: "confirmed", account_number: "A2", option_id: "oid-2" }
      ]
    };
    if (url.includes("options/instruments")) return { chain_symbol: params["0"] === "oid-1" ? "GOOG" : "AMD" };
    throw new Error(`unexpected ${url}`);
  }) as any;

  it("shapes events newest-first with best-effort symbol enrichment", async () => {
    const r = await computeOptionsEvents({}, { getJson });
    expect(r.count).toBe(2);
    expect(r.events[0]).toMatchObject({ date: "2026-03-20", type: "expiration", symbol: "GOOG", account: "A1" });
  });

  it("filters to one account when account_number is passed", async () => {
    const r = await computeOptionsEvents({ accountNumber: "A2" }, { getJson });
    expect(r.count).toBe(1);
    expect(r.events[0]).toMatchObject({ account: "A2", type: "assignment", cash: 500 });
  });
});
