/**
 * Withdrawal domain. It never invents a POST: execution unlocks only from a
 * sanitized action-scoped browser capture, explicit caller approval, and an
 * immediately preceding authenticated source × rail × destination quote.
 */
export type WithdrawalRail = "bank_standard" | "bank_instant" | "debit_card";
export type WithdrawalLimitPeriod = "per_transfer" | "daily" | "rolling";

export const WITHDRAWAL_RAIL_METADATA = {
  bank_standard: {
    fee: "none",
    limitReset: { timezone: "America/New_York", cadence: "business_day", localTime: "19:00" },
    publishedProcessing: "1_day_on_robinhood_receiving_bank_may_vary",
  },
  bank_instant: {
    fee: "1.75_percent_min_1_max_150",
    limitReset: { timezone: "America/New_York", cadence: "calendar_day", localTime: "00:00" },
    publishedProcessing: "typically_10_minutes",
  },
  debit_card: {
    fee: "1.75_percent_min_1_max_150",
    limitReset: { timezone: "America/New_York", cadence: "calendar_day", localTime: "00:00" },
    publishedProcessing: "up_to_30_minutes",
  },
} as const;

export interface WithdrawalSource {
  accountId: string;
  accountType: string;
  withdrawalsEnabled: boolean;
}

export interface WithdrawalDestination {
  id: string;
  rail: WithdrawalRail;
  eligible: boolean;
}

export interface WithdrawalInventory {
  sources: WithdrawalSource[];
  destinations: WithdrawalDestination[];
  executableRails: WithdrawalRail[];
}

export interface WithdrawalLimitWindow {
  period: WithdrawalLimitPeriod;
  amountRemainingUsd?: string;
  countRemaining?: number;
  windowEndsAt?: string;
}

export interface WithdrawalLimitQuote {
  sourceAccountId: string;
  destinationId: string;
  rail: WithdrawalRail;
  observedAt: string;
  /** Fresh owned-account cash when the account read exposes it; absent means unknown, not zero. */
  withdrawableCashUsd?: string;
  eligible: boolean;
  fee: { known: boolean; usd?: string };
  holds: string[];
  windows: WithdrawalLimitWindow[];
  /** Result of the exact amount-specific authenticated validation GET. */
  validationPassed?: boolean;
  provenance: "authenticated_limit_read";
}

export interface WithdrawalHistoryRow {
  amountUsd: string;
  sourceAccountId: string;
  destinationId: string;
  rail: WithdrawalRail;
  state: string;
}

export interface RetirementWithdrawal {
  /** The authenticated retirement flow, not a generic account-type assumption, verified eligibility. */
  eligibilityVerified: boolean;
}

export interface CapturedWithdrawalRequest {
  method: "POST";
  url: string;
  body: Record<string, unknown>;
  amountField: string;
}

export interface NativeWithdrawalRequestInput {
  sourceId: string;
  sourceType: string;
  destinationId: string;
  destinationType: string;
  amountUsd: string;
  rail: WithdrawalRail;
  idempotencyId?: string;
  iraDistribution?: {
    distributionType: string;
    federalTaxWithholdingPercent: string;
    stateTaxWithholdingPercent: string;
    state: string;
  };
}

export interface WithdrawalInput {
  maxFeeUsd?: string;
  amountUsd: string;
  source: WithdrawalSource;
  destination: WithdrawalDestination;
  limitQuote?: WithdrawalLimitQuote;
  history: WithdrawalHistoryRow[];
  retirement?: RetirementWithdrawal;
  capturedRequest?: CapturedWithdrawalRequest;
}

export interface WithdrawalQuote {
  executable: boolean;
  amountUsd: string;
  source: WithdrawalSource;
  destination: WithdrawalDestination;
  fee: { known: boolean; usd?: string };
  /** Server validation is distinct from whether numeric cash/quota fields were disclosed. */
  validationPassed?: boolean;
  numericLimitsKnown: boolean;
  gates: string[];
}

export interface WithdrawalPlan extends WithdrawalQuote {
  request?: CapturedWithdrawalRequest;
}

