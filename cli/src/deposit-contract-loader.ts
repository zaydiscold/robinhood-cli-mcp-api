import { randomUUID } from "node:crypto";

export type DepositMethod = "bank_standard" | "bank_instant" | "debit_card";
export interface DepositContractStep { url: string; body: Record<string, unknown>; }
export interface DepositContract { steps: [DepositContractStep, DepositContractStep]; capturedAt?: string; }
export interface BoundDepositContract { method: DepositMethod; sourceId: string; destinationId: string; amountUsd: string; idempotencyId: string; steps: [DepositContractStep, DepositContractStep]; }
export interface DepositWorkflowReceipt { submitted: boolean; ambiguous: boolean; receiptStatus: "accepted" | "rejected" | "transport_ambiguous"; steps: Array<{ url?: string; status?: number; body?: unknown }>; }

const PRE_CREATE = "https://bonfire.robinhood.com/transfer/pre_create/";
const CREATE = "https://bonfire.robinhood.com/transfer/create/";
const money = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;

/** Parses only final transfer POSTs from an operator-private WireBrowser artifact. Values never enter the public repository. */
export function loadDepositContractsFromJsonl(text: string): DepositContract[] {
  const contracts: DepositContract[] = [];
  for (const line of text.split(/\r?\n/)) {
    let row: any;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.action !== "final" || !Array.isArray(row.events)) continue;
    const steps = row.events.flatMap((event: any) => {
      const request = event?.request;
      if (request?.method !== "POST" || (request.url !== PRE_CREATE && request.url !== CREATE)) return [];
      try {
        const body = JSON.parse(request.postData);
        return body && typeof body === "object" && !Array.isArray(body) ? [{ url: request.url, body }] : [];
      } catch { return []; }
    });
    const pre = steps.find((step: DepositContractStep) => step.url === PRE_CREATE);
    const create = steps.find((step: DepositContractStep) => step.url === CREATE);
    if (pre && create) contracts.push({ steps: [pre, create], capturedAt: typeof row.capturedAt === "string" ? row.capturedAt : undefined });
  }
  return contracts;
}

function bindBody(template: Record<string, unknown>, sourceId: string, destinationId: string, amountUsd: string, id: string): Record<string, unknown> {
  const source = template.source;
  const sink = template.sink;
  if (!source || typeof source !== "object" || Array.isArray(source) || !sink || typeof sink !== "object" || Array.isArray(sink))
    throw new Error("captured transfer body lacks source/sink objects");
  return {
    ...template,
    id,
    amount: amountUsd,
    source: { ...(source as Record<string, unknown>), id: sourceId },
    sink: { ...(sink as Record<string, unknown>), id: destinationId },
  };
}

/** Rebinds exactly the caller-selected source, destination, amount, and fresh client id; no body is invented. */
export function bindDepositContract(contract: DepositContract, input: { sourceId: string; destinationId: string; amountUsd: string; method: DepositMethod; idempotencyId?: string }): BoundDepositContract {
  if (!input.sourceId || !input.destinationId) throw new Error("sourceId and destinationId are required");
  if (!money(input.amountUsd)) throw new Error("amountUsd must be a positive USD value with at most two decimals");
  const idempotencyId = input.idempotencyId ?? randomUUID();
  const [pre, create] = contract.steps;
  return {
    ...input,
    idempotencyId,
    steps: [
      { url: pre.url, body: bindBody(pre.body, input.sourceId, input.destinationId, input.amountUsd, idempotencyId) },
      { url: create.url, body: bindBody(create.body, input.sourceId, input.destinationId, input.amountUsd, idempotencyId) },
    ],
  };
}

/** Both calls are financial mutations. A missing final-create response is ambiguous, never retryable. */
export function classifyDepositWorkflowReceipt(steps: Array<{ url?: string; status?: number; body?: unknown }>): DepositWorkflowReceipt {
  const final = steps[1];
  if (!final || final.status === undefined) return { submitted: false, ambiguous: true, receiptStatus: "transport_ambiguous", steps };
  if (final.status < 200 || final.status >= 300) return { submitted: false, ambiguous: false, receiptStatus: "rejected", steps };
  return { submitted: true, ambiguous: false, receiptStatus: "accepted", steps };
}
