import type { MovementKind } from "./money-movement-quote.js";
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
