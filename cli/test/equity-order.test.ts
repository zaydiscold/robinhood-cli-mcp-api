import { describe, expect, it } from "vitest";
import {
  DEDUP_WINDOW_MS,
  extractOrderId,
  filterRecentPending,
  getOrderStatus,
  placeEquityOrder
} from "../src/lib.js";

// Golden-behavior tests for the shared equity-order engine — the single code path behind the CLI
// `buy`/`sell` commands AND the MCP robinhood_buy/robinhood_sell tools (alignment invariant). These
// pin the money-touching semantics: amount/shares validation, the OTC/fractional guard, the
// dead-quote hard-fail (a 0/missing quote must never become qty=Infinity), the 5-minute pending
// dedup, ref_id idempotency, and live-send trade logging. All deps injected — no network.

const NOW = Date.parse("2026-06-11T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

interface Fix {
  instrument: any;
  quote: any;
  pendingOrders: any[];
  writeResult: { status: number; dryRun: boolean; body: unknown };
  orderListThrows?: boolean;
}

function makeDeps(overrides: Partial<Fix> = {}) {
  const fix: Fix = {
    instrument: { id: "iid-123", symbol: "AAPL", fractional_tradability: "tradable", otc_market_tier: null },
    quote: { last_trade_price: "100.00", instrument_id: "iid-123" },
    pendingOrders: [],
    writeResult: { status: 0, dryRun: true, body: "{}" },
    ...overrides
  };
  const calls = { writes: [] as any[], logs: [] as any[], orderListQueries: 0 };
  const deps = {
    now: () => NOW,
    getJson: async (url: string) => {
      if (url.includes("instruments/?symbol")) return { results: fix.instrument ? [fix.instrument] : [] };
      if (url.includes("marketdata/quotes")) return { results: fix.quote ? [fix.quote] : [] };
      if (url === "https://api.robinhood.com/orders/") {
        calls.orderListQueries++;
        if (fix.orderListThrows) throw new Error("orders list unavailable");
        return { results: fix.pendingOrders };
      }
      throw new Error(`unexpected url in test fake: ${url}`);
    },
    write: async (opts: any) => {
      calls.writes.push(opts);
      return fix.writeResult;
    },
    log: async (entry: any) => {
      calls.logs.push(entry);
    }
  };
  return { deps, calls, fix };
}

describe("extractOrderId", () => {
  it("passes a bare id through", () => {
    expect(extractOrderId("abc-123")).toBe("abc-123");
  });
  it("extracts from a full order URL, with or without trailing slash", () => {
    expect(extractOrderId("https://api.robinhood.com/orders/abc-123/")).toBe("abc-123");
    expect(extractOrderId("https://api.robinhood.com/orders/abc-123")).toBe("abc-123");
  });
});

describe("filterRecentPending — the 5-minute dedup window", () => {
  const pending = (over: any = {}) => ({ side: "buy", state: "queued", created_at: minutesAgo(1), id: "o1", ...over });

  it("keeps a fresh same-side pending order", () => {
    expect(filterRecentPending([pending()], "buy", NOW)).toHaveLength(1);
  });
  it("drops stale pending orders (older than the window) — a forgotten GTC is not a duplicate", () => {
    expect(filterRecentPending([pending({ created_at: minutesAgo(6) })], "buy", NOW)).toHaveLength(0);
    expect(filterRecentPending([pending({ created_at: minutesAgo(4.9) })], "buy", NOW)).toHaveLength(1);
  });
  it("still blocks a future-dated pending order (server clock skew)", () => {
    expect(filterRecentPending([pending({ created_at: minutesAgo(-0.5) })], "buy", NOW)).toHaveLength(1);
  });
  it("drops terminal states and the other side", () => {
    for (const state of ["filled", "cancelled", "rejected"]) {
      expect(filterRecentPending([pending({ state })], "buy", NOW)).toHaveLength(0);
    }
    expect(filterRecentPending([pending({ side: "sell" })], "buy", NOW)).toHaveLength(0);
  });
  it("drops unparseable created_at and tolerates non-array input", () => {
    expect(filterRecentPending([pending({ created_at: "garbage" })], "buy", NOW)).toHaveLength(0);
    expect(filterRecentPending(undefined as any, "buy", NOW)).toHaveLength(0);
  });
  it("exports the window constant the engine actually uses", () => {
    expect(DEDUP_WINDOW_MS).toBe(300_000);
  });
});

describe("placeEquityOrder — validation & guards", () => {
  it("requires amount XOR shares", async () => {
    const { deps } = makeDeps();
    await expect(placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy" }, deps))
      .rejects.toThrow(/amount.*or shares/i);
    await expect(placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, shares: 1 }, deps))
      .rejects.toThrow(/not both/i);
  });

  it("throws on an unknown symbol", async () => {
    const { deps } = makeDeps({ instrument: null });
    await expect(placeEquityOrder({ symbol: "ZZZZ", accountNumber: "A1", side: "buy", amount: 10 }, deps))
      .rejects.toThrow(/not found/);
  });

  it("blocks dollar orders on non-fractional/OTC names (failure mode #4), but allows shares", async () => {
    const otc = { id: "iid-otc", symbol: "RNECY", fractional_tradability: "position_closing_only", otc_market_tier: "otc" };
    const blocked = makeDeps({ instrument: otc });
    await expect(placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "buy", amount: 25 }, blocked.deps))
      .rejects.toThrow(/fractional_tradability=position_closing_only/);

    const allowed = makeDeps({ instrument: otc });
    const r = await placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "buy", shares: 2, limitPrice: 5 }, allowed.deps);
    expect(r.dryRun).toBe(true);
    expect(allowed.calls.writes).toHaveLength(1);
  });

  it("OTC dollar orders reject in BOTH directions — '$X of RNECY' is impossible buying OR selling", async () => {
    const otc = { id: "iid-otc", symbol: "RNECY", fractional_tradability: "position_closing_only", otc_market_tier: "otc" };
    const buy = makeDeps({ instrument: otc });
    await expect(placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "buy", amount: 25 }, buy.deps))
      .rejects.toThrow(/dollar\/fractional buy order.*auto-limits at the ask/);
    const sell = makeDeps({ instrument: otc });
    await expect(placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "sell", amount: 25 }, sell.deps))
      .rejects.toThrow(/dollar\/fractional sell order.*auto-limits at the bid/);
    expect(buy.calls.writes).toHaveLength(0);
    expect(sell.calls.writes).toHaveLength(0);
  });

  it("OTC whole-share BUY with no limit auto-limits at the ASK (marketable limit, gfd)", async () => {
    const otc = { id: "iid-otc", symbol: "RNECY", fractional_tradability: "position_closing_only", otc_market_tier: "otc" };
    const { deps, calls } = makeDeps({ instrument: otc, quote: { last_trade_price: "5.00", bid_price: "4.90", ask_price: "5.10", instrument_id: "iid-otc" } });
    const r = await placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "buy", shares: 2 }, deps);
    expect(calls.writes[0].body).toMatchObject({ type: "limit", price: "5.10", time_in_force: "gfd", side: "buy", quantity: "2" });
    expect(r.type).toBe("limit");
    expect(r.otcAutoLimit).toBe(true);
  });

  it("OTC whole-share SELL with no limit auto-limits at the BID (never the ask, never market)", async () => {
    const otc = { id: "iid-otc", symbol: "RNECY", fractional_tradability: "position_closing_only", otc_market_tier: "otc" };
    const { deps, calls } = makeDeps({ instrument: otc, quote: { last_trade_price: "5.00", bid_price: "4.90", ask_price: "5.10", instrument_id: "iid-otc" } });
    const r = await placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "sell", shares: 1 }, deps);
    expect(calls.writes[0].body).toMatchObject({ type: "limit", price: "4.90", time_in_force: "gfd", side: "sell", quantity: "1" });
    expect(r.otcAutoLimit).toBe(true);
  });

  it("OTC auto-limit falls back to last on a one-sided book; explicit limits stay untouched (gtc)", async () => {
    const otc = { id: "iid-otc", symbol: "RNECY", fractional_tradability: "position_closing_only", otc_market_tier: "otc" };
    const oneSided = makeDeps({ instrument: otc, quote: { last_trade_price: "5.00", bid_price: "0.00", ask_price: null, instrument_id: "iid-otc" } });
    await placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "sell", shares: 1 }, oneSided.deps);
    expect(oneSided.calls.writes[0].body).toMatchObject({ type: "limit", price: "5.00", time_in_force: "gfd" });

    const explicit = makeDeps({ instrument: otc, quote: { last_trade_price: "5.00", bid_price: "4.90", ask_price: "5.10", instrument_id: "iid-otc" } });
    const r = await placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "sell", shares: 1, limitPrice: 5.25 }, explicit.deps);
    expect(explicit.calls.writes[0].body).toMatchObject({ type: "limit", price: "5.25", time_in_force: "gtc" });
    expect(r.otcAutoLimit).toBe(false);
  });

  it("OTC names trade in WHOLE shares only — fractional share quantities reject", async () => {
    const otc = { id: "iid-otc", symbol: "RNECY", fractional_tradability: "position_closing_only", otc_market_tier: "otc" };
    const { deps, calls } = makeDeps({ instrument: otc });
    await expect(placeEquityOrder({ symbol: "RNECY", accountNumber: "A1", side: "buy", shares: 1.5, limitPrice: 5 }, deps))
      .rejects.toThrow(/WHOLE shares only/);
    expect(calls.writes).toHaveLength(0);
  });

  it("hard-fails on a dead or missing quote — never qty=Infinity", async () => {
    const dead = makeDeps({ quote: { last_trade_price: "0.00" } });
    await expect(placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "sell", amount: 50 }, dead.deps))
      .rejects.toThrow(/Invalid or missing quote/);
    expect(dead.calls.writes).toHaveLength(0);

    const missing = makeDeps({ quote: null });
    await expect(placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "sell", amount: 50 }, missing.deps))
      .rejects.toThrow(/Invalid or missing quote/);
  });
});

