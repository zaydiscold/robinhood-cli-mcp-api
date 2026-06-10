import { describe, expect, it } from "vitest";
import {
  routeTokens,
  suggestRoutes,
  describeRoute,
  missingParamHint,
  noMatchHint,
  type BrokerageRoute
} from "../src/lib.js";

// T3: self-describing output + fail-loud hints. The route map must never fail silently — a miss returns a
// did-you-mean, a missing param names the token + an example, and describeRoute turns a URL into a card.

const route = (url: string, extra: Partial<BrokerageRoute> = {}): BrokerageRoute => ({
  url, host: new URL(url).host, categories: [], risk: "read", methods: ["GET"], ...extra
});

const fixture: BrokerageRoute[] = [
  route("https://api.robinhood.com/portfolios/{account_number}/", {
    risk: "sensitive-read", fields: ["equity", "extended_hours_equity", "adjusted_equity_previous_close"],
    fieldsSource: "verified", fieldsShape: "object"
  }),
  route("https://api.robinhood.com/positions/", { risk: "sensitive-read", queryKeys: ["nonzero", "account_number"], fields: ["instrument", "quantity"], fieldsSource: "inferred" }),
  route("https://api.robinhood.com/orders/", { risk: "sensitive-read" }),
  route("https://api.robinhood.com/orders/{0}/cancel/", { methods: ["POST"], risk: "destructive" })
];

describe("routeTokens", () => {
  it("extracts deduped placeholder tokens in order", () => {
    expect(routeTokens("a/{account_number}/b/{instrument_id}/")).toEqual(["account_number", "instrument_id"]);
    expect(routeTokens("no/tokens/here/")).toEqual([]);
    expect(routeTokens("x/{id}/y/{id}/")).toEqual(["id"]); // deduped
  });
});

describe("suggestRoutes (did-you-mean)", () => {
  it("surfaces an exact-substring match", () => {
    expect(suggestRoutes("positions", fixture)).toContain("https://api.robinhood.com/positions/");
  });
  it("is typo-tolerant via shared prefix", () => {
    // 'portfoliosss' contains no route as a substring, but shares a long prefix with 'portfolios'
    expect(suggestRoutes("portfoliosss", fixture)).toContain("https://api.robinhood.com/portfolios/{account_number}/");
  });
  it("returns nothing for a hopeless query", () => {
    expect(suggestRoutes("zzzzzqqqq", fixture)).toEqual([]);
  });
});

describe("describeRoute", () => {
  it("returns a full self-describing card for a resolved route", () => {
    const d = describeRoute("portfolios/{account_number}/", undefined, fixture);
    expect(d.resolved).toBe(true);
    expect(d.url).toBe("https://api.robinhood.com/portfolios/{account_number}/");
    expect(d.risk).toBe("sensitive-read");
    expect(d.command).toBe("portfolio");
    expect(d.requiredTokens).toEqual(["account_number"]);
    expect(d.fields).toContain("adjusted_equity_previous_close");
    expect(d.fieldsSource).toBe("verified");
  });

  it("resolves via a legacy {num} alias query too", () => {
    const d = describeRoute("portfolios/{num}/", undefined, fixture);
    expect(d.resolved).toBe(true);
    expect(d.url).toBe("https://api.robinhood.com/portfolios/{account_number}/");
  });

  it("returns suggestions (not silence) on a miss", () => {
    const d = describeRoute("positionsss", undefined, fixture);
    expect(d.resolved).toBe(false);
    expect(d.suggestions).toContain("https://api.robinhood.com/positions/");
  });

  it("returns the candidate list on ambiguity", () => {
    const d = describeRoute("orders/", undefined, fixture);
    expect(d.resolved).toBe(false);
    expect(d.ambiguous?.length).toBeGreaterThan(1);
  });
});

describe("fail-loud hint strings", () => {
  it("missingParamHint names the missing param, the route tokens, and an example", () => {
    const msg = missingParamHint("https://api.robinhood.com/portfolios/{account_number}/", ["account_number"]);
    expect(msg).toContain("account_number");
    expect(msg).toContain("{account_number}");
    expect(msg).toContain("--param account_number=<value>");
    expect(msg).toMatch(/num=\/account=/); // documents the legacy alias
  });

  it("noMatchHint appends did-you-mean candidates", () => {
    const msg = noMatchHint("positionsss", fixture);
    expect(msg).toContain("No brokerage route matched");
    expect(msg).toContain("Did you mean");
    expect(msg).toContain("positions/");
  });

  it("noMatchHint degrades gracefully when nothing is close", () => {
    expect(noMatchHint("zzzzzqqqq", fixture)).toContain("api-map directory");
  });
});
