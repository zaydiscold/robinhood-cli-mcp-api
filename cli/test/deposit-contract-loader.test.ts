import { describe, expect, it } from "vitest";
import {
  bindDepositContract,
  classifyDepositWorkflowReceipt,
  loadDepositContractsFromJsonl,
} from "../src/deposit-contract-loader.js";

const captured = JSON.stringify({
  action: "final",
  events: [
    { request: { method: "POST", url: "https://bonfire.robinhood.com/transfer/pre_create/", postData: JSON.stringify({ id: "captured-id", amount: "1.00", currency: "USD", frequency: "one_time", source: { id: "old-source", type: "ach" }, sink: { id: "old-destination", type: "ira_roth" }, additional_data: { ira_contribution_data: { tax_year: 2026 } } }) } },
    { request: { method: "POST", url: "https://bonfire.robinhood.com/transfer/create/", postData: JSON.stringify({ id: "captured-id", amount: "1.00", currency: "USD", frequency: "one_time", source: { id: "old-source", type: "ach" }, sink: { id: "old-destination", type: "ira_roth" }, additional_data: { ira_contribution_data: { tax_year: 2026 } } }) } },
  ],
});

describe("private deposit contract loader", () => {
  it("loads only the observed financial sequence and binds caller-selected ids and amount", () => {
    const contracts = loadDepositContractsFromJsonl(`${captured}\nnot-json`);
    expect(contracts).toHaveLength(1);
    const bound = bindDepositContract(contracts[0]!, { sourceId: "source-1", destinationId: "destination-1", amountUsd: "1.00", method: "bank_instant" });
    expect(bound.steps.map((step) => step.url)).toEqual([
      "https://bonfire.robinhood.com/transfer/pre_create/",
      "https://bonfire.robinhood.com/transfer/create/",
    ]);
    expect(bound.steps[0]?.body).toMatchObject({ amount: "1.00", source: { id: "source-1" }, sink: { id: "destination-1" } });
    expect(bound.steps[0]?.body.id).not.toBe("captured-id");
  });

  it("rejects malformed amounts and a capture with no complete pre-create/create sequence", () => {
    expect(() => bindDepositContract(loadDepositContractsFromJsonl(`${captured}\n`)[0]!, { sourceId: "s", destinationId: "d", amountUsd: "1.001", method: "bank_standard" })).toThrow(/positive USD/);
    expect(loadDepositContractsFromJsonl(JSON.stringify({ action: "final", events: [] }))).toEqual([]);
  });

  it("marks missing final response as ambiguous and never treats pre-create as a quote", () => {
    expect(classifyDepositWorkflowReceipt([{ status: 200, body: { ok: true } }])).toMatchObject({ receiptStatus: "transport_ambiguous", submitted: false, ambiguous: true });
    expect(classifyDepositWorkflowReceipt([{ status: 200 }, { status: 201, body: { id: "receipt" } }])).toMatchObject({ receiptStatus: "accepted", submitted: true, ambiguous: false });
  });
});
