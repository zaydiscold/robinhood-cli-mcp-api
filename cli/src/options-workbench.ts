import { createHash } from "node:crypto";

type QuoteValue = number | string | null;
type GreekName = "delta" | "gamma" | "theta" | "vega";

export interface WorkbenchLeg {
  id: string;
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  ratioQuantity?: number;
  premium?: QuoteValue;
  bid?: QuoteValue;
  ask?: QuoteValue;
  mark?: QuoteValue;
  delta?: QuoteValue;
  gamma?: QuoteValue;
  theta?: QuoteValue;
  vega?: QuoteValue;
}

export interface ExpirationPayoffSummary {
  scenarios: Array<{ spot: number; pnl: number }>;
  maxProfit: number | "unlimited";
  maxLoss: number | "unlimited";
  breakevens: number[];
  rightTailSlope: number;
  exactForSameExpiration: true;
}

export interface GreekCoverage {
  observedLegs: number;
  totalLegs: number;
  complete: boolean;
  missingLegIds: string[];
  invalidLegIds: string[];
}

function legPayoff(leg: WorkbenchLeg & { premium: number }, spot: number): number {
  const intrinsic =
    leg.type === "call" ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
  const signed = leg.action === "buy" ? 1 : -1;
  return signed * (intrinsic - leg.premium) * (leg.ratioQuantity ?? 1) * 100;
}

function finiteQuote(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function isMissingNumeric(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function finiteSignedNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function resolvePremium(leg: WorkbenchLeg, mode: "natural" | "mid"): number {
  const premium = finiteQuote(leg.premium);
  if (premium !== null) return premium;

  const bid = finiteQuote(leg.bid);
  const ask = finiteQuote(leg.ask);
  const mark = finiteQuote(leg.mark);
  if (mode === "natural") {
    const natural = leg.action === "buy" ? ask : bid;
    if (natural !== null) return natural;
  }
  if (bid !== null && ask !== null) return (bid + ask) / 2;
  if (mark !== null) return mark;
  throw new Error(`Leg ${leg.id} needs premium, mark, or a usable bid/ask`);
}

/**
 * Exact same-expiration payoff envelope from resolved premiums.
 * Shared by the options workbench and strategy-quote pricing summary.
 */
export function computeExpirationPayoff(input: {
  legs: Array<WorkbenchLeg & { premium: number }>;
  quantity?: number;
  underlyingPrice?: number;
}): ExpirationPayoffSummary {
  if (!input.legs.length) throw new Error("Expiration payoff requires at least one leg");
  const quantity = input.quantity ?? 1;
  const legs = input.legs;
  const strikes = legs.map((leg) => leg.strike);
  const breakpoints = [...new Set([0, ...strikes])].sort((a, b) => a - b);
  const payoffAt = (spot: number) =>
    Number((legs.reduce((sum, leg) => sum + legPayoff(leg, spot), 0) * quantity).toFixed(2));
  const scenarioSpots = [
    ...new Set([
      ...breakpoints,
      ...(Number.isFinite(input.underlyingPrice) ? [Number(input.underlyingPrice)] : []),
    ]),
  ].sort((a, b) => a - b);
  const scenarios = scenarioSpots.map((spot) => ({ spot, pnl: payoffAt(spot) }));
  const breakpointValues = breakpoints.map(payoffAt);
  const rightTailSlope = legs.reduce(
    (sum, leg) =>
      sum +
      (leg.type === "call"
        ? (leg.action === "buy" ? 1 : -1) * (leg.ratioQuantity ?? 1) * quantity * 100
        : 0),
    0,
  );
  const maxProfit: number | "unlimited" =
    rightTailSlope > 0 ? "unlimited" : Math.max(...breakpointValues);
  const maxLoss: number | "unlimited" =
    rightTailSlope < 0 ? "unlimited" : Math.abs(Math.min(...breakpointValues, 0));
  const breakevens: number[] = [];
  for (let i = 0; i < breakpoints.length - 1; i += 1) {
    const x1 = breakpoints[i]!;
    const x2 = breakpoints[i + 1]!;
    const y1 = payoffAt(x1);
    const y2 = payoffAt(x2);
    if (y1 === 0) breakevens.push(x1);
    if (y1 * y2 < 0) {
      breakevens.push(Number((x1 + ((0 - y1) * (x2 - x1)) / (y2 - y1)).toFixed(4)));
    }
  }
  const lastX = breakpoints.at(-1)!;
  const lastY = payoffAt(lastX);
  if (lastY === 0) breakevens.push(lastX);
  if (rightTailSlope !== 0 && lastY * rightTailSlope < 0) {
    breakevens.push(Number((lastX - lastY / rightTailSlope).toFixed(4)));
  }
  return {
    scenarios,
    maxProfit,
    maxLoss,
    breakevens,
    rightTailSlope,
    exactForSameExpiration: true,
  };
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
  const legs = input.legs.map((leg) => ({
    ...leg,
    premium: resolvePremium(leg, input.pricingMode ?? "mid"),
  }));
  const payoff = computeExpirationPayoff({
    legs,
    quantity,
    underlyingPrice: input.underlyingPrice,
  });
  const greek = (name: GreekName) => {
    const missingLegIds: string[] = [];
    const invalidLegIds: string[] = [];
    let observedLegs = 0;
    const total = legs.reduce((sum, leg) => {
      const raw = leg[name];
      if (isMissingNumeric(raw)) {
        missingLegIds.push(leg.id);
        return sum;
      }
      const numeric = finiteSignedNumber(raw);
      if (numeric === null) {
        invalidLegIds.push(leg.id);
        return sum;
      }
      observedLegs += 1;
      return (
        sum +
        (leg.action === "buy" ? 1 : -1) *
          numeric *
          (leg.ratioQuantity ?? 1) *
          quantity *
          100
      );
    }, 0);
    return {
      value: Number(total.toFixed(6)),
      coverage: {
        observedLegs,
        totalLegs: legs.length,
        complete: observedLegs === legs.length,
        missingLegIds,
        invalidLegIds,
      } satisfies GreekCoverage,
    };
  };
  const delta = greek("delta");
  const gamma = greek("gamma");
  const theta = greek("theta");
  const vega = greek("vega");
  const bodyHash =
    input.orderBody === undefined
      ? null
      : createHash("sha256").update(JSON.stringify(input.orderBody)).digest("hex");
  return {
    contract: { symbol: input.symbol.toUpperCase(), expiration: input.expiration, quantity, legs },
    package: {
      pricingMode: input.pricingMode ?? "mid",
      netPremium: Number(
        (
          legs.reduce(
            (sum, leg) =>
              sum +
              (leg.action === "sell" ? 1 : -1) *
                leg.premium *
                (leg.ratioQuantity ?? 1) *
                100,
            0,
          ) * quantity
        ).toFixed(2),
      ),
    },
    payoff,
    netGreeks: {
      delta: delta.value,
      gamma: gamma.value,
      theta: theta.value,
      vega: vega.value,
    },
    greekCoverage: {
      delta: delta.coverage,
      gamma: gamma.coverage,
      theta: theta.coverage,
      vega: vega.coverage,
    },
    approvalCard: {
      body: input.orderBody ?? null,
      bodySha256: bodyHash,
      collateral: input.collateral ?? null,
      review: input.review ?? null,
      bodyBound: Boolean(input.orderBody),
    },
    rollAlternatives: input.rollAlternatives ?? [],
  };
}
