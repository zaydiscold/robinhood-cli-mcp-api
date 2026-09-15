import type { MovementKind } from "./money-movement-quote.js";
import type { WithdrawalRail } from "./withdrawal.js";

export interface MoneyMovementPreflightIdentity {
  clientId: string;
  sourceId: string;
  destinationId: string;
  amountUsd: string;
  kind: MovementKind;
  rail?: WithdrawalRail;
}

export interface BlockingMoneyMovementReceipt {
  serverReceiptId: string;
  state: string;
  reason: "same_client_id" | "active_same_route";
}

const transferTypes = (kind: MovementKind, rail?: WithdrawalRail): string[] => {
  if (kind === "internal") return ["internal", "inter_entity"];
  if (rail === "bank_instant") return ["instant_bank_transfer"];
  if (rail === "debit_card") return ["debit_card_funding"];
  return ["originated_ach"];
};

const activeTransferState = (state: unknown): boolean =>
  /^(new|ready|pending|paused|queued|submitted|processed)$/i.test(String(state ?? ""));

/**
 * PaymentHub reports pull-deposit account orientation opposite the request body.
 * A reused client id always blocks. A different-id completed transfer does not block a new,
 * intentional transfer, while an active same-route row does.
 */
export function findBlockingMoneyMovementReceipt(
  rows: Record<string, unknown>[],
  input: MoneyMovementPreflightIdentity,
): BlockingMoneyMovementReceipt | undefined {
  const expectedDirection = input.kind === "deposit" ? "pull" : "push";
  const types = transferTypes(input.kind, input.rail);
  for (const row of rows) {
    if (typeof row.id !== "string") continue;
    if (row.ref_id === input.clientId)
      return {
        serverReceiptId: row.id,
        state: String(row.state ?? "unknown"),
        reason: "same_client_id",
      };
    const rowSource =
      input.kind === "deposit" ? row.receiving_account_id : row.originating_account_id;
    const rowDestination =
      input.kind === "deposit" ? row.originating_account_id : row.receiving_account_id;
    if (
      row.direction === expectedDirection &&
      types.includes(String(row.transfer_type)) &&
      String(rowSource) === input.sourceId &&
      String(rowDestination) === input.destinationId &&
      Number(row.amount) === Number(input.amountUsd) &&
      activeTransferState(row.state)
    )
      return {
        serverReceiptId: row.id,
        state: String(row.state),
        reason: "active_same_route",
      };
  }
  return undefined;
}

export async function reconcileBeforeMoneyMovement(input: MoneyMovementPreflightIdentity) {
  const { brokerageGetAllResults } = await import("./lib.js");
  const rows = await brokerageGetAllResults(
    "https://bonfire.robinhood.com/paymenthub/unified_transfers/",
    {},
    { page_size: "100" },
  );
  return findBlockingMoneyMovementReceipt(rows, input);
}

export function matchMoneyMovementReceipt(
  rows: Record<string, unknown>[],
  input: {
    serverReceiptId: string;
    sourceId: string;
    destinationId: string;
    amountUsd: string;
    kind: MovementKind;
  },
) {
  const candidates = rows.filter((r) => r.id === input.serverReceiptId);
  const receipts = candidates.filter(
    (r) =>
      String(r[input.kind === "deposit" ? "receiving_account_id" : "originating_account_id"]) ===
        input.sourceId &&
      String(r[input.kind === "deposit" ? "originating_account_id" : "receiving_account_id"]) ===
        input.destinationId &&
      Number(r.amount) === Number(input.amountUsd),
  );
  return {
    checked: true,
    serverReceiptId: input.serverReceiptId,
    receiptVerified: receipts.length === 1,
    matchCount: receipts.length,
    receipts: receipts.map((r) => ({
      serverReceiptId: r.id,
      state: r.state,
      amountUsd: r.amount,
      feeUsd: r.service_fee ?? null,
      transferType: r.transfer_type,
      createdAt: r.created_at,
    })),
  };
}
export async function getMoneyMovementReceipt(input: {
  serverReceiptId: string;
  sourceId: string;
  destinationId: string;
  amountUsd: string;
  kind: MovementKind;
}) {
  if (!input.serverReceiptId) throw new Error("Exact server receipt ID required");
  const { brokerageGetAllResults } = await import("./lib.js");
  const rows = await brokerageGetAllResults(
    "https://bonfire.robinhood.com/paymenthub/unified_transfers/",
    {},
    { page_size: "100" },
  );
  return matchMoneyMovementReceipt(rows, input);
}