export interface WithdrawalReceipt {
  submitted: boolean;
  ambiguous: boolean;
  receiptStatus:
    | "accepted"
    | "rejected"
    | "transport_ambiguous"
    | "verification_required"
    | "dry_run"
    | "already_exists";
  serverReceiptId?: string;
  userAction?: {
    type: "approve_on_phone";
    message: string;
    workflowId?: string;
    automaticRetry: false;
  };
  status?: number;
  body?: unknown;
}

const asCents = (value: string | undefined): number | undefined => {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
};

const observedSourceTypes = new Set(["rhs", "ira", "ira_roth"]);
const observedDestinationTypes = new Set(["ach", "bank_account", "dcf", "debit_card"]);

const WITHDRAWAL_PRE_CREATE_URL = "https://bonfire.robinhood.com/transfer/pre_create/";
const WITHDRAWAL_CREATE_URL = "https://bonfire.robinhood.com/transfer/create/";

/** Captured 2026-09-11/13: instant, card, and IRA paths pre-create; taxable standard ACH does not. */
export function getWithdrawalMutationUrls(sourceType: string, rail: WithdrawalRail): string[] {
  return sourceType.startsWith("ira") || rail !== "bank_standard"
    ? [WITHDRAWAL_PRE_CREATE_URL, WITHDRAWAL_CREATE_URL]
    : [WITHDRAWAL_CREATE_URL];
}

/** Builds the observed create schema; transfer types must come from authenticated reads. */
export function buildNativeWithdrawalRequest(
  input: NativeWithdrawalRequestInput,
): CapturedWithdrawalRequest {
  if (!input.sourceId || !input.destinationId)
    throw new Error("sourceId and destinationId are required");
  if (asCents(input.amountUsd) === undefined || asCents(input.amountUsd)! <= 0)
    throw new Error("amountUsd must be a positive USD value with at most two decimals");
  if (!observedSourceTypes.has(input.sourceType))
    throw new Error("native withdrawal requires an observed source type");
  if (!observedDestinationTypes.has(input.destinationType))
    throw new Error("native withdrawal requires an observed destination type");
  if (input.rail === "debit_card" && !["dcf", "debit_card"].includes(input.destinationType))
    throw new Error("debit_card rail requires an observed dcf sink type");
  if (input.rail !== "debit_card" && ["dcf", "debit_card"].includes(input.destinationType))
    throw new Error("bank rail cannot use an observed dcf sink type");
  const retirementSource = input.sourceType.startsWith("ira");
  if (retirementSource) {
    const distribution = input.iraDistribution;
    if (
      !distribution ||
      !distribution.distributionType ||
      !/^[A-Z]{2}$/.test(distribution.state) ||
      !/^\d+(?:\.\d{1,4})?$/.test(distribution.federalTaxWithholdingPercent) ||
      !/^\d+(?:\.\d{1,4})?$/.test(distribution.stateTaxWithholdingPercent)
    )
      throw new Error(
        "Retirement-originating withdrawal requires explicit distribution type, two-letter state, and withholding percents; no distribution is inferred",
      );
  } else if (input.iraDistribution) {
    throw new Error("Distribution fields do not apply to a taxable source");
  }
  return {
    method: "POST",
    url: "https://bonfire.robinhood.com/transfer/create/",
    amountField: "amount",
    body: {
      id: input.idempotencyId ?? crypto.randomUUID(),
      additional_data: {
        entry_point: 5,
        ...(!retirementSource && input.rail !== "debit_card"
          ? { is_instant_transfer: input.rail === "bank_instant" }
          : {}),
        ...(retirementSource
          ? {
              ira_distribution_data: {
                distribution_type: input.iraDistribution!.distributionType,
                federal_tax_withholding_percent:
                  input.iraDistribution!.federalTaxWithholdingPercent,
                state: input.iraDistribution!.state,
                state_tax_withholding_percent: input.iraDistribution!.stateTaxWithholdingPercent,
              },
            }
          : {}),
      },
      amount: input.amountUsd,
      currency: "usd",
      frequency: "once",
      source: { id: input.sourceId, type: input.sourceType },
      sink: { id: input.destinationId, type: input.destinationType },
    },
  };
}

const isRetirementAccount = (accountType: string): boolean =>
  accountType === "ira" || accountType === "ira_roth";

