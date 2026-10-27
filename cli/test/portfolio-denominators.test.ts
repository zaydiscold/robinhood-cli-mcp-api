import { describe, it, expect } from "vitest";
import { computeExposure, getMarginHealth } from "../src/lib.js";
const accounts = { results: [{ type: "rhs", account_number: "111111111" }] };
describe("portfolio interpretation fields", () => {
  it.each([543, undefined])(
    "preserves uncleared-deposit context %s without calling it a broker notice",
    async (uncleared) => {
      const getJson = async (url: string) => {
        if (url.includes("transfer/accounts")) return accounts;
        if (url.includes("investing_info")) return { amount_borrowed: "7000" };
        if (url.includes("portfolios/"))
          return {
            equity: "2700",
            market_value: "9700",
            excess_maintenance: "-1857",
            excess_maintenance_with_uncleared_deposits: uncleared,
          };
        return { results: [] };
      };
      const result = await getMarginHealth(undefined, { getJson: getJson as never });
      expect(result.accounts[0].excessMaintenanceWithUnclearedDepositsUsd).toBe(uncleared ?? null);
      expect(result.accounts[0].pendingDepositMaintenanceAdjustmentUsd).toBe(
        uncleared === undefined ? null : 2400,
      );
      expect(result.accounts[0].riskStatusSource).toContain("not a broker call notice");
    },
  );
  it.each([100, 0, -100])(
    "distinguishes gross weights from net-equity weights at equity %s",
    async (equity) => {
      const getJson = async (url: string) => {
        if (url.includes("transfer/accounts")) return accounts;
        if (url.includes("portfolios/")) return { equity };
        if (url.includes("marketdata/quotes"))
          return { results: [{ instrument_id: "example", last_trade_price: "200" }] };
        return { results: [] };
      };
      const getAll = async (url: string) =>
        url.includes("aggregate_positions")
          ? []
          : [{ symbol: "EXMP", quantity: "1", instrument_id: "example" }];
      const result = await computeExposure({}, { getJson, getAll });
      expect(result.grossPositionValueUsd).toBe(200);
      expect(result.concentration[0].weightPct).toBe(100);
      expect(result.concentration[0].weightPctOfNetEquity).toBe(equity > 0 ? 200 : null);
      expect(result.concentrationWeightBasis).toContain("gross_position");
    },
  );
});
