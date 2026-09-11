/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted JSONL capture rows are narrowed before use. */
import { randomUUID } from "node:crypto";

export interface InternalTransferContract {
  context: {
    sourceId: string;
    destinationId: string;
    sourceType: string;
    destinationType: string;
    contributionYear?: number;
  };
  request: {
    method: "POST";
    url: "https://bonfire.robinhood.com/paymenthub/unified_transfers/";
    body: Record<string, unknown>;
    amountField: string;
    sourceAccountField: string;
    destinationAccountField: string;
    idempotencyField: string;
  };
}
const money = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const hasNamedField = (body: Record<string, unknown>, field: unknown): field is string =>
  typeof field === "string" &&
  field.length > 0 &&
  Object.prototype.hasOwnProperty.call(body, field);

/** Loads only action-scoped, private, literal POST captures. It never creates a request shape. */
export function loadInternalTransferContractsFromJsonl(text: string): InternalTransferContract[] {
  const contracts: InternalTransferContract[] = [];
  for (const line of text.split(/\r?\n/)) {
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row?.schema !== 2 || row?.action !== "final") continue;
    const context = record(row.context);
    const bindings = record(row.bindings);
    if (
      !context ||
      !bindings ||
      ["sourceId", "destinationId", "sourceType", "destinationType"].some(
        (key) => typeof context[key] !== "string" || !context[key],
      )
    )
      continue;
    const event = Array.isArray(row.events)
      ? row.events.find(
          (item: any) =>
            item?.request?.method === "POST" &&
            item.request.url === "https://bonfire.robinhood.com/paymenthub/unified_transfers/",
        )
      : undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event?.request?.postData);
    } catch {
      parsed = undefined;
    }
    const body = record(parsed);
    if (
      !body ||
      !hasNamedField(body, bindings.amountField) ||
      !hasNamedField(body, bindings.sourceAccountField) ||
      !hasNamedField(body, bindings.destinationAccountField) ||
      !hasNamedField(body, bindings.idempotencyField)
    )
      continue;
    contracts.push({
      context: context as InternalTransferContract["context"],
      request: {
        method: "POST",
        url: "https://bonfire.robinhood.com/paymenthub/unified_transfers/",
        body,
        amountField: bindings.amountField,
        sourceAccountField: bindings.sourceAccountField,
        destinationAccountField: bindings.destinationAccountField,
        idempotencyField: bindings.idempotencyField,
      },
    });
  }
  return contracts;
}

/** Reuses a concrete capture only for its exact source/destination/account-class context. */
export function bindInternalTransferContract(
  contract: InternalTransferContract,
  input: {
    amountUsd: string;
    sourceId: string;
    destinationId: string;
    sourceType: string;
    destinationType: string;
    contributionYear?: number;
    idempotencyKey?: string;
  },
): { body: Record<string, unknown>; idempotencyKey: string } {
  if (!money(input.amountUsd))
    throw new Error("amountUsd must be a positive USD value with at most two decimals");
  const c = contract.context;
  if (
    c.sourceId !== input.sourceId ||
    c.destinationId !== input.destinationId ||
    c.sourceType !== input.sourceType ||
    c.destinationType !== input.destinationType ||
    c.contributionYear !== input.contributionYear
  )
    throw new Error("selected values do not match captured route semantics");
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const r = contract.request;
  return {
    idempotencyKey,
    body: {
      ...r.body,
      [r.amountField]: input.amountUsd,
      [r.sourceAccountField]: input.sourceId,
      [r.destinationAccountField]: input.destinationId,
      [r.idempotencyField]: idempotencyKey,
    },
  };
}
