export type MovementKind = "deposit" | "withdrawal" | "internal";
export interface MovementQuoteInput {
  sourceId: string;
  destinationId: string;
  amountUsd: string;
  kind: MovementKind;
  rail?: "bank_standard" | "bank_instant" | "debit_card";
  maxFeeUsd?: string;
}
export const USD_CURRENCY_ID = "1072fc76-1862-41ab-82c2-485837590762"; // public currency identifier, not an account identifier
export async function getMoneyMovementQuote(input: MovementQuoteInput) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(input.amountUsd) || Number(input.amountUsd) <= 0)
    throw new Error("Positive USD amount required");
  const api = await import("./lib.js");
  const [accounts, limits] = await Promise.all([
    api.brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/"),
    api.brokerageGetJson("https://bonfire.robinhood.com/limitshub/v1/limits/"),
  ]);
  const source = accounts.results.find(
    (a: Record<string, unknown>) => a.account_id === input.sourceId,
  );
  const destination = accounts.results.find(
    (a: Record<string, unknown>) => a.account_id === input.destinationId,
  );
  if (!source || !destination)
    throw new Error("Source/destination not present in authenticated transfer inventory");
  const actualKind = source.is_external
    ? "deposit"
    : destination.is_external
      ? "withdrawal"
      : "internal";
  if (actualKind !== input.kind)
    throw new Error("Direction disagrees with the selected account pair");
  const reasons: string[] = [];
  if (source.is_withdrawals_enabled !== true || destination.is_deposits_enabled !== true)
    reasons.push("Broker-disabled source or destination");
  if (source.account_id === destination.account_id) reasons.push("Same source and destination");
  if (
    source.withdrawable_cash != null &&
    Number.isFinite(Number(source.withdrawable_cash)) &&
    Number(source.withdrawable_cash) < Number(input.amountUsd)
  )
    reasons.push("Withdrawable cash is below the requested amount");
  if (String(source.type).startsWith("ira") && input.kind !== "deposit")
    reasons.push(
      "Retirement-originating movement requires captured distribution/conversion fields; no distribution is inferred",
    );
  const rail = input.rail ?? "bank_standard";
  const productType =
    input.kind === "internal"
      ? "internal"
      : rail === "debit_card"
        ? "debit_card_funding"
        : rail === "bank_instant"
          ? "instant_bank_transfer"
          : "originated_ach";
  const group =
    limits.product_limits.find(
      (r: Record<string, unknown> & { product_type?: string; details?: { direction?: string } }) =>
        r.product_type === productType &&
        r.details?.direction === (input.kind === "withdrawal" ? "withdraw" : input.kind),
    ) ?? null;
  if (group) {
    const t = group.transfer_limits;
    if (t?.min_transfer && Number(input.amountUsd) < Number(t.min_transfer))
      reasons.push("Below broker minimum transfer");
    if (t?.max_transfer && Number(input.amountUsd) > Number(t.max_transfer))
      reasons.push("Above broker maximum transfer");
    for (const r of group.amount_limits ?? [])
      if (r.remaining_amount != null && Number(input.amountUsd) > Number(r.remaining_amount))
        reasons.push("Remaining amount allowance exhausted");
    for (const r of group.count_limits ?? [])
      if (r.remaining_count != null && r.remaining_count <= 0)
        reasons.push("Transfer count allowance exhausted");
    if (group.pending_count_limits?.remaining_pending_count === 0)
      reasons.push("Pending transfer allowance exhausted");
  }
  const validation = await api.brokerageGetJson(
    "https://api.robinhood.com/bff-mm/transfer/validation",
    {},
    {
      direction:
        "TRANSFER_DIRECTION_" +
        (input.kind === "internal"
          ? "INTERNAL"
          : input.kind === "deposit"
            ? "DEPOSIT"
            : "WITHDRAWAL"),
      state: "TRANSFER_STATE_EDIT",
      "amount.amount": input.amountUsd,
      "amount.currency": "USD",
      "source.id": input.sourceId,
      "sink.id": input.destinationId,
    },
  );
  if (validation?.isSuccess !== true)
    reasons.push("Broker validation did not approve this route and amount");
  const fee =
    input.kind === "internal"
      ? {
          service_fee: "0.00",
          original_amount: input.amountUsd,
          net_amount: input.amountUsd,
          provenance: "observed_internal_transfer_receipt",
        }
      : await api.brokerageGetJson(
          "https://bonfire.robinhood.com/transfer/service_fee/",
          {},
          {
            amount: JSON.stringify({
              amount: input.amountUsd,
              currency_code: "USD",
              currency_id: USD_CURRENCY_ID,
            }),
            source_account_type: source.type,
            sink_account_type: destination.type,
            transfer_type: productType,
          },
        );
  const maxFee = input.maxFeeUsd ?? "0.00";
  if (!/^\d+(?:\.\d{1,2})?$/.test(maxFee)) throw new Error("Invalid maximum fee");
  if (fee.service_fee == null || !Number.isFinite(Number(fee.service_fee)))
    reasons.push("Fee unavailable");
  else if (Number(fee.service_fee) > Number(maxFee)) reasons.push("Fee exceeds authorized maximum");
  return {
    observedAt: new Date().toISOString(),
    ...input,
    rail,
    sourceType: source.type,
    destinationType: destination.type,
    executable: reasons.length === 0,
    reasons,
    validation,
    fee,
    limits: group,
    limitScope: {
      providerProduct: productType,
      direction: input.kind,
      sourceSpecificBucket: null,
      sharedAcrossSources: null,
    },
    withdrawableCashUsd: source.withdrawable_cash ?? null,
    holds: source.holds ?? null,
    settlement:
      input.kind === "internal"
        ? "observed_immediate"
        : rail === "bank_standard"
          ? "up_to_5_business_days"
          : rail === "debit_card"
            ? "typically_30_minutes"
            : "requires_bank_acceptance_then_minutes",
  };
}
