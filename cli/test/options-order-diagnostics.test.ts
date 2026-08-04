import { describe, expect, it } from "vitest";
import { readOptionsOrderDiagnostics } from "../src/lib.js";

type Call = { url: string; params: Record<string, string>; query: Record<string, string> };

function deps(fixture: Record<string, unknown>, throwOn: string[] = []) {
  const calls: Call[] = [];
  const getJson = async (
    url: string,
    params: Record<string, string> = {},
    query: Record<string, string> = {},
  ) => {
    calls.push({ url, params, query });
    const key = url.includes("available_contracts")
      ? "contracts"
      : url.includes("available_shares")
        ? "shares"
        : url.includes("maximum_rollable_quantity")
          ? "rollable"
          : url.includes("has_recent_rejection")
            ? "rejection"
            : url.includes("exercise_checks")
              ? "exercise"
              : "unexpected";
    if (throwOn.includes(key)) throw new Error(`${key} unavailable`);
    if (key === "unexpected") throw new Error(`unexpected ${url}`);
    return fixture[key];
  };
  return { getJson, calls };
}

const fixture = {
  contracts: { num_of_contracts: "3" },
  shares: { num_of_shares: "125" },
  rollable: {
    available_quantity: "2",
    pending_closing_quantity: "1",
    total_quantity: "3",
  },
  rejection: { recent_rejection_exists: false },
  exercise: { exercisable_quantity: "4", corporate_action_restriction: null, extra: "retained" },
};

describe("readOptionsOrderDiagnostics", () => {
  it("uses only documented, input-gated read routes and normalizes known scalar fields", async () => {
    const d = deps(fixture);
    const result = await readOptionsOrderDiagnostics(
      {
        accountNumber: "111",
        strategyCode: "option-1_L1",
        equityInstrumentId: "equity-1",
        optionId: "option-1",
        orderToReplaceId: "order-1",
      },
      d,
    );

    expect(d.calls).toEqual([
      {
        url: "https://api.robinhood.com/options/orders/available_contracts/{account_number}/",
        params: { account_number: "111" },
        query: { strategy_code: "option-1_L1", order_to_replace_id: "order-1" },
      },
      {
        url: "https://api.robinhood.com/options/maximum_rollable_quantity/{strategy_code}/",
        params: { strategy_code: "option-1_L1" },
        query: { account_number: "111" },
      },
      {
        url: "https://api.robinhood.com/options/orders/available_shares/{account_number}/",
        params: { account_number: "111" },
        query: { equity_instrument_id: "equity-1", order_to_replace_id: "order-1" },
      },
      {
        url: "https://api.robinhood.com/options/has_recent_rejection/",
        params: {},
        query: {},
      },
      {
        url: "https://api.robinhood.com/options/exercise_checks/",
        params: {},
        query: { account_number: "111", option_id: "option-1" },
      },
    ]);
    expect(result).toMatchObject({
      accountNumber: "111",
      availableContracts: 3,
      availableShares: 125,
      rollable: {
        availableQuantity: 2,
        pendingClosingQuantity: 1,
        totalQuantity: 3,
        strategyCode: "option-1_L1",
      },
      recentRejectionExists: false,
      exerciseChecks: {
        exercisableQuantity: 4,
        corporateActionRestriction: null,
        raw: fixture.exercise,
      },
      warnings: [],
      evidence: {
        availableContracts: "observed-contract",
        availableShares: "observed-contract",
        recentRejection: "live-verified",
        exerciseChecks: "observed-contract",
        maximumRollableQuantity: "live-verified",
      },
    });
  });

  it("reports explicit not-evaluated states when prerequisite inputs are missing", async () => {
    const d = deps(fixture);
    const result = await readOptionsOrderDiagnostics({}, d);

    expect(d.calls).toEqual([
      { url: "https://api.robinhood.com/options/has_recent_rejection/", params: {}, query: {} },
    ]);
    expect(result.availableContracts).toBeUndefined();
    expect(result.availableShares).toBeUndefined();
    expect(result.rollable).toBeUndefined();
    expect(result.exerciseChecks).toBeUndefined();
    expect(result.notEvaluated).toEqual([
      {
        surface: "availableContractsAndRollableQuantity",
        reason: "accountNumber and strategyCode are required",
      },
      {
        surface: "availableShares",
        reason: "accountNumber and equityInstrumentId are required",
      },
      {
        surface: "exerciseChecks",
        reason: "accountNumber and optionId are required",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/skipp/i);
    expect(result.warnings.join(" ")).toMatch(/available contracts.*account.*strategy/i);
    expect(result.warnings.join(" ")).toMatch(/available shares.*account.*equity/i);
    expect(result.warnings.join(" ")).toMatch(/rollable.*account.*strategy/i);
    expect(result.warnings.join(" ")).toMatch(/exercise.*account.*option/i);
  });

  it("keeps independent results when a sub-read fails", async () => {
    const d = deps(fixture, ["shares", "exercise"]);
    const result = await readOptionsOrderDiagnostics(
      {
        accountNumber: "111",
        strategyCode: "option-1_L1",
        equityInstrumentId: "equity-1",
        optionId: "option-1",
      },
      d,
    );

    expect(result.availableContracts).toBe(3);
    expect(result.rollable?.availableQuantity).toBe(2);
    expect(result.recentRejectionExists).toBe(false);
    expect(result.availableShares).toBeUndefined();
    expect(result.exerciseChecks).toBeUndefined();
    expect(result.warnings.join(" ")).toMatch(
      /available shares read failed.*exercise checks read failed/i,
    );
  });
});
