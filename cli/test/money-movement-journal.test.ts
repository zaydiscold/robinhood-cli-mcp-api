import { afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMoneyMovement, resumeMoneyMovement } from "../src/money-movement-journal.js";
import { matchMoneyMovementReceipt } from "../src/money-movement-receipt.js";
import { buildNativeBankDeposit } from "../src/native-bank-deposit.js";

vi.mock("../src/lib.js", () => ({
  executeCapturedDeposit: vi.fn(),
  executeCapturedWithdrawal: vi.fn(),
  executeNativeInternalTransfer: vi.fn(),
  brokerageGetJson: vi.fn(),
  brokerageGetAllResults: vi.fn(),
  executeBrokerageRequest: vi.fn(),
}));
vi.mock("../src/money-movement-verification.js", () => ({
  advanceMoneyMovementVerification: vi.fn(),
}));

describe("money movement journal", () => {
  let dir: string;
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.resetAllMocks();
  });
  it("atomically serializes equivalent live intents even when callers generate different IDs", async () => {
    dir = mkdtempSync(join(tmpdir(), "mm-"));
    process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR = dir;
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-a";
    const { executeNativeInternalTransfer } = await import("../src/lib.js");
    let finish!: (value: { submitted: boolean; ambiguous: boolean; receiptStatus: string }) => void;
    vi.mocked(executeNativeInternalTransfer).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as ReturnType<typeof executeNativeInternalTransfer>,
    );
    const first = runMoneyMovement({
      kind: "internal",
      input: { sourceId: "a", destinationId: "b", amountUsd: "0.11" },
    });
    await vi.waitFor(() => expect(executeNativeInternalTransfer).toHaveBeenCalledTimes(1));
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-b";
    await expect(
      runMoneyMovement({
        kind: "internal",
        input: { sourceId: "a", destinationId: "b", amountUsd: "0.110" },
      }),
    ).rejects.toThrow(/equivalent money movement.*active/i);
    finish({ submitted: false, ambiguous: false, receiptStatus: "rejected" });
    await first;
    expect(executeNativeInternalTransfer).toHaveBeenCalledTimes(1);
  });
  it("omits inert taxable retirement eligibility from the intent identity", async () => {
    dir = mkdtempSync(join(tmpdir(), "mm-"));
    process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR = dir;
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-a";
    const { executeCapturedWithdrawal } = await import("../src/lib.js");
    let finish!: (value: { submitted: boolean; ambiguous: boolean; receiptStatus: string }) => void;
    vi.mocked(executeCapturedWithdrawal).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as ReturnType<typeof executeCapturedWithdrawal>,
    );
    const first = runMoneyMovement({
      kind: "withdrawal",
      input: {
        sourceId: "a",
        destinationId: "bank",
        amountUsd: "1.00",
        rail: "bank_standard",
      },
    });
    await vi.waitFor(() => expect(executeCapturedWithdrawal).toHaveBeenCalledTimes(1));
    await expect(
      runMoneyMovement({
        kind: "withdrawal",
        input: {
          sourceId: "a",
          destinationId: "bank",
          amountUsd: "1",
          rail: "bank_standard",
          retirement: { eligibilityVerified: true },
        },
      }),
    ).rejects.toThrow(/equivalent money movement.*active/i);
    finish({ submitted: false, ambiguous: false, receiptStatus: "rejected" });
    await first;
    expect(executeCapturedWithdrawal).toHaveBeenCalledTimes(1);
  });
  it("keeps an equivalent-intent lock through verification-required state", async () => {
    dir = mkdtempSync(join(tmpdir(), "mm-"));
    process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR = dir;
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-a";
    const { executeNativeInternalTransfer } = await import("../src/lib.js");
    vi.mocked(executeNativeInternalTransfer).mockResolvedValue({
      submitted: false,
      receiptStatus: "verification_required",
      body: { verification_workflow: { id: "11111111-1111-4111-8111-111111111111" } },
    });
    await runMoneyMovement({
      kind: "internal",
      input: { sourceId: "a", destinationId: "b", amountUsd: "0.11" },
    });
    await expect(
      runMoneyMovement({
        kind: "internal",
        input: { sourceId: "a", destinationId: "b", amountUsd: "0.11" },
      }),
    ).rejects.toThrow(/equivalent money movement.*active/i);
    expect(executeNativeInternalTransfer).toHaveBeenCalledTimes(1);
  });
  it("refuses a second live submission of the same operation identity", async () => {
    dir = mkdtempSync(join(tmpdir(), "mm-"));
    process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR = dir;
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-a";
    const { executeNativeInternalTransfer } = await import("../src/lib.js");
    vi.mocked(executeNativeInternalTransfer).mockResolvedValue({
      submitted: false,
      receiptStatus: "verification_required",
      body: { verification_workflow: { id: "11111111-1111-4111-8111-111111111111" } },
    });
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await runMoneyMovement({
      kind: "internal",
      input: { sourceId: "a", destinationId: "b", amountUsd: "0.11", idempotencyId: id },
    });
    await expect(
      runMoneyMovement({
        kind: "internal",
        input: { sourceId: "a", destinationId: "b", amountUsd: "0.11", idempotencyId: id },
      }),
    ).rejects.toThrow(/already recorded/);
    expect(executeNativeInternalTransfer).toHaveBeenCalledTimes(1);
  });
  it("reconciles the original client identity before resuming after device approval", async () => {
    dir = mkdtempSync(join(tmpdir(), "mm-"));
    process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR = dir;
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-a";
    const api = await import("../src/lib.js");
    const verification = await import("../src/money-movement-verification.js");
    vi.mocked(api.executeNativeInternalTransfer).mockResolvedValue({
      submitted: false,
      receiptStatus: "verification_required",
      body: { verification_workflow: { id: "11111111-1111-4111-8111-111111111111" } },
    });
    vi.mocked(verification.advanceMoneyMovementVerification).mockResolvedValue({
      approved: true,
      submitted: false,
      status: "WORKFLOW_STATUS_APPROVED",
    });
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await runMoneyMovement({
      kind: "internal",
      input: { sourceId: "a", destinationId: "b", amountUsd: "0.11", idempotencyId: id },
    });
    vi.mocked(api.brokerageGetAllResults).mockResolvedValue([
      {
        id: "server-existing",
        ref_id: id,
        direction: "push",
        transfer_type: "internal",
        originating_account_id: "a",
        receiving_account_id: "b",
        amount: "0.11",
        state: "pending",
      },
    ]);
    const resumed = await resumeMoneyMovement(id);
    expect(resumed).toMatchObject({
      alreadySubmitted: true,
      serverReceiptId: "server-existing",
      state: "pending",
    });
    expect(api.executeNativeInternalTransfer).toHaveBeenCalledTimes(1);
  });
  it("serializes concurrent resumes of one recorded operation", async () => {
    dir = mkdtempSync(join(tmpdir(), "mm-"));
    process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR = dir;
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-a";
    const api = await import("../src/lib.js");
    const verification = await import("../src/money-movement-verification.js");
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    vi.mocked(api.executeNativeInternalTransfer).mockResolvedValueOnce({
      submitted: false,
      receiptStatus: "verification_required",
      body: { verification_workflow: { id: "11111111-1111-4111-8111-111111111111" } },
    });
    await runMoneyMovement({
      kind: "internal",
      input: { sourceId: "a", destinationId: "b", amountUsd: "0.11", idempotencyId: id },
    });
    vi.mocked(verification.advanceMoneyMovementVerification).mockResolvedValue({
      approved: true,
      submitted: false,
      status: "WORKFLOW_STATUS_APPROVED",
    });
    vi.mocked(api.brokerageGetAllResults).mockResolvedValue([]);
    let finish!: (value: { submitted: boolean; ambiguous: boolean; receiptStatus: string }) => void;
    vi.mocked(api.executeNativeInternalTransfer).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as ReturnType<typeof api.executeNativeInternalTransfer>,
    );
    const first = resumeMoneyMovement(id);
    await vi.waitFor(() => expect(api.executeNativeInternalTransfer).toHaveBeenCalledTimes(2));
    await expect(resumeMoneyMovement(id)).rejects.toThrow(/resume is already active/i);
    finish({ submitted: false, ambiguous: false, receiptStatus: "rejected" });
    await first;
    expect(api.executeNativeInternalTransfer).toHaveBeenCalledTimes(2);
  });
  it("does not resume under a different credential fingerprint", async () => {
    dir = mkdtempSync(join(tmpdir(), "mm-"));
    process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR = dir;
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-a";
    const { executeNativeInternalTransfer } = await import("../src/lib.js");
    vi.mocked(executeNativeInternalTransfer).mockResolvedValue({
      submitted: false,
      receiptStatus: "verification_required",
      body: { verification_workflow: { id: "11111111-1111-4111-8111-111111111111" } },
    });
    const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await runMoneyMovement({
      kind: "internal",
      input: { sourceId: "a", destinationId: "b", amountUsd: "0.11", idempotencyId: id },
    });
    process.env.ROBINHOOD_BROKERAGE_TOKEN = "session-b";
    await expect(resumeMoneyMovement(id)).rejects.toThrow(/original authenticated session/);
  });
});

