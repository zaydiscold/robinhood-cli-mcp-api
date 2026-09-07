import { afterEach, expect, it, vi } from "vitest";
import { buyWatchlistBasket, DISCOVERY_LISTS_URL, DISCOVERY_LISTS_ITEMS_URL } from "../src/lib.js";
afterEach(() => vi.unstubAllEnvs());

it.each(["shrinking", "missing", "uncertain"])("blocks further live basket legs when %s", async (scenario) => {
  vi.stubEnv("ROBINHOOD_ALLOW_LIVE_WRITE", "1");
  vi.stubEnv("ROBINHOOD_ALLOWED_ACCOUNT", "");
  let bpReads = 0;
  const getJson = async (url: string) => {
    if (url === DISCOVERY_LISTS_URL) return { results: [{ id: "list1", display_name: "Example" }] };
    if (url === DISCOVERY_LISTS_ITEMS_URL) return { results: ["AAA", "BBB"].map(symbol => ({ symbol, object_type: "instrument", us_tradability: "tradable", state: "active" })) };
    bpReads++;
    if (scenario === "missing" && bpReads > 1) throw new Error("offline");
    return { buying_power: scenario === "shrinking" && bpReads > 2 ? "0" : "20" };
  };
  const placeOrder = vi.fn(async () => ({ dryRun: false, evidence: { confirmed: scenario !== "uncertain" } }));
  const result = await buyWatchlistBasket({ list: "Example", amount: 5, accountNumber: "A1", liveWrite: true, delayMs: 0 }, { getJson, placeOrder: placeOrder as never });
  expect(placeOrder).toHaveBeenCalledTimes(scenario === "missing" ? 0 : 1);
  expect(result.counts.attempted).toBe(scenario === "missing" ? 0 : 1);
  expect(result.counts.blocked).toBe(scenario === "missing" ? 2 : 1);
});