describe("placeEquityOrder — order body & dry-run semantics", () => {
  it("builds the exact market-buy body: 4dp sizing, ref_id, order_form_version 7, gfd", async () => {
    const { deps, calls } = makeDeps();
    const r = await placeEquityOrder({ symbol: "aapl", accountNumber: "A1", side: "buy", amount: 250 }, deps);

    expect(calls.writes).toHaveLength(1);
    const w = calls.writes[0];
    expect(w.url).toBe("https://api.robinhood.com/orders/");
    expect(w.method).toBe("POST");
    expect(w.dryRun).toBe(true);
    expect(w.body).toMatchObject({
      account: "https://api.robinhood.com/accounts/A1/",
      instrument: "https://api.robinhood.com/instruments/iid-123/",
      symbol: "AAPL",
      type: "market",
      time_in_force: "gfd",
      trigger: "immediate",
      side: "buy",
      quantity: "2.5",
      price: "100.00",
      order_form_version: "7",
      ref_id: `AAPL-A1-${NOW}`
    });
    expect(r).toMatchObject({ symbol: "AAPL", shares: 2.5, estimatedTotal: 250, type: "market", dryRun: true, live: false, refId: `AAPL-A1-${NOW}` });
  });

  it("limit orders use gtc and the 2dp limit price", async () => {
    const { deps, calls } = makeDeps();
    await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "sell", shares: 3, limitPrice: 95.5 }, deps);
    expect(calls.writes[0].body).toMatchObject({ type: "limit", time_in_force: "gtc", price: "95.50", side: "sell", quantity: "3" });
  });

  it("dry-run never queries the pending-order list and never logs a trade", async () => {
    const { deps, calls } = makeDeps({ pendingOrders: [{ side: "buy", state: "queued", created_at: minutesAgo(1) }] });
    await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10 }, deps);
    expect(calls.orderListQueries).toBe(0);
    expect(calls.logs).toHaveLength(0);
  });
});

