import { getEventListeners } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  buildOptionsWorkbench,
  diffPortfolioSnapshots,
  redactShareSafe,
  type PortfolioSnapshot,
  watchOrderLifecycle,
} from "../src/lib.js";

describe("safety edge cases", () => {
  it("removes abort listeners after completed order polling delays", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const resultPromise = watchOrderLifecycle({
        id: "order-cleanup",
        poll: async () => ({ state: "queued" }),
        intervalMs: 100,
        timeoutMs: 250,
        signal: controller.signal,
      });

      await vi.advanceTimersByTimeAsync(400);
      await expect(resultPromise).resolves.toMatchObject({
        state: "confirmed",
        outcomeKnown: true,
        retrySafe: false,
      });
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves missing snapshot values instead of coercing them to zero", () => {
    const before: PortfolioSnapshot = {
      version: 2,
      id: "before",
      capturedAt: "2026-08-22T00:00:00Z",
      source: "portfolio",
      data: {
        totals: { equityUsd: 100, dayChangeUsd: 5, afterHoursChangeUsd: 1 },
        byPosition: [
          {
            accountNumber: "111",
            kind: "equity",
            symbol: "AAPL",
            name: "Apple",
            marketValueUsd: 100,
            dayChangeUsd: 5,
            qty: 1,
          },
        ],
      },
    };
    const after: PortfolioSnapshot = {
      version: 2,
      id: "after",
      capturedAt: "2026-08-23T00:00:00Z",
      source: "portfolio",
      data: {
        totals: { equityUsd: null, dayChangeUsd: null, afterHoursChangeUsd: 1 },
        byPosition: [
          {
            accountNumber: "111",
            kind: "equity",
            symbol: "AAPL",
            name: "Apple",
            marketValueUsd: null,
            dayChangeUsd: null,
            qty: 1,
          },
        ],
      },
    };

    const diff = diffPortfolioSnapshots(before, after);
    expect(diff.totals).toMatchObject({ equityDelta: null, dayDelta: null });
    expect(diff.positions).toEqual([
      expect.objectContaining({ valueDelta: null, dayUsdDelta: null, quantityDelta: 0 }),
    ]);
  });

  it("does not treat null option quotes as executable zero-dollar premiums", () => {
    const result = buildOptionsWorkbench({
      symbol: "AAPL",
      expiration: "2026-12-18",
      underlyingPrice: 100,
      pricingMode: "natural",
      legs: [
        {
          id: "long-call",
          action: "buy",
          type: "call",
          strike: 105,
          bid: 1.8,
          ask: null,
          mark: 2,
        },
      ],
    });

    expect(result.contract.legs[0]?.premium).toBe(2);
    expect(result.package.netPremium).toBe(-200);
  });

  it("includes a breakeven that lands exactly on the highest strike", () => {
    const result = buildOptionsWorkbench({
      symbol: "AAPL",
      expiration: "2026-12-18",
      underlyingPrice: 95,
      legs: [
        { id: "lower-call", action: "buy", type: "call", strike: 90, premium: 8 },
        { id: "upper-call", action: "buy", type: "call", strike: 100, premium: 2 },
      ],
    });

    expect(result.payoff.breakevens).toEqual([100]);
  });

  it("fully redacts credentials while only suffix-masking account identifiers", () => {
    const output = redactShareSafe({
      account_number: "123456789",
      password: "correct-horse-battery-staple",
      otp: "123456",
      apiKey: "api-secret-value",
      token: "987654321",
      deviceId: "device-secret-value",
    });

    expect(output).toEqual({
      account_number: "…6789",
      password: "[REDACTED]",
      otp: "[REDACTED]",
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      deviceId: "[REDACTED]",
    });
  });
});
