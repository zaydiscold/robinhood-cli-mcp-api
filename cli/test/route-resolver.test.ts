import { describe, expect, it } from "vitest";
import {
  canonicalToken,
  normalizeUrlTokens,
  resolveParamValue,
  filterBrokerageRoutes,
  brokerageGetJson,
  planBrokerageRequest,
  selectRouteByQueryAndMethod,
  AmbiguousRouteError,
  loadBrokerageRoutes,
  type BrokerageRoute,
} from "../src/lib.js";

// Part C of the api-map field/normalization pass: account-identifying URL tokens were standardized to
// {account_number}. These tests prove the rename worked AND that the alias layer keeps every legacy caller
// resolving — the "nothing broke" guarantee. They also pin the resolver's two refuse-to-guess behaviors
// (ambiguity throw, write fail-closed) so the rename can't have weakened the #1 money-loss protection.

const route = (url: string, methods: string[] = ["GET"], risk = "read"): BrokerageRoute => ({
  url,
  host: new URL(url).host,
  categories: [],
  risk: risk as any,
  methods,
});

describe("token canonicalization", () => {
  it("maps every account-ish alias to {account_number}, leaves others alone", () => {
    expect(canonicalToken("num")).toBe("account_number");
    expect(canonicalToken("account")).toBe("account_number");
    expect(canonicalToken("n")).toBe("account_number");
    expect(canonicalToken("acct")).toBe("account_number");
    expect(canonicalToken("account_number")).toBe("account_number");
    expect(canonicalToken("instrument_id")).toBe("instrument_id"); // untouched
    expect(canonicalToken("chain_id")).toBe("chain_id");
  });

  it("normalizeUrlTokens rewrites legacy tokens so they compare equal", () => {
    expect(normalizeUrlTokens("portfolios/{num}/")).toBe("portfolios/{account_number}/");
    expect(normalizeUrlTokens("option_settings/{account}/")).toBe(
      "option_settings/{account_number}/",
    );
    expect(normalizeUrlTokens("options/{0}/cancel/")).toBe("options/{0}/cancel/"); // positional untouched
  });

  it("resolveParamValue finds a value by exact name OR any alias", () => {
    expect(resolveParamValue({ account_number: "X" }, "account_number")).toBe("X");
    expect(resolveParamValue({ account: "Y" }, "account_number")).toBe("Y"); // legacy key → canonical token
    expect(resolveParamValue({ num: "Z" }, "account_number")).toBe("Z");
    expect(resolveParamValue({ account_number: "C" }, "num")).toBe("C"); // canonical key → legacy token
    expect(resolveParamValue({}, "account_number")).toBeUndefined();
    expect(resolveParamValue({ symbol: "AAPL" }, "account_number")).toBeUndefined(); // unrelated key
  });
});

