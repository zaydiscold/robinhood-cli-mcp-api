import { describe, expect, it } from "vitest";
import { readAccountPulse } from "../src/lib.js";

const accounts = {
  results: [
    { type: "rhs", account_number: "11112222", account_name: "Taxable" },
    { type: "ira_roth", account_number: "33334444", account_name: "Roth" },
    { type: "external", account_number: "99990000", account_name: "External" },
  ],
};

function makeDeps(failRecentFor?: string) {
  const calls: Array<{ url: string; params: Record<string, string>; query: Record<string, string> }> = [];
  const getJson = async (
    url: string,
    params: Record<string, string> = {},
    query: Record<string, string> = {},
  ): Promise<unknown> => {
    calls.push({ url, params, query });
    if (url.includes("transfer/accounts")) return accounts;
    if (url.includes("options_buying_power")) return { amount: params.account_number === "11112222" ? "10" : "20" };
    if (url.endsWith("/options/option_settings/{account_number}/")) {
      return { trading_on_expiration_state: "enabled" };
    }
    if (url.includes("wormhole/bw/orders/recent")) {
      if (query.accountNumber === failRecentFor) throw new Error("recent endpoint unavailable");
      return { results: [{ id: `order-${query.accountNumber}` }], failedAssetTypes: [] };
    }
    if (url.endsWith("/ceres/v1/accounts")) {
      return query.rhsAccountNumber === "11112222"
        ? { results: [{ id: "ceres-1", rhsAccountNumber: "11112222", accountType: "FUTURES" }] }
        : { results: [] };
    }
    if (url.includes("aggregated_positions")) return { results: [{ assetType: "FUTURE" }] };
    if (url.includes("pnl_cost_basis")) return { contractToInfo: { c1: { direction: "LONG" } } };
    throw new Error(`unexpected ${url}`);
  };
  return { calls, getJson };
}

describe("readAccountPulse", () => {
  it("scopes universal reads per owned account and includes optional Ceres futures diagnostics", async () => {
    const { calls, getJson } = makeDeps();
    const out = await readAccountPulse({}, { getJson: getJson as never });

    expect(out.accounts).toHaveLength(2);
    expect(out.accounts.map((x) => x.accountLast4)).toEqual(["2222", "4444"]);
    expect(out.accounts[0]).toMatchObject({
      label: "Taxable",
      optionsBuyingPower: { amount: "10" },
      recentOrderCount: 1,
      recentFailedAssetTypes: [],
      optionSettings: {
        tradingOnExpirationState: "enabled",
        tradingOnExpirationEnabled: undefined,
        shortSharesOnOptionEventsEnabled: undefined,
        defaultPrice: undefined,
      },
      futures: { accountTypes: ["FUTURES"], aggregatedPositionCount: 1, costBasisContractCount: 1 },
      warnings: [],
    });
    expect(out.accounts[1].futures).toBeUndefined();

    const recentCalls = calls.filter((x) => x.url.includes("wormhole/bw/orders/recent"));
    expect(recentCalls.map((x) => x.query)).toEqual([
      { accountNumber: "11112222" },
      { accountNumber: "33334444" },
    ]);
    const settingsCalls = calls.filter((x) => x.url.includes("option_settings"));
    expect(settingsCalls.map((x) => x.params.account_number)).toEqual(["11112222", "33334444"]);
  });

  it("degrades one failed surface without dropping the account", async () => {
    const { getJson } = makeDeps("33334444");
    const out = await readAccountPulse({ accountNumber: "33334444" }, { getJson: getJson as never });

    expect(out.accounts).toHaveLength(1);
    expect(out.accounts[0].accountLast4).toBe("4444");
    expect(out.accounts[0].recentOrderCount).toBeUndefined();
    expect(out.accounts[0].warnings).toEqual(["recent orders unavailable"]);
  });

  it("rejects an account outside the owned trading graph", async () => {
    const { getJson } = makeDeps();
    await expect(readAccountPulse({ accountNumber: "55556666" }, { getJson: getJson as never })).rejects.toThrow(
      /not one of your trading accounts/,
    );
  });
});
