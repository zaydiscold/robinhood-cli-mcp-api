import { describe, it, expect } from "vitest";
import { computePerformance } from "../src/lib.js";

// computePerformance calls getJson(url, params, query); brokerageGetJson fills {id} from params,
// so the injected fake keys off params.id (the url stays the {id} template). The accounts graph
// comes from transfer/accounts/.
function fakeGetJson(perfBody: any, accounts = [{ type: "rhs", account_number: "111111111", account_name: "Main" }]) {
  return async (url: string, _params: any = {}, _query: any = {}) => {
    if (url.includes("transfer/accounts")) return { results: accounts };
    if (url.includes("portfolio/performance")) return perfBody;
    return {};
  };
}

const perfFixture = {
  display_span: "year",
  performance_baseline: { amount: "10000.00" },
  lines: [
    {
      identifier: "returns",
      segments: [
        {
          points: [
            { x: 0, y: 0.0, cursor_data: { label: { value: "Jun 20, 2025" }, primary_value: { value: "$10,000.00" }, secondary_value: { main: { value: "$0.00 (0.00%)" }, description: { value: "" } } } },
            { x: 0.5, y: 0.05, cursor_data: { label: { value: "Dec 20, 2025" }, primary_value: { value: "$10,500.00" }, secondary_value: { main: { value: "+$500.00 (5.00%)" }, description: { value: "Overnight" } } } },
            { x: 1, y: 0.1, cursor_data: { label: { value: "Jun 19, 2026" }, primary_value: { value: "$11,000.00" }, secondary_value: { main: { value: "+$1,000.00 (10.00%)" }, description: { value: "Today" } } } }
          ]
        }
      ]
    },
    { identifier: "benchmark", segments: [] }
  ]
};

describe("computePerformance — portfolio equity curve", () => {
  it("flattens the returns line into points with parsed $ value, return %, timestamp, session", async () => {
    const r = await computePerformance({ span: "year" }, { getJson: fakeGetJson(perfFixture) });
    expect(r.span).toBe("year");
    expect(r.accounts).toHaveLength(1);
    const a = r.accounts[0];
    expect(a.summary.pointCount).toBe(3);
    expect(a.points[0].valueUsd).toBe(10000);
    expect(a.points[2].valueUsd).toBe(11000);
    expect(a.points[2].returnPct).toBe(10); // y(0.10) * 100, not 100×
    expect(a.points[0].at).toBe("Jun 20, 2025");
    expect(a.points[2].session).toBe("Today");
    // reads the "returns" line, not the benchmark line
    expect(a.points.every((p: any) => Number.isFinite(p.valueUsd))).toBe(true);
  });

  it("computes summary: current value (last point), baseline, period return $ and %", async () => {
    const r = await computePerformance({ span: "year" }, { getJson: fakeGetJson(perfFixture) });
    const s = r.accounts[0].summary;
    expect(s.currentValueUsd).toBe(11000);
    expect(s.baselineUsd).toBe(10000);
    expect(s.periodReturnUsd).toBe(1000); // 11000 - 10000
    expect(s.periodReturnPct).toBe(10);
  });

  it("maps friendly span aliases (1y → year) and warns + defaults to day on unknown span", async () => {
    const ok = await computePerformance({ span: "1y" }, { getJson: fakeGetJson(perfFixture) });
    expect(ok.span).toBe("year");
    expect(ok.warnings).toHaveLength(0);

    const bad = await computePerformance({ span: "decade" }, { getJson: fakeGetJson(perfFixture) });
    expect(bad.span).toBe("day");
    expect(bad.warnings.some((w: string) => w.includes("Unknown span"))).toBe(true);
  });

  it("parses negative formatted money: '-$50.00' and '($50.00)' both → -50", async () => {
    const neg = {
      performance_baseline: { amount: "10000" },
      lines: [{ identifier: "returns", segments: [{ points: [
        { y: -0.005, cursor_data: { label: { value: "x" }, primary_value: { value: "-$50.00" } } },
        { y: -0.005, cursor_data: { label: { value: "y" }, primary_value: { value: "($50.00)" } } }
      ] }] }]
    };
    const r = await computePerformance({ span: "day" }, { getJson: fakeGetJson(neg) });
    expect(r.accounts[0].points[0].valueUsd).toBe(-50);
    expect(r.accounts[0].points[1].valueUsd).toBe(-50);
  });

  it("degrades per-account: a failing account becomes a warning; others survive", async () => {
    const getJson = async (url: string, params: any = {}) => {
      if (url.includes("transfer/accounts")) return { results: [
        { type: "rhs", account_number: "111111111", account_name: "Good" },
        { type: "rhs", account_number: "222222222", account_name: "Bad" }
      ] };
      if (url.includes("portfolio/performance")) {
        if (params?.id === "222222222") throw new Error("500 Internal Server Error");
        return perfFixture;
      }
      return {};
    };
    const r = await computePerformance({ span: "year" }, { getJson });
    expect(r.accounts).toHaveLength(1); // only the good account
    expect(r.accounts[0].account).toBe("…1111");
    expect(r.warnings.some((w: string) => w.includes("…2222"))).toBe(true);
  });

  it("scopes to a single account when accountNumber is given", async () => {
    const getJson = fakeGetJson(perfFixture, [
      { type: "rhs", account_number: "111111111", account_name: "Main" },
      { type: "ira_roth", account_number: "222222222", account_name: "Roth" }
    ]);
    const r = await computePerformance({ span: "month", accountNumber: "222222222" }, { getJson });
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0].account).toBe("…2222");
  });
});
