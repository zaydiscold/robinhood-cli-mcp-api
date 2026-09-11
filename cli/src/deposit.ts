/** Account-agnostic deposit domain. POST execution requires an action-scoped captured contract. */
export type DepositPaymentMethod = "bank_standard" | "bank_instant" | "debit_card";

/** Published reset cadence only; quotas remain authenticated per source × rail × destination observations. */
export const DEPOSIT_RAIL_METADATA = {
  bank_standard: {
    limitReset: { timezone: "America/New_York", cadence: "business_day", localTime: "19:00" },
    publishedSettlement: "up_to_5_business_days",
  },
  bank_instant: {
    limitReset: { timezone: "America/New_York", cadence: "calendar_day", localTime: "00:00" },
    publishedFee: "none",
    publishedSettlement: "minutes",
  },
  debit_card: {
    limitReset: { timezone: "America/New_York", cadence: "calendar_day", localTime: "00:00" },
    publishedSettlement: "typically_30_minutes",
  },
} as const;
export type DepositRequestStatus =
  | "captured_exact_write_contract"
  | "missing_exact_write_contract"
  | "missing_source_and_exact_write_contract";

export interface DepositDestination {
  accountId: string;
  accountType: string;
  depositEnabled: boolean;
}

export interface DepositSource {
  id: string;
  method: DepositPaymentMethod;
  eligible: boolean;
  requestStatus: DepositRequestStatus;
  evidence: string[];
}

export interface DepositInventory {
  destinations: DepositDestination[];
  sources: DepositSource[];
  executableMethods: DepositPaymentMethod[];
}

export interface DepositHistoryRow {
  amountUsd: string;
  method: DepositPaymentMethod;
  destinationAccountId: string;
  state: string;
}

export interface CapturedDepositRequest {
  method: "POST";
  url: string;
  body: Record<string, unknown>;
  amountField: string;
}

export interface IraContribution {
  /** Selected through the IRA contribution flow only; never a generic deposit field. */
  contributionYear: number;
  contributionRoomUsd: string;
  eligibilityVerified: boolean;
}
/** @deprecated Use IraContribution. Retained only for input compatibility. */
export type RetirementContribution = IraContribution;

export interface DepositLimitWindow {
  period: "per_transfer" | "daily" | "rolling";
  amountRemainingUsd?: string;
  countRemaining?: number;
  windowEndsAt?: string;
}

/** An authenticated, action-specific source × rail × destination limit observation; never a published maximum. */
export interface DepositLimitQuote {
  sourceId: string;
  method: DepositPaymentMethod;
  destinationAccountId: string;
  observedAt: string;
  eligible: boolean;
  fee: { known: boolean; usd?: string };
  holds: string[];
  windows: DepositLimitWindow[];
  provenance: "authenticated_limit_read";
}

export interface DepositInput {
  amountUsd: string;
  destination: DepositDestination;
  source: Pick<DepositSource, "id" | "method" | "eligible">;
  fee: { known: boolean; usd?: string };
  history: DepositHistoryRow[];
  /** Required for a live-eligible quote: exact account/source/rail observation from Transfers → limits. */
  limitQuote?: DepositLimitQuote;
  /** Used only when destination is ira/ira_roth; binds an IRA contribution-year contract. */
  iraContribution?: IraContribution;
  /** @deprecated Use iraContribution. */
  retirement?: RetirementContribution;
  capturedRequest?: CapturedDepositRequest;
}

export interface DepositQuote {
  executable: boolean;
  amountUsd: string;
  destination: DepositDestination;
  sourceId: string;
  method: DepositPaymentMethod;
  gates: string[];
}

export interface DepositPlan extends DepositQuote {
  request?: CapturedDepositRequest;
}

export interface DepositReceipt {
  submitted: boolean;
  ambiguous: boolean;
  receiptStatus: "accepted" | "rejected" | "transport_ambiguous";
  status?: number;
  body?: unknown;
}

const asCents = (value: string | undefined): number | undefined => {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
};

const isRetirementDestination = (accountType: string): boolean =>
  accountType === "ira" || accountType === "ira_roth";

