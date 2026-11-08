import { describe, it, expect, vi } from "vitest";
import { readOwnedEquityPositions } from "../src/lib.js";

describe("shared complete equity inventory", () => {
  const getJson = async () => ({
    results: [
      { type: "rhs", account_number: "111111111" },
      { type: "ira_roth", account_number: "222222222" },
    ],
  });
  it("uses the complete paginated reader per account and retains account identity", async () => {
    const getAll = vi.fn(async (_url: string, _params: unknown, query: Record<string, string>) => [
      { symbol: "EXMP", quantity: "1", account_number: "wrong" },
      { symbol: "ZERO", quantity: "0" },
    ]);
    const positions = await readOwnedEquityPositions(undefined, {
      getJson: getJson as never,
      getAll: getAll as never,
    });
    expect(getAll.mock.calls.map((call) => call[2].account_number)).toEqual([
      "111111111",
      "222222222",
    ]);
    expect(positions.map((p) => p.accountLast4)).toEqual(["1111", "2222"]);
    expect(positions.map((p) => p.account_number)).toEqual(["111111111", "222222222"]);
  });
  it("does not report an empty portfolio when account discovery is unavailable", async () => {
    await expect(
      readOwnedEquityPositions(undefined, { getJson: (async () => ({})) as never }),
    ).rejects.toThrow("completeness is unknown");
  });
  it("does not silently omit a failed account", async () => {
    const getAll = async (_url: string, _params: unknown, query: Record<string, string>) => {
      if (query.account_number === "222222222") throw new Error("offline");
      return [];
    };
    await expect(
      readOwnedEquityPositions(undefined, { getJson: getJson as never, getAll: getAll as never }),
    ).rejects.toThrow("offline");
  });
});
