/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted JSONL capture rows are narrowed before use. */
import { randomUUID } from "node:crypto";

export type DepositMethod = "bank_standard" | "bank_instant" | "debit_card";
export interface DepositContractStep {
  url: string;
  body: Record<string, unknown>;
}
export interface DepositContractContext {
  method: DepositMethod;
  sourceId: string;
  sourceType: string;
  destinationId: string;
  destinationType: string;
  contributionYear?: number;
}
export interface DepositContract {
  steps: [DepositContractStep, DepositContractStep];
  context: DepositContractContext;
  capturedAt?: string;
}
export interface BoundDepositContract {
  method: DepositMethod;
  sourceId: string;
  destinationId: string;
  destinationType: string;
  amountUsd: string;
  idempotencyId: string;
  steps: [DepositContractStep, DepositContractStep];
}
export interface DepositWorkflowReceipt {
  submitted: boolean;
  ambiguous: boolean;
  receiptStatus: "accepted" | "rejected" | "transport_ambiguous" | "dry_run" | "action_required";
  serverReceiptId?: string;
  clientId?: string;
  steps: Array<{ url?: string; status?: number; body?: unknown }>;
}

const PRE_CREATE = "https://bonfire.robinhood.com/transfer/pre_create/";
const CREATE = "https://bonfire.robinhood.com/transfer/create/";
const money = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const isRetirement = (type: string) => type === "ira" || type === "ira_roth";

function exactContext(row: any, steps: DepositContractStep[]): DepositContractContext | undefined {
  const context = record(row?.context);
  if (!context || !["bank_standard", "bank_instant", "debit_card"].includes(String(context.method)))
    return undefined;
  const [pre, create] = steps;
  const pSource = record(pre.body.source),
    cSource = record(create.body.source);
  const pSink = record(pre.body.sink),
    cSink = record(create.body.sink);
  if (!pSource || !cSource || !pSink || !cSink) return undefined;
  const required = ["sourceId", "sourceType", "destinationId", "destinationType"] as const;
  if (required.some((key) => typeof context[key] !== "string" || !context[key])) return undefined;
  if (
    pSource.id !== context.sourceId ||
    cSource.id !== context.sourceId ||
    pSource.type !== context.sourceType ||
    cSource.type !== context.sourceType ||
    pSink.id !== context.destinationId ||
    cSink.id !== context.destinationId ||
    pSink.type !== context.destinationType ||
    cSink.type !== context.destinationType
  )
    return undefined;
  const year = context.contributionYear;
  if (
    year !== undefined &&
    (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 3000)
  )
    return undefined;
  const contribution = record(record(pre.body.additional_data)?.ira_contribution_data);
  if (isRetirement(String(context.destinationType))) {
    if (!contribution || contribution.tax_year !== year) return undefined;
  } else if (contribution || record(record(create.body.additional_data)?.ira_contribution_data))
    return undefined;
  return context as unknown as DepositContractContext;
}

/** Parses only complete, action-scoped final POST sequences with explicit captured route semantics. */
export function loadDepositContractsFromJsonl(text: string): DepositContract[] {
  const contracts: DepositContract[] = [];
  for (const line of text.split(/\r?\n/)) {
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row?.schema !== 2 || row?.action !== "final" || !Array.isArray(row.events)) continue;
    const steps = row.events.flatMap((event: any) => {
      const request = event?.request;
      if (request?.method !== "POST" || (request.url !== PRE_CREATE && request.url !== CREATE))
        return [];
      const body = (() => {
        try {
          return JSON.parse(request.postData);
        } catch {
          return undefined;
        }
      })();
      return record(body) ? [{ url: request.url, body }] : [];
    });
    const pre = steps.find((step: DepositContractStep) => step.url === PRE_CREATE);
    const create = steps.find((step: DepositContractStep) => step.url === CREATE);
    if (!pre || !create) continue;
    const context = exactContext(row, [pre, create]);
    if (context)
      contracts.push({
        steps: [pre, create],
        context,
        capturedAt: typeof row.capturedAt === "string" ? row.capturedAt : undefined,
      });
  }
  return contracts;
}

/** Reuses the observed body exactly; only the client id is fresh. No rail/account rebinding occurs. */
export function bindDepositContract(
  contract: DepositContract,
  input: {
    sourceId: string;
    destinationId: string;
    destinationType: string;
    amountUsd: string;
    method: DepositMethod;
    contributionYear?: number;
    idempotencyId?: string;
  },
): BoundDepositContract {
  if (!money(input.amountUsd))
    throw new Error("amountUsd must be a positive USD value with at most two decimals");
  const c = contract.context;
  if (input.method !== c.method)
    throw new Error("selected method does not match captured route semantics");
  if (input.sourceId !== c.sourceId)
    throw new Error("sourceId does not match captured route semantics");
  if (input.destinationId !== c.destinationId)
    throw new Error("destinationId does not match captured route semantics");
  if (input.destinationType !== c.destinationType)
    throw new Error("destination type does not match captured route semantics");
  if (isRetirement(c.destinationType) && input.contributionYear !== c.contributionYear)
    throw new Error("contribution year does not match captured destination semantics");
  if (!isRetirement(c.destinationType) && input.contributionYear !== undefined)
    throw new Error("contribution year is invalid for non-retirement destination");
  const idempotencyId = input.idempotencyId ?? randomUUID();
  const bind = (step: DepositContractStep): DepositContractStep => ({
    ...step,
    body: { ...step.body, id: idempotencyId },
  });
  return { ...input, idempotencyId, steps: [bind(contract.steps[0]), bind(contract.steps[1])] };
}

function receiptIdentity(body: unknown): { serverReceiptId?: string; clientId?: string } {
  const row = record(body);
  const transfer = record(row?.transfer);
  // `transfer_id` is the observed create-response receipt field. Retain the other
  // shapes for independently captured API variants, but never infer from the client id.
  const serverReceiptId =
    typeof row?.transfer_id === "string"
      ? row.transfer_id
      : typeof transfer?.id === "string"
        ? transfer.id
        : typeof row?.server_receipt_id === "string"
          ? row.server_receipt_id
          : undefined;
  const clientId = typeof row?.client_id === "string" ? row.client_id : undefined;
  return { serverReceiptId, clientId };
}

/** Both calls are mutations: 2xx is insufficient without an actual captured broker receipt identity. */
export function classifyDepositWorkflowReceipt(
  steps: Array<{ url?: string; status?: number; body?: unknown }>,
): DepositWorkflowReceipt {
  const final = steps[1];
  if (!final || final.status === undefined)
    return { submitted: false, ambiguous: true, receiptStatus: "transport_ambiguous", steps };
  if (final.status < 200 || final.status >= 300)
    return { submitted: false, ambiguous: false, receiptStatus: "rejected", steps };
  const identity = receiptIdentity(final.body);
  if (!identity.serverReceiptId)
    return { submitted: false, ambiguous: true, receiptStatus: "transport_ambiguous", steps };
  return { submitted: true, ambiguous: false, receiptStatus: "accepted", steps, ...identity };
}
