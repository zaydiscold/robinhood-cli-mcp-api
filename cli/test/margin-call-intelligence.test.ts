import { describe, expect, it } from "vitest";
import { getMarginHealth, getUnifiedHistory } from "../src/lib.js";

const accounts = {
  results: [
    {
      type: "rhs",
      account_number: "873870497",
      account_name: "far 9mo plus",
      state: "active",
    },
  ],
};

const riskOrder = {
  id: "risk-1",
  assetType: "EQUITY",
  symbol: "CBRG",
  submittedAt: "2026-08-25T17:35:11.874354Z",
  updatedAt: "2026-08-25T17:35:12.168Z",
  quantity: "239.655003",
  avgFilledPrice: { amount: "3.0451", currency_code: "USD" },
  filledQuantity: "239.655003",
  equityOrder: {
    side: "SELL",
    filledNotional: { amount: "729.77", currency_code: "USD" },
    realizedPnl: { amount: "-824.92", currency_code: "USD" },
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
      { accountNumber: "873870497", days: 7 },
      { getJson: getJson as never, now: () => Date.parse("2026-08-25T21:00:00Z") },
    );

    expect(events).toEqual([
      expect.objectContaining({
        kind: "equity",
        symbol: "CBRG",
        side: "sell",
        quantity: 239.655003,
        averagePrice: 3.0451,
        filledNotionalUsd: 729.77,
        realizedPnlUsd: -824.92,
        placedBy: "PLACED_BY_RISK",
        forcedLiquidation: true,
        accountLast4: "0497",
        state: "filled",
      }),
    ]);
  });

  it("reports the true maintenance buffer and recent risk-sale totals", async () => {
    const getJson = async (url: string) => {
      if (url.includes("transfer/accounts")) return accounts;
      if (url.includes("margin/") && url.includes("investing_info")) {
        return {
          amount_borrowed: { amount: "4296.97" },
          margin_interest_rate: "5.0000",
          margin_available: { amount: "4615.37" },
          buying_power_with_margin: { amount: "318.40" },
          projected_intraday_buying_power: { amount: "0" },
          margin_used_including_cash_held: { amount: "4296.97" },
          interest_exemption_amount: { amount: "1000" },
        };
      }
      if (url.includes("portfolios/")) {
        return {
          equity: "3522.0372",
          market_value: "7819.0072",
          excess_maintenance: "79.3916",
          excess_margin: "-834.5046",
        };
      }
      if (url.includes("wormhole/bw/orders/recent")) return { results: [riskOrder] };
      throw new Error(`unexpected ${url}`);
    };

    const out = await getMarginHealth("873870497", { getJson: getJson as never });
    expect(out.accounts[0]).toMatchObject({
      equityUsd: 3522.0372,
      marketValueUsd: 7819.0072,
      excessMaintenanceUsd: 79.3916,
      maintenanceRequirementUsd: 3442.65,
      maintenanceBufferPctOfEquity: 2.25,
      riskStatus: "critical",
      recentRiskLiquidationCount: 1,
      recentRiskLiquidationRealizedPnlUsd: -824.92,
    });
  });
});
