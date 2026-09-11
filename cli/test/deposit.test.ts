import { describe, expect, it } from "vitest";
import {
  buildDepositInventory,
  buildDepositPlan,
  buildDepositQuote,
  classifyDepositReceipt,
  correlateUnifiedDepositReceipts,
} from "../src/deposit.js";

const bankA = {
  id: "bank-a",
  verified: true,
  state: "approved",
  available_payment_rails: { is_rtp_eligible: true, is_rfp_eligible: true },
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
const limitQuote = (
  sourceId: string,
  method: "bank_standard" | "bank_instant" | "debit_card",
  destinationAccountId: string,
) => ({
  sourceId,
  method,
  destinationAccountId,
  observedAt: "2026-09-11T15:00:00.000Z",
  eligible: true,
  fee: { known: true, usd: "0.00" },
  holds: [],
  windows: [{ period: "per_transfer" as const, amountRemainingUsd: "100.00", countRemaining: 1 }],
  provenance: "authenticated_limit_read" as const,
});

describe("generic deposit contracts", () => {
  it("discovers every eligible owned destination and observed funding source without imposing Roth selection", () => {
    const inventory = buildDepositInventory(
      [taxable, roth, traditionalIra],
      [bankA, bankB, debitA],
    );
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
      limitQuote: limitQuote("bank-b", "bank_standard", "taxable-a"),
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
    const taxableDestination = {
      accountId: taxable.id,
      accountType: taxable.type,
      depositEnabled: true,
    };
    const rothDestination = { accountId: roth.id, accountType: roth.type, depositEnabled: true };
    expect(
      buildDepositQuote({
        ...base,
        destination: taxableDestination,
        limitQuote: limitQuote("bank-a", "bank_instant", taxable.id),
      }).executable,
    ).toBe(true);
    expect(buildDepositQuote({ ...base, destination: rothDestination }).gates).toContain(
      "retirement contribution eligibility is not verified",
    );
    expect(
      buildDepositQuote({
        ...base,
        destination: rothDestination,
        limitQuote: limitQuote("bank-a", "bank_instant", roth.id),
        retirement: {
          contributionYear: 2026,
          contributionRoomUsd: "1.00",
          eligibilityVerified: true,
        },
      }).executable,
    ).toBe(true);
  });

  it("plans captured writes and refuses absent write contracts without globally blocking eligible deposits", () => {
    const input = {
      amountUsd: "1.00",
      destination: { accountId: "ira-a", accountType: "ira", depositEnabled: true },
      source: { id: "debit-a", method: "debit_card" as const, eligible: true },
      fee: { known: true, usd: "0.00" },
      limitQuote: limitQuote("debit-a", "debit_card", "ira-a"),
      retirement: {
        contributionYear: 2026,
        contributionRoomUsd: "1.00",
        eligibilityVerified: true,
      },
      history: [],
    };
    expect(buildDepositPlan(input).executable).toBe(false);
    expect(buildDepositPlan(input).gates).toContain(
      "exact deposit write contract has not been captured",
    );
    expect(buildDepositPlan({ ...input, capturedRequest: request })).toMatchObject({
      executable: true,
      request,
      destination: { accountType: "ira" },
      sourceId: "debit-a",
    });
  });

  it("binds dynamic limits and fees to each source × rail × destination without aggregating unrelated sources", () => {
    const base = {
      amountUsd: "10.00",
      destination: { accountId: "taxable-a", accountType: "brokerage", depositEnabled: true },
      source: { id: "bank-a", method: "bank_standard" as const, eligible: true },
      fee: { known: true, usd: "0.00" },
      history: [],
    };
    const bankATaxable = limitQuote("bank-a", "bank_standard", "taxable-a");
    const cardATaxable = {
      ...limitQuote("card-a", "debit_card", "taxable-a"),
      fee: { known: true, usd: "0.25" },
    };
    const bankBRoth = {
      ...limitQuote("bank-b", "bank_instant", "roth-a"),
      windows: [
        {
          period: "daily" as const,
          amountRemainingUsd: "9.99",
          countRemaining: 0,
          windowEndsAt: "2026-09-12T04:00:00.000Z",
        },
      ],
    };
    expect(buildDepositQuote({ ...base, limitQuote: bankATaxable }).executable).toBe(true);
    expect(
      buildDepositQuote({
        ...base,
        source: { id: "card-a", method: "debit_card", eligible: true },
        limitQuote: cardATaxable,
      }).gates,
    ).toContain("limit quote fee is unknown or non-zero; no fee is authorized");
    expect(
      buildDepositQuote({
        ...base,
        source: { id: "bank-b", method: "bank_instant", eligible: true },
        destination: { accountId: "roth-a", accountType: "ira_roth", depositEnabled: true },
        retirement: {
          contributionYear: 2026,
          contributionRoomUsd: "10.00",
          eligibilityVerified: true,
        },
        limitQuote: bankBRoth,
      }).gates,
    ).toEqual(
      expect.arrayContaining([
        "daily amount remaining is below deposit amount",
        "daily transfer count remaining is exhausted",
      ]),
    );
    expect(
      buildDepositQuote({
        ...base,
        source: { id: "card-b", method: "debit_card", eligible: true },
        limitQuote: bankATaxable,
      }).gates,
    ).toContain("limit quote does not bind this source × rail × destination");
  });

  it("rejects missing authenticated limit reads and invalid captured non-POST contracts", () => {
    const input = {
      amountUsd: "1.00",
      destination: { accountId: "taxable-a", accountType: "brokerage", depositEnabled: true },
      source: { id: "bank-a", method: "bank_standard" as const, eligible: true },
      fee: { known: true, usd: "0.00" },
      history: [],
    };
    expect(buildDepositQuote(input).gates).toContain(
      "source × rail × destination authenticated limit quote is missing",
    );
    expect(
      buildDepositPlan({
        ...input,
        limitQuote: limitQuote("bank-a", "bank_standard", "taxable-a"),
        capturedRequest: { ...request, method: "PUT" as never },
      }).gates,
    ).toContain("captured deposit write contract is incomplete");
  });

  it("correlates unified history by its observed reversed account fields and never source_id", () => {
    const receipts = correlateUnifiedDepositReceipts([
      {
        id: "server-receipt",
        transfer_type: "originated_ach",
        amount: "1.00",
        originating_account_id: "destination-a",
        receiving_account_id: "source-a",
        source_id: null,
        state: "pending",
        service_fee: "0.00",
      },
    ], { sourceId: "source-a", destinationId: "destination-a", amountUsd: "1.00", method: "bank_standard" });
    expect(receipts).toEqual([{
      serverReceiptId: "server-receipt",
      state: "pending",
      transferType: "originated_ach",
      serviceFeeUsd: "0.00",
    }]);
  });

  it("keeps receipt status generic and marks transport uncertainty ambiguous", () => {
    expect(
      classifyDepositReceipt({ status: 201, body: { id: "synthetic-receipt" } }),
    ).toMatchObject({
      submitted: true,
      receiptStatus: "accepted",
    });
    expect(classifyDepositReceipt()).toMatchObject({
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
    });
  });
});
