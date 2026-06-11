import { describe, expect, it } from "vitest";
import { classifyWheelStage, computeWheelState, WHEEL_DOC } from "../src/lib.js";

// Wheel engine tests — the classifier is the part that must never lie: it turns account evidence
// (shares, short puts, short calls) into a stage + the next-leg command. Coverage math (short
// calls vs shares/100) is the one hard safety check. All composition deps injected — no network.

const NOW = Date.parse("2026-06-11T12:00:00Z");

const leg = (over: any = {}) => ({
  optionId: "opt-1", side: "short", type: "put", strike: 24, expiration: "2026-06-26",
  dte: 15, contracts: 1, strategy: "short_put", ...over
});

const empty = { sharesQty: 0, avgCost: null, shortPuts: [], shortCalls: [], otherLegs: [] };

describe("classifyWheelStage", () => {
  it("not-started → leg 1 entry (cash-secured short put) with the literal command", () => {
    const c = classifyWheelStage(empty, { symbol: "F", accountNumber: "A1" });
    expect(c.stage).toBe("not-started");
    expect(c.nextLeg.command).toContain("cash-secured-short-put");
    expect(c.nextLeg.command).toContain("--symbol F");
    expect(c.nextLeg.command).toContain("--account A1");
    expect(c.blockers).toHaveLength(0);
  });

  it("short put open → csp-open, next is managing/rolling the put", () => {
    const c = classifyWheelStage({ ...empty, shortPuts: [leg()] }, { symbol: "F", accountNumber: "A1" });
    expect(c.stage).toBe("cash-secured-put-open");
    expect(c.summary).toContain("1× $24 P 2026-06-26");
    expect(c.nextLeg.command).toContain("roll-plan");
    expect(c.nextLeg.command).toContain("--type put");
    expect(c.nextLeg.command).toContain("--close-strike 24");
  });

  it("100+ shares, no calls → shares-uncovered, next is the covered call at/above basis", () => {
    const c = classifyWheelStage({ ...empty, sharesQty: 120, avgCost: 25.1 }, { symbol: "F", accountNumber: "A1" });
    expect(c.stage).toBe("shares-uncovered");
    expect(c.nextLeg.command).toContain("covered-call");
    expect(c.nextLeg.command).toContain("short_call=");
    expect(c.nextLeg.command).toContain("basis $25.10");
    expect(c.nextLeg.rationale).toContain("1 contract(s) of coverage");
  });

  it("covered call open → leg 3 working, next is roll/expire/assign management", () => {
    const c = classifyWheelStage(
      { ...empty, sharesQty: 100, shortCalls: [leg({ type: "call", strike: 30, strategy: "short_call" })] },
      { symbol: "HPE", accountNumber: "A1" }
    );
    expect(c.stage).toBe("covered-call-open");
    expect(c.nextLeg.command).toContain("roll-plan");
    expect(c.nextLeg.command).toContain("--type call");
    expect(c.blockers).toHaveLength(0);
  });

  it("short calls beyond share coverage → undercovered blocker, NOT a wheel state, no command", () => {
    const c = classifyWheelStage(
      { ...empty, sharesQty: 100, shortCalls: [leg({ type: "call", contracts: 2, strategy: "short_call" })] },
      { symbol: "F" }
    );
    expect(c.stage).toBe("short-call-undercovered");
    expect(c.blockers[0]).toContain("need 200 shares");
    expect(c.blockers[0]).toContain("holds 100");
    expect(c.nextLeg.command).toBeNull();
  });

  it("short put while already holding 100+ shares → csp-plus-shares, CC offered in parallel", () => {
    const c = classifyWheelStage(
      { ...empty, sharesQty: 150, avgCost: 10, shortPuts: [leg()] },
      { symbol: "F", accountNumber: "A1" }
    );
    expect(c.stage).toBe("csp-plus-shares");
    expect(c.nextLeg.command).toContain("covered-call");
  });

  it("sub-100 shares → not wheelable, CSP suggested for a fresh lot", () => {
    const c = classifyWheelStage({ ...empty, sharesQty: 7 }, { symbol: "F" });
    expect(c.stage).toBe("sub-100-shares");
    expect(c.nextLeg.command).toContain("cash-secured-short-put");
  });

  it("non-wheel legs are noted but never counted as wheel legs", () => {
    const c = classifyWheelStage(
      { ...empty, otherLegs: [leg({ side: "long", type: "call", strategy: "long_call" })] },
      { symbol: "NVDA" }
    );
    expect(c.stage).toBe("not-started");
    expect(c.summary).toContain("non-wheel option leg");
  });
});

