import { describe, expect, it } from "vitest";
import {
  buildDepositInventory,
  buildDepositPlan,
  buildDepositQuote,
  classifyDepositReceipt,
} from "../src/deposit.js";

const bankA = {
  id: "bank-a",
  verified: true,
  state: "approved",
  available_payment_rails: { is_rtp_eligible: true },
};
const bankB = {
  id: "bank-b",
  verified: true,
  state: "approved",
  available_payment_rails: { is_rtp_eligible: false },
};
const debitA = { id: "debit-a", type: "debit_card", verified: true, state: "approved" };

const taxable = { id: "taxable-a", type: "brokerage", is_deposits_enabled: true };
const roth = { id: "roth-a", type: "ira_roth", is_deposits_enabled: true };
const traditionalIra = { id: "ira-a", type: "ira", is_deposits_enabled: true };

const request = {
  method: "POST" as const,
  url: "https://api.robinhood.com/ach/transfers/",
  body: { direction: "deposit", relationship: "placeholder" },
  amountField: "amount",
};

describe("generic deposit contracts", () => {
  it("discovers every eligible owned destination and observed funding source without imposing Roth selection", () => {
    const inventory = buildDepositInventory([taxable, roth, traditionalIra], [bankA, bankB, debitA]);
    expect(inventory.destinations).toEqual([
      { accountId: "taxable-a", accountType: "brokerage", depositEnabled: true },
      { accountId: "roth-a", accountType: "ira_roth", depositEnabled: true },
      { accountId: "ira-a", accountType: "ira", depositEnabled: true },
    ]);
    expect(inventory.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "bank-a", method: "bank_standard", eligible: true }),
        expect.objectContaining({ id: "bank-a", method: "bank_instant", eligible: true }),
        expect.objectContaining({ id: "bank-b", method: "bank_standard", eligible: true }),
        expect.objectContaining({ id: "debit-a", method: "debit_card", eligible: true }),
      ]),
    );
    expect(inventory.sources).not.toContainEqual(expect.objectContaining({ id: "unobserved" }));
  });

  it("quotes a requested bank-to-taxable deposit without retirement gates", () => {
    const quote = buildDepositQuote({
      amountUsd: "25.00",
      destination: { accountId: "taxable-a", accountType: "brokerage", depositEnabled: true },
      source: { id: "bank-b", method: "bank_standard", eligible: true },
      fee: { known: true, usd: "0.00" },
      history: [],
    });
    expect(quote).toMatchObject({ executable: true, amountUsd: "25.00", gates: [] });
  });

  it("requires retirement contribution fields only for retirement destinations", () => {
    const base = {
      amountUsd: "1.00",
      source: { id: "bank-a", method: "bank_instant" as const, eligible: true },
      fee: { known: true, usd: "0.00" },
      history: [],
    };
    const taxableDestination = { accountId: taxable.id, accountType: taxable.type, depositEnabled: true };
    const rothDestination = { accountId: roth.id, accountType: roth.type, depositEnabled: true };
    expect(buildDepositQuote({ ...base, destination: taxableDestination }).executable).toBe(true);
    expect(buildDepositQuote({ ...base, destination: rothDestination }).gates).toContain(
      "retirement contribution eligibility is not verified",
    );
    expect(
      buildDepositQuote({
        ...base,
        destination: rothDestination,
        retirement: { contributionYear: 2026, contributionRoomUsd: "1.00", eligibilityVerified: true },
      }).executable,
    ).toBe(true);
  });

  it("plans captured writes and refuses absent write contracts without globally blocking eligible deposits", () => {
    const input = {
      amountUsd: "1.00",
      destination: { accountId: "ira-a", accountType: "ira", depositEnabled: true },
      source: { id: "debit-a", method: "debit_card" as const, eligible: true },
      fee: { known: true, usd: "0.00" },
      retirement: { contributionYear: 2026, contributionRoomUsd: "1.00", eligibilityVerified: true },
      history: [],
    };
    expect(buildDepositPlan(input).executable).toBe(false);
    expect(buildDepositPlan(input).gates).toContain("exact deposit write contract has not been captured");
    expect(buildDepositPlan({ ...input, capturedRequest: request })).toMatchObject({
      executable: true,
      request,
      destination: { accountType: "ira" },
      sourceId: "debit-a",
    });
  });

  it("keeps receipt status generic and marks transport uncertainty ambiguous", () => {
    expect(classifyDepositReceipt({ status: 201, body: { id: "synthetic-receipt" } })).toMatchObject({
      submitted: true,
      receiptStatus: "accepted",
    });
    expect(classifyDepositReceipt()).toMatchObject({ ambiguous: true, receiptStatus: "transport_ambiguous" });
  });
});
