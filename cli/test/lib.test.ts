import { describe, expect, it } from "vitest";
import {
  executeBrokerageRequest,
  executeCryptoRequest,
  filterBrokerageRoutes,
  filterRobinhoodRoutes,
  listCryptoRoutes,
  loadBrowserRoutes,
  loadBrokerageRoutes,
  loadRobinhoodRoutes,
  parseParamAssignments,
  planBrokerageRequest,
  planCryptoRequest,
  resolveLiveWriteGate,
  signCryptoRequest,
  summarizeApiMap
} from "../src/lib.js";

const robinhoodPublishedExamplePrivateKeyBase64 = () =>
  Buffer.from([
    197, 9, 211, 37, 87, 144, 46, 108, 53, 252, 200, 54, 98, 41, 132, 86,
    36, 169, 195, 244, 157, 37, 200, 13, 93, 158, 100, 66, 64, 23, 52, 245
  ]).toString("base64");

const robinhoodPublishedExampleApiKey = () =>
  ["rh", "api", "6148effc", "c0b1", "486c", "8940", "a1d099456be6"].join("-");

describe("Robinhood API map", () => {
  it("loads the brokerage seed map with conservative risk counts", () => {
    const routes = loadBrokerageRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(259);
    expect(filterBrokerageRoutes(routes, { risk: "destructive" })).toHaveLength(4);
    expect(filterBrokerageRoutes(routes, { risk: "write-safe" }).length).toBeGreaterThanOrEqual(4);
    expect(filterBrokerageRoutes(routes, { category: "options" }).length).toBeGreaterThanOrEqual(11);
    expect(filterBrokerageRoutes(routes, { query: "ach/relationships" }).length).toBeGreaterThan(0);
    expect(filterBrokerageRoutes(routes, { query: "marketdata/equities/summary/robinhood" }).length).toBeGreaterThan(0);
    expect(filterBrokerageRoutes(routes, { host: "bonfire.robinhood.com" }).length).toBeGreaterThanOrEqual(80);
  });

  it("summarizes the official Crypto OpenAPI and brokerage map", () => {
    const summary = summarizeApiMap();
    expect(summary.unified.routes).toBeGreaterThanOrEqual(275);
    expect(summary.unified.openapiOperations).toBeGreaterThanOrEqual(266);
    expect(summary.unified.hosts["trading.robinhood.com"]).toBe(16);
    expect(summary.crypto.paths).toBe(14);
    expect(summary.crypto.operations).toBe(16);
    expect(summary.brokerage.routes).toBeGreaterThanOrEqual(259);
    expect(summary.brokerage.browserRoutes).toBeGreaterThanOrEqual(217);
    expect(summary.brokerage.openapiPaths).toBeGreaterThanOrEqual(249);
    expect(summary.brokerage.openapiOperations).toBeGreaterThanOrEqual(250);
    expect(summary.brokerage.byRisk["sensitive-read"]).toBeGreaterThanOrEqual(71);
  });

  it("mixes Robinhood-published Crypto routes into the unified API map", () => {
    const routes = loadRobinhoodRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(275);
    expect(filterRobinhoodRoutes(routes, { host: "trading.robinhood.com" })).toHaveLength(16);
    expect(filterRobinhoodRoutes(routes, { category: "crypto" })).toHaveLength(16);
    expect(filterRobinhoodRoutes(routes, { query: "https://trading.robinhood.com/api/v2/crypto/trading/orders/" })).toHaveLength(3);
    expect(
      filterRobinhoodRoutes(routes, { query: "https://trading.robinhood.com/api/v2/crypto/trading/orders/{id}/cancel/" })[0]?.risk
    ).toBe("destructive");
    expect(filterRobinhoodRoutes(routes, { risk: "destructive" }).length).toBeGreaterThanOrEqual(6);
  });

  it("loads the latest sanitized CDP browser route slice", () => {
    const routes = loadBrowserRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(217);
    expect(routes.some((route) => route.seenOn.includes("stock-nvda"))).toBe(true);
    expect(routes.some((route) => route.seenOn.includes("account-transfers"))).toBe(true);
    expect(routes.some((route) => route.host === "bonfire.robinhood.com")).toBe(true);
    expect(JSON.stringify(routes)).not.toMatch(/Cookie|Authorization|Bearer|localStorage|sessionStorage/i);
  });

  it("lists official Crypto routes without counting OpenAPI metadata keys as methods", () => {
    const routes = listCryptoRoutes();
    expect(routes).toHaveLength(14);
    expect(routes.find((route) => route.path === "/api/v1/crypto/trading/orders/")?.methods.sort()).toEqual(["get", "post"]);
  });

  it("builds brokerage request plans with live execution as the default mode", () => {
    const routes = loadBrokerageRoutes();
    const route = routes.find((candidate) => candidate.url.includes("/recent_day_trades/"));
    expect(route).toBeTruthy();
    const plan = planBrokerageRequest({
      route: route!,
      params: parseParamAssignments(["0=ABC123"])
    });
    expect(plan.method).toBe("GET");
    expect(plan.mode).toBe("execute");
    expect(plan.url).toContain("ABC123");
    expect(plan.command).toContain("Authorization: Bearer $ROBINHOOD_BROKERAGE_TOKEN");
    expect(plan.missingParams).toEqual([]);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("dry-runs brokerage execution without auth or fetch", async () => {
    const route = loadBrokerageRoutes().find((candidate) => candidate.url === "https://api.robinhood.com/accounts/");
    expect(route).toBeTruthy();
    const plan = planBrokerageRequest({ route: route!, dryRun: true });
    const result = await executeBrokerageRequest(plan, {
      fetchImpl: async () => {
        throw new Error("fetch should not run during dry-run");
      }
    });
    expect(result.statusText).toBe("DRY_RUN");
    expect(result.body).toContain("https://api.robinhood.com/accounts/");
  });

  it("executes brokerage requests with caller-owned auth", async () => {
    const route = loadBrokerageRoutes().find((candidate) => candidate.url === "https://api.robinhood.com/accounts/");
    expect(route).toBeTruthy();
    const plan = planBrokerageRequest({ route: route! });
    let calledUrl = "";
    const result = await executeBrokerageRequest(plan, {
      token: "test-token",
      fetchImpl: async (input, init) => {
        calledUrl = String(input);
        expect(init?.headers).toMatchObject({ authorization: "Bearer test-token" });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    });
    expect(calledUrl).toBe("https://api.robinhood.com/accounts/");
    expect(result.ok).toBe(true);
    expect(result.body).toContain('"ok":true');
  });

  it("warns before live write-capable brokerage execution", async () => {
    const route = loadBrokerageRoutes().find((candidate) => candidate.risk === "write-safe");
    expect(route).toBeTruthy();
    const plan = planBrokerageRequest({ route: route! });
    const originalError = console.error;
    const warnings: string[] = [];
    console.error = (value?: unknown) => {
      warnings.push(String(value));
    };
    try {
      await executeBrokerageRequest(plan, {
        token: "test-token",
        fetchImpl: async () =>
          new Response("{}", {
            status: 202,
            headers: { "content-type": "application/json" }
          })
      });
    } finally {
      console.error = originalError;
    }
    expect(warnings.join("\n")).toContain("[WRITES TO LIVE ROBINHOOD]");
  });

  it("builds official Crypto request plans with path/query signing context", () => {
    const route = filterRobinhoodRoutes(loadRobinhoodRoutes(), {
      query: "https://trading.robinhood.com/api/v2/crypto/trading/estimated_price/"
    })[0];
    expect(route).toBeTruthy();
    const plan = planCryptoRequest({
      route: route!,
      query: parseParamAssignments(["symbol=BTC-USD", "side=ask", "quantity=0.1"]),
      dryRun: true
    });
    expect(plan.url).toBe("https://trading.robinhood.com/api/v2/crypto/trading/estimated_price/?symbol=BTC-USD&side=ask&quantity=0.1");
    expect(plan.path).toBe("/api/v2/crypto/trading/estimated_price/?symbol=BTC-USD&side=ask&quantity=0.1");
    expect(plan.mode).toBe("dry_run");
    expect(plan.command).toContain("x-signature");
  });

  it("dry-runs official Crypto execution without auth or fetch", async () => {
    const route = filterRobinhoodRoutes(loadRobinhoodRoutes(), {
      query: "https://trading.robinhood.com/api/v1/crypto/trading/accounts/"
    })[0];
    expect(route).toBeTruthy();
    const plan = planCryptoRequest({ route: route!, dryRun: true });
    const result = await executeCryptoRequest(plan, {
      fetchImpl: async () => {
        throw new Error("fetch should not run during crypto dry-run");
      }
    });
    expect(result.statusText).toBe("DRY_RUN");
    expect(result.body).toContain("x-signature");
  });

  it("executes official Crypto requests with signed caller-owned API credentials", async () => {
    const route = filterRobinhoodRoutes(loadRobinhoodRoutes(), {
      query: "https://trading.robinhood.com/api/v2/crypto/trading/orders/"
    }).find((candidate) => candidate.methods?.includes("POST"));
    expect(route).toBeTruthy();
    const body = JSON.stringify({
      client_order_id: "131de903-5a9c-4260-abc1-28d562a5dcf0",
      side: "buy",
      symbol: "BTC-USD",
      type: "market",
      market_order_config: { asset_quantity: "0.1" }
    });
    const plan = planCryptoRequest({ route: route!, method: "POST", body });
    const originalError = console.error;
    const warnings: string[] = [];
    console.error = (value?: unknown) => {
      warnings.push(String(value));
    };
    try {
      const result = await executeCryptoRequest(plan, {
        apiKey: "rh-api-test",
        privateKeyBase64: robinhoodPublishedExamplePrivateKeyBase64(),
        timestamp: "1698708981",
        fetchImpl: async (input, init) => {
          expect(String(input)).toBe("https://trading.robinhood.com/api/v2/crypto/trading/orders/");
          expect(init?.headers).toMatchObject({
            "x-api-key": "rh-api-test",
            "x-timestamp": "1698708981",
            "content-type": "application/json"
          });
          expect((init?.headers as Record<string, string>)["x-signature"]).toBeTruthy();
          expect(init?.body).toBe(body);
          return new Response(JSON.stringify({ id: "order-id" }), {
            status: 201,
            headers: { "content-type": "application/json" }
          });
        }
      });
      expect(result.ok).toBe(true);
      expect(result.body).toContain("order-id");
    } finally {
      console.error = originalError;
    }
    expect(warnings.join("\n")).toContain("[WRITES TO LIVE ROBINHOOD]");
  });

  it("matches Robinhood's published Ed25519 signing example", () => {
    const body =
      "{'client_order_id': '131de903-5a9c-4260-abc1-28d562a5dcf0', 'side': 'buy', 'symbol': 'BTC-USD', 'type': 'market', 'market_order_config': {'asset_quantity': '0.1'}}";
    const headers = signCryptoRequest({
      apiKey: robinhoodPublishedExampleApiKey(),
      privateKeyBase64: robinhoodPublishedExamplePrivateKeyBase64(),
      timestamp: "1698708981",
      path: "/api/v1/crypto/trading/orders/",
      method: "POST",
      body
    });
    expect(headers["x-signature"]).toBe(
      "q/nEtxp/P2Or3hph3KejBqnw5o9qeuQ+hYRnB56FaHbjDsNUY9KhB1asMxohDnzdVFSD7StaTqjSd9U9HvaRAw=="
    );
  });

  it("never sends a live write without both --live-write and the env gate", () => {
    // Read routes always run live.
    expect(resolveLiveWriteGate({ risk: "read", dryRun: false, liveWrite: false, env: {} })).toEqual({
      allowed: true,
      forcedDryRun: false
    });

    // Write with neither opt-in is forced to dry-run.
    const neither = resolveLiveWriteGate({ risk: "write-mutate", dryRun: false, liveWrite: false, env: {} });
    expect(neither.allowed).toBe(false);
    expect(neither.forcedDryRun).toBe(true);

    // Flag alone is not enough.
    expect(
      resolveLiveWriteGate({ risk: "write-mutate", dryRun: false, liveWrite: true, env: {} }).forcedDryRun
    ).toBe(true);

    // Env alone is not enough.
    expect(
      resolveLiveWriteGate({
        risk: "write-mutate",
        dryRun: false,
        liveWrite: false,
        env: { ROBINHOOD_ALLOW_LIVE_WRITE: "1" }
      }).forcedDryRun
    ).toBe(true);

    // Both opt-ins permit the live write.
    expect(
      resolveLiveWriteGate({
        risk: "destructive",
        dryRun: false,
        liveWrite: true,
        env: { ROBINHOOD_ALLOW_LIVE_WRITE: "1" }
      })
    ).toEqual({ allowed: true, forcedDryRun: false });
  });
});