describe("computeWheelState (injected deps, no network)", () => {
  const ACCT = "12345678";

  function deps(fix: { positions?: any[]; agg?: any[] } = {}) {
    return {
      now: () => NOW,
      getJson: async (url: string) => {
        if (url.includes("transfer/accounts")) {
          return { results: [{ type: "rhs", account_number: ACCT, account_name: "test-margin" }] };
        }
        throw new Error(`unexpected getJson url: ${url}`);
      },
      getAll: async (url: string) => {
        if (url.includes("aggregate_positions")) return fix.agg ?? [];
        if (url.includes("/positions/")) return fix.positions ?? [];
        throw new Error(`unexpected getAll url: ${url}`);
      }
    };
  }

  const aggShortCall = {
    symbol: "HPE", quantity: "1.0000", strategy: "short_call",
    legs: [{ option_id: "uuid-1", position_type: "short", option_type: "call", strike_price: "30.0000", expiration_date: "2026-09-18", ratio_quantity: 1 }]
  };

  it("classifies a covered call from shares + short-call evidence, with DTE computed", async () => {
    const r = await computeWheelState({ symbol: "HPE" }, deps({
      positions: [{ symbol: "HPE", quantity: "100.0000", average_buy_price: "21.50" }],
      agg: [aggShortCall]
    }));
    expect(r.states).toHaveLength(1);
    const s = r.states[0];
    expect(s.stage).toBe("covered-call-open");
    expect(s.sharesQty).toBe(100);
    expect(s.avgCost).toBe(21.5);
    expect(s.shortCalls[0].dte).toBe(99);
    expect(s.account).toBe(ACCT);
    expect(r.reference).toBe(WHEEL_DOC);
  });

  it("no-symbol scan surfaces option symbols and 100+ share lots, skips dust", async () => {
    const r = await computeWheelState({}, deps({
      positions: [
        { symbol: "VOO", quantity: "120.0000", average_buy_price: "400" },
        { symbol: "DUST", quantity: "2.0000", average_buy_price: "1" }
      ],
      agg: [aggShortCall]
    }));
    const symbols = r.states.map((s: any) => s.symbol).sort();
    expect(symbols).toEqual(["HPE", "VOO"]);
    expect(r.states.find((s: any) => s.symbol === "VOO").stage).toBe("shares-uncovered");
    // HPE short call with NO shares → undercovered blocker fires
    expect(r.states.find((s: any) => s.symbol === "HPE").stage).toBe("short-call-undercovered");
  });

  it("discussion mode: a requested symbol with no position still returns the leg-1 plan", async () => {
    const r = await computeWheelState({ symbol: "F" }, deps());
    expect(r.states).toHaveLength(1);
    expect(r.states[0].stage).toBe("not-started");
    expect(r.states[0].account).toBeNull();
    expect(r.states[0].nextLeg.command).toContain("cash-secured-short-put");
  });

  it("a failed per-account read degrades to a note instead of throwing", async () => {
    const d = deps();
    (d as any).getAll = async (url: string) => {
      if (url.includes("aggregate_positions")) throw new Error("agg unavailable");
      return [];
    };
    const r = await computeWheelState({ symbol: "F" }, d);
    expect(r.notes.some((n: string) => n.includes("option positions read failed"))).toBe(true);
    expect(r.states[0].stage).toBe("not-started");
  });

  it("unknown account filter throws loudly (wrong-account is the #1 risk)", async () => {
    await expect(computeWheelState({ accountNumber: "99999999" }, deps())).rejects.toThrow(/not one of your trading accounts/);
  });
});

// made with love by Zayd Khan / cold
