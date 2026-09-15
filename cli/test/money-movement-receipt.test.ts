import { describe, expect, it } from "vitest";
import { findBlockingMoneyMovementReceipt } from "../src/money-movement-receipt.js";

const base = {
  clientId: "client-new",
  sourceId: "source-a",
  destinationId: "destination-a",
  amountUsd: "1.00",
  kind: "withdrawal" as const,
  rail: "bank_standard" as const,
};

describe("pre-send money movement reconciliation", () => {
  it("blocks an active same-route withdrawal even when a caller generated a new client id", () => {
    const row = {
      id: "server-existing",
      ref_id: "client-old",
      direction: "push",
      transfer_type: "originated_ach",
      originating_account_id: "source-a",
      receiving_account_id: "destination-a",
      amount: "1.00",
      state: "pending",
    };
    expect(findBlockingMoneyMovementReceipt([row], base)).toMatchObject({
      serverReceiptId: "server-existing",
      reason: "active_same_route",
    });
  });

  it("allows a new intentional transfer after an older different-id transfer completed", () => {
    const row = {
      id: "server-old",
      ref_id: "client-old",
      direction: "push",
      transfer_type: "originated_ach",
      originating_account_id: "source-a",
      receiving_account_id: "destination-a",
      amount: "1.00",
      state: "completed",
    };
    expect(findBlockingMoneyMovementReceipt([row], base)).toBeUndefined();
  });

  it("blocks any durable row with the same client identity", () => {
    const row = {
      id: "server-same-client",
      ref_id: "client-new",
      direction: "push",
      transfer_type: "originated_ach",
      originating_account_id: "source-a",
      receiving_account_id: "destination-a",
      amount: "1.00",
      state: "completed",
    };
    expect(findBlockingMoneyMovementReceipt([row], base)).toMatchObject({
      serverReceiptId: "server-same-client",
      reason: "same_client_id",
    });
  });

  it("uses PaymentHub's reversed account orientation for pull deposits", () => {
    const row = {
      id: "server-deposit",
      ref_id: "client-old",
      direction: "pull",
      transfer_type: "debit_card_funding",
      originating_account_id: "destination-a",
      receiving_account_id: "source-a",
      amount: "1.00",
      state: "paused",
    };
    expect(
      findBlockingMoneyMovementReceipt([row], {
        ...base,
        kind: "deposit",
        rail: "debit_card",
      }),
    ).toMatchObject({ serverReceiptId: "server-deposit", reason: "active_same_route" });
  });
});
