import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetOwnedAccountsCache,
  assertAccountOwned,
  gatedBrokerageWrite,
  loadOwnedAccounts,
  verifyOrderEvidence,
} from "../src/lib.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  __resetOwnedAccountsCache();
});

it("keeps ownership and submission on one credential snapshot during concurrent refresh", async () => {
  vi.stubEnv("ROBINHOOD_ALLOW_LIVE_WRITE", "1");
  vi.stubEnv("ROBINHOOD_BROKERAGE_TOKEN", "synthetic-session-a");
  vi.stubEnv("ROBINHOOD_ALLOWED_ACCOUNT", "");
  const identities: string[] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    identities.push(new Headers(init?.headers).get("authorization") ?? "");
    if (init?.method === "GET") {
      vi.stubEnv("ROBINHOOD_BROKERAGE_TOKEN", "synthetic-session-b");
      return Response.json(graph("A1"));
    }
    return Response.json({ id: "synthetic-order" }, { status: 201 });
  });
  await gatedBrokerageWrite({
    url: "https://api.robinhood.com/orders/",
    method: "POST",
    accountNumber: "A1",
    body: {},
    liveWrite: true,
    executeOptions: { fetchImpl: fetchImpl as typeof fetch },
    logImpl: async () => {},
  });
  expect(identities).toEqual(["Bearer synthetic-session-a", "Bearer synthetic-session-a"]);
});
const graph = (account: string) => ({ results: [{ type: "rhs", account_number: account }] });

describe("ownership freshness", () => {
  it("expires a cached graph and never returns stale ownership after failed refresh", async () => {
    vi.useFakeTimers();
    const getJson = vi
      .fn()
      .mockResolvedValueOnce(graph("A1"))
      .mockRejectedValue(new Error("offline"));
    expect((await loadOwnedAccounts({ getJson }))?.numbers.has("A1")).toBe(true);
    vi.advanceTimersByTime(30_001);
    expect(await loadOwnedAccounts({ getJson })).toBeNull();
    await expect(assertAccountOwned("A1", { getJson, onLookupFailure: "block" })).rejects.toThrow(
      /ownership lookup failed/,
    );
  });
  it("does not reuse another session's graph", async () => {
    const getJson = vi.fn().mockResolvedValueOnce(graph("A1")).mockResolvedValueOnce(graph("B1"));
    vi.stubEnv("ROBINHOOD_BROKERAGE_TOKEN", "synthetic-session-a");
    await loadOwnedAccounts({ getJson });
    vi.stubEnv("ROBINHOOD_BROKERAGE_TOKEN", "synthetic-session-b");
    expect((await loadOwnedAccounts({ getJson }))?.numbers.has("B1")).toBe(true);
    expect(getJson).toHaveBeenCalledTimes(2);
  });
  it("refreshes when a requested account is absent", async () => {
    const getJson = vi.fn().mockResolvedValueOnce(graph("A1")).mockResolvedValueOnce(graph("B1"));
    await loadOwnedAccounts({ getJson });
    await expect(assertAccountOwned("B1", { getJson })).resolves.toBe("");
    expect(getJson).toHaveBeenCalledTimes(2);
  });
});

describe("exact order evidence", () => {
  it.each([{ id: "different", state: "filled" }, { state: "filled" }])(
    "rejects unrelated or unidentified readback",
    async (record) => {
      const result = await verifyOrderEvidence("requested", "equity", {
        getJson: async () => record,
      });
      expect(result.confirmed).toBe(false);
    },
  );
});

it.each([undefined, "OTHER_ACCOUNT"])(
  "does not confirm missing or mismatched order account: %s",
  async (account_number) => {
    const result = await verifyOrderEvidence("requested", "equity", {
      expectedAccountNumber: "EXPECTED_ACCOUNT",
      getJson: async () => ({ id: "requested", state: "filled", account_number }),
    });
    expect(result.confirmed).toBe(false);
  },
);