/** Maps only observed source records. A debit row exists only when the read response identifies one. */
export function buildDepositInventory(
  accounts: Array<Record<string, unknown>>,
  fundingSources: Array<Record<string, unknown>>,
): DepositInventory {
  const destinations = accounts
    // Transfer-account rows carry their own `id`, but observed transfer bodies use
    // the underlying account_id as sink.id. Prefer that binding when both exist.
    .filter((account) => typeof (account.account_id ?? account.id) === "string")
    .map((account) => ({
      accountId: String(account.account_id ?? account.id),
      accountType: String(account.type ?? account.account_type ?? "unknown"),
      depositEnabled: account.is_deposits_enabled === true,
    }));
  const sources: DepositSource[] = [];
  for (const source of fundingSources) {
    const id = String(source.id ?? source.relationship_id ?? "");
    if (!id) continue;
    const verified = source.verified === true && source.state === "approved";
    const type = String(source.type ?? source.source_type ?? "").toLowerCase();
    if (type === "debit_card") {
      sources.push({
        id,
        method: "debit_card",
        eligible: verified,
        requestStatus: "missing_exact_write_contract",
        evidence: ["captured funding-source GET", "source type debit_card", "verified/approved"],
      });
      continue;
    }
    const rails = (source.available_payment_rails ?? {}) as Record<string, unknown>;
    sources.push({
      id,
      method: "bank_standard",
      eligible: verified,
      requestStatus: "missing_exact_write_contract",
      evidence: ["cashier/ach/relationships GET", "relationship verified/approved"],
    });
    if (rails.is_rtp_eligible === true) {
      sources.push({
        id,
        method: "bank_instant",
        eligible: verified,
        requestStatus: "missing_exact_write_contract",
        evidence: ["cashier/ach/relationships GET", "available_payment_rails.is_rtp_eligible"],
      });
    }
  }
  return { destinations, sources, executableMethods: [] };
}

/** Correlates PaymentHub's observed deposit-history schema without trusting nullable `source_id`. */
export function correlateUnifiedDepositReceipts(
  rows: Array<Record<string, unknown>>,
  input: { sourceId: string; destinationId: string; amountUsd: string; method: DepositPaymentMethod },
): Array<{ serverReceiptId: string; clientId?: string; state: string; transferType: string; serviceFeeUsd: string }> {
  const transferTypeByMethod: Record<DepositPaymentMethod, string> = {
    bank_standard: "originated_ach",
    bank_instant: "instant_bank_transfer",
    debit_card: "debit_card_funding",
  };
  return rows
    // For a pull deposit, PaymentHub reports the broker destination as originating
    // and the funding relationship as receiving. `source_id` is nullable in this row.
    .filter((row) => row.transfer_type === transferTypeByMethod[input.method]
      && String(row.amount) === input.amountUsd
      && row.receiving_account_id === input.sourceId
      && row.originating_account_id === input.destinationId
      && typeof row.id === "string")
    .map((row) => ({
      serverReceiptId: row.id as string,
      clientId: typeof row.ref_id === "string" ? row.ref_id : undefined,
      state: typeof row.state === "string" ? row.state : "unknown",
      transferType: row.transfer_type as string,
      serviceFeeUsd: typeof row.service_fee === "string" ? row.service_fee : "unknown",
    }));
}

