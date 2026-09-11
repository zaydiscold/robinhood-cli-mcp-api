import { describe, expect, it } from "vitest";
import {
  buildRothDepositPlan,
  buildRothDepositSourceInventory,
  classifyRothDepositReceipt,
  executeRothDeposit,
} from "../src/roth-deposit.js";

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
    expect(buildRothDepositPlan({ ...eligible, source: { id: "bank-2", method: "bank_standard" as const, eligible: true } }).executable).toBe(true);
  });

  it("inventories verified bank rails but makes every unobserved write contract non-executable", () => {
    const inventory = buildRothDepositSourceInventory(
      [{ id: "roth", type: "ira_roth", is_deposits_enabled: true }],
      [{ id: "bank", verified: true, state: "approved", available_payment_rails: { is_rtp_eligible: true, is_rfp_eligible: false } }],
    );
    expect(inventory.destination).toEqual({ accountId: "roth", accountType: "ira_roth", depositEnabled: true });
    expect(inventory.sources).toEqual([
      expect.objectContaining({ id: "bank", method: "bank_standard", eligible: true, requestStatus: "missing_exact_write_contract" }),
      expect.objectContaining({ id: "bank", method: "bank_instant", eligible: true, requestStatus: "missing_exact_write_contract" }),
      expect.objectContaining({ method: "debit_card", eligible: false, requestStatus: "missing_source_and_exact_write_contract" }),
    ]);
  });

  it("classifies accepted, rejected, and transport-ambiguous receipts without retries", () => {
    expect(classifyRothDepositReceipt({ status: 201, body: { id: "receipt" } })).toMatchObject({ submitted: true, ambiguous: false, receiptStatus: "accepted" });
    expect(classifyRothDepositReceipt({ status: 422, body: { detail: "invalid" } })).toMatchObject({ submitted: false, ambiguous: false, receiptStatus: "rejected" });
    expect(classifyRothDepositReceipt()).toMatchObject({ submitted: false, ambiguous: true, receiptStatus: "transport_ambiguous" });
  });
});
