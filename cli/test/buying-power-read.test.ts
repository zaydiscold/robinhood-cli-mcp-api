import { describe, expect, it } from "vitest";
import { readBuyingPower } from "../src/lib.js";

describe("readBuyingPower", () => {
  it("keeps broker cash distinct from regular buying power and records each endpoint as-of", async () => {
    const instants = [
      new Date("2026-09-11T13:04:00.000Z"),
      new Date("2026-09-11T13:04:00.125Z"),
    ];
    let i = 0;
    const getJson = async (url: string, params: Record<string, string> = {}) => {
      if (url.includes("transfer/accounts")) {
        return { results: [{ type: "ira_roth", account_number: "11112222" }] };
      }
      if (url.includes("buying_power_breakdown")) {
        expect(params.num).toBe("11112222");
        return {
          buying_power: "101.25",
          unleveraged_buying_power: "101.25",
          intraday_buying_power: "0",
          cash: "102.50",
          leverage_enabled: false,
        };
      }
      if (url.includes("portfolios/")) {
        expect(params.num).toBe("11112222");
        return {
          equity: "10000.50",
          market_value: "10000.50",
          excess_maintenance: "0",
          excess_margin: "0",
        };
      }
      throw new Error(`unexpected URL ${url}`);
    };

    const result = await readBuyingPower(
      { accountNumber: "11112222" },
      { getJson, now: () => instants[i++] },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      accountNumber: "11112222",
      buyingPower: 101.25,
      unleveragedBuyingPower: 101.25,
      intradayBuyingPower: 0,
      cash: 102.5,
      equity: 10000.5,
      asOf: {
        buyingPowerBreakdown: "2026-09-11T13:04:00.000Z",
        portfolio: "2026-09-11T13:04:00.125Z",
      },
    });
    expect(result[0].cash).not.toBe(result[0].buyingPower);
  });
});
