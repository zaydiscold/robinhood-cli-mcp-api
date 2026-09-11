import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
type Api = typeof import("./lib.js");
export type MovementOperation =
  | { kind: "deposit"; input: Parameters<Api["executeCapturedDeposit"]>[0] }
  | { kind: "withdrawal"; input: Parameters<Api["executeCapturedWithdrawal"]>[0] }
  | { kind: "internal"; input: Parameters<Api["executeNativeInternalTransfer"]>[0] };
const directory = () =>
  process.env.ROBINHOOD_MONEY_MOVEMENT_STATE_DIR ??
  join(homedir(), ".config", "robinhood-cli", "money-movement");
const pathFor = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid operation ID");
  return join(directory(), id + ".json");
};
const fingerprint = () =>
  createHash("sha256")
    .update(process.env.ROBINHOOD_BROKERAGE_TOKEN ?? "")
    .digest("hex");
async function invoke(op: MovementOperation) {
  const api = await import("./lib.js");
  switch (op.kind) {
    case "deposit":
      return api.executeCapturedDeposit(op.input);
    case "withdrawal":
      return api.executeCapturedWithdrawal(op.input);
    case "internal":
      return api.executeNativeInternalTransfer(op.input);
  }
}
export async function runMoneyMovement(op: MovementOperation) {
  if (op.input.dryRun) return invoke(op);
  const id = op.input.idempotencyId ?? randomUUID();
  const input = { ...op.input, idempotencyId: id };
  const prepared = { ...op, input } as MovementOperation;
  mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const path = pathFor(id);
  if (existsSync(path))
    throw new Error(
      "Operation already recorded. Use money-movement-resume; do not submit a second request.",
    );
  const record = {
    operation: prepared,
    credentialFingerprint: fingerprint(),
    startedAt: new Date().toISOString(),
    response: null as unknown,
  };
  writeFileSync(path, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  const response = await invoke(prepared);
  record.response = response;
  writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
  return { ...response, operationId: id };
}
/** No token values are persisted. A changed session cannot consume another session's challenge. */
export async function resumeMoneyMovement(operationId: string) {
  const path = pathFor(operationId);
  const record = JSON.parse(readFileSync(path, "utf8"));
  const response = record.response;
  const receiptId = response?.serverReceiptId;
  if (receiptId) return { ...response, operationId, alreadySubmitted: true };
  if (!response || response.ambiguous)
    throw new Error(
      "Unknown prior outcome: independently reconcile history before any resubmission",
    );
  const workflow =
    response.body?.verification_workflow ??
    response.steps
      ?.map((s: { body?: { verification_workflow?: unknown } }) => s.body?.verification_workflow)
      .find(Boolean);
  if (!workflow)
    throw new Error("This operation requires a provider-specific action; no blind resubmission");
  if (record.credentialFingerprint !== fingerprint())
    throw new Error(
      "Verification belongs to the original authenticated session; credentials changed",
    );
  const { advanceMoneyMovementVerification } = await import("./money-movement-verification.js");
  const verification = await advanceMoneyMovementVerification({ workflowId: workflow.id });
  if (!verification.approved) return { operationId, submitted: false, verification };
  const next = await invoke(record.operation);
  record.response = next;
  writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
  return { ...next, operationId };
}
