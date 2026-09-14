import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
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
const normalizeIntentAmount = (value: string) => {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return value.trim();
  const whole = BigInt(match[1]).toString();
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
};
const intentSemantics = (op: MovementOperation) => {
  let rail: string;
  let retirement: unknown;
  switch (op.kind) {
    case "deposit":
      rail = op.input.method;
      retirement = { contributionYear: op.input.contributionYear };
      break;
    case "withdrawal":
      rail = op.input.rail;
      retirement = {
        iraDistribution: op.input.iraDistribution,
      };
      break;
    case "internal":
      rail = "internal";
      retirement = {
        contributionYear: op.input.contributionYear,
        contributionType: op.input.contributionType,
        iraDistribution: op.input.iraDistribution,
      };
      break;
  }
  return {
    kind: op.kind,
    sourceId: op.input.sourceId,
    destinationId: op.input.destinationId,
    rail,
    amountUsd: normalizeIntentAmount(op.input.amountUsd),
    retirement,
  };
};
const intentLockPath = (op: MovementOperation) =>
  join(
    directory(),
    "intent-locks",
    createHash("sha256")
      .update(JSON.stringify(intentSemantics(op)))
      .digest("hex") + ".lock",
  );
const acquireIntentLock = (op: MovementOperation, operationId: string) => {
  const locks = join(directory(), "intent-locks");
  mkdirSync(locks, { recursive: true, mode: 0o700 });
  const lock = intentLockPath(op);
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let owner = "unknown";
    try {
      owner = String(JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")).operationId);
    } catch {}
    throw new Error(
      `Equivalent money movement is already active as operation ${owner}. Reconcile or resume it before creating another request.`,
    );
  }
  writeFileSync(
    join(lock, "owner.json"),
    JSON.stringify({ operationId, startedAt: new Date().toISOString() }),
    { flag: "wx", mode: 0o600 },
  );
};
const releaseIntentLock = (op: MovementOperation, operationId: string) => {
  const lock = intentLockPath(op);
  try {
    const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8"));
    if (owner.operationId === operationId) rmSync(lock, { recursive: true, force: true });
  } catch {}
};
const operationLockPath = (operationId: string) =>
  join(directory(), "operation-locks", operationId + ".lock");
const acquireOperationLock = (operationId: string) => {
  const locks = join(directory(), "operation-locks");
  mkdirSync(locks, { recursive: true, mode: 0o700 });
  try {
    mkdirSync(operationLockPath(operationId), { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Error(
      `Resume is already active for operation ${operationId}. Wait for it to reconcile; do not retry.`,
    );
  }
};
const releaseOperationLock = (operationId: string) =>
  rmSync(operationLockPath(operationId), { recursive: true, force: true });
const terminalStates = new Set([
  "completed",
  "failed",
  "canceled",
  "cancelled",
  "rejected",
  "reversed",
]);
const isTerminalResponse = (response: unknown) => {
  const value = response as {
    submitted?: boolean;
    ambiguous?: boolean;
    receiptStatus?: string;
    state?: string;
  } | null;
  if (!value) return false;
  if (value.state && terminalStates.has(value.state.toLowerCase())) return true;
  return (
    value.submitted === false &&
    value.ambiguous !== true &&
    value.receiptStatus !== "verification_required" &&
    value.receiptStatus !== "already_exists"
  );
};
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
  acquireIntentLock(prepared, id);
  const record = {
    operation: prepared,
    credentialFingerprint: fingerprint(),
    startedAt: new Date().toISOString(),
    response: null as unknown,
  };
  try {
    writeFileSync(path, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  } catch (error) {
    releaseIntentLock(prepared, id);
    throw error;
  }
  const response = await invoke(prepared);
  record.response = response;
  writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
  if (isTerminalResponse(response)) releaseIntentLock(prepared, id);
  return { ...response, operationId: id };
}
/** No token values are persisted. A changed session cannot consume another session's challenge. */
async function resumeMoneyMovementExclusive(operationId: string) {
  const path = pathFor(operationId);
  const record = JSON.parse(readFileSync(path, "utf8"));
  const response = record.response;
  const receiptId = response?.serverReceiptId;
  const movement = record.operation as MovementOperation;
  const movementInput = movement.input;
  const reconcileOriginalIntent = async () => {
    const { reconcileBeforeMoneyMovement } = await import("./money-movement-receipt.js");
    return reconcileBeforeMoneyMovement({
      clientId: movementInput.idempotencyId!,
      sourceId: movementInput.sourceId,
      destinationId: movementInput.destinationId,
      amountUsd: movementInput.amountUsd,
      kind: movement.kind,
      rail:
        movement.kind === "deposit"
          ? movement.input.method
          : movement.kind === "withdrawal"
            ? movement.input.rail
            : undefined,
    });
  };
  if (record.continuationState === "dispatching" && !receiptId) {
    const existing = await reconcileOriginalIntent();
    if (!existing) {
      record.response = {
        submitted: false,
        ambiguous: true,
        receiptStatus: "transport_ambiguous",
      };
      writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
      throw new Error(
        "Unknown prior resume outcome: exact history reconciliation found no receipt; do not resend",
      );
    }
    const reconciled = {
      submitted: false,
      ambiguous: false,
      receiptStatus: "already_exists",
      serverReceiptId: existing.serverReceiptId,
      state: existing.state,
    };
    record.response = reconciled;
    record.continuationState = "reconciled";
    writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
    if (existing.state && terminalStates.has(existing.state.toLowerCase())) {
      releaseIntentLock(movement, operationId);
    }
    return { ...reconciled, operationId, alreadySubmitted: true };
  }
  if (receiptId) {
    const { getMoneyMovementReceipt } = await import("./money-movement-receipt.js");
    const reconciliation = await getMoneyMovementReceipt({
      serverReceiptId: receiptId,
      sourceId: movementInput.sourceId,
      destinationId: movementInput.destinationId,
      amountUsd: movementInput.amountUsd,
      kind: movement.kind,
    });
    const state = reconciliation.receipts[0]?.state;
    if (
      reconciliation.receiptVerified &&
      typeof state === "string" &&
      terminalStates.has(state.toLowerCase())
    ) {
      releaseIntentLock(movement, operationId);
    }
    return { ...response, operationId, alreadySubmitted: true, reconciliation };
  }
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
  const existing = await reconcileOriginalIntent();
  if (existing) {
    const reconciled = {
      submitted: false,
      ambiguous: false,
      receiptStatus: "already_exists",
      serverReceiptId: existing.serverReceiptId,
      state: existing.state,
    };
    record.response = reconciled;
    writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
    if (existing.state && terminalStates.has(existing.state.toLowerCase())) {
      releaseIntentLock(movement, operationId);
    }
    return { ...reconciled, operationId, alreadySubmitted: true };
  }
  record.continuationState = "dispatching";
  writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
  let next: Awaited<ReturnType<typeof invoke>>;
  try {
    next = await invoke(record.operation);
  } catch (error) {
    record.response = {
      submitted: false,
      ambiguous: true,
      receiptStatus: "transport_ambiguous",
    };
    record.continuationState = "ambiguous";
    writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
    throw error;
  }
  record.response = next;
  record.continuationState = "responded";
  writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
  if (isTerminalResponse(next)) releaseIntentLock(movement, operationId);
  return { ...next, operationId };
}

export async function resumeMoneyMovement(operationId: string) {
  pathFor(operationId);
  acquireOperationLock(operationId);
  try {
    return await resumeMoneyMovementExclusive(operationId);
  } finally {
    releaseOperationLock(operationId);
  }
}
