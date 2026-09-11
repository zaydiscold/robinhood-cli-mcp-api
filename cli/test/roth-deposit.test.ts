import { describe, expect, it } from "vitest";
import { buildRothDepositPlan, executeRothDeposit } from "../src/roth-deposit.js";

const eligible = {
  year: 2026,
  contributionRoomUsd: "10.00",
  eligibilityVerified: true,
  destination: { accountId: "roth-id", accountType: "ira_roth", depositEnabled: true },
  source: { id: "bank-1", method: "bank_instant" as const, eligible: true },
  fee: { known: true, usd: "0.00" },
  history: [],
};

describe("Roth $1 deposit planner", () => {
  it("creates a one-dollar plan only with verified eligibility, room, source and zero fee", () => {
    expect(buildRothDepositPlan(eligible)).toMatchObject({
      executable: true,
      amountUsd: "1.00",
      method: "bank_instant",
      destination: { accountType: "ira_roth" },
    });
  });

  it("blocks a duplicate before transport and never retries an ambiguous submission", async () => {
    const plan = buildRothDepositPlan({
      ...eligible,
      history: [{ amountUsd: "1.00", method: "bank_instant", destinationAccountId: "roth-id", state: "pending" }],
    });
    expect(plan.executable).toBe(false);
    expect(plan.gates).toContain("matching $1 deposit is already pending or completed");
    let calls = 0;
    await expect(executeRothDeposit(plan, async () => { calls++; throw new Error("timeout"); })).rejects.toThrow(/not executable/);
    expect(calls).toBe(0);
  });

  it("refuses an unknown fee or insufficient room without imposing a method-count cap", () => {
    expect(buildRothDepositPlan({ ...eligible, fee: { known: false } }).executable).toBe(false);
    expect(buildRothDepositPlan({ ...eligible, contributionRoomUsd: "0.99" }).executable).toBe(false);
    expect(buildRothDepositPlan({ ...eligible, source: { id: "bank-2", method: "wire" as const, eligible: true } }).executable).toBe(true);
  });
});
