export interface WorkbenchLeg {
  id: string;
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  ratioQuantity?: number;
  premium: number;
  delta?: number; gamma?: number; theta?: number; vega?: number;
}

function legPayoff(leg: WorkbenchLeg, spot: number): number {
  const intrinsic = leg.type === "call" ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
  const signed = leg.action === "buy" ? 1 : -1;
  return signed * (intrinsic - leg.premium) * (leg.ratioQuantity ?? 1) * 100;
}

/** Pure options package analysis. Review/collateral responses stay body-bound to this exact leg set. */
export function buildOptionsWorkbench(input: {
  symbol: string;
  expiration: string;
  underlyingPrice: number;
  quantity?: number;
  legs: WorkbenchLeg[];
  orderBody?: unknown;
  collateral?: unknown;
  review?: unknown;
  rollAlternatives?: unknown[];
}) {
  if (!input.legs.length) throw new Error("Options workbench requires at least one leg");
  const quantity = input.quantity ?? 1;
  const strikes = input.legs.map((leg) => leg.strike);
  const scenarioSpots = [...new Set([0, ...strikes, input.underlyingPrice, Math.max(...strikes) * 1.5])].sort((a, b) => a - b);
  const payoff = scenarioSpots.map((spot) => ({ spot, pnl: Number((input.legs.reduce((sum, leg) => sum + legPayoff(leg, spot), 0) * quantity).toFixed(2)) }));
  const values = payoff.map((row) => row.pnl);
  const greek = (name: "delta"|"gamma"|"theta"|"vega") => Number((input.legs.reduce((sum, leg) => sum + (leg.action === "buy" ? 1 : -1) * Number(leg[name] ?? 0) * (leg.ratioQuantity ?? 1) * quantity * 100, 0)).toFixed(6));
  return {
    contract: { symbol: input.symbol.toUpperCase(), expiration: input.expiration, quantity, legs: input.legs },
    package: { netPremium: Number((input.legs.reduce((sum, leg) => sum + (leg.action === "sell" ? 1 : -1) * leg.premium * (leg.ratioQuantity ?? 1) * 100, 0) * quantity).toFixed(2)) },
    payoff: { scenarios: payoff, sampledMaxProfit: Math.max(...values), sampledMaxLoss: Math.min(...values), note: "Sampled payoff; unbounded tails require strategy classification." },
    netGreeks: { delta: greek("delta"), gamma: greek("gamma"), theta: greek("theta"), vega: greek("vega") },
    approvalCard: { body: input.orderBody ?? null, collateral: input.collateral ?? null, review: input.review ?? null, bodyBound: Boolean(input.orderBody) },
    rollAlternatives: input.rollAlternatives ?? []
  };
}
