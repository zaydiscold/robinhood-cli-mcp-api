import { randomUUID } from "node:crypto";
import type { BoundDepositContract } from "./deposit-contract-loader.js";

/** Observed WireBrowser transfer/create builder (App module 258271), 2026-09-11.
 * A source/destination account identifier is not a display-list id such as rhs-123.
 * Generic entry-point metadata applies to taxable accounts too; IRA data does not.
 */
export function buildNativeBankDeposit(input: {
  method?: "bank_standard" | "bank_instant" | "debit_card";
  radarSessionId?: string;
  sourceId: string;
  destinationId: string;
  destinationType: string;
  amountUsd: string;
  contributionYear?: number;
  idempotencyId?: string;
}): BoundDepositContract {
  if (!/^\d+(?:\.\d{1,2})?$/.test(input.amountUsd) || Number(input.amountUsd) <= 0)
    throw new Error("Positive USD amount required");
  if (!input.sourceId || !input.destinationId) throw new Error("Source and destination required");
  const retirement = ["ira", "ira_roth", "ira_traditional"].includes(input.destinationType);
  if (
    retirement &&
    (!Number.isInteger(input.contributionYear) ||
      input.contributionYear! < 2000 ||
      input.contributionYear! > 3000)
  )
    throw new Error("Retirement contribution year must be explicit");
  if (!retirement && input.contributionYear !== undefined)
    throw new Error("Contribution year does not apply to taxable deposits");
  const id = input.idempotencyId ?? randomUUID();
  const body = {
    id,
    additional_data: {
      entry_point: retirement ? 0 : 5,
      ...(input.radarSessionId ? { radar_session_id: input.radarSessionId } : {}),
      ...(retirement
        ? {
            ira_contribution_data: {
              contribution_type: "contribution",
              tax_year: input.contributionYear,
            },
          }
        : {}),
    },
    amount: input.amountUsd,
    currency: "usd",
    frequency: "once",
    sink: { id: input.destinationId, type: input.destinationType },
    source: { id: input.sourceId, type: input.method === "debit_card" ? "dcf" : "ach" },
  };
  return {
    method: input.method ?? "bank_standard",
    sourceId: input.sourceId,
    destinationId: input.destinationId,
    destinationType: input.destinationType,
    amountUsd: input.amountUsd,
    idempotencyId: id,
    steps: [
      { url: "https://bonfire.robinhood.com/transfer/pre_create/", body },
      { url: "https://bonfire.robinhood.com/transfer/create/", body: structuredClone(body) },
    ],
  };
}
