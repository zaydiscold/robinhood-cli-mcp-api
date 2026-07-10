import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetOwnedAccountsCache,
  brokerageOrderNotional,
  gatedBrokerageWrite,
  getSessionNotionalSpent,
  loadBrokerageRoutes,
  NotionalCapError,
  resetSessionNotionalSpent,
  routeAllowsLiveWrite,
  routeVerificationStatus,
} from "../src/lib.js";

const ORIGINAL_ENV = { ...process.env };

describe("canonical raw-write policy", () => {
  beforeEach(() => {
    process.env.ROBINHOOD_ALLOW_LIVE_WRITE = "1";
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "test-token";
    delete process.env.ROBINHOOD_MAX_ORDER_DOLLARS;
    delete process.env.ROBINHOOD_MAX_SESSION_DOLLARS;
    __resetOwnedAccountsCache();
    resetSessionNotionalSpent();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    __resetOwnedAccountsCache();
    resetSessionNotionalSpent();
  });

  it("forces an inferred money-movement route to dry-run even when the master switch is armed", async () => {
    let fetched = false;
    const result = await gatedBrokerageWrite({
      url: "https://api.robinhood.com/ach/relationships/",
      method: "POST",
      body: { bank_routing_number: "000000000" },
      executeOptions: {
        fetchImpl: (async () => {
          fetched = true;
          throw new Error("must not send");
        }) as typeof fetch,
      },
    });

    expect(fetched).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.status).toBe(0);
    expect(result.verificationStatus).toBe("inferred");
    expect(result.reason).toMatch(/requires verificationStatus=captured or live_verified/);
  });

  it("applies notional caps to a raw equity order before transport", async () => {
    process.env.ROBINHOOD_MAX_ORDER_DOLLARS = "100";
    let fetched = false;

    await expect(gatedBrokerageWrite({
      url: "https://api.robinhood.com/orders/",
      method: "POST",
      body: {
        account: "https://api.robinhood.com/accounts/111111111/",
        dollar_based_amount: { amount: "500", currency_code: "USD" },
      },
      ownershipGetJson: async () => ({ results: [{ type: "rhs", account_number: "111111111" }] }),
      executeOptions: {
        fetchImpl: (async () => {
          fetched = true;
          throw new Error("must not send over-cap order");
        }) as typeof fetch,
      },
    })).rejects.toBeInstanceOf(NotionalCapError);

    expect(fetched).toBe(false);
    expect(getSessionNotionalSpent()).toBe(0);
  });

  it("records session spend and one audit event only after a successful raw send", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const result = await gatedBrokerageWrite({
      url: "https://api.robinhood.com/orders/",
      method: "POST",
      body: {
        account: "https://api.robinhood.com/accounts/111111111/",
        dollar_based_amount: { amount: "50", currency_code: "USD" },
      },
      ownershipGetJson: async () => ({ results: [{ type: "rhs", account_number: "111111111" }] }),
      executeOptions: {
        autoRefresh: false,
        autoRetry: false,
        fetchImpl: (async () => new Response(JSON.stringify({ id: "order-1", state: "queued" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
      },
      logImpl: async (entry) => { logs.push(entry); },
      logContext: "raw policy regression test",
    });

    expect(result.dryRun).toBe(false);
    expect(result.status).toBe(201);
    expect(result.verificationStatus).toBe("captured");
    expect(getSessionNotionalSpent()).toBe(50);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ kind: "live-write", context: "raw policy regression test", status: 201 });
  });
});

describe("route verification metadata", () => {
  it("classifies known inferred, captured, live-verified, and mixed-method routes correctly", () => {
    const routes = loadBrokerageRoutes();
    const find = (url: string, method: string) => routes.find((route) =>
      route.url === url && route.methods?.includes(method)
    )!;

    const achCreate = find("https://api.robinhood.com/ach/relationships/", "POST");
    const equityOrder = find("https://api.robinhood.com/orders/", "POST");
    const recurringCreate = find("https://bonfire.robinhood.com/recurring_schedules/", "POST");
    const recurringItem = find("https://bonfire.robinhood.com/recurring_schedules/{0}/", "PATCH");

    expect(routeVerificationStatus(achCreate, "POST")).toBe("inferred");
    expect(routeAllowsLiveWrite(achCreate, "POST")).toBe(false);
    expect(routeVerificationStatus(equityOrder, "POST")).toBe("captured");
    expect(routeAllowsLiveWrite(equityOrder, "POST")).toBe(true);
    expect(routeVerificationStatus(recurringCreate, "POST")).toBe("live_verified");
    expect(routeVerificationStatus(recurringItem, "PATCH")).toBe("live_verified");
    expect(routeVerificationStatus(recurringItem, "DELETE")).toBe("inferred");
  });

  it("never mistakes the word unverified for verified", () => {
    expect(routeVerificationStatus({
      url: "https://api.robinhood.com/example/",
      host: "api.robinhood.com",
      categories: ["test"],
      risk: "write-mutate",
      methods: ["POST"],
      note: "body unverified 2026-07-10",
    }, "POST")).toBe("inferred");
  });

  it("computes raw equity, options, and crypto order notionals but never cancel notionals", () => {
    expect(brokerageOrderNotional("https://api.robinhood.com/orders/", "POST", {
      dollar_based_amount: { amount: "25" },
    })).toBe(25);
    expect(brokerageOrderNotional("https://api.robinhood.com/orders/", "POST", {
      price: "12.50", quantity: "4",
    })).toBe(50);
    expect(brokerageOrderNotional("https://api.robinhood.com/options/orders/", "POST", {
      price: "1.25", quantity: "2",
    })).toBe(250);
    expect(brokerageOrderNotional("https://nummus.robinhood.com/orders/", "POST", {
      price: "60000", quantity: "0.001",
    })).toBe(60);
    expect(brokerageOrderNotional("https://api.robinhood.com/orders/id/cancel/", "POST", {
      price: "999", quantity: "999",
    })).toBe(0);
  });
});