/** Validates a specific source-to-destination amount; retirement gates are destination-specific. */
export function buildDepositQuote(input: DepositInput): DepositQuote {
  const gates: string[] = [];
  const amountCents = asCents(input.amountUsd);
  if (amountCents === undefined || amountCents <= 0)
    gates.push("deposit amount must be a positive USD amount");
  if (!input.destination.accountId || !input.destination.depositEnabled)
    gates.push("destination is not deposit-enabled");
  if (!input.source.id || !input.source.eligible)
    gates.push(`${input.source.method} source is not eligible`);
  if (!input.fee.known || asCents(input.fee.usd) !== 0)
    gates.push("fee is unknown or non-zero; no fee is authorized");
  const limit = input.limitQuote;
  if (!limit) {
    gates.push("source × rail × destination authenticated limit quote is missing");
  } else {
    if (
      limit.sourceId !== input.source.id ||
      limit.method !== input.source.method ||
      limit.destinationAccountId !== input.destination.accountId ||
      limit.provenance !== "authenticated_limit_read"
    )
      gates.push("limit quote does not bind this source × rail × destination");
    if (!Number.isFinite(Date.parse(limit.observedAt)))
      gates.push("limit quote timestamp is invalid");
    if (!limit.eligible) gates.push("limit quote reports this deposit route as ineligible");
    if (!limit.fee.known || asCents(limit.fee.usd) !== 0)
      gates.push("limit quote fee is unknown or non-zero; no fee is authorized");
    if (limit.holds.length) gates.push("limit quote reports an active hold");
    if (!limit.windows.length) gates.push("limit quote contains no quota windows");
    for (const window of limit.windows) {
      if (
        (asCents(window.amountRemainingUsd) ?? Number.MAX_SAFE_INTEGER) <
        (amountCents ?? Number.MAX_SAFE_INTEGER)
      )
        gates.push(`${window.period} amount remaining is below deposit amount`);
      if (
        window.countRemaining !== undefined &&
        (!Number.isInteger(window.countRemaining) || window.countRemaining < 1)
      )
        gates.push(`${window.period} transfer count remaining is exhausted`);
      if (window.windowEndsAt !== undefined && !Number.isFinite(Date.parse(window.windowEndsAt)))
        gates.push(`${window.period} quota reset timestamp is invalid`);
    }
  }
  const contribution = input.iraContribution ?? input.retirement;
  if (isRetirementDestination(input.destination.accountType)) {
    if (!contribution?.eligibilityVerified)
      gates.push("retirement contribution eligibility is not verified");
    if (
      !Number.isInteger(contribution?.contributionYear) ||
      (contribution?.contributionYear ?? 0) < 2020
    )
      gates.push("retirement contribution year is invalid");
    if (
      (asCents(contribution?.contributionRoomUsd) ?? -1) < (amountCents ?? Number.MAX_SAFE_INTEGER)
    )
      gates.push("verified retirement contribution room is below deposit amount");
  }
  const duplicate = input.history.some(
    (row) =>
      row.amountUsd === input.amountUsd &&
      row.method === input.source.method &&
      row.destinationAccountId === input.destination.accountId &&
      /pending|queued|submitted|complete|completed|settled/i.test(row.state),
  );
  if (duplicate) gates.push("matching deposit is already pending or completed");
  return {
    executable: gates.length === 0,
    amountUsd: input.amountUsd,
    destination: input.destination,
    sourceId: input.source.id,
    method: input.source.method,
    gates,
  };
}

/** Produces a one-shot POST plan only from a captured exact contract; it never invents a body. */
export function buildDepositPlan(input: DepositInput): DepositPlan {
  const quote = buildDepositQuote(input);
  const gates = [...quote.gates];
  const request = input.capturedRequest;
  if (!request) gates.push("exact deposit write contract has not been captured");
  else if (request.method !== "POST" || !request.url.startsWith("https://") || !request.amountField)
    gates.push("captured deposit write contract is incomplete");
  return { ...quote, executable: gates.length === 0, gates, request };
}

export function classifyDepositReceipt(response?: {
  status: number;
  body?: unknown;
}): DepositReceipt {
  if (!response) return { submitted: false, ambiguous: true, receiptStatus: "transport_ambiguous" };
  const submitted = response.status >= 200 && response.status < 300;
  return {
    submitted,
    ambiguous: false,
    receiptStatus: submitted ? "accepted" : "rejected",
    status: response.status,
    body: response.body,
  };
}

/** One-shot executor. Callers must independently read status before any retry decision. */
export async function executeDeposit(
  plan: DepositPlan,
  send: (
    request: CapturedDepositRequest & { body: Record<string, unknown> },
  ) => Promise<{ status: number; body?: unknown }>,
): Promise<DepositReceipt> {
  if (!plan.executable) throw new Error(`Deposit is not executable: ${plan.gates.join("; ")}`);
  if (!plan.request)
    throw new Error("Deposit write contract has not been captured; refusing to invent a request");
  try {
    return classifyDepositReceipt(
      await send({
        ...plan.request,
        body: { ...plan.request.body, [plan.request.amountField]: plan.amountUsd },
      }),
    );
  } catch (error) {
    return {
      submitted: false,
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
      body: { error: (error as Error).message },
    };
  }
}
