import { describe, expect, it } from "vitest";
import { bindInternalTransferContract, loadInternalTransferContractsFromJsonl } from "../src/internal-transfer-contract-loader.js";

const capture = JSON.stringify({
  schema: 2,
  action: "final",
  capturedAt: "2026-09-11T16:00:00.000Z",
  events: [{ request: { method: "POST", url: "https://bonfire.robinhood.com/paymenthub/unified_transfers/", postData: JSON.stringify({ amount: "1.00", source_id: "source", destination_id: "destination", transfer_type: "internal", idempotency_key: "old" }) } }],
  context: { sourceId: "source", destinationId: "destination", sourceType: "rhs_account", destinationType: "ira_roth", contributionYear: 2026 },
  bindings: { amountField: "amount", sourceAccountField: "source_id", destinationAccountField: "destination_id", idempotencyField: "idempotency_key" },
});

describe("internal transfer captured contracts", () => {
  it("accepts only exact account-bound unified-transfer POST captures and renews only the observed idempotency key", () => {
    const [contract] = loadInternalTransferContractsFromJsonl(capture);
    expect(contract).toBeDefined();
    const bound = bindInternalTransferContract(contract!, { amountUsd: "1.00", sourceId: "source", destinationId: "destination", sourceType: "rhs_account", destinationType: "ira_roth", contributionYear: 2026, idempotencyKey: "new-key" });
    expect(bound.body).toMatchObject({ amount: "1.00", source_id: "source", destination_id: "destination", idempotency_key: "new-key" });
    expect(() => bindInternalTransferContract(contract!, { amountUsd: "1.00", sourceId: "other", destinationId: "destination", sourceType: "rhs_account", destinationType: "ira_roth", contributionYear: 2026 })).toThrow(/captured route semantics/);
  });
});
