/** Internal account-to-account transfer domain. Plans never submit or infer an undocumented request body. */
export interface InternalTransferAccount {
  accountId: string;
  accountType: string;
  owned: boolean;
  transferEnabled: boolean;
  withdrawableCashUsd?: string;
}
export interface InternalTransferLimit {
  period: "per_transfer" | "daily" | "rolling";
  amountRemainingUsd?: string;
  countRemaining?: number;
  windowEndsAt?: string;
}
export interface InternalTransferLimitQuote {
  sourceAccountId: string;
  destinationAccountId: string;
  observedAt: string;
  eligible: boolean;
  fee: { known: boolean; usd?: string };
  holds: string[];
  limits: InternalTransferLimit[];
  provenance: "authenticated_transfer_limit_read";
}
export interface InternalTransferContribution {
  contributionYear: number;
  contributionRoomUsd: string;
  eligibilityVerified: boolean;
}
export interface RetirementOriginEligibility {
  eligibilityVerified: boolean;
  route: string;
}
export interface CapturedInternalTransferRequest {
  method: "POST";
  url: string;
  body: Record<string, unknown>;
  amountField: string;
  sourceAccountField: string;
  destinationAccountField: string;
}
export interface InternalTransferHistoryRow {
  idempotencyKey?: string;
  state: string;
  id?: string;
}
export interface InternalTransferInput {
  amountUsd: string;
  source: InternalTransferAccount;
  destination: InternalTransferAccount;
  fee: { known: boolean; usd?: string };
  limitQuote?: InternalTransferLimitQuote;
  contribution?: InternalTransferContribution;
  retirementOrigin?: RetirementOriginEligibility;
  history: InternalTransferHistoryRow[];
  idempotencyKey: string;
  capturedRequest?: CapturedInternalTransferRequest;
}
export interface InternalTransferQuote {
  executable: boolean;
  amountUsd: string;
  source: InternalTransferAccount;
  destination: InternalTransferAccount;
  transferKind: "cash" | "contribution";
  gates: string[];
  idempotencyKey: string;
}
export interface InternalTransferPlan extends InternalTransferQuote {
  request?: CapturedInternalTransferRequest;
}
export interface InternalTransferReceipt {
  submitted: boolean;
  ambiguous: boolean;
  receiptStatus: "accepted_pending_readback" | "rejected" | "transport_ambiguous" | "reconciled";
  requiresReadback: boolean;
  status?: number;
  body?: unknown;
}
const cents = (value?: string): number | undefined => {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
};
const retirement = (type: string) => type === "ira" || type === "ira_roth";

