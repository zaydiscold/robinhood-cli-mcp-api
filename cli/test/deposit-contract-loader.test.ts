import { describe, expect, it } from "vitest";
import {
  bindDepositContract,
  classifyDepositWorkflowReceipt,
  loadDepositContractsFromJsonl,
} from "../src/deposit-contract-loader.js";

const rothBody = { id: "captured-client-id", amount: "1.00", currency: "USD", frequency: "one_time", source: { id: "bank-a", type: "ach" }, sink: { id: "roth-a", type: "ira_roth" }, additional_data: { ira_contribution_data: { tax_year: 2026 } } };
const capture = (body = rothBody) => JSON.stringify({
  schema: 2,
  action: "final",
  context: { method: "bank_standard", sourceId: "bank-a", sourceType: "ach", destinationId: "roth-a", destinationType: "ira_roth", contributionYear: 2026 },
  events: [
    { dispatch: "blocked_before_dispatch", request: { method: "POST", url: "https://bonfire.robinhood.com/transfer/pre_create/", postData: JSON.stringify(body) } },
    { dispatch: "blocked_before_dispatch", request: { method: "POST", url: "https://bonfire.robinhood.com/transfer/create/", postData: JSON.stringify(body) } },
  ],
});

describe("private deposit contract loader", () => {
  it("keeps a captured Roth body semantically unchanged except for the fresh client id", () => {
    const [contract] = loadDepositContractsFromJsonl(capture());
    const bound = bindDepositContract(contract!, { sourceId: "bank-a", destinationId: "roth-a", destinationType: "ira_roth", amountUsd: "1.00", method: "bank_standard", contributionYear: 2026, idempotencyId: "fresh-client-id" });
    expect(bound.steps[0]!.body).toEqual({ ...rothBody, id: "fresh-client-id" });
    expect(bound.steps[1]!.body).toEqual({ ...rothBody, id: "fresh-client-id" });
  });

  it("refuses cross-rail, cross-source, and cross-destination reuse", () => {
    const [contract] = loadDepositContractsFromJsonl(capture());
    const input = { sourceId: "bank-a", destinationId: "roth-a", destinationType: "ira_roth", amountUsd: "1.00", method: "bank_standard" as const, contributionYear: 2026 };
    expect(() => bindDepositContract(contract!, { ...input, method: "bank_instant" })).toThrow(/method/);
    expect(() => bindDepositContract(contract!, { ...input, sourceId: "other-bank" })).toThrow(/sourceId/);
    expect(() => bindDepositContract(contract!, { ...input, destinationId: "taxable-a", destinationType: "brokerage" })).toThrow(/destination/);
  });

  it("rejects Roth contribution data for taxable destinations instead of stripping or reusing it", () => {
    const [contract] = loadDepositContractsFromJsonl(capture());
    expect(() => bindDepositContract(contract!, { sourceId: "bank-a", destinationId: "roth-a", destinationType: "brokerage", amountUsd: "1.00", method: "bank_standard", contributionYear: 2026 })).toThrow(/destination type/);
    expect(loadDepositContractsFromJsonl(capture({ ...rothBody, sink: { id: "taxable-a", type: "brokerage" } }))).toEqual([]);
  });

  it("requires observed capture context and current contribution-year agreement", () => {
    expect(loadDepositContractsFromJsonl(JSON.stringify({ action: "final", events: [] }))).toEqual([]);
    const [contract] = loadDepositContractsFromJsonl(capture());
    expect(() => bindDepositContract(contract!, { sourceId: "bank-a", destinationId: "roth-a", destinationType: "ira_roth", amountUsd: "1.00", method: "bank_standard", contributionYear: 2025 })).toThrow(/contribution year/);
  });

  it("does not accept a 2xx workflow response without a captured server receipt identity", () => {
    expect(classifyDepositWorkflowReceipt([{ status: 200, body: { ok: true } }, { status: 201, body: { ok: true } }])).toMatchObject({ receiptStatus: "transport_ambiguous", submitted: false, ambiguous: true });
    // The observed create response identifies the server receipt as `transfer_id`, not `id`.
    expect(classifyDepositWorkflowReceipt([{ status: 200, body: { ok: true } }, { status: 200, body: { transfer_id: "server-receipt" } }])).toMatchObject({ receiptStatus: "accepted", submitted: true, ambiguous: false, serverReceiptId: "server-receipt" });
    expect(classifyDepositWorkflowReceipt([{ status: 200, body: { id: "pre" } }, { status: 201, body: { transfer: { id: "server-receipt" }, client_id: "fresh-client-id" } }])).toMatchObject({ receiptStatus: "accepted", submitted: true, ambiguous: false, serverReceiptId: "server-receipt" });
  });
});