describe("placeEquityOrder — live-send dedup & logging", () => {
  const live = { writeResult: { status: 201, dryRun: false, body: JSON.stringify({ id: "ord-1", state: "queued" }) } };

  it("blocks a live send when a fresh same-side pending order exists — nothing is sent", async () => {
    const { deps, calls } = makeDeps({ ...live, pendingOrders: [{ id: "ord-dup-1", side: "buy", state: "queued", created_at: minutesAgo(2) }] });
    await expect(placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true }, deps))
      .rejects.toThrow(/^DEDUP: 1 pending buy/);
    expect(calls.writes).toHaveLength(0);
  });

  it("force skips the dedup check; other-side and stale pendings never block", async () => {
    const forced = makeDeps({ ...live, pendingOrders: [{ side: "buy", state: "queued", created_at: minutesAgo(2) }] });
    await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true, force: true }, forced.deps);
    expect(forced.calls.writes).toHaveLength(1);

    const otherSide = makeDeps({ ...live, pendingOrders: [{ side: "sell", state: "queued", created_at: minutesAgo(1) }, { side: "buy", state: "queued", created_at: minutesAgo(10) }] });
    await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true }, otherSide.deps);
    expect(otherSide.calls.writes).toHaveLength(1);
  });

  it("a broken dedup read degrades (the trade proceeds); a positive hit always blocks", async () => {
    const { deps, calls } = makeDeps({ ...live, orderListThrows: true });
    await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true }, deps);
    expect(calls.writes).toHaveLength(1);
  });

  it("logs live sends to the trading log with refId + broker order id", async () => {
    const { deps, calls } = makeDeps(live);
    const r = await placeEquityOrder({ symbol: "AAPL", accountNumber: "A1", side: "buy", amount: 10, liveWrite: true }, deps);
    expect(calls.logs).toHaveLength(1);
    expect(calls.logs[0]).toMatchObject({ symbol: "AAPL", account: "A1", side: "buy", refId: `AAPL-A1-${NOW}`, orderId: "ord-1", httpStatus: 201 });
    expect(r).toMatchObject({ live: true, dryRun: false, orderId: "ord-1", state: "queued", httpStatus: 201 });
  });
});

