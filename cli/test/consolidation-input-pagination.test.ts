import { describe, expect, it, vi } from "vitest";
import { getUnifiedHistory, placeEquityOrder } from "../src/lib.js";

const accountNumber = "900000003";
const oldOrder = { id: "old", updated_at: "2020-01-01", side: "sell" };
const recentOrder = { id: "recent", updated_at: "2026-09-08", side: "sell" };

function historyRead(pages: (query: Record<string, string>) => unknown) {
  return vi.fn(async (url: string, _params: unknown, query: Record<string, string> = {}) => {
    if (url.includes("transfer/accounts"))
      return { results: [{ type: "rhs", account_number: accountNumber }] };
    if (url === "https://api.robinhood.com/orders/") return pages(query);
    return { results: [] };
  });
}

describe("history completeness", () => {
  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid maxPages %s before dependency work",
    async (maxPages) => {
      const getJson = vi.fn();
      await expect(getUnifiedHistory({ maxPages }, { getJson: getJson as never })).rejects.toThrow(
        "maxPages must be a positive integer",
      );
      expect(getJson).not.toHaveBeenCalled();
    },
  );
  it("retains recent updates after an older page without assuming ordering", async () => {
    const getJson = historyRead((query) =>
      query.cursor
        ? { results: [recentOrder], next: null }
        : { results: [oldOrder], next: "https://api.robinhood.com/orders/?cursor=two" },
    );
    const result = await getUnifiedHistory(
      { days: 3 },
      { getJson: getJson as never, now: () => Date.parse("2026-09-08T12:00:00Z") },
    );
    expect(result.map((row) => row.orderId)).toEqual(["recent"]);
  });

  it.each(["not a URL", "https://api.robinhood.com/orders/?page=2"])(
    "rejects malformed next cursor %s",
    async (next) => {
      const getJson = historyRead(() => ({ results: [recentOrder], next }));
      await expect(getUnifiedHistory({}, { getJson: getJson as never })).rejects.toThrow(
        "cursor is malformed",
      );
    },
  );

  it("fails explicitly when a later page cannot be read", async () => {
    const getJson = historyRead((query) => {
      if (query.cursor) throw new Error("offline");
      return { results: [recentOrder], next: "https://api.robinhood.com/orders/?cursor=two" };
    });
    await expect(getUnifiedHistory({}, { getJson: getJson as never })).rejects.toThrow(
      "after the first page",
    );
  });

  it("enforces an explicit finite page budget", async () => {
    const getJson = historyRead((query) => ({
      results: [],
      next: `https://api.robinhood.com/orders/?cursor=${Number(query.cursor ?? 0) + 1}`,
    }));
    await expect(getUnifiedHistory({ maxPages: 2 }, { getJson: getJson as never })).rejects.toThrow(
      "pagination limit (2 pages)",
    );
    expect(
      getJson.mock.calls.filter(([url]) => url === "https://api.robinhood.com/orders/"),
    ).toHaveLength(2);
  });
});

describe("equity numeric boundary", () => {
  const invalid = [0, -1, NaN, Infinity, -Infinity, null, "10"];
  it.each(
    invalid.flatMap((value) => [
      { amount: value },
      { shares: value },
      { shares: 1, limitPrice: value },
    ]),
  )("rejects invalid numeric input before calling dependencies: %j", async (fields) => {
    const dependency = vi.fn(() => {
      throw new Error("dependency must not run");
    });
    await expect(
      placeEquityOrder({ symbol: "AAPL", side: "buy", accountNumber, ...fields } as never, {
        getJson: dependency as never,
        write: dependency as never,
        log: dependency as never,
        getMarketSession: dependency as never,
      }),
    ).rejects.toThrow("finite and greater than zero");
    expect(dependency).not.toHaveBeenCalled();
  });

  it("rejects both fields even when one is zero", async () => {
    const getJson = vi.fn();
    await expect(
      placeEquityOrder(
        { symbol: "AAPL", side: "buy", accountNumber, amount: 0, shares: 1 },
        { getJson: getJson as never },
      ),
    ).rejects.toThrow("amount OR shares");
    expect(getJson).not.toHaveBeenCalled();
  });
});