/** Builds only linked/observed routes; no bank, card, or eligibility is inferred. */
export function buildWithdrawalInventory(
  accounts: Array<Record<string, unknown>>,
  destinations: Array<Record<string, unknown>>,
): WithdrawalInventory {
  const sources = accounts
    .filter((account) => {
      const type = String(account.type ?? account.account_type ?? "").toLowerCase();
      return (
        typeof (account.id ?? account.account_id) === "string" &&
        ["rhs", "brokerage", "ira", "ira_roth"].includes(type)
      );
    })
    .map((account) => ({
      accountId: String(account.account_id ?? account.id),
      accountType: String(account.type ?? account.account_type ?? "unknown"),
      withdrawalsEnabled: account.is_withdrawals_enabled === true,
    }));
  const observed: WithdrawalDestination[] = [];
  for (const destination of destinations) {
    const id = String(
      destination.id ?? destination.relationship_id ?? destination.account_id ?? "",
    );
    if (!id) continue;
    const eligible =
      (destination.verified === true && destination.state === "approved") ||
      destination.status === "approved";
    const type = String(destination.type ?? destination.source_type ?? "").toLowerCase();
    if (type === "debit_card" || type === "dcf") {
      observed.push({ id, rail: "debit_card", eligible });
      continue;
    }
    observed.push({ id, rail: "bank_standard", eligible });
    const rails = (destination.available_payment_rails ?? {}) as Record<string, unknown>;
    if (rails.is_rtp_eligible === true) observed.push({ id, rail: "bank_instant", eligible });
  }
  return { sources, destinations: observed, executableRails: [] };
}

/** Validates one exact withdrawal route; published limits never substitute authenticated observations. */
export function buildWithdrawalQuote(input: WithdrawalInput): WithdrawalQuote {
  const gates: string[] = [];
  const amountCents = asCents(input.amountUsd);
  if (amountCents === undefined || amountCents <= 0)
    gates.push("withdrawal amount must be a positive USD amount");
  if (!input.source.accountId || !input.source.withdrawalsEnabled)
    gates.push("source is not withdrawal-enabled");
  if (!input.destination.id || !input.destination.eligible)
    gates.push("destination is not eligible");
  const quote = input.limitQuote;
  if (!quote) {
    gates.push("source × rail × destination authenticated limit quote is missing");
  } else {
    if (
      quote.sourceAccountId !== input.source.accountId ||
      quote.destinationId !== input.destination.id ||
      quote.rail !== input.destination.rail ||
      quote.provenance !== "authenticated_limit_read"
    )
      gates.push("limit quote does not bind this source × rail × destination");
    if (!Number.isFinite(Date.parse(quote.observedAt)))
      gates.push("limit quote timestamp is invalid");
    if (!quote.eligible) gates.push("limit quote reports this withdrawal route as ineligible");
    if (quote.validationPassed === false)
      gates.push("server validation rejected this withdrawal route");
    if (quote.rail === "bank_standard") {
      if (!quote.fee.known || quote.fee.usd === undefined) {
        gates.push("standard bank withdrawal fee is not explicitly confirmed as zero");
      } else if (
        asCents(quote.fee.usd) === undefined ||
        asCents(quote.fee.usd)! > (asCents(input.maxFeeUsd ?? "0.00") ?? 0)
      ) {
        gates.push("standard bank withdrawal fee is not zero; parent approval is required");
      }
    }
    if (
      quote.rail !== "bank_standard" &&
      (!quote.fee.known ||
        asCents(quote.fee.usd) === undefined ||
        asCents(quote.fee.usd)! > (asCents(input.maxFeeUsd ?? "0.00") ?? 0))
    )
      gates.push("fee unavailable or above authorized maximum");
    if (quote.holds.length) gates.push("limit quote reports an active hold");
    if (
      quote.withdrawableCashUsd !== undefined &&
      (asCents(quote.withdrawableCashUsd) ?? -1) < (amountCents ?? Number.MAX_SAFE_INTEGER)
    )
      gates.push("withdrawable cash is below withdrawal amount");
    for (const window of quote.windows) {
      if (
        (asCents(window.amountRemainingUsd) ?? Number.MAX_SAFE_INTEGER) <
        (amountCents ?? Number.MAX_SAFE_INTEGER)
      )
        gates.push(`${window.period} amount remaining is below withdrawal amount`);
      if (
        window.countRemaining !== undefined &&
        (!Number.isInteger(window.countRemaining) || window.countRemaining < 1)
      )
        gates.push(`${window.period} transfer count remaining is exhausted`);
      if (window.windowEndsAt !== undefined && !Number.isFinite(Date.parse(window.windowEndsAt)))
        gates.push(`${window.period} quota reset timestamp is invalid`);
    }
  }
  if (isRetirementAccount(input.source.accountType) && !input.retirement?.eligibilityVerified)
    gates.push("retirement withdrawal eligibility is not verified");
  if (
    input.history.some(
      (row) =>
        row.amountUsd === input.amountUsd &&
        row.sourceAccountId === input.source.accountId &&
        row.destinationId === input.destination.id &&
        row.rail === input.destination.rail &&
        /pending|queued|submitted|complete|completed|settled/i.test(row.state),
    )
  )
    gates.push("matching withdrawal is already pending or completed");
  return {
    executable: gates.length === 0,
    amountUsd: input.amountUsd,
    source: input.source,
    destination: input.destination,
    fee: quote?.fee ?? { known: false },
    validationPassed: quote?.validationPassed,
    numericLimitsKnown: Boolean(
      quote?.withdrawableCashUsd !== undefined ||
      quote?.windows.some(
        (window) => window.amountRemainingUsd !== undefined || window.countRemaining !== undefined,
      ),
    ),
    gates,
  };
}