/** Maps the authenticated transfer account graph; external/bank rails are never internal accounts. */
export function buildInternalTransferInventory(rows: Array<Record<string, unknown>>): {
  accounts: InternalTransferAccount[];
} {
  return {
    accounts: rows
      .filter((row) => {
        const id = row.id ?? row.account_id ?? row.account_number;
        const type = String(row.type ?? row.account_type ?? "");
        return (
          typeof id === "string" &&
          row.is_external !== true &&
          row.is_owned !== false &&
          type !== "ach"
        );
      })
      .map((row) => ({
        accountId: String(row.id ?? row.account_id ?? row.account_number),
        accountType: String(row.type ?? row.account_type),
        owned: true,
        transferEnabled: row.is_transfer_enabled === true,
        withdrawableCashUsd:
          typeof (row.withdrawable_cash ?? row.withdrawable_amount) === "string"
            ? String(row.withdrawable_cash ?? row.withdrawable_amount)
            : undefined,
      })),
  };
}
/** Validates only the route that the caller supplied; eligibility/limits remain authenticated observations. */
export function buildInternalTransferQuote(input: InternalTransferInput): InternalTransferQuote {
  const gates: string[] = [];
  const amount = cents(input.amountUsd);
  const transferKind = retirement(input.destination.accountType) ? "contribution" : "cash";
  if (amount === undefined || amount <= 0)
    gates.push("transfer amount must be a positive USD amount");
  for (const [label, account] of [
    ["source", input.source],
    ["destination", input.destination],
  ] as const) {
    if (!account.accountId || !account.owned || !account.transferEnabled)
      gates.push(`${label} is not an owned transfer-enabled account`);
  }
  if (retirement(input.source.accountType) && !input.retirementOrigin?.eligibilityVerified)
    gates.push(
      "retirement-originating transfer eligibility is not verified; do not infer a distribution or rollover",
    );
  if (
    input.source.withdrawableCashUsd !== undefined &&
    (cents(input.source.withdrawableCashUsd) ?? -1) < (amount ?? Number.MAX_SAFE_INTEGER)
  )
    gates.push("source withdrawable cash is below transfer amount");
  if (!input.fee.known || cents(input.fee.usd) !== 0)
    gates.push("fee is unknown or non-zero; no fee is authorized");
  const limit = input.limitQuote;
  if (!limit) gates.push("authenticated source → destination transfer limit quote is missing");
  else {
    if (
      limit.sourceAccountId !== input.source.accountId ||
      limit.destinationAccountId !== input.destination.accountId ||
      limit.provenance !== "authenticated_transfer_limit_read"
    )
      gates.push("limit quote does not bind this owned source → destination pair");
    if (!Number.isFinite(Date.parse(limit.observedAt)))
      gates.push("limit quote timestamp is invalid");
    if (!limit.eligible) gates.push("limit quote reports this transfer route as ineligible");
    if (!limit.fee.known || cents(limit.fee.usd) !== 0)
      gates.push("limit quote fee is unknown or non-zero; no fee is authorized");
    if (limit.holds.length) gates.push("limit quote reports an active hold");
    if (!limit.limits.length) gates.push("limit quote contains no quota windows");
    for (const window of limit.limits) {
      if (
        (cents(window.amountRemainingUsd) ?? Number.MAX_SAFE_INTEGER) <
        (amount ?? Number.MAX_SAFE_INTEGER)
      )
        gates.push(`${window.period} amount remaining is below transfer amount`);
      if (
        window.countRemaining !== undefined &&
        (!Number.isInteger(window.countRemaining) || window.countRemaining < 1)
      )
        gates.push(`${window.period} transfer count remaining is exhausted`);
      if (window.windowEndsAt !== undefined && !Number.isFinite(Date.parse(window.windowEndsAt)))
        gates.push(`${window.period} quota reset timestamp is invalid`);
    }
  }
  if (transferKind === "contribution") {
    const c = input.contribution;
    if (!c?.eligibilityVerified) gates.push("retirement contribution eligibility is not verified");
    if (!Number.isInteger(c?.contributionYear) || (c?.contributionYear ?? 0) < 2020)
      gates.push("retirement contribution year is invalid");
    if ((cents(c?.contributionRoomUsd) ?? -1) < (amount ?? Number.MAX_SAFE_INTEGER))
      gates.push("verified retirement contribution room is below transfer amount");
  }
  if (!input.idempotencyKey) gates.push("idempotency key is required");
  if (
    input.history.some(
      (row) =>
        row.idempotencyKey === input.idempotencyKey &&
        /pending|queued|submitted|complete|completed|settled/i.test(row.state),
    )
  )
    gates.push("matching idempotency key is already pending or completed");
  return {
    executable: !gates.length,
    amountUsd: input.amountUsd,
    source: input.source,
    destination: input.destination,
    transferKind,
    gates,
    idempotencyKey: input.idempotencyKey,
  };
}
/** Adds captured-contract validation; body values are never generated by this library. */
export function buildInternalTransferPlan(input: InternalTransferInput): InternalTransferPlan {
  const quote = buildInternalTransferQuote(input);
  const gates = [...quote.gates];
  const request = input.capturedRequest;
  if (!request) gates.push("exact internal-transfer write contract has not been captured");
  else if (
    request.method !== "POST" ||
    request.url !== "https://bonfire.robinhood.com/paymenthub/unified_transfers/" ||
    !request.amountField ||
    !request.sourceAccountField ||
    !request.destinationAccountField
  )
    gates.push("captured internal-transfer write contract is incomplete");
  return { ...quote, executable: !gates.length, gates, request };
}
/** A successful mutation receipt is deliberately only pending until GET readback proves its state. */
export function classifyInternalTransferReceipt(
  response?: { status: number; body?: unknown },
  readback?: { state?: string; id?: string },
): InternalTransferReceipt {
  if (!response)
    return {
      submitted: false,
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
      requiresReadback: true,
    };
  const submitted = response.status >= 200 && response.status < 300;
  if (submitted && readback)
    return {
      submitted: true,
      ambiguous: false,
      receiptStatus: "reconciled",
      requiresReadback: false,
      status: response.status,
      body: readback,
    };
  return {
    submitted,
    ambiguous: false,
    receiptStatus: submitted ? "accepted_pending_readback" : "rejected",
    requiresReadback: submitted,
    status: response.status,
    body: response.body,
  };
}

/** Sends exactly one captured, account-bound request. A transport failure is never retried here. */
export async function executeInternalTransfer(
  plan: InternalTransferPlan,
  send: (
    request: CapturedInternalTransferRequest & { body: Record<string, unknown> },
  ) => Promise<{ status: number; body?: unknown }>,
): Promise<InternalTransferReceipt> {
  if (!plan.executable || !plan.request)
    throw new Error(`Internal transfer is not executable: ${plan.gates.join("; ")}`);
  const request = plan.request;
  try {
    return classifyInternalTransferReceipt(
      await send({
        ...request,
        body: {
          ...request.body,
          [request.amountField]: plan.amountUsd,
          [request.sourceAccountField]: plan.source.accountId,
          [request.destinationAccountField]: plan.destination.accountId,
        },
      }),
    );
  } catch (error) {
    return {
      submitted: false,
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
      requiresReadback: true,
      body: { error: (error as Error).message },
    };
  }
}

/** Selects only the current server receipt; an older idempotency match is never execution proof. */
export function findCurrentInternalTransferReceipt(
  expected: { serverId: string; idempotencyKey: string },
  history: Array<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  return history.find(
    (row) =>
      row.id === expected.serverId &&
      (row.idempotency_key === expected.idempotencyKey ||
        row.idempotencyKey === expected.idempotencyKey),
  );
}