describe("alias-aware matching + substitution", () => {
  const routes = [
    route("https://api.robinhood.com/portfolios/{account_number}/"),
    route("https://api.robinhood.com/marketdata/quotes/?ids={ids}"),
    {
      ...route("https://api.robinhood.com/instruments/"),
      queryKeys: ["active_instruments_only", "ids", "symbol"],
    },
  ];

  it("a legacy {num} query still finds the canonical {account_number} route", () => {
    const m = filterBrokerageRoutes(routes, { query: "portfolios/{num}/" });
    expect(m).toHaveLength(1);
    expect(m[0].url).toBe("https://api.robinhood.com/portfolios/{account_number}/");
  });

  it("the canonical query also matches", () => {
    expect(filterBrokerageRoutes(routes, { query: "portfolios/{account_number}/" })).toHaveLength(
      1,
    );
  });

  it("a plain text query (no braces) is unaffected by normalization", () => {
    expect(filterBrokerageRoutes(routes, { query: "quotes" })).toHaveLength(1);
    expect(filterBrokerageRoutes(routes, { query: "nonexistent" })).toHaveLength(0);
  });

  it("matches executable query templates to a consolidated captured route", () => {
    const template = "https://api.robinhood.com/instruments/?symbol={symbol}";
    const concrete = "https://api.robinhood.com/instruments/?symbol=AAPL";
    expect(filterBrokerageRoutes(routes, { query: template }).map((r) => r.url)).toEqual([
      "https://api.robinhood.com/instruments/",
    ]);
    expect(filterBrokerageRoutes(routes, { query: concrete }).map((r) => r.url)).toEqual([
      "https://api.robinhood.com/instruments/",
    ]);
  });

  it("does not accept an unobserved query key on the same captured path", () => {
    expect(
      filterBrokerageRoutes(routes, {
        query: "https://api.robinhood.com/instruments/?not_a_real_key={value}",
      }),
    ).toHaveLength(0);
  });

  it("preserves an approved templated query string in the executed read", async () => {
    let requestedUrl = "";
    const payload = await brokerageGetJson(
      "https://api.robinhood.com/instruments/?symbol={symbol}",
      { symbol: "AAPL" },
      {},
      {
        token: "test-token",
        autoRefresh: false,
        fetchImpl: async (input) => {
          requestedUrl = String(input);
          return new Response(JSON.stringify({ results: [{ symbol: "AAPL" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );
    expect(requestedUrl).toBe("https://api.robinhood.com/instruments/?symbol=AAPL");
    expect(payload.results[0].symbol).toBe("AAPL");
  });

  it("substitutes a canonical {account_number} token from a legacy --param account=/num=", () => {
    const r = route("https://api.robinhood.com/options/option_settings/{account_number}/");
    expect(planBrokerageRequest({ route: r, params: { account: "123" } }).url).toBe(
      "https://api.robinhood.com/options/option_settings/123/",
    );
    expect(planBrokerageRequest({ route: r, params: { num: "456" } }).url).toBe(
      "https://api.robinhood.com/options/option_settings/456/",
    );
    expect(planBrokerageRequest({ route: r, params: { account_number: "789" } }).url).toBe(
      "https://api.robinhood.com/options/option_settings/789/",
    );
  });

  it("still reports a genuinely missing param (no alias supplies it)", () => {
    const r = route("https://api.robinhood.com/options/option_settings/{account_number}/");
    expect(planBrokerageRequest({ route: r, params: {} }).missingParams).toContain(
      "account_number",
    );
  });
});

describe("resolver refuse-to-guess behavior is intact after the rename", () => {
  it("throws AmbiguousRouteError when a substring query spans multiple distinct URLs", () => {
    const ambiguous = [
      route("https://api.robinhood.com/orders/", ["GET"], "sensitive-read"),
      route("https://api.robinhood.com/orders/{0}/cancel/", ["POST"], "destructive"),
    ];
    expect(() => selectRouteByQueryAndMethod(ambiguous, "orders/")).toThrow(AmbiguousRouteError);
  });

  it("fails closed on a forced write verb with no matching write route", () => {
    const readOnly = [route("https://api.robinhood.com/positions/", ["GET"], "sensitive-read")];
    expect(selectRouteByQueryAndMethod(readOnly, "positions/", "POST")).toBeUndefined();
  });

  it("prefers an exact URL match over a substring pool", () => {
    const pool = [
      route("https://api.robinhood.com/options/orders/", ["GET"]),
      route("https://api.robinhood.com/options/orders/{0}/", ["GET"]),
    ];
    const picked = selectRouteByQueryAndMethod(
      pool,
      "https://api.robinhood.com/options/orders/",
      "GET",
    );
    expect(picked?.url).toBe("https://api.robinhood.com/options/orders/");
  });
});

describe("the live route map is standardized + still resolves", () => {
  const routes = loadBrokerageRoutes();

  it("contains no legacy {num} or {account} path tokens", () => {
    const legacy = routes.filter((r) => /\{num\}|\{account\}/.test(r.url));
    expect(legacy.map((r) => r.url)).toEqual([]);
  });

  it("has no exact (url, methods) duplicate entries", () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const r of routes) {
      const key = `${[...(r.methods ?? ["GET"])].sort().join(",")} ${r.url}`;
      if (seen.has(key)) dups.push(key);
      seen.add(key);
    }
    expect(dups).toEqual([]);
  });

  it("resolves the per-account portfolio route via both the canonical and a legacy query", () => {
    const canonical = filterBrokerageRoutes(routes, { query: "portfolios/{account_number}/" });
    const legacy = filterBrokerageRoutes(routes, { query: "portfolios/{num}/" });
    expect(canonical.length).toBeGreaterThan(0);
    expect(legacy.length).toBeGreaterThan(0);
    expect(
      canonical.some((r) => r.url === "https://api.robinhood.com/portfolios/{account_number}/"),
    ).toBe(true);
    expect(
      legacy.some((r) => r.url === "https://api.robinhood.com/portfolios/{account_number}/"),
    ).toBe(true);
  });

  it("every route carries a fields slot with honest provenance", () => {
    const sources = new Set(routes.map((r) => r.fieldsSource));
    expect(
      [...sources].every((s) => s === "verified" || s === "inferred" || s === "undocumented"),
    ).toBe(true);
    expect(routes.every((r) => Array.isArray(r.fields))).toBe(true);
  });
});

// Zayd Khan // cold // www.zayd.wtf
