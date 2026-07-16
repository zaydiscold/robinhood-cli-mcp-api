import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PortfolioSnapshot {
  version: 1 | 2;
  id: string;
  capturedAt: string;
  source: "portfolio";
  data: PortfolioSnapshotData;
}

interface SnapshotPosition {
  accountNumber?: unknown;
  acct?: unknown;
  kind?: unknown;
  symbol?: unknown;
  name?: unknown;
  marketValueUsd?: unknown;
  value?: unknown;
  dayChangeUsd?: unknown;
  dayUsd?: unknown;
  qty?: unknown;
}

interface PortfolioSnapshotData {
  totals?: {
    equity?: unknown;
    day?: unknown;
    afterHours?: unknown;
    equityUsd?: unknown;
    regularCloseEquityUsd?: unknown;
    dayChangeUsd?: unknown;
    afterHoursChangeUsd?: unknown;
  };
  reconciliation?: { driverDayChangeUsd?: unknown };
  drivers?: SnapshotPosition[];
  byPosition?: SnapshotPosition[];
}

export function appendPortfolioSnapshot(path: string, snapshot: PortfolioSnapshot): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readPortfolioSnapshots(path: string): PortfolioSnapshot[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as PortfolioSnapshot;
      } catch {
        throw new Error(`Invalid portfolio snapshot JSONL at line ${index + 1}`);
      }
    });
}

function numericDelta(after: unknown, before: unknown): number | null {
  const a = Number(after),
    b = Number(before);
  return Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(4)) : null;
}

export function diffPortfolioSnapshots(before: PortfolioSnapshot, after: PortfolioSnapshot) {
  const crossVersion = before.version !== after.version;
  const positionsFor = (snapshot: PortfolioSnapshot) =>
    snapshot.data.byPosition ?? snapshot.data.drivers ?? [];
  const keyFor = (position: SnapshotPosition) =>
    [position.accountNumber ?? position.acct, position.kind, position.symbol, position.name]
      .map((part) => (part == null ? "" : String(part)))
      .join(":");
  const beforeDrivers = new Map<string, SnapshotPosition>(
    positionsFor(before).map((position) => [keyFor(position), position]),
  );
  const afterDrivers = new Map<string, SnapshotPosition>(
    positionsFor(after).map((position) => [keyFor(position), position]),
  );
  const positions = [...new Set([...beforeDrivers.keys(), ...afterDrivers.keys()])]
    .map((key) => {
      const a = afterDrivers.get(key) ?? {},
        b = beforeDrivers.get(key) ?? {};
      return {
        key,
        valueDelta: numericDelta(a.marketValueUsd ?? a.value, b.marketValueUsd ?? b.value),
        dayUsdDelta: numericDelta(a.dayChangeUsd ?? a.dayUsd, b.dayChangeUsd ?? b.dayUsd),
        quantityDelta: numericDelta(a.qty, b.qty),
      };
    })
    .filter((row) => row.valueDelta !== 0 || row.dayUsdDelta !== 0 || row.quantityDelta !== 0);
  const equityBasis = (snapshot: PortfolioSnapshot) => {
    const totals = snapshot.data.totals;
    if (snapshot.version === 2)
      return crossVersion
        ? (totals?.regularCloseEquityUsd ?? totals?.equityUsd)
        : totals?.equityUsd;
    return totals?.equityUsd ?? totals?.equity;
  };
  const dayBasis = (snapshot: PortfolioSnapshot) => {
    const totals = snapshot.data.totals;
    if (snapshot.version === 1)
      return (
        snapshot.data.reconciliation?.driverDayChangeUsd ?? totals?.dayChangeUsd ?? totals?.day
      );
    return totals?.dayChangeUsd;
  };
  return {
    before: { id: before.id, capturedAt: before.capturedAt },
    after: { id: after.id, capturedAt: after.capturedAt },
    comparison: {
      crossVersion,
      equityBasis: crossVersion
        ? "regular-close"
        : after.version === 2
          ? "current"
          : "legacy-regular-close",
      dayBasis: "priced-position",
    },
    totals: {
      equityDelta: numericDelta(equityBasis(after), equityBasis(before)),
      dayDelta: numericDelta(dayBasis(after), dayBasis(before)),
      afterHoursDelta: numericDelta(
        after.data.totals?.afterHoursChangeUsd ?? after.data.totals?.afterHours,
        before.data.totals?.afterHoursChangeUsd ?? before.data.totals?.afterHours,
      ),
    },
    positions,
  };
}
