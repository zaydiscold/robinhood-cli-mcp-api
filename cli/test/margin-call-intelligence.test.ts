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

  it("includes an in-window legacy equity order from a later cursor page", async () => {
    const olderSale = {
      id: "older-sale",
      side: "sell",
      quantity: "1.25",
      average_price: "28.00",
      state: "filled",
      updated_at: "2026-09-03T15:58:44.978Z",
    };
    const getJson = async (url: string, _params?: Record<string, string>, query?: Record<string, string>) => {
      if (url.includes("transfer/accounts")) return accounts;
      if (url.includes("wormhole/bw/orders/recent")) return { results: [] };
      if (url === "https://api.robinhood.com/orders/") {
        return query?.cursor === "page-2"
          ? { results: [olderSale], next: null }
          : { results: [], next: "https://api.robinhood.com/orders/?cursor=page-2" };
      }
      if (url.includes("options/orders")) return { results: [] };
      if (url.includes("nummus.robinhood.com")) return { results: [] };
      if (url.includes("ach/transfers")) return { results: [] };
      throw new Error(`unexpected ${url}`);
    };

    const events = await getUnifiedHistory(
      { accountNumber: "873870497", days: 7 },
      { getJson: getJson as never, now: () => Date.parse("2026-09-04T21:00:00Z") },
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "equity",
        orderId: "older-sale",
        side: "sell",
        quantity: 1.25,
        averagePrice: 28,
        accountLast4: "0497",
        state: "filled",
        summary: "sell 1.25 @ 28.00",
      }),
    );
  });

  it("reads legacy equity pages separately for every owned account", async () => {
    const getJson = async (url: string, _params?: Record<string, string>, query?: Record<string, string>) => {
      if (url.includes("transfer/accounts"))
        return {
          results: [
            ...accounts.results,
            { type: "ira_roth", account_number: "710276346", account_name: "Roth IRA", state: "active" },
          ],
        };
      if (url.includes("wormhole/bw/orders/recent")) return { results: [] };
      if (url === "https://api.robinhood.com/orders/") {
        const updated_at = "2026-09-03T15:58:44.978Z";
        if (query?.account_number === "873870497")
          return { results: [{ id: "far-sale", side: "sell", quantity: "1", average_price: "10", state: "filled", updated_at }] };
        if (query?.account_number === "710276346")
          return { results: [{ id: "roth-sale", side: "sell", quantity: "2", average_price: "20", state: "filled", updated_at }] };
        return { results: [] };
      }
      if (url.includes("options/orders")) return { results: [] };
      if (url.includes("nummus.robinhood.com")) return { results: [] };
      if (url.includes("ach/transfers")) return { results: [] };
      throw new Error(`unexpected ${url}`);
    };

    const events = await getUnifiedHistory(
      { days: 7 },
      { getJson: getJson as never, now: () => Date.parse("2026-09-04T21:00:00Z") },
    );

    expect(events.filter((event) => event.kind === "equity" && event.state === "filled")).toHaveLength(2);
  });

  it("does not silently return a truncated legacy order history at the pagination guard", async () => {
    const getJson = async (url: string) => {
      if (url.includes("transfer/accounts")) return accounts;
      if (url.includes("wormhole/bw/orders/recent")) return { results: [] };
      if (url === "https://api.robinhood.com/orders/")
        return { results: [], next: "https://api.robinhood.com/orders/?cursor=still-more" };
      if (url.includes("options/orders")) return { results: [] };
      if (url.includes("nummus.robinhood.com")) return { results: [] };
      if (url.includes("ach/transfers")) return { results: [] };
      throw new Error(`unexpected ${url}`);
    };

    await expect(
      getUnifiedHistory({ accountNumber: "873870497", days: 7 }, { getJson: getJson as never }),
    ).rejects.toThrow("pagination limit");
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
