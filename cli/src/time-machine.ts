import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PortfolioSnapshot {
  version: 1;
  id: string;
  capturedAt: string;
  source: "portfolio";
  data: any;
}

export function appendPortfolioSnapshot(path: string, snapshot: PortfolioSnapshot): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readPortfolioSnapshots(path: string): PortfolioSnapshot[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as PortfolioSnapshot; }
    catch { throw new Error(`Invalid portfolio snapshot JSONL at line ${index + 1}`); }
  });
}

function numericDelta(after: unknown, before: unknown): number | null {
  const a = Number(after), b = Number(before);
  return Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(4)) : null;
}

export function diffPortfolioSnapshots(before: PortfolioSnapshot, after: PortfolioSnapshot) {
  const beforeDrivers = new Map<string, any>((before.data?.drivers ?? []).map((d: any) => [`${d.kind}:${d.symbol}:${d.name ?? ""}`, d]));
  const afterDrivers = new Map<string, any>((after.data?.drivers ?? []).map((d: any) => [`${d.kind}:${d.symbol}:${d.name ?? ""}`, d]));
  const positions = [...new Set([...beforeDrivers.keys(), ...afterDrivers.keys()])].map((key) => {
    const a = afterDrivers.get(key) ?? {}, b = beforeDrivers.get(key) ?? {};
    return { key, valueDelta: numericDelta(a.value, b.value), dayUsdDelta: numericDelta(a.dayUsd, b.dayUsd), quantityDelta: numericDelta(a.qty, b.qty) };
  }).filter((row) => row.valueDelta !== 0 || row.dayUsdDelta !== 0 || row.quantityDelta !== 0);
  return {
    before: { id: before.id, capturedAt: before.capturedAt },
    after: { id: after.id, capturedAt: after.capturedAt },
    totals: {
      equityDelta: numericDelta(after.data?.totals?.equity, before.data?.totals?.equity),
      dayDelta: numericDelta(after.data?.totals?.day, before.data?.totals?.day),
      afterHoursDelta: numericDelta(after.data?.totals?.afterHours, before.data?.totals?.afterHours)
    },
    positions
  };
}
