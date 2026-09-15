import { describe, expect, it } from "vitest";
import {
  buildInternalTransferInventory,
  buildInternalTransferPlan,
  buildInternalTransferQuote,
  classifyInternalTransferReceipt,
  executeInternalTransfer,
  findCurrentInternalTransferReceipt,
} from "../src/internal-transfer.js";

const taxable = {
  accountId: "taxable-a",
  accountType: "rhs_account",
  owned: true,
  transferEnabled: true,
  withdrawableCashUsd: "25.00",
};
const roth = {
  accountId: "roth-a",
  accountType: "ira_roth",
  owned: true,
  transferEnabled: true,
};

const routeQuote = {
  sourceAccountId: taxable.accountId,
  destinationAccountId: roth.accountId,
  observedAt: "2026-09-11T15:00:00.000Z",
  eligible: true,
  fee: { known: true, usd: "0.00" },
  holds: [],
  limits: [{ period: "per_transfer" as const, amountRemainingUsd: "25.00", countRemaining: 1 }],
  provenance: "authenticated_transfer_limit_read" as const,
};

const capturedRequest = {
  method: "POST" as const,
  url: "https://bonfire.robinhood.com/paymenthub/unified_transfers/",
  body: {
    currency: "USD",
    direction: "outbound",
    originating_account_type: "rhs_account",
    receiving_account_type: "ira_roth",
    transfer_type: "internal",
  },
  amountField: "amount",
  sourceAccountField: "originating_account_id",
  destinationAccountField: "receiving_account_id",
};

describe("internal account-to-account transfer contracts", () => {
  it("discovers only owned, transfer-enabled accounts without treating a bank rail as an internal source", () => {
    expect(
      buildInternalTransferInventory([
        { id: "taxable-a", type: "rhs_account", is_transfer_enabled: true, withdrawable_cash: "25.00" },
        { id: "roth-a", type: "ira_roth", is_transfer_enabled: true },
        { id: "other", type: "rhs_account", is_transfer_enabled: true, is_owned: false },
      ]),
    ).toEqual({ accounts: [taxable, roth] });
  });

  it("quotes an owned taxable-to-Roth contribution only with a bound live zero-fee limit observation", () => {
    const quote = buildInternalTransferQuote({
      amountUsd: "1.00",
      source: taxable,
      destination: roth,
      fee: { known: true, usd: "0.00" },
      limitQuote: routeQuote,
      contribution: { contributionYear: 2026, contributionRoomUsd: "1.00", eligibilityVerified: true },
      history: [],
      idempotencyKey: "test-transfer-001",
    });
    expect(quote).toMatchObject({ executable: true, gates: [], transferKind: "contribution" });
  });

  it("requires contribution fields only when the destination is retirement and requires route-specific eligibility for retirement sources", () => {
    const base = {
      amountUsd: "1.00",
      source: taxable,
      destination: { ...taxable, accountId: "taxable-b" },
      fee: { known: true, usd: "0.00" },
      limitQuote: { ...routeQuote, destinationAccountId: "taxable-b" },
      history: [],
      idempotencyKey: "test-transfer-002",
    };
    expect(buildInternalTransferQuote(base)).toMatchObject({ executable: true, transferKind: "cash" });
    expect(
      buildInternalTransferQuote({ ...base, destination: roth, limitQuote: routeQuote }).gates,
    ).toContain("retirement contribution eligibility is not verified");
    expect(
      buildInternalTransferQuote({
        ...base,
        source: roth,
        destination: taxable,
        limitQuote: { ...routeQuote, sourceAccountId: roth.accountId, destinationAccountId: taxable.accountId },
      }).gates,
    ).toContain("retirement-originating transfer eligibility is not verified; do not infer a distribution or rollover");
  });

  it("binds limits, fees, withdrawal cash, and idempotency to the exact source-destination pair", () => {
    const input = {
      amountUsd: "10.00",
      source: taxable,
      destination: { ...taxable, accountId: "taxable-b" },
      fee: { known: true, usd: "0.00" },
      limitQuote: { ...routeQuote, destinationAccountId: "taxable-b" },
      history: [],
      idempotencyKey: "test-transfer-003",
    };
    expect(buildInternalTransferQuote(input).executable).toBe(true);
    expect(
      buildInternalTransferQuote({ ...input, amountUsd: "25.01" }).gates,
    ).toContain("source withdrawable cash is below transfer amount");
    expect(
      buildInternalTransferQuote({ ...input, fee: { known: true, usd: "0.01" } }).gates,
    ).toContain("fee is unknown or non-zero; no fee is authorized");
    expect(
      buildInternalTransferQuote({
        ...input,
        limitQuote: { ...routeQuote, sourceAccountId: "different-source" },
      }).gates,
    ).toContain("limit quote does not bind this owned source → destination pair");
    expect(
      buildInternalTransferQuote({
        ...input,
        history: [{ idempotencyKey: "test-transfer-003", state: "pending" }],
      }).gates,
    ).toContain("matching idempotency key is already pending or completed");
  });

  it("builds an exact captured request without inventing account types or a retry contract", () => {
    const input = {
      amountUsd: "1.00",
      source: taxable,
      destination: roth,
      fee: { known: true, usd: "0.00" },
      limitQuote: routeQuote,
      contribution: { contributionYear: 2026, contributionRoomUsd: "1.00", eligibilityVerified: true },
      history: [],
      idempotencyKey: "test-transfer-004",
    };
    expect(buildInternalTransferPlan(input).gates).toContain(
      "exact internal-transfer write contract has not been captured",
    );
    expect(buildInternalTransferPlan({ ...input, capturedRequest })).toMatchObject({
      executable: true,
      request: capturedRequest,
      idempotencyKey: "test-transfer-004",
    });
  });

  it("requires reconciliation for every receipt and marks missing transport evidence ambiguous", () => {
    expect(classifyInternalTransferReceipt({ status: 201, body: { id: "synthetic" } })).toMatchObject({
      submitted: true,
      receiptStatus: "accepted_pending_readback",
      requiresReadback: true,
    });
    expect(classifyInternalTransferReceipt()).toMatchObject({
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
    });
  });

  it("submits the captured body only once and reconciles by the server transfer id, never an old lookalike", async () => {
    const plan = buildInternalTransferPlan({
      amountUsd: "1.00", source: taxable, destination: roth, fee: { known: true, usd: "0.00" },
      limitQuote: routeQuote, contribution: { contributionYear: 2026, contributionRoomUsd: "1.00", eligibilityVerified: true },
      history: [], idempotencyKey: "test-transfer-005", capturedRequest,
    });
    const receipt = await executeInternalTransfer(plan, async (request) => {
      expect(request.body).toMatchObject({ amount: "1.00", originating_account_id: "taxable-a", receiving_account_id: "roth-a" });
      return { status: 201, body: { id: "server-new" } };
    });
    expect(receipt).toMatchObject({ receiptStatus: "accepted_pending_readback", requiresReadback: true });
    expect(findCurrentInternalTransferReceipt({ serverId: "server-new", idempotencyKey: "test-transfer-005" }, [
      { id: "old", idempotency_key: "test-transfer-005", state: "completed" },
      { id: "server-new", idempotency_key: "test-transfer-005", state: "pending" },
    ])).toMatchObject({ id: "server-new", state: "pending" });
  });
});
