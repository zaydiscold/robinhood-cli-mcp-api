export function applyBankTransferChoice(
  body: Record<string, unknown>,
  actions: unknown[],
  method: "bank_standard" | "bank_instant",
): Record<string, unknown> {
  const types = actions.map((a) => (a as { type?: string })?.type);
  if (types.some((t) => t !== "rfp_upsell" && t !== "rtp_upsell"))
    throw new Error("A separate broker-required pre-transfer action must be completed");
  if (method === "bank_instant" && !types.includes("rfp_upsell"))
    throw new Error("Broker did not offer instant bank deposit for this source/destination");
  return {
    ...body,
    additional_data: {
      ...((body.additional_data as Record<string, unknown>) ?? {}),
      is_instant_transfer: method === "bank_instant",
    },
  };
}
