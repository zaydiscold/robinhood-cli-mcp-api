/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted JSONL capture rows are narrowed before use. */
import { randomUUID } from "node:crypto";
import type { WithdrawalRail } from "./withdrawal.js";

export interface WithdrawalContract {
  context: {
    sourceId: string;
    sourceType: string;
    destinationId: string;
    destinationType: string;
    rail: WithdrawalRail;
  };
  request: {
    method: "POST";
    url: "https://bonfire.robinhood.com/transfer/create/";
    body: Record<string, unknown>;
    amountField: string;
    idempotencyField: string;
  };
}

const CREATE = "https://bonfire.robinhood.com/transfer/create/";
const money = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const knownSourceTypes = new Set(["rhs", "brokerage", "rhs_account", "ira", "ira_roth"]);
const knownDestinationTypes = new Set(["ach", "bank_account", "dcf", "debit_card"]);

/** Loads action-scoped final create requests from the operator-private JSONL capture. */
export function loadWithdrawalContractsFromJsonl(text: string): WithdrawalContract[] {
  const contracts: WithdrawalContract[] = [];
  // JSONL is newline-delimited JSON; do not use splitLines-style normalization on private captures.
  for (const line of text.split(/\r?\n/)) {
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!["decline-upsell", "final"].includes(row?.action) || !Array.isArray(row.events)) continue;
    const event = row.events.find(
      (item: any) =>
        item?.dispatch === "blocked_before_dispatch" &&
        item?.request?.method === "POST" &&
        item?.request?.url === CREATE,
    );
    let body: unknown;
    try {
      body = JSON.parse(event?.request?.postData);
    } catch {
      body = undefined;
    }
    const request = record(body);
    const source = record(request?.source);
    const sink = record(request?.sink);
    const additionalData = record(request?.additional_data);
    if (!request || !source || !sink || !additionalData) continue;
    if (typeof request.id !== "string" || typeof request.amount !== "string") continue;
    if (
      typeof source.id !== "string" ||
      typeof source.type !== "string" ||
      !knownSourceTypes.has(source.type)
    )
      continue;
    if (
      typeof sink.id !== "string" ||
      typeof sink.type !== "string" ||
      !knownDestinationTypes.has(sink.type)
    )
      continue;
    const isCard = sink.type === "dcf" || sink.type === "debit_card";
    const isRetirementSource = source.type === "ira" || source.type === "ira_roth";
    if (!isCard && !isRetirementSource && typeof additionalData.is_instant_transfer !== "boolean")
      continue;
    const rail: WithdrawalRail = isCard
      ? "debit_card"
      : additionalData.is_instant_transfer
        ? "bank_instant"
        : "bank_standard";
    contracts.push({
      context: {
        sourceId: source.id,
        sourceType: source.type,
        destinationId: sink.id,
        destinationType: sink.type,
        rail,
      },
      request: {
        method: "POST",
        url: CREATE,
        body: request,
        amountField: "amount",
        idempotencyField: "id",
      },
    });
  }
  return contracts;
}

/** Binds only a selected exact captured route; no account, rail, or body semantics are inferred. */
export function bindWithdrawalContract(
  contract: WithdrawalContract,
  input: {
    sourceId: string;
    destinationId: string;
    amountUsd: string;
    rail: WithdrawalRail;
    idempotencyId?: string;
  },
): { body: Record<string, unknown>; idempotencyId: string } {
  if (!money(input.amountUsd))
    throw new Error("amountUsd must be a positive USD value with at most two decimals");
  const context = contract.context;
  if (context.sourceId !== input.sourceId)
    throw new Error("sourceId does not match captured route semantics");
  if (context.destinationId !== input.destinationId)
    throw new Error("destinationId does not match captured route semantics");
  if (context.rail !== input.rail)
    throw new Error("selected rail does not match captured route semantics");
  const idempotencyId = input.idempotencyId ?? randomUUID();
  const request = contract.request;
  return {
    idempotencyId,
    body: {
      ...request.body,
      [request.amountField]: input.amountUsd,
      [request.idempotencyField]: idempotencyId,
    },
  };
}