describe("receipt identity", () => {
  it("requires the current server ID plus the observed source/destination/amount binding", () => {
    const rows = [
      {
        id: "receipt-a",
        originating_account_id: "owned-a",
        receiving_account_id: "owned-b",
        amount: "0.11",
      },
    ];
    expect(
      matchMoneyMovementReceipt(rows, {
        serverReceiptId: "receipt-a",
        sourceId: "owned-a",
        destinationId: "owned-b",
        amountUsd: "0.11",
        kind: "internal",
      }).receiptVerified,
    ).toBe(true);
    expect(
      matchMoneyMovementReceipt(rows, {
        serverReceiptId: "receipt-b",
        sourceId: "owned-a",
        destinationId: "owned-b",
        amountUsd: "0.11",
        kind: "internal",
      }).receiptVerified,
    ).toBe(false);
  });
});

describe("debit card native contract", () => {
  it("uses the independently observed dcf source type without repeating a live send", () => {
    const built = buildNativeBankDeposit({
      method: "debit_card",
      sourceId: "card-a",
      destinationId: "owned-a",
      destinationType: "rhs",
      amountUsd: "1.00",
      idempotencyId: "request-a",
    });
    expect(built.steps[0].body.source).toEqual({ id: "card-a", type: "dcf" });
    expect(built.steps[1].body).toEqual(built.steps[0].body);
  });
});
