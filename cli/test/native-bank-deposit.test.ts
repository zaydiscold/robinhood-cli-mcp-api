import { describe, it, expect } from "vitest";
import { buildNativeBankDeposit } from "../src/native-bank-deposit.js";
describe("native bank deposits", () => {
  const input = {
    sourceId: "bank-a",
    destinationId: "taxable-a",
    destinationType: "rhs",
    amountUsd: "1.00",
    idempotencyId: "request-a",
  };
  it("matches captured taxable request without private fixtures", () => {
    const p = buildNativeBankDeposit(input);
    expect(p.steps[0].body).toEqual({
      id: "request-a",
      additional_data: { entry_point: 5 },
      amount: "1.00",
      currency: "usd",
      frequency: "once",
      sink: { id: "taxable-a", type: "rhs" },
      source: { id: "bank-a", type: "ach" },
    });
    expect(p.steps[1].body).toEqual(p.steps[0].body);
  });
  it("keeps the contribution year explicit and out of taxable requests", () => {
    expect(() => buildNativeBankDeposit({ ...input, destinationType: "ira_roth" })).toThrow(/year/);
    expect(() => buildNativeBankDeposit({ ...input, contributionYear: 2026 })).toThrow(/taxable/);
    expect(
      buildNativeBankDeposit({ ...input, destinationType: "ira_roth", contributionYear: 2026 })
        .steps[0].body.additional_data,
    ).toEqual({
      entry_point: 0,
      ira_contribution_data: { contribution_type: "contribution", tax_year: 2026 },
    });
  });
  it.each(["0", "-1", "NaN", "1e2", "1.001"])("rejects invalid amount %s", (amountUsd) =>
    expect(() => buildNativeBankDeposit({ ...input, amountUsd })).toThrow(),
  );
  it("uses fresh ids by default but preserves explicit continuation identity", () => {
    expect(buildNativeBankDeposit({ ...input, idempotencyId: undefined }).idempotencyId).not.toBe(
      buildNativeBankDeposit({ ...input, idempotencyId: undefined }).idempotencyId,
    );
    expect(buildNativeBankDeposit(input).idempotencyId).toBe("request-a");
  });
});