/** Requires an exact captured POST and never silently turns a generic ACH route into a withdrawal body. */
export function buildWithdrawalPlan(input: WithdrawalInput): WithdrawalPlan {
  const quote = buildWithdrawalQuote(input);
  const gates = [...quote.gates];
  const request = input.capturedRequest;
  if (!request) gates.push("exact withdrawal write contract has not been captured");
  else if (request.method !== "POST" || !request.url.startsWith("https://") || !request.amountField)
    gates.push("captured withdrawal write contract is incomplete");
  return { ...quote, executable: gates.length === 0, gates, request };
}

export function classifyWithdrawalReceipt(response?: {
  status: number;
  body?: unknown;
}): WithdrawalReceipt {
  if (!response) return { submitted: false, ambiguous: true, receiptStatus: "transport_ambiguous" };
  const body = response.body as
    | { error_code?: string; transfer_id?: string; verification_workflow?: { id?: string } }
    | undefined;
  if (body?.error_code === "suv_check_pending") {
    return {
      submitted: false,
      ambiguous: false,
      receiptStatus: "verification_required",
      status: response.status,
      body: response.body,
      userAction: {
        type: "approve_on_phone",
        message:
          "Open Robinhood on your phone and approve the verification notification. Approval is not a transfer receipt; reconcile transfer status before resuming this request.",
        workflowId: body.verification_workflow?.id,
        automaticRetry: false,
      },
    };
  }
  const successfulHttp = response.status >= 200 && response.status < 300;
  const serverReceiptId = typeof body?.transfer_id === "string" ? body.transfer_id : undefined;
  if (successfulHttp && !serverReceiptId)
    return {
      submitted: false,
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
      status: response.status,
      body: response.body,
    };
  return {
    submitted: successfulHttp,
    ambiguous: false,
    receiptStatus: successfulHttp ? "accepted" : "rejected",
    ...(serverReceiptId ? { serverReceiptId } : {}),
    status: response.status,
    body: response.body,
  };
}

/** One-shot only: the caller must read withdrawal status before considering any retry. */
export async function executeWithdrawal(
  plan: WithdrawalPlan,
  send: (
    request: CapturedWithdrawalRequest & { body: Record<string, unknown> },
  ) => Promise<{ status: number; body?: unknown }>,
): Promise<WithdrawalReceipt> {
  if (!plan.executable) throw new Error(`Withdrawal is not executable: ${plan.gates.join("; ")}`);
  if (!plan.request)
    throw new Error(
      "Withdrawal write contract has not been captured; refusing to invent a request",
    );
  try {
    return classifyWithdrawalReceipt(
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
