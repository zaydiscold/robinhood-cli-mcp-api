import { describe, expect, it } from "vitest";
import {
  buildAccountContextUrl,
  buildOptionsContractNavigationPlan,
  buildOptionsStrategyPricingSummary,
  buildOptionsStrategyOrderPlan,
  classifyMoneyness,
  executeBrokerageRequest,
  executeCryptoRequest,
  filterAccountContextWorkflows,
  filterBrokerageRoutes,
  filterOptionsStrategyWorkflows,
  filterRobinhoodRoutes,
  listCryptoRoutes,
  loadAccountContextWorkflows,
  loadBrowserRoutes,
  loadBrokerageRoutes,
  loadOptionsStrategyWorkflows,
  loadRobinhoodRoutes,
  optionReturnPct,
  parseParamAssignments,
  percentChange,
  planBrokerageRequest,
  planCryptoRequest,
  resolveLiveWriteGate,
  selectNearStrikes,
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
  it("loads the brokerage route map with conservative risk counts", () => {
    const routes = loadBrokerageRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(259);
    // 11 genuinely destructive routes: ACH unlink, 3× order cancel, watchlist
    // create/rename/delete (the url_template→url repair in c2dd79f made the legacy
    // discovery/lists stubs countable again), recurring create/delete. Bump
    // deliberately after auditing so a misclassification can't slip in as "just
    // another count change".
    expect(filterBrokerageRoutes(routes, { risk: "destructive" })).toHaveLength(11);
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
    expect(routes.length).toBeGreaterThanOrEqual(250);
    expect(routes.some((route) => route.seenOn.includes("stock-nvda"))).toBe(true);
    expect(routes.some((route) => route.seenOn.includes("account-transfers"))).toBe(true);
    expect(routes.some((route) => route.seenOn.includes("options-chain-symbol-account-context"))).toBe(true);
    expect(routes.some((route) => route.host === "bonfire.robinhood.com")).toBe(true);
    expect(JSON.stringify(routes)).not.toMatch(/Cookie|Authorization|Bearer|localStorage|sessionStorage/i);
  });

  it("loads account-context workflow findings and builds sanitized web URLs", () => {
    const workflows = loadAccountContextWorkflows();
    expect(workflows.length).toBeGreaterThanOrEqual(8);
    expect(filterAccountContextWorkflows(workflows, { behavior: "propagates" }).map((workflow) => workflow.id)).toContain(
      "stock-detail-order-ticket"
    );
    const stockTicket = workflows.find((workflow) => workflow.id === "stock-detail-order-ticket");
    expect(stockTicket).toBeTruthy();
    const built = buildAccountContextUrl(stockTicket!, {
      account_number: "ACCOUNT_TEST",
      symbol: "XBI",
      instrument_uuid: "00000000-0000-4000-8000-000000000000"
    });
    expect(built.url).toBe(
      "https://robinhood.com/stocks/XBI(00000000-0000-4000-8000-000000000000)?account_number=ACCOUNT_TEST&source=lists_section_position"
    );
    expect(built.missingParams).toEqual([]);
    const optionsChain = workflows.find((workflow) => workflow.id === "options-chain-symbol-builder");
    expect(optionsChain).toBeTruthy();
    const chainUrl = buildAccountContextUrl(optionsChain!, {
      account_number: "ACCOUNT_TEST",
      symbol: "XBI"
    });
    expect(chainUrl.url).toBe("https://robinhood.com/options/chains/XBI?account_number=ACCOUNT_TEST");
    expect(chainUrl.warnings.some((warning) => warning.includes("Mixed account-context behavior"))).toBe(true);
    expect(JSON.stringify(workflows)).not.toMatch(/(?:account_number|rhsAccountNumber)=[0-9]{6,}/i);
  });

  it("loads options strategy workflows and dry-run order templates", () => {
    const workflows = loadOptionsStrategyWorkflows();
    expect(workflows.length).toBeGreaterThanOrEqual(10);
    expect(filterOptionsStrategyWorkflows(workflows, { definedRisk: true }).map((workflow) => workflow.id)).toContain("iron-condor");
    expect(filterOptionsStrategyWorkflows(workflows, { aggressiveness: "aggressive" }).map((workflow) => workflow.id)).toContain(
      "naked-short-call"
    );
    expect(filterOptionsStrategyWorkflows(workflows, { aggressiveness: "aggressive" }).map((workflow) => workflow.id)).toContain(
      "naked-short-put"
    );
    expect(filterOptionsStrategyWorkflows(workflows, { query: "debit spread" }).map((workflow) => workflow.id)).toContain(
      "call-debit-spread"
    );
    expect(filterOptionsStrategyWorkflows(workflows, { query: "strangle" }).map((workflow) => workflow.id)).toContain(
      "short-strangle"
    );
    expect(filterOptionsStrategyWorkflows(workflows, { query: "covered short put" }).map((workflow) => workflow.id)).toEqual(
      expect.arrayContaining(["cash-secured-short-put", "covered-put"])
    );
    const spread = workflows.find((workflow) => workflow.id === "call-credit-spread");
    expect(spread).toBeTruthy();
    const plan = buildOptionsStrategyOrderPlan(spread!, {
      account_number: "ACCOUNT_TEST",
      chain_id: "chain-id",
      expiration: "2026-06-26",
      symbol: "XBI",
      strategy_legs: "short_call,long_call",
      short_call_option_id: "short-call-id",
      long_call_option_id: "long-call-id",
      limit_price: "4.00",
      quantity: "1",
      time_in_force: "gfd",
      ref_id: "00000000-0000-4000-8000-000000000001"
    });
    expect(plan.mode).toBe("dry_run");
    expect(plan.risk).toBe("write-mutate");
    expect(plan.missingParams).toEqual([]);
    expect(JSON.stringify(plan.order)).toContain("https://api.robinhood.com/options/instruments/short-call-id/");
    expect(plan.reviewContract.greekMath.netDelta).toContain("contracts * 100");
    expect(plan.reviewContract.scenarioRows.map((row) => row.id)).toContain("spot-plus-minus-1pct");
    expect(plan.reviewContract.variantResolution.find((row) => row.phrase === "covered short put")?.rule).toContain(
      "require the user to choose"
    );
    expect(plan.reviewContract.hardBlockers).toContain("missing option instrument id for any leg");
    expect(JSON.stringify(workflows)).not.toMatch(/(?:account_number|rhsAccountNumber)=[0-9]{6,}/i);
  });

  it("prices option credit spreads from side-aware bid/ask and builds a far sell probe", () => {
    const pricing = buildOptionsStrategyPricingSummary({
      mode: "safe-sell-probe",
      preferredDirection: "credit",
      legs: [
        {
          id: "short_call",
          action: "sell",
          ratioQuantity: 1,
          bid: "1.20",
          ask: "1.30",
          mark: "1.25",
          delta: "0.40",
          theta: "-0.03"
        },
        {
          id: "long_call",
          action: "buy",
          ratioQuantity: 1,
          bid: "0.40",
          ask: "0.50",
          mark: "0.45",
          delta: "0.20",
          theta: "-0.01"
        }
      ]
    });

    expect(pricing.direction).toBe("credit");
    expect(pricing.naturalNet).toBeCloseTo(0.7);
    expect(pricing.naturalPrice).toBeCloseTo(0.7);
    expect(pricing.midPrice).toBeCloseTo(0.8);
    expect(pricing.limitPrice).toBeCloseTo(200.7);
    expect(pricing.netGreeks.delta).toBeCloseTo(-20);
    expect(pricing.netGreeks.theta).toBeCloseTo(2);
    expect(pricing.warnings.join("\n")).toContain("safe-sell-probe");
  });

  it("prices option debit spreads from ask paid and bid received", () => {
    const pricing = buildOptionsStrategyPricingSummary({
      mode: "mid",
      preferredDirection: "debit",
      legs: [
        { id: "long_call", action: "buy", ratioQuantity: 1, bid: "1.80", ask: "2.00", mark: "1.90", delta: "0.55" },
        { id: "short_call", action: "sell", ratioQuantity: 1, bid: "0.75", ask: "0.85", mark: "0.80", delta: "0.35" }
      ]
    });

    expect(pricing.direction).toBe("debit");
    expect(pricing.naturalNet).toBeCloseTo(-1.25);
    expect(pricing.naturalPrice).toBeCloseTo(1.25);
    expect(pricing.midPrice).toBeCloseTo(1.1);
    expect(pricing.limitPrice).toBeCloseTo(1.1);
    expect(pricing.netGreeks.delta).toBeCloseTo(20);
  });

  it("builds exact-contract navigation/API plans without treating candidate URL params as proven", () => {
    const plan = buildOptionsContractNavigationPlan({
      accountNumber: "ACCOUNT_TEST",
      symbol: "xbi",
      expiration: "2026-06-26",
      optionType: "call",
      side: "buy",
      strike: "127",
      chainId: "CHAIN_TEST",
      optionInstrumentId: "OPTION_TEST",
      aggregatePositionId: "AGGREGATE_TEST",
      optionOrderId: "ORDER_TEST"
    });
    expect(plan.mode).toBe("dry_run");
    expect(plan.risk).toBe("write-mutate");
    expect(plan.selector.symbol).toBe("XBI");
    expect(plan.selector.positionEffect).toBe("open");
    expect(plan.webNavigation.find((link) => link.id === "options-chain-account-shell")?.url).toBe(
      "https://robinhood.com/options/chains/XBI?account_number=ACCOUNT_TEST"
    );
    const candidate = plan.webNavigation.find((link) => link.id === "options-chain-contract-query-candidate");
    expect(candidate?.confidence).toBe("candidate");
    expect(candidate?.url).toContain("expiration_dates=2026-06-26");
    expect(candidate?.url).toContain("strike_price=127");
    expect(candidate?.url).toContain("side=buy");
    expect(candidate?.url).toContain("type=call");
    expect(candidate?.url).toContain("source=robinhood-cli-contract-plan");
    expect(plan.queryParamCandidates.expiration).toEqual(["expiration", "expiration_date", "expiration_dates"]);
    expect(Object.keys(plan.queryParamCandidates)).not.toContain("appOnlyOptionChainTarget");
    expect(plan.apiResolutionSteps.map((step) => step.id)).toContain("resolve-contracts-for-expiration-type");
    expect(plan.apiResolutionSteps.find((step) => step.id === "resolve-contracts-for-expiration-type")?.url).toBe(
      "https://api.robinhood.com/options/instruments/?account_number=ACCOUNT_TEST&chain_id=CHAIN_TEST&expiration_dates=2026-06-26&state=active&type=call"
    );
    expect(plan.apiResolutionSteps.find((step) => step.id === "quote-single-contract")?.url).toBe(
      "https://api.robinhood.com/marketdata/options/?ids=OPTION_TEST&include_all_sessions=true"
    );
    expect(JSON.stringify(plan.orderHandoff.orderTemplate)).toContain("https://api.robinhood.com/options/instruments/OPTION_TEST/");
    expect(plan.warnings.join("\n")).toContain("candidate probe keys");
    expect(JSON.stringify(plan)).not.toMatch(/(?:account_number|rhsAccountNumber)=[0-9]{6,}/i);
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

describe("Options analytics helpers", () => {
  it("computes long-option percent return from cost basis and mark", () => {
    // DRAM $50C: $1.30 premium (avg 130) -> $18.65 mark ≈ +1335%
    expect(optionReturnPct(130, 18.65)).toBeCloseTo(1334.6, 0);
    // A loser: $2.09 premium -> $0.67 mark ≈ -68%
    expect(optionReturnPct(209.33, 0.67)).toBeCloseTo(-68.0, 0);
    // Guards: zero/negative basis or non-finite mark -> NaN, never a divide-by-zero blowup
    expect(optionReturnPct(0, 5)).toBeNaN();
    expect(optionReturnPct(100, Number.NaN)).toBeNaN();
  });

  it("classifies call and put moneyness, treating equality and unknown spot as ATM", () => {
    expect(classifyMoneyness(200, 219, "call")).toBe("ITM");
    expect(classifyMoneyness(240, 219, "call")).toBe("OTM");
    expect(classifyMoneyness(240, 219, "put")).toBe("ITM");
    expect(classifyMoneyness(200, 219, "put")).toBe("OTM");
    expect(classifyMoneyness(219, 219, "call")).toBe("ATM");
    expect(classifyMoneyness(219, 0, "call")).toBe("ATM");
  });

  it("computes generic percent change for equity P/L and day moves", () => {
    expect(percentChange(331.46, 364.6)).toBeCloseTo(10.0, 1); // avg cost vs last
    expect(percentChange(205, 219.26)).toBeCloseTo(6.96, 1); // prev close vs last
    expect(percentChange(100, 80)).toBeCloseTo(-20.0, 1);
    expect(percentChange(0, 50)).toBeNaN();
    expect(percentChange(100, Number.NaN)).toBeNaN();
  });

  it("selects an ATM-centered strike window and sorts ascending", () => {
    const ladder = [200, 205, 210, 215, 220, 225, 230, 235, 240].map((strike) => ({ strike }));
    const near = selectNearStrikes(ladder, 219, 2);
    expect(near.map((row) => row.strike)).toEqual([210, 215, 220, 225, 230]);
    // Unknown spot returns the full ladder (sorted), not an empty window
    expect(selectNearStrikes(ladder, 0, 2)).toHaveLength(ladder.length);
  });
});
