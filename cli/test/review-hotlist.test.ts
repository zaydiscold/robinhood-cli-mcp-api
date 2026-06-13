import { describe, expect, it } from "vitest";
import {
  computeTradeReview,
  formatTradeNote,
  noteMatchesTrade,
  parseHotlist,
  parseTradeNotes
} from "../src/lib.js";

// Golden-fixture tests for the FILM-STUDY engine (computeTradeReview) + the trade-notes ledger +
// the hotlist parser — shared CLI + MCP per the alignment invariant. These pin the money math an
// agent must NOT hand-compute: FIFO round-trip pairing (multi-fill, options ×100, short direction),
// the open-leg flag (unmatched legs are flagged, never dropped), win-rate/total math, and note
// attachment by ref. All deps injected — no network.

const NOW = Date.parse("2026-06-11T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

interface ReviewFix {
  accounts: any;
  equityOrders: Record<string, any[]>;
  optionOrders: Record<string, any[]>;
  instruments: any[];
  optionInstruments: any[];
  throwOptionResolve?: boolean;
}

function reviewDeps(fix: ReviewFix, notes: Array<{ when: string; ref: string; note: string }> = []) {
  const getJson = async (url: string, params: any = {}, query: any = {}) => {
    if (url.includes("transfer/accounts")) return fix.accounts;
    if (url.includes("instruments/?ids")) {
      const ids = String(params.ids ?? "").split(",");
      return { results: fix.instruments.filter((i) => ids.includes(i.id)) };
    }
    if (url.includes("options/instruments/")) {
      if (fix.throwOptionResolve) throw new Error("503 resolve down");
      const ids = String(query.ids ?? "").split(",");
      return { results: fix.optionInstruments.filter((i) => ids.includes(i.id)) };
    }
    throw new Error("unexpected getJson " + url);
  };
  const getAll = async (url: string, _params: any = {}, query: any = {}) => {
    if (url.includes("options/orders")) return fix.optionOrders[query.account_numbers] ?? [];
    if (url.includes("/orders/")) return fix.equityOrders[query.account_numbers] ?? [];
    throw new Error("unexpected getAll " + url);
  };
  return { getJson, getAll, now: () => NOW, loadNotes: () => notes };
}

// Account 111: HPE bought in two fills (6 + 4 @ $10), sold 6 @ $12 and 4 @ $11 → two round trips.
// Plus a long NVDA call opened @ $1.00 and closed @ $2.50 (×100 = +$150), and a short F put
// opened (sell/open) with NO close → must surface as an open leg, not a round trip.
const baseFix = (): ReviewFix => ({
  accounts: { results: [{ type: "rhs", account_number: "111", account_name: "Main" }] },
  instruments: [{ id: "iid-hpe", symbol: "HPE" }],
  optionInstruments: [
    { id: "opt-nvda", chain_symbol: "NVDA", strike_price: "190.0000", type: "call", expiration_date: "2026-09-18" },
    { id: "opt-f", chain_symbol: "F", strike_price: "11.0000", type: "put", expiration_date: "2026-07-17" }
  ],
  equityOrders: {
    "111": [
      {
        id: "eq-buy-1", state: "filled", side: "buy",
        instrument: "https://api.robinhood.com/instruments/iid-hpe/",
        executions: [
          { price: "10.00", quantity: "6", timestamp: daysAgo(30) },
          { price: "10.00", quantity: "4", timestamp: daysAgo(30) }
        ]
      },
      {
        id: "eq-sell-1", state: "filled", side: "sell",
        instrument: "https://api.robinhood.com/instruments/iid-hpe/",
        executions: [{ price: "12.00", quantity: "6", timestamp: daysAgo(10) }]
      },
      {
        id: "eq-sell-2", state: "filled", side: "sell",
        instrument: "https://api.robinhood.com/instruments/iid-hpe/",
        executions: [{ price: "11.00", quantity: "4", timestamp: daysAgo(5) }]
      },
      { id: "eq-old", state: "filled", side: "buy", instrument: "https://api.robinhood.com/instruments/iid-hpe/",
        executions: [{ price: "9.00", quantity: "1", timestamp: daysAgo(200) }] }, // outside window
      { id: "eq-cancelled", state: "cancelled", side: "buy", instrument: "https://api.robinhood.com/instruments/iid-hpe/" }
    ]
  },
  optionOrders: {
    "111": [
      {
        id: "op-open-1", state: "filled", chain_symbol: "NVDA",
        legs: [{ side: "buy", position_effect: "open", option: "https://api.robinhood.com/options/instruments/opt-nvda/",
          executions: [{ price: "1.00", quantity: "1", timestamp: daysAgo(20) }] }]
      },
      {
        id: "op-close-1", state: "filled", chain_symbol: "NVDA",
        legs: [{ side: "sell", position_effect: "close", option: "https://api.robinhood.com/options/instruments/opt-nvda/",
          executions: [{ price: "2.50", quantity: "1", timestamp: daysAgo(6) }] }]
      },
      {
        id: "op-short-open", state: "filled", chain_symbol: "F",
        legs: [{ side: "sell", position_effect: "open", option: "https://api.robinhood.com/options/instruments/opt-f/",
          executions: [{ price: "0.40", quantity: "1", timestamp: daysAgo(3) }] }]
      }
    ]
  }
});

describe("computeTradeReview — FIFO round-trip pairing in dollars", () => {
  it("pairs multi-fill equity buys against later sells FIFO and computes $ outcomes", async () => {
    const r = await computeTradeReview({ days: 90 }, reviewDeps(baseFix()));
    const hpe = r.roundTrips.filter((t) => t.symbol === "HPE");
    expect(hpe).toHaveLength(2);
    expect(hpe[0]).toMatchObject({ quantity: 6, entryUsd: 60, exitUsd: 72, realizedPnlUsd: 12, win: true, direction: "long", holdDays: 20 });
    expect(hpe[1]).toMatchObject({ quantity: 4, entryUsd: 40, exitUsd: 44, realizedPnlUsd: 4, win: true, holdDays: 25 });
    expect(hpe[0].orderIds.sort()).toEqual(["eq-buy-1", "eq-sell-1"]);
  });

  it("options round trips use the ×100 multiplier and resolve the contract label", async () => {
    const r = await computeTradeReview({ days: 90 }, reviewDeps(baseFix()));
    const nvda = r.roundTrips.find((t) => t.symbol === "NVDA")!;
    expect(nvda.realizedPnlUsd).toBe(150);   // (2.50 − 1.00) × 100 × 1
    expect(nvda.entryUsd).toBe(100);
    expect(nvda.exitUsd).toBe(250);
    expect(nvda.contract).toBe("NVDA $190 call 2026-09-18");
    expect(nvda.win).toBe(true);
  });

  it("flags unmatched legs openLeg:true (still-open short put) — never silently dropped", async () => {
    const r = await computeTradeReview({ days: 90 }, reviewDeps(baseFix()));
    const shortPut = r.trades.find((t) => t.symbol === "F")!;
    expect(shortPut.openLeg).toBe(true);
    expect(shortPut.unmatchedQuantity).toBe(1);
    expect(r.roundTrips.some((t) => t.symbol === "F")).toBe(false);
    expect(r.summary.openLegs).toBe(1);
  });

  it("window-filters fills (the 200-day-old buy is excluded) and skips non-filled orders", async () => {
    const r = await computeTradeReview({ days: 90 }, reviewDeps(baseFix()));
    expect(r.trades.some((t) => t.orderId === "eq-old")).toBe(false);
    expect(r.trades.some((t) => t.orderId === "eq-cancelled")).toBe(false);
  });

  it("a close whose entry filled OUTSIDE the window is an open leg, not a fake round trip", async () => {
    const fix = baseFix();
    fix.equityOrders["111"] = [
      { id: "eq-pre", state: "filled", side: "buy", instrument: "https://api.robinhood.com/instruments/iid-hpe/",
        executions: [{ price: "9.00", quantity: "5", timestamp: daysAgo(200) }] },
      { id: "eq-sell-x", state: "filled", side: "sell", instrument: "https://api.robinhood.com/instruments/iid-hpe/",
        executions: [{ price: "12.00", quantity: "5", timestamp: daysAgo(2) }] }
    ];
    fix.optionOrders["111"] = [];
    const r = await computeTradeReview({ days: 90 }, reviewDeps(fix));
    expect(r.roundTrips).toHaveLength(0);
    const sell = r.trades.find((t) => t.orderId === "eq-sell-x")!;
    expect(sell.openLeg).toBe(true);
    expect(sell.unmatchedQuantity).toBe(5);
  });

  it("summary math: winners/losers, winRatePct, totalRealizedUsd, best/worst, avgHoldDays", async () => {
    const fix = baseFix();
    // add a losing short call round trip: sell/open 0.50 → buy/close 2.00 = −$150
    fix.optionInstruments.push({ id: "opt-loss", chain_symbol: "AMD", strike_price: "150.0000", type: "call", expiration_date: "2026-08-21" });
    fix.optionOrders["111"].push(
      { id: "op-so", state: "filled", chain_symbol: "AMD",
        legs: [{ side: "sell", position_effect: "open", option: "https://api.robinhood.com/options/instruments/opt-loss/",
          executions: [{ price: "0.50", quantity: "1", timestamp: daysAgo(15) }] }] },
      { id: "op-bc", state: "filled", chain_symbol: "AMD",
        legs: [{ side: "buy", position_effect: "close", option: "https://api.robinhood.com/options/instruments/opt-loss/",
          executions: [{ price: "2.00", quantity: "1", timestamp: daysAgo(5) }] }] }
    );
    const r = await computeTradeReview({ days: 90 }, reviewDeps(fix));
    const s = r.summary;
    expect(s.roundTrips).toBe(4);            // HPE×2 + NVDA + AMD
    expect(s.winners).toBe(3);
    expect(s.losers).toBe(1);
    expect(s.winRatePct).toBe(75);
    expect(s.totalRealizedUsd).toBe(16);     // 12 + 4 + 150 − 150
    expect(s.bestTrade!.symbol).toBe("NVDA");
    expect(s.bestTrade!.realizedPnlUsd).toBe(150);
    expect(s.worstTrade!.symbol).toBe("AMD");
    expect(s.worstTrade!.realizedPnlUsd).toBe(-150);
    const amd = r.roundTrips.find((t) => t.symbol === "AMD")!;
    expect(amd.direction).toBe("short");     // short P&L = (open − close) × 100
    expect(s.avgHoldDays).toBe(17.3);        // mean(20, 25, 14, 10) = 17.25 → 17.3
  });

  it("scopes by --symbol and degrades (not crashes) when the option-contract resolve fails", async () => {
    const only = await computeTradeReview({ days: 90, symbol: "hpe" }, reviewDeps(baseFix()));
    expect(only.roundTrips.every((t) => t.symbol === "HPE")).toBe(true);
    expect(only.trades.every((t) => t.symbol === "HPE")).toBe(true);

    const fix = baseFix();
    fix.throwOptionResolve = true;
    const r = await computeTradeReview({ days: 90 }, reviewDeps(fix));
    const nvda = r.roundTrips.find((t) => t.symbol === "NVDA")!;
    expect(nvda.contract).toMatch(/^NVDA opt-nvda/);  // UUID stub, not a crash
    expect(r.warnings.some((w) => /contract resolve failed/.test(w))).toBe(true);
  });
});

describe("computeTradeReview — note attachment by ref (order id or symbol)", () => {
  it("attaches notes to trades and round trips whose order id or symbol matches the ref", async () => {
    const notes = [
      { when: "2026-06-10 09:00", ref: "eq-sell-1", note: "sold the first lot into strength" },
      { when: "2026-06-10 09:05", ref: "NVDA 2026-06-05", note: "let the winner run to 2.5x — right call" },
      { when: "2026-06-10 09:10", ref: "TSLA", note: "unrelated note — must not attach" }
    ];
    const r = await computeTradeReview({ days: 90 }, reviewDeps(baseFix(), notes));
    const hpeTrip = r.roundTrips.find((t) => t.orderIds.includes("eq-sell-1"))!;
    expect(hpeTrip.notes.map((n) => n.ref)).toEqual(["eq-sell-1"]);
    const nvdaTrip = r.roundTrips.find((t) => t.symbol === "NVDA")!;
    expect(nvdaTrip.notes).toHaveLength(1);
    expect(nvdaTrip.notes[0].note).toMatch(/winner run/);
    expect(r.roundTrips.every((t) => !t.notes.some((n) => n.ref === "TSLA"))).toBe(true);
  });
});

describe("trade-notes ledger — format + parse + match", () => {
  it("formatTradeNote renders `### YYYY-MM-DD HH:MM | <ref>` + note + ---", () => {
    const entry = formatTradeNote({ ref: "HPE 2026-06-10", note: "lesson text", now: new Date(2026, 5, 11, 9, 5) });
    expect(entry).toBe("\n### 2026-06-11 09:05 | HPE 2026-06-10\n\nlesson text\n\n---\n");
  });

  it("parseTradeNotes round-trips entries and tolerates header prose", () => {
    const content = [
      "# Trade Notes", "", "some header prose that is not an entry", "",
      "### 2026-06-11 09:05 | HPE 2026-06-10", "", "lesson one", "line two", "", "---",
      "### 2026-06-12 10:00 | eq-sell-1", "", "lesson two", "", "---", ""
    ].join("\n");
    const notes = parseTradeNotes(content);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ when: "2026-06-11 09:05", ref: "HPE 2026-06-10" });
    expect(notes[0].note).toBe("lesson one\nline two");
    expect(notes[1].ref).toBe("eq-sell-1");
  });

  it("noteMatchesTrade: order-id substring (≥6 chars) or symbol as a standalone token", () => {
    const trade = { symbol: "HPE", orderIds: ["abcdef-123456"] };
    expect(noteMatchesTrade("abcdef-123456", trade)).toBe(true);   // exact id
    expect(noteMatchesTrade("abcdef", trade)).toBe(true);          // id prefix ≥6
    expect(noteMatchesTrade("abc", trade)).toBe(false);            // too short to match an id
    expect(noteMatchesTrade("HPE 2026-06-10", trade)).toBe(true);  // symbol token
    expect(noteMatchesTrade("hpe", trade)).toBe(true);             // case-insensitive token
    expect(noteMatchesTrade("SHPEX", trade)).toBe(false);          // not a token boundary
    expect(noteMatchesTrade("TSLA", trade)).toBe(false);
  });
});

describe("parseHotlist — headers/blank/example lines ignored, thesis captured", () => {
  it("parses `TICKER — thesis` lines and skips headers, comments, blanks, and (example) lines", () => {
    const content = [
      "# Hotlist — operator-maintained ticker watchlist",
      "# One ticker per line: `TICKER — optional thesis/note`",
      "<!-- a comment -->",
      "",
      "NVDA — ai capex supercycle; watch for dip entries (example)",
      "HPE — earnings momentum thesis",
      "BRK.B - plain-dash separator works too",
      "F",
      "not a ticker line",
      "> quoted prose"
    ].join("\n");
    const entries = parseHotlist(content);
    expect(entries.map((e) => e.symbol)).toEqual(["HPE", "BRK.B", "F"]);
    expect(entries[0].thesis).toBe("earnings momentum thesis");
    expect(entries[1].thesis).toBe("plain-dash separator works too");
    expect(entries[2].thesis).toBeNull();
  });
});

// Zayd Khan // cold // www.zayd.wtf
