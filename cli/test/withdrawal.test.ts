import { describe, expect, it } from "vitest";
import {
  buildWithdrawalInventory,
  buildNativeWithdrawalRequest,
  buildWithdrawalPlan,
  buildWithdrawalQuote,
  classifyWithdrawalReceipt,
  executeWithdrawal,
} from "../src/withdrawal.js";

const taxable = { id: "taxable-a", type: "brokerage", is_withdrawals_enabled: true };
const roth = { id: "roth-a", type: "ira_roth", is_withdrawals_enabled: true };
const bankA = {
  id: "bank-a",
  type: "bank_account",
  verified: true,
  state: "approved",
  available_payment_rails: { is_rtp_eligible: true },
};
const bankB = {
  id: "bank-b",
  type: "bank_account",
  verified: true,
  state: "approved",
  available_payment_rails: { is_rtp_eligible: false },
};
const cardA = { id: "card-a", type: "debit_card", verified: true, state: "approved" };

const limitQuote = (
  sourceAccountId: string,
  rail: "bank_standard" | "bank_instant" | "debit_card",
) => ({
  sourceAccountId,
  destinationId: "bank-a",
  rail,
  observedAt: "2026-09-11T15:00:00.000Z",
  withdrawableCashUsd: "100.00",
  eligible: true,
  fee: rail === "bank_standard" ? { known: true, usd: "0.00" } : { known: true, usd: "1.75" },
  holds: [],
  windows: [{ period: "daily" as const, amountRemainingUsd: "100.00", countRemaining: 1 }],
  provenance: "authenticated_limit_read" as const,
});

