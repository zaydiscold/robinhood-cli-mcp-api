import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPortfolioSnapshot,
  buildOptionsWorkbench,
  diffPortfolioSnapshots,
  redactShareSafe,
  readPortfolioSnapshots,
  runDoctor,
  watchOrderLifecycle
} from "../src/lib.js";

describe("share-safe output", () => {
  it("redacts nested financial identifiers and signed URLs without mutating input", () => {
    const input = { symbol: "AAPL", price: 210.5, account_number: "123456789", balance: 42, nested: { document_url: "https://x.test/a?X-Amz-Signature=secret", note: "public" } };
    const output = redactShareSafe(input);
    expect(output).toEqual({ symbol: "AAPL", price: 210.5, account_number: "…6789", balance: "[REDACTED]", nested: { document_url: "[REDACTED]", note: "public" } });
    expect(input.balance).toBe(42);
    expect(JSON.stringify(output)).not.toContain("secret");
  });
});

describe("durable order lifecycle", () => {
  it("deduplicates intermediate states and stops on a fill", async () => {
    const states = ["queued", "queued", "partially_filled", "filled"];
    const result = await watchOrderLifecycle({ id: "order-1", poll: async () => ({ state: states.shift() }), intervalMs: 0, sleep: async () => undefined });
    expect(result.state).toBe("filled");
    expect(result.transitions.map((row) => row.state)).toEqual(["sent", "confirmed", "filled"]);
    expect(result.retrySafe).toBe(false);
  });

  it("performs a final reconciliation read and never declares retry safe", async () => {
    let reads = 0;
    const times = [0, 2, 3, 4].map((ms) => new Date(ms));
    const result = await watchOrderLifecycle({
      id: "order-2", timeoutMs: 1, intervalMs: 0,
      now: () => times.shift() ?? new Date(5), sleep: async () => undefined,
      poll: async () => { reads += 1; throw new Error("transport unknown"); }
    });
    expect(reads).toBeGreaterThanOrEqual(1);
    expect(result).toMatchObject({ state: "unknown", outcomeKnown: false, retrySafe: false });
  });
});

describe("portfolio time machine", () => {
  it("persists private JSONL snapshots and reports position drift", () => {
    const path = join(mkdtempSync(join(tmpdir(), "rh-snap-")), "snapshots.jsonl");
    const before: any = { version: 1, id: "a", capturedAt: "2026-01-01T00:00:00Z", source: "portfolio", data: { totals: { equity: 100, day: 1, afterHours: 0 }, drivers: [{ kind: "equity", symbol: "AAPL", value: 50, dayUsd: 1, qty: 1 }] } };
    const after: any = { version: 1, id: "b", capturedAt: "2026-01-02T00:00:00Z", source: "portfolio", data: { totals: { equity: 110, day: 3, afterHours: 1 }, drivers: [{ kind: "equity", symbol: "AAPL", value: 60, dayUsd: 2, qty: 1 }] } };
    appendPortfolioSnapshot(path, before); appendPortfolioSnapshot(path, after);
    expect(readPortfolioSnapshots(path)).toHaveLength(2);
    expect(diffPortfolioSnapshots(before, after)).toMatchObject({ totals: { equityDelta: 10, dayDelta: 2, afterHoursDelta: 1 }, positions: [{ valueDelta: 10 }] });
  });
});

describe("options workbench", () => {
  it("nets premium, exact expiry payoff samples, and signed Greeks", () => {
    const result = buildOptionsWorkbench({ symbol: "AAPL", expiration: "2026-12-18", underlyingPrice: 100, legs: [
      { id: "short", action: "sell", type: "call", strike: 105, premium: 3, delta: .4 },
      { id: "long", action: "buy", type: "call", strike: 110, premium: 1, delta: .2 }
    ], orderBody: { ref_id: "x" } });
    expect(result.package.netPremium).toBe(200);
    expect(result.netGreeks.delta).toBe(-20);
    expect(result.payoff.scenarios.find((row) => row.spot === 110)?.pnl).toBe(-300);
    expect(result.payoff.maxProfit).toBe(200);
    expect(result.payoff.maxLoss).toBe(300);
    expect(result.payoff.exactForSameExpiration).toBe(true);
    expect(result.approvalCard.bodyBound).toBe(true);
    expect(result.approvalCard.bodySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("marks an uncovered short-call tail as unlimited loss and can price from bid/ask", () => {
    const result = buildOptionsWorkbench({ symbol: "AAPL", expiration: "2026-12-18", underlyingPrice: 100, pricingMode: "natural", legs: [
      { id: "short", action: "sell", type: "call", strike: 105, bid: 2.9, ask: 3.1 }
    ] });
    expect(result.package.netPremium).toBe(290);
    expect(result.payoff.maxLoss).toBe("unlimited");
  });
});

describe("doctor", () => {
  it("is offline, detects source/dist drift, and never emits credential values", () => {
    const root = mkdtempSync(join(tmpdir(), "rh-doctor-"));
    for (const path of ["api-map", "cli/dist/api-map", "docs"]) mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, "api-map/brokerage-routes.json"), "[]");
    writeFileSync(join(root, "cli/dist/api-map/brokerage-routes.json"), "[]");
    for (const path of ["AGENTS.md", "SKILL.md", "docs/cli-mcp-architecture.md", "docs/write-operations.md"]) writeFileSync(join(root, path), "ok");
    const result = runDoctor(root, { ROBINHOOD_BROKERAGE_TOKEN: "should-never-print" } as any);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("should-never-print");
    expect(result.checks.find((check) => check.id === "source-dist-parity")?.status).toBe("pass");
  });
});
