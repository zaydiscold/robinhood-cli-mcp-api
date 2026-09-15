import { describe, it, expect } from "vitest";
import { buildNativeInternalTransferBody } from "../src/native-internal-transfer.js";
describe("native internal transfer contract", () => {
  const input = {
    sourceId: "owned-a",
    destinationId: "owned-b",
    amountUsd: "1.00",
    idempotencyId: "request-a",
  };
  it("matches the independently captured owned-account POST", () =>
    expect(buildNativeInternalTransferBody(input, "rhs", "rhs")).toEqual({
      id: "request-a",
      additional_data: { entry_point: 5 },
      amount: "1.00",
      currency: "usd",
      frequency: "once",
      source: { id: "owned-a", type: "rhs" },
      sink: { id: "owned-b", type: "rhs" },
    }));
  it("rejects same-account and invalid amounts", () => {
    expect(() =>
      buildNativeInternalTransferBody({ ...input, destinationId: "owned-a" }, "rhs", "rhs"),
    ).toThrow(/differ/);
    expect(() =>
      buildNativeInternalTransferBody({ ...input, amountUsd: "-1" }, "rhs", "rhs"),
    ).toThrow(/Positive/);
  });
  it("requires retirement inputs only for retirement routes", () => {
    expect(() => buildNativeInternalTransferBody(input, "rhs", "ira_roth")).toThrow(/year/);
    expect(() =>
      buildNativeInternalTransferBody({ ...input, contributionYear: 2026 }, "rhs", "rhs"),
    ).toThrow(/taxable/);
  });
  it("matches the independently captured taxable-to-Roth contribution POST", () =>
    expect(
      buildNativeInternalTransferBody(
        { ...input, destinationId: "owned-ira", amountUsd: "0.11", contributionYear: 2026 },
        "rhs",
        "ira_roth",
      ),
    ).toEqual({
      id: "request-a",
      additional_data: {
        entry_point: 0,
        ira_contribution_data: { contribution_type: "contribution", tax_year: 2026 },
      },
      amount: "0.11",
      currency: "usd",
      frequency: "once",
      source: { id: "owned-a", type: "rhs" },
      sink: { id: "owned-ira", type: "ira_roth" },
    }));
  it("matches the independently captured Roth-origin distribution POST", () =>
    expect(
      buildNativeInternalTransferBody(
        {
          ...input,
          sourceId: "owned-ira",
          amountUsd: "0.11",
          iraDistribution: {
            distributionType: "early",
            federalTaxWithholdingPercent: "0",
            stateTaxWithholdingPercent: "0",
            state: "CA",
          },
        },
        "ira_roth",
        "rhs",
      ),
    ).toEqual({
      id: "request-a",
      additional_data: {
        entry_point: 5,
        ira_distribution_data: {
          distribution_type: "early",
          federal_tax_withholding_percent: "0",
          state: "CA",
          state_tax_withholding_percent: "0",
        },
      },
      amount: "0.11",
      currency: "usd",
      frequency: "once",
      source: { id: "owned-ira", type: "ira_roth" },
      sink: { id: "owned-b", type: "rhs" },
    }));
  it("does not infer a Roth-origin distribution", () =>
    expect(() => buildNativeInternalTransferBody(input, "ira_roth", "rhs")).toThrow(
      /distribution/,
    ));
});