describe("withdrawal contracts", () => {
  it("builds the observed create schema without a private capture", () => {
    expect(
      buildNativeWithdrawalRequest({
        sourceId: "taxable-a",
        sourceType: "rhs",
        destinationId: "bank-a",
        destinationType: "ach",
        amountUsd: "1.00",
        rail: "bank_standard",
        idempotencyId: "fresh-client-id",
      }),
    ).toEqual({
      method: "POST",
      url: "https://bonfire.robinhood.com/transfer/create/",
      amountField: "amount",
      body: {
        id: "fresh-client-id",
        additional_data: { entry_point: 5, is_instant_transfer: false },
        amount: "1.00",
        currency: "usd",
        frequency: "once",
        source: { id: "taxable-a", type: "rhs" },
        sink: { id: "bank-a", type: "ach" },
      },
    });
  });

  it("does not guess native withdrawal types or rail semantics", () => {
    expect(() =>
      buildNativeWithdrawalRequest({
        sourceId: "taxable-a",
        sourceType: "unknown",
        destinationId: "bank-a",
        destinationType: "ach",
        amountUsd: "1.00",
        rail: "bank_standard",
      }),
    ).toThrow(/observed source type/);
    expect(() =>
      buildNativeWithdrawalRequest({
        sourceId: "taxable-a",
        sourceType: "rhs",
        destinationId: "bank-a",
        destinationType: "ach",
        amountUsd: "1.00",
        rail: "debit_card",
      }),
    ).toThrow(/observed debit_card sink type/);
    expect(() =>
      buildNativeWithdrawalRequest({
        sourceId: "roth-a",
        sourceType: "ira_roth",
        destinationId: "bank-a",
        destinationType: "ach",
        amountUsd: "0.11",
        rail: "bank_standard",
      }),
    ).toThrow(/distribution/);
  });
  it("matches the independently captured Roth-origin withdrawal create schema", () => {
    expect(
      buildNativeWithdrawalRequest({
        sourceId: "roth-a",
        sourceType: "ira_roth",
        destinationId: "bank-a",
        destinationType: "ach",
        amountUsd: "0.11",
        rail: "bank_standard",
        idempotencyId: "fresh-client-id",
        iraDistribution: {
          distributionType: "early",
          federalTaxWithholdingPercent: "0",
          stateTaxWithholdingPercent: "0",
          state: "CA",
        },
      }),
    ).toEqual({
      method: "POST",
      url: "https://bonfire.robinhood.com/transfer/create/",
      amountField: "amount",
      body: {
        id: "fresh-client-id",
        additional_data: {
          entry_point: 5,
          is_instant_transfer: false,
          ira_distribution_data: {
            distribution_type: "early",
            federal_tax_withholding_percent: "0",
            state: "CA",
            state_tax_withholding_percent: "0",
          },
        },
        amount: "0.11",
        currency: "usd",
        frequency: "once",
        source: { id: "roth-a", type: "ira_roth" },
        sink: { id: "bank-a", type: "ach" },
      },
    });
  });

  it("keeps a successful server validation separate from unknown numeric quota fields", () => {
    const quote = buildWithdrawalQuote({
      amountUsd: "1.00",
      source: { accountId: "taxable-a", accountType: "rhs", withdrawalsEnabled: true },
      destination: { id: "bank-a", rail: "bank_standard", eligible: true },
      limitQuote: {
        sourceAccountId: "taxable-a",
        destinationId: "bank-a",
        rail: "bank_standard",
        observedAt: "2026-09-11T15:00:00.000Z",
        eligible: true,
        fee: { known: true, usd: "0.00" },
        holds: [],
        windows: [],
        provenance: "authenticated_limit_read",
        validationPassed: true,
      },
      history: [],
    });
    expect(quote).toMatchObject({
      executable: true,
      validationPassed: true,
      numericLimitsKnown: false,
      gates: [],
    });
  });

  it("rejects a server validation failure even when numeric limits are unknown", () => {
    const quote = buildWithdrawalQuote({
      amountUsd: "1.00",
      source: { accountId: "taxable-a", accountType: "rhs", withdrawalsEnabled: true },
      destination: { id: "bank-a", rail: "bank_standard", eligible: true },
      limitQuote: {
        sourceAccountId: "taxable-a",
        destinationId: "bank-a",
        rail: "bank_standard",
        observedAt: "2026-09-11T15:00:00.000Z",
        eligible: true,
        fee: { known: true, usd: "0.00" },
        holds: [],
        windows: [],
        provenance: "authenticated_limit_read",
        validationPassed: false,
      },
      history: [],
    });
    expect(quote.gates).toContain("server validation rejected this withdrawal route");
  });

  it("discovers every owned withdrawal source and only observed linked bank/card rails", () => {
    const inventory = buildWithdrawalInventory(
      [taxable, roth, { id: "ach-external", type: "ach", is_withdrawals_enabled: true }],
      [bankA, bankB, cardA],
    );
    expect(inventory.sources).toEqual([
      { accountId: "taxable-a", accountType: "brokerage", withdrawalsEnabled: true },
      { accountId: "roth-a", accountType: "ira_roth", withdrawalsEnabled: true },
    ]);
    expect(inventory.destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "bank-a", rail: "bank_standard", eligible: true }),
        expect.objectContaining({ id: "bank-a", rail: "bank_instant", eligible: true }),
        expect.objectContaining({ id: "bank-b", rail: "bank_standard", eligible: true }),
        expect.objectContaining({ id: "card-a", rail: "debit_card", eligible: true }),
      ]),
    );
    expect(inventory.destinations).not.toContainEqual(
      expect.objectContaining({ id: "unobserved" }),
    );
  });

  it("binds cash, quota, fee, source, rail, destination, and amount without cross-route aggregation", () => {
    const input = {
      amountUsd: "100.00",
      source: { accountId: "taxable-a", accountType: "brokerage", withdrawalsEnabled: true },
      destination: { id: "bank-a", rail: "bank_standard" as const, eligible: true },
      limitQuote: limitQuote("taxable-a", "bank_standard"),
      history: [],
    };
    expect(buildWithdrawalQuote(input)).toMatchObject({ executable: true, gates: [] });
    expect(
      buildWithdrawalQuote({
        ...input,
        limitQuote: {
          ...limitQuote("taxable-a", "bank_standard"),
          fee: { known: true, usd: "0.01" },
        },
      }).gates,
    ).toContain("standard bank withdrawal fee is not zero; parent approval is required");
    expect(
      buildWithdrawalQuote({
        ...input,
        limitQuote: { ...limitQuote("taxable-a", "bank_standard"), fee: { known: false } },
      }).gates,
    ).toContain("standard bank withdrawal fee is not explicitly confirmed as zero");
    expect(
      buildWithdrawalQuote({
        ...input,
        destination: { id: "card-a", rail: "debit_card", eligible: true },
      }).gates,
    ).toContain("limit quote does not bind this source × rail × destination");
    expect(buildWithdrawalQuote({ ...input, amountUsd: "100.01" }).gates).toContain(
      "withdrawable cash is below withdrawal amount",
    );
  });

  it("requires explicit retirement eligibility rather than blanket-blocking retirement sources", () => {
    const input = {
      amountUsd: "1.00",
      source: { accountId: "roth-a", accountType: "ira_roth", withdrawalsEnabled: true },
      destination: { id: "bank-a", rail: "bank_standard" as const, eligible: true },
      limitQuote: limitQuote("roth-a", "bank_standard"),
      history: [],
    };
    expect(buildWithdrawalQuote(input).gates).toContain(
      "retirement withdrawal eligibility is not verified",
    );
    expect(
      buildWithdrawalQuote({ ...input, retirement: { eligibilityVerified: true } }).executable,
    ).toBe(true);
  });

  it("rejects duplicates, exhausted count windows, unknown fee, and missing exact write capture", () => {
    const input = {
      amountUsd: "10.00",
      source: { accountId: "taxable-a", accountType: "brokerage", withdrawalsEnabled: true },
      destination: { id: "bank-a", rail: "bank_instant" as const, eligible: true },
      limitQuote: {
        ...limitQuote("taxable-a", "bank_instant"),
        windows: [{ period: "daily" as const, countRemaining: 0 }],
      },
      history: [
        {
          amountUsd: "10.00",
          sourceAccountId: "taxable-a",
          destinationId: "bank-a",
          rail: "bank_instant" as const,
          state: "pending",
        },
      ],
    };
    expect(buildWithdrawalQuote(input).gates).toEqual(
      expect.arrayContaining([
        "daily transfer count remaining is exhausted",
        "matching withdrawal is already pending or completed",
      ]),
    );
    expect(
      buildWithdrawalPlan({ ...input, limitQuote: limitQuote("taxable-a", "bank_instant") }).gates,
    ).toContain("exact withdrawal write contract has not been captured");
  });

  it("marks a missing response transport-ambiguous so callers must read status before any retry", () => {
    expect(classifyWithdrawalReceipt()).toMatchObject({
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
    });
    expect(classifyWithdrawalReceipt({ status: 201, body: { id: "synthetic" } })).toMatchObject({
      submitted: true,
      receiptStatus: "accepted",
    });
  });

  it("binds the approved amount into one captured request and never retries an ambiguous transport", async () => {
    const plan = buildWithdrawalPlan({
      amountUsd: "25.00",
      source: { accountId: "taxable-a", accountType: "brokerage", withdrawalsEnabled: true },
      destination: { id: "bank-a", rail: "bank_standard", eligible: true },
      limitQuote: limitQuote("taxable-a", "bank_standard"),
      history: [],
      capturedRequest: {
        method: "POST",
        url: "https://api.robinhood.com/captured-withdrawal/",
        body: { amount: "placeholder", relationship: "bank-a" },
        amountField: "amount",
      },
    });
    const sent: unknown[] = [];
    await expect(
      executeWithdrawal(plan, async (request) => {
        sent.push(request);
        throw new Error("socket closed");
      }),
    ).resolves.toMatchObject({ ambiguous: true, submitted: false });
    expect(sent).toEqual([
      {
        method: "POST",
        url: "https://api.robinhood.com/captured-withdrawal/",
        body: { amount: "25.00", relationship: "bank-a" },
        amountField: "amount",
      },
    ]);
  });
});
