import { createHash } from "node:crypto";

export interface WorkbenchLeg {
  id: string;
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  ratioQuantity?: number;
  premium?: number;
  bid?: number;
  ask?: number;
  mark?: number;
  delta?: number; gamma?: number; theta?: number; vega?: number;
}

function legPayoff(leg: WorkbenchLeg, spot: number): number {
  const intrinsic = leg.type === "call" ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
  const signed = leg.action === "buy" ? 1 : -1;
  return signed * (intrinsic - Number(leg.premium)) * (leg.ratioQuantity ?? 1) * 100;
}

function resolvePremium(leg: WorkbenchLeg, mode: "natural" | "mid"): number {
  if (Number.isFinite(leg.premium)) return Number(leg.premium);
  const bid = Number(leg.bid), ask = Number(leg.ask), mark = Number(leg.mark);
  if (mode === "natural") {
    const natural = leg.action === "buy" ? ask : bid;
    if (Number.isFinite(natural)) return natural;
  }
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  if (Number.isFinite(mark)) return mark;
  throw new Error(`Leg ${leg.id} needs premium, mark, or a usable bid/ask`);
}

/** Pure options package analysis. Review/collateral responses stay body-bound to this exact leg set. */
export function buildOptionsWorkbench(input: {
  symbol: string;
  expiration: string;
  underlyingPrice: number;
  quantity?: number;
  pricingMode?: "natural" | "mid";
  legs: WorkbenchLeg[];
  orderBody?: unknown;
  collateral?: unknown;
  review?: unknown;
  rollAlternatives?: unknown[];
}) {
  if (!input.legs.length) throw new Error("Options workbench requires at least one leg");
  const quantity = input.quantity ?? 1;
  const legs = input.legs.map((leg) => ({ ...leg, premium: resolvePremium(leg, input.pricingMode ?? "mid") }));
  const strikes = legs.map((leg) => leg.strike);
  const breakpoints = [...new Set([0, ...strikes])].sort((a, b) => a - b);
  const payoffAt = (spot: number) => Number((legs.reduce((sum, leg) => sum + legPayoff(leg, spot), 0) * quantity).toFixed(2));
  const payoff = [...new Set([...breakpoints, input.underlyingPrice])].sort((a, b) => a - b).map((spot) => ({ spot, pnl: payoffAt(spot) }));
  const breakpointValues = breakpoints.map(payoffAt);
  const rightTailSlope = legs.reduce((sum, leg) => sum + (leg.type === "call" ? (leg.action === "buy" ? 1 : -1) * (leg.ratioQuantity ?? 1) * quantity * 100 : 0), 0);
  const maxProfit: number | "unlimited" = rightTailSlope > 0 ? "unlimited" : Math.max(...breakpointValues);
  const maxLoss: number | "unlimited" = rightTailSlope < 0 ? "unlimited" : Math.abs(Math.min(...breakpointValues, 0));
  const breakevens: number[] = [];
  for (let i = 0; i < breakpoints.length - 1; i += 1) {
    const x1 = breakpoints[i]!, x2 = breakpoints[i + 1]!, y1 = payoffAt(x1), y2 = payoffAt(x2);
    if (y1 === 0) breakevens.push(x1);
    if (y1 * y2 < 0) breakevens.push(Number((x1 + (0 - y1) * (x2 - x1) / (y2 - y1)).toFixed(4)));
  }
  const lastX = breakpoints.at(-1)!, lastY = payoffAt(lastX);
  if (rightTailSlope !== 0 && lastY * rightTailSlope < 0) breakevens.push(Number((lastX - lastY / rightTailSlope).toFixed(4)));
  const greek = (name: "delta"|"gamma"|"theta"|"vega") => Number((legs.reduce((sum, leg) => sum + (leg.action === "buy" ? 1 : -1) * Number(leg[name] ?? 0) * (leg.ratioQuantity ?? 1) * quantity * 100, 0)).toFixed(6));
  const bodyHash = input.orderBody === undefined ? null : createHash("sha256").update(JSON.stringify(input.orderBody)).digest("hex");
  return {
    contract: { symbol: input.symbol.toUpperCase(), expiration: input.expiration, quantity, legs },
    package: { pricingMode: input.pricingMode ?? "mid", netPremium: Number((legs.reduce((sum, leg) => sum + (leg.action === "sell" ? 1 : -1) * Number(leg.premium) * (leg.ratioQuantity ?? 1) * 100, 0) * quantity).toFixed(2)) },
    payoff: { scenarios: payoff, maxProfit, maxLoss, breakevens, rightTailSlope, exactForSameExpiration: true },
    netGreeks: { delta: greek("delta"), gamma: greek("gamma"), theta: greek("theta"), vega: greek("vega") },
    approvalCard: { body: input.orderBody ?? null, bodySha256: bodyHash, collateral: input.collateral ?? null, review: input.review ?? null, bodyBound: Boolean(input.orderBody) },
    rollAlternatives: input.rollAlternatives ?? []
  };
}
