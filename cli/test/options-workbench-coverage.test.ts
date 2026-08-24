import { describe, expect, it } from "vitest";
import { buildOptionsWorkbench } from "../src/lib.js";

describe("options workbench Greek coverage", () => {
  it("keeps compatible numeric totals while exposing missing and invalid inputs", () => {
    const result = buildOptionsWorkbench({
      symbol: "AAPL",
      expiration: "2026-12-18",
      underlyingPrice: 100,
      legs: [
        {
          id: "lower-call",
          action: "buy",
          type: "call",
          strike: 95,
          premium: 7,
          delta: "0.50",
          gamma: 0.02,
          theta: null,
          vega: "not-a-number",
        },
        {
          id: "upper-call",
          action: "buy",
          type: "call",
          strike: 105,
          premium: 2,
          delta: -0.25,
          gamma: "",
          theta: -0.01,
          vega: 0.1,
        },
      ],
    });

    expect(result.netGreeks).toEqual({
      delta: 25,
      gamma: 2,
      theta: -1,
      vega: 10,
    });
    expect(Object.values(result.netGreeks).every(Number.isFinite)).toBe(true);
    expect(result.greekCoverage).toEqual({
      delta: {
        observedLegs: 2,
        totalLegs: 2,
        complete: true,
        missingLegIds: [],
        invalidLegIds: [],
      },
      gamma: {
        observedLegs: 1,
        totalLegs: 2,
        complete: false,
        missingLegIds: ["upper-call"],
        invalidLegIds: [],
      },
      theta: {
        observedLegs: 1,
        totalLegs: 2,
        complete: false,
        missingLegIds: ["lower-call"],
        invalidLegIds: [],
      },
      vega: {
        observedLegs: 1,
        totalLegs: 2,
        complete: false,
        missingLegIds: [],
        invalidLegIds: ["lower-call"],
      },
    });
  });

  it("treats an explicit zero Greek as observed data", () => {
    const result = buildOptionsWorkbench({
      symbol: "AAPL",
      expiration: "2026-12-18",
      underlyingPrice: 100,
      legs: [
        {
          id: "zero-greeks",
          action: "buy",
          type: "call",
          strike: 100,
          premium: 4,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
        },
      ],
    });

    expect(result.netGreeks).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
    for (const coverage of Object.values(result.greekCoverage)) {
      expect(coverage).toMatchObject({ observedLegs: 1, totalLegs: 1, complete: true });
    }
  });
});