describe("getOrderStatus — ticker resolution", () => {
  const order = { id: "ord-9", side: "buy", state: "filled", instrument: "https://api.robinhood.com/instruments/9f6b6e9e-1111-2222-3333-444455556666/" };

  function statusDeps(opts: { order?: any; symbol?: string | null; instrumentsThrow?: boolean } = {}) {
    const calls = { instrumentLookups: 0 };
    return {
      calls,
      deps: {
        getJson: async (url: string) => {
          if (url.includes("orders/{0}")) return opts.order ?? order;
          if (url.includes("instruments/?ids")) {
            calls.instrumentLookups++;
            if (opts.instrumentsThrow) throw new Error("lookup down");
            return { results: [{ symbol: opts.symbol === undefined ? "MRVL" : opts.symbol }] };
          }
          throw new Error(`unexpected url in test fake: ${url}`);
        }
      }
    };
  }

  it("resolves the instrument UUID to the real ticker (not the UUID tail)", async () => {
    const { deps } = statusDeps();
    const r = await getOrderStatus("https://api.robinhood.com/orders/ord-9/", deps);
    expect(r.symbol).toBe("MRVL");
    expect(r.id).toBe("ord-9");
  });

  it("skips the lookup when the order already carries a symbol", async () => {
    const s = statusDeps({ order: { ...order, symbol: "AAPL" } });
    const r = await getOrderStatus("ord-9", s.deps);
    expect(r.symbol).toBe("AAPL");
    expect(s.calls.instrumentLookups).toBe(0);
  });

  it("degrades gracefully when the instrument lookup fails — order still returned", async () => {
    const s = statusDeps({ instrumentsThrow: true });
    const r = await getOrderStatus("ord-9", s.deps);
    expect(r.id).toBe("ord-9");
    expect(r.symbol).toBeUndefined();
  });
});

// Zayd Khan // cold // www.zayd.wtf
