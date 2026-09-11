export type RothPaymentMethod = "bank_standard" | "bank_instant" | "debit_card" | "wire";

export interface RothDepositHistoryRow {
  amountUsd: string;
  method: RothPaymentMethod;
  destinationAccountId: string;
  state: string;
}

export interface CapturedDepositRequest {
  method: "POST";
  url: string;
  /** Sanitized, action-scoped body template. The executor replaces only amount fields supplied here. */
  body: Record<string, unknown>;
  amountField: string;
}

export interface RothDepositInput {
  year: number;
  contributionRoomUsd: string;
  eligibilityVerified: boolean;
  destination: { accountId: string; accountType: string; depositEnabled: boolean };
  source: { id: string; method: RothPaymentMethod; eligible: boolean };
  fee: { known: boolean; usd?: string };
  history: RothDepositHistoryRow[];
  capturedRequest?: CapturedDepositRequest;
}

export interface RothDepositPlan {
  executable: boolean;
  amountUsd: "1.00";
  year: number;
  method: RothPaymentMethod;
  destination: { accountId: string; accountType: string };
  sourceId: string;
  gates: string[];
  request?: CapturedDepositRequest;
}

const ONE_DOLLAR = "1.00";
const asCents = (value: string | undefined): number | undefined => {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
};

/** Pure, rail-neutral eligibility plan. It does not invent undocumented POST bodies. */
export function buildRothDepositPlan(input: RothDepositInput): RothDepositPlan {
  const gates: string[] = [];
  if (!Number.isInteger(input.year) || input.year < 2020) gates.push("contribution year is invalid");
  if (!input.eligibilityVerified) gates.push("Roth contribution eligibility is not verified");
  if ((asCents(input.contributionRoomUsd) ?? -1) < 100) gates.push("verified Roth contribution room is below $1.00");
  if (input.destination.accountType !== "ira_roth" || !input.destination.depositEnabled) {
    gates.push("destination is not a deposit-enabled Roth IRA");
  }
  if (!input.source.eligible) gates.push(`${input.source.method} source is not eligible`);
  if (!input.fee.known || asCents(input.fee.usd) !== 0) gates.push("fee is unknown or non-zero; no fee is authorized");

  const duplicate = input.history.some((row) =>
    row.amountUsd === ONE_DOLLAR &&
    row.method === input.source.method &&
    row.destinationAccountId === input.destination.accountId &&
    /pending|queued|submitted|complete|completed|settled/i.test(row.state),
  );
  if (duplicate) gates.push("matching $1 deposit is already pending or completed");
  if (input.capturedRequest && input.capturedRequest.method !== "POST") gates.push("captured rail request is not a POST");
  if (input.capturedRequest && (!input.capturedRequest.url.startsWith("https://") || !input.capturedRequest.amountField)) {
    gates.push("captured rail request is incomplete");
  }
  return {
    executable: gates.length === 0,
    amountUsd: ONE_DOLLAR,
    year: input.year,
    method: input.source.method,
    destination: { accountId: input.destination.accountId, accountType: input.destination.accountType },
    sourceId: input.source.id,
    gates,
    request: input.capturedRequest,
  };
}

export interface RothDepositReceipt {
  submitted: boolean;
  ambiguous: boolean;
  status?: number;
  body?: unknown;
}

/** One-shot executor: no retry, and transport uncertainty is surfaced as ambiguous. */
export async function executeRothDeposit(
  plan: RothDepositPlan,
  send: (request: CapturedDepositRequest & { body: Record<string, unknown> }) => Promise<{ status: number; body?: unknown }>,
): Promise<RothDepositReceipt> {
  if (!plan.executable) throw new Error(`Roth deposit is not executable: ${plan.gates.join("; ")}`);
  if (!plan.request) throw new Error("Roth deposit rail contract has not been captured; refusing to invent a request");
  const body = { ...plan.request.body, [plan.request.amountField]: plan.amountUsd };
  try {
    const response = await send({ ...plan.request, body });
    return { submitted: response.status >= 200 && response.status < 300, ambiguous: false, status: response.status, body: response.body };
  } catch (error) {
    return { submitted: false, ambiguous: true, body: { error: (error as Error).message } };
  }
}
