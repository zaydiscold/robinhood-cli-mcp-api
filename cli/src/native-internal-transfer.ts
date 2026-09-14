import { randomUUID } from "node:crypto";
export interface IraDistributionFields {
  distributionType: string;
  federalTaxWithholdingPercent: string;
  stateTaxWithholdingPercent: string;
  state: string;
}
export interface NativeInternalTransferInput {
  sourceId: string;
  destinationId: string;
  amountUsd: string;
  contributionYear?: number;
  contributionType?: "contribution" | "rollover";
  iraDistribution?: IraDistributionFields;
  idempotencyId?: string;
  dryRun?: boolean;
}
const percent = (value: string) => /^\d+(?:\.\d{1,4})?$/.test(value);
export function buildNativeInternalTransferBody(
  input: NativeInternalTransferInput,
  sourceType: string,
  destinationType: string,
) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(input.amountUsd) || Number(input.amountUsd) <= 0)
    throw new Error("Positive USD amount required");
  if (input.sourceId === input.destinationId) throw new Error("Source and destination must differ");
  const retirementSource = sourceType.startsWith("ira");
  const retirementDestination = destinationType.startsWith("ira");
  if (retirementSource && retirementDestination)
    throw new Error("Retirement-to-retirement conversion requires a captured conversion contract");
  if (retirementSource) {
    const distribution = input.iraDistribution;
    if (
      !distribution ||
      !distribution.distributionType ||
      !/^[A-Z]{2}$/.test(distribution.state) ||
      !percent(distribution.federalTaxWithholdingPercent) ||
      !percent(distribution.stateTaxWithholdingPercent)
    )
      throw new Error(
        "Retirement-originating transfer requires explicit distribution type, two-letter state, and withholding percents; no distribution is inferred",
      );
    if (input.contributionYear !== undefined)
      throw new Error("Contribution year does not apply to a retirement-originating transfer");
  } else if (input.iraDistribution) {
    throw new Error("Distribution fields do not apply to a taxable source");
  }
  if (retirementDestination && !Number.isInteger(input.contributionYear))
    throw new Error("Explicit contribution year required for a retirement destination");
  if (!retirementDestination && input.contributionYear !== undefined)
    throw new Error("Contribution year does not apply to taxable transfers");
  return {
    id: input.idempotencyId ?? randomUUID(),
    additional_data: {
      entry_point: retirementDestination ? 0 : 5,
      ...(retirementDestination
        ? {
            ira_contribution_data: {
              contribution_type: input.contributionType ?? "contribution",
              tax_year: input.contributionYear,
            },
          }
        : {}),
      ...(retirementSource
        ? {
            ira_distribution_data: {
              distribution_type: input.iraDistribution!.distributionType,
              federal_tax_withholding_percent: input.iraDistribution!.federalTaxWithholdingPercent,
              state: input.iraDistribution!.state,
              state_tax_withholding_percent: input.iraDistribution!.stateTaxWithholdingPercent,
            },
          }
        : {}),
    },
    amount: input.amountUsd,
    currency: "usd",
    frequency: "once",
    source: { id: input.sourceId, type: sourceType },
    sink: { id: input.destinationId, type: destinationType },
  };
}
/** Native normal-input path; the website's shared transfer builder handles rhs→rhs too. */
export async function executeNativeInternalTransfer(input: NativeInternalTransferInput) {
  const api = await import("./lib.js");
  const accounts = (await api.brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/"))
    .results as Record<string, unknown>[];
  const source = accounts.find((a) => a.account_id === input.sourceId && a.is_external === false);
  const destination = accounts.find(
    (a) => a.account_id === input.destinationId && a.is_external === false,
  );
  if (!source || !destination)
    throw new Error("Both endpoints must be currently owned Robinhood accounts");
  if (source.is_withdrawals_enabled !== true || destination.is_deposits_enabled !== true)
    throw new Error("This source/destination currently has transfers disabled by the broker");
  if (
    source.withdrawable_cash != null &&
    Number.isFinite(Number(source.withdrawable_cash)) &&
    Number(source.withdrawable_cash) < Number(input.amountUsd)
  )
    throw new Error("Withdrawable cash is below the requested amount");
  const body = buildNativeInternalTransferBody(
    input,
    String(source.type),
    String(destination.type),
  );
  const { getMoneyMovementQuote } = await import("./money-movement-quote.js");
  const liveQuote = await getMoneyMovementQuote({
    sourceId: input.sourceId,
    destinationId: input.destinationId,
    amountUsd: input.amountUsd,
    kind: "internal",
  });
  if (!liveQuote.executable)
    return {
      submitted: false,
      ambiguous: false,
      receiptStatus: "validation_rejected",
      validation: liveQuote.validation,
      reasons: liveQuote.reasons,
      idempotencyId: body.id,
    };
  const validation = await api.brokerageGetJson(
    "https://api.robinhood.com/bff-mm/transfer/validation",
    {},
    {
      direction: "TRANSFER_DIRECTION_INTERNAL",
      state: "TRANSFER_STATE_EDIT",
      "amount.amount": input.amountUsd,
      "amount.currency": "USD",
      "source.id": input.sourceId,
      "sink.id": input.destinationId,
    },
  );
  if (validation?.isSuccess !== true)
    return {
      submitted: false,
      ambiguous: false,
      receiptStatus: "validation_rejected",
      validation,
      idempotencyId: body.id,
    };
  if (input.dryRun)
    return {
      submitted: false,
      ambiguous: false,
      receiptStatus: "dry_run",
      validation,
      body,
      idempotencyId: body.id,
    };
  if (process.env.ROBINHOOD_ALLOW_LIVE_WRITE !== "1")
    throw new Error("ROBINHOOD_ALLOW_LIVE_WRITE=1 required");
  const { reconcileBeforeMoneyMovement } = await import("./money-movement-receipt.js");
  const existing = await reconcileBeforeMoneyMovement({
    clientId: body.id,
    sourceId: input.sourceId,
    destinationId: input.destinationId,
    amountUsd: input.amountUsd,
    kind: "internal",
  });
  if (existing)
    return {
      submitted: false,
      ambiguous: false,
      receiptStatus: "already_exists",
      serverReceiptId: existing.serverReceiptId,
      idempotencyId: body.id,
    };
  const steps: Array<{ status: number; body: Record<string, unknown>; url: string }> = [];
  for (const endpoint of ["pre_create", "create"]) {
    const url = "https://bonfire.robinhood.com/transfer/" + endpoint + "/";
    try {
      const response = await api.executeBrokerageRequest(
        {
          url,
          method: "POST",
          risk: "write-mutate",
          mutatesAccount: true,
          requiresAuth: true,
          mode: "execute",
          host: "bonfire.robinhood.com",
          categories: ["money-movement"],
          missingParams: [],
          warnings: [],
          command: "internal-transfer-execute",
        },
        { body, dryRun: false, fullBody: true, autoRetry: false },
      );
      const data = JSON.parse(response.body || "{}");
      steps.push({ status: response.status, body: data, url });
      if (response.status < 200 || response.status >= 300)
        return {
          submitted: false,
          ambiguous: false,
          receiptStatus: data.verification_workflow ? "verification_required" : "rejected",
          idempotencyId: body.id,
          steps,
        };
      if (endpoint === "pre_create" && data.pre_transfer_actions?.length)
        return {
          submitted: false,
          ambiguous: false,
          receiptStatus: "action_required",
          idempotencyId: body.id,
          steps,
        };
      if (endpoint === "create")
        return {
          submitted: typeof data.transfer_id === "string",
          ambiguous: typeof data.transfer_id !== "string",
          receiptStatus: typeof data.transfer_id === "string" ? "accepted" : "transport_ambiguous",
          serverReceiptId: data.transfer_id,
          idempotencyId: body.id,
          steps,
        };
    } catch (error) {
      return {
        submitted: false,
        ambiguous: true,
        receiptStatus: "transport_ambiguous",
        idempotencyId: body.id,
        steps,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  throw new Error("No transfer result");
}
