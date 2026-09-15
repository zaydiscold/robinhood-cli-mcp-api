import { describe, expect, it } from "vitest";
import {
  bindWithdrawalContract,
  loadWithdrawalContractsFromJsonl,
} from "../src/withdrawal-contract-loader.js";

const body = {
  id: "captured-client-id",
  additional_data: { entry_point: 1, is_instant_transfer: false },
  amount: "360.00",
  currency: "USD",
  frequency: "one_time",
  source: { id: "taxable-a", type: "brokerage" },
  sink: { id: "bank-a", type: "ach" },
};

const capture = (postBody = body, action = "decline-upsell") =>
  `${JSON.stringify({
    schema: 1,
    action,
    target: "withdrawal-confirmation",
    events: [
      {
        dispatch: "blocked_before_dispatch",
        request: {
          method: "POST",
          url: "https://bonfire.robinhood.com/transfer/create/",
          postData: JSON.stringify(postBody),
        },
      },
    ],
  })}\n`;

describe("private withdrawal contract loader", () => {
  it("loads a blocked-before-dispatch create request and preserves the exact selected route", () => {
    const [contract] = loadWithdrawalContractsFromJsonl(capture());
    expect(contract).toMatchObject({
      context: {
        sourceId: "taxable-a",
        sourceType: "brokerage",
        destinationId: "bank-a",
        destinationType: "ach",
        rail: "bank_standard",
      },
    });
    const bound = bindWithdrawalContract(contract!, {
      sourceId: "taxable-a",
      destinationId: "bank-a",
      amountUsd: "1.00",
      rail: "bank_standard",
      idempotencyId: "fresh-client-id",
    });
    expect(bound.body).toEqual({ ...body, id: "fresh-client-id", amount: "1.00" });
  });

  it("refuses a cross-source, cross-destination, or cross-rail rebind", () => {
    const [contract] = loadWithdrawalContractsFromJsonl(capture());
    const input = {
      sourceId: "taxable-a",
      destinationId: "bank-a",
      amountUsd: "1.00",
      rail: "bank_standard" as const,
    };
    expect(() => bindWithdrawalContract(contract!, { ...input, sourceId: "roth-a" })).toThrow(
      /source/,
    );
    expect(() => bindWithdrawalContract(contract!, { ...input, destinationId: "bank-b" })).toThrow(
      /destination/,
    );
    expect(() => bindWithdrawalContract(contract!, { ...input, rail: "bank_instant" })).toThrow(
      /rail/,
    );
  });

  it("loads the observed final DCF capture without requiring an ACH instant flag", () => {
    const cardBody = {
      ...body,
      additional_data: { entry_point: 5 },
      source: { id: "taxable-a", type: "rhs" },
      sink: { id: "card-a", type: "dcf" },
    };
    expect(loadWithdrawalContractsFromJsonl(capture(cardBody, "final"))).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          sourceType: "rhs",
          destinationType: "dcf",
          rail: "debit_card",
        }),
      }),
    ]);
  });

  it("rejects malformed, non-final, or unknown-rail capture rows", () => {
    expect(loadWithdrawalContractsFromJsonl("not json\n")).toEqual([]);
    expect(
      loadWithdrawalContractsFromJsonl(capture({ ...body, additional_data: { entry_point: 1 } })),
    ).toEqual([]);
    expect(
      loadWithdrawalContractsFromJsonl(
        capture({ ...body, source: { id: "taxable-a", type: "unknown" } }),
      ),
    ).toEqual([]);
  });
});
