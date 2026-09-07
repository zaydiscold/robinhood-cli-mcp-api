import { describe, expect, it } from "vitest";
import { getMarginHealth, getUnifiedHistory } from "../src/lib.js";

const accounts = {
  results: [
    {
      type: "rhs",
      account_number: "900000003",
      account_name: "Example margin account",
      state: "active",
    },
  ],
};

const riskOrder = {
  id: "risk-1",
  assetType: "EQUITY",
  symbol: "EXMP",
  submittedAt: "2026-08-25T12:00:00Z",
  updatedAt: "2026-08-25T12:00:01Z",
  quantity: "10.5",
  avgFilledPrice: { amount: "2", currency_code: "USD" },
  filledQuantity: "10.5",
  equityOrder: {
    side: "SELL",
    filledNotional: { amount: "21", currency_code: "USD" },
    realizedPnl: { amount: "-9", currency_code: "USD" },
  },
  derivedState: "FILLED",
  placedBy: "PLACED_BY_RISK",
};

describe("margin-call intelligence", () => {
  it("surfaces broker risk liquidations from wormhole recent orders", async () => {
    const getJson = async (url: string) => {
      if (url.includes("transfer/accounts")) return accounts;
      if (url.includes("wormhole/bw/orders/recent")) return { results: [riskOrder] };
      if (url.includes("/orders/")) return { results: [] };
      if (url.includes("options/orders")) return { results: [] };
      if (url.includes("nummus.robinhood.com")) return { results: [] };
      if (url.includes("ach/transfers")) return { results: [] };
      throw new Error(`unexpected ${url}`);
    };

    const events = await getUnifiedHistory(
      { accountNumber: "900000003", days: 7 },
      { getJson: getJson as never, now: () => Date.parse("2026-08-25T21:00:00Z") },
    );

    expect(events).toEqual([
      expect.objectContaining({
        kind: "equity",
        symbol: "EXMP",
        side: "sell",
        quantity: 10.5,
        averagePrice: 2,
        filledNotionalUsd: 21,
        realizedPnlUsd: -9,
        placedBy: "PLACED_BY_RISK",
        forcedLiquidation: true,
        accountLast4: "0003",
        state: "filled",
      }),
    ]);
  });

  it("reports the true maintenance buffer and recent risk-sale totals", async () => {
    const getJson = async (url: string) => {
      if (url.includes("transfer/accounts")) return accounts;
      if (url.includes("margin/") && url.includes("investing_info")) {
        return {
          amount_borrowed: { amount: "4000" },
          margin_interest_rate: "5.0000",
          margin_available: { amount: "4500" },
          buying_power_with_margin: { amount: "500" },
          projected_intraday_buying_power: { amount: "0" },
          margin_used_including_cash_held: { amount: "4000" },
          interest_exemption_amount: { amount: "1000" },
        };
      }
      if (url.includes("portfolios/")) {
        return {
          equity: "3500",
          market_value: "7500",
          excess_maintenance: "70",
          excess_margin: "-800",
        };
      }
      if (url.includes("wormhole/bw/orders/recent")) return { results: [riskOrder] };
      throw new Error(`unexpected ${url}`);
    };

    const out = await getMarginHealth("900000003", { getJson: getJson as never });
    expect(out.accounts[0]).toMatchObject({
      equityUsd: 3500,
      marketValueUsd: 7500,
      excessMaintenanceUsd: 70,
      maintenanceRequirementUsd: 3430,
      maintenanceBufferPctOfEquity: 2,
      riskStatus: "critical",
      recentRiskLiquidationCount: 1,
      recentRiskLiquidationRealizedPnlUsd: -9,
    });
  });
});
