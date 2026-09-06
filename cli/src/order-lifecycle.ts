export type OrderLifecycleState =
  | "planned"
  | "sent"
  | "confirmed"
  | "filled"
  | "rejected"
  | "cancelled"
  | "unknown";

export interface OrderLifecycleTransition {
  state: OrderLifecycleState;
  at: string;
  brokerState?: string;
  detail?: unknown;
}

const TERMINAL = new Set<OrderLifecycleState>(["filled", "rejected", "cancelled"]);

export function normalizeOrderLifecycleState(value: unknown): OrderLifecycleState {
  const state = String(value ?? "").toLowerCase();
  if (["filled", "completed", "executed"].includes(state)) return "filled";
  if (["rejected", "failed", "voided"].includes(state)) return "rejected";
  if (["cancelled", "canceled"].includes(state)) return "cancelled";
  if (
    ["confirmed", "queued", "placed", "unconfirmed", "partially_filled", "pending"].includes(
      state,
    )
  ) {
    return "confirmed";
  }
  return "unknown";
}

function brokerStateFrom(detail: unknown): unknown {
  if (!detail || typeof detail !== "object") return undefined;
  const record = detail as Record<string, unknown>;
  return record.state ?? record.status;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }

    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason ?? new Error("aborted"));
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const MAX_TIMER_MS = 2_147_483_647;

function duration(value: number, name: string, allowZero = false): number {
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 1) || value > MAX_TIMER_MS) {
    throw new RangeError(
      `${name} must be finite and between ${allowZero ? 0 : 1} and ${MAX_TIMER_MS} ms`,
    );
  }
  return value;
}

/**
 * Bound the observer even when a legacy poll/sleep callback ignores cancellation.
 * This stops waiting; it cannot cancel transport work owned by the callback.
 * Attach both settlement handlers so a late rejection never becomes unhandled.
 */
function withinBudget<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(signal?.reason ?? new Error("aborted"));
    const timer = setTimeout(
      () => fail(new Error("Order observation deadline exceeded")),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      Promise.resolve(operation()).then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * timeoutMs bounds observation; one final read has a separate bounded budget.
 * The default final budget is min(timeoutMs, 5000). No order is ever resubmitted.
 */
export async function watchOrderLifecycle(input: {
  id: string;
  poll: (id: string) => Promise<unknown>;
  intervalMs?: number;
  timeoutMs?: number;
  finalReadTimeoutMs?: number;
  signal?: AbortSignal;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<{
  id: string;
  state: OrderLifecycleState;
  transitions: OrderLifecycleTransition[];
  outcomeKnown: boolean;
  retrySafe: false;
}> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? abortableSleep;
  const timeoutMs = duration(input.timeoutMs ?? 120_000, "timeoutMs");
  const intervalMs = duration(input.intervalMs ?? 2_000, "intervalMs", true);
  const finalReadTimeoutMs = duration(
    input.finalReadTimeoutMs ?? Math.min(timeoutMs, 5_000),
    "finalReadTimeoutMs",
  );
  const started = now().getTime();
  const monotonicStarted = performance.now();
  const remaining = () =>
    Math.max(
      0,
      timeoutMs - Math.max(now().getTime() - started, performance.now() - monotonicStarted),
    );
  const transitions: OrderLifecycleTransition[] = [{ state: "sent", at: now().toISOString() }];
  let lastError: unknown;
  let finalDetail: unknown;

  const record = (detail: unknown) => {
    finalDetail = detail;
    const brokerState = brokerStateFrom(detail);
    const state = normalizeOrderLifecycleState(brokerState);
    if (transitions.at(-1)?.state !== state) {
      transitions.push({
        state,
        brokerState: String(brokerState ?? ""),
        at: now().toISOString(),
        detail,
      });
    }
    return state;
  };

  while (!input.signal?.aborted) {
    const pollBudget = remaining();
    if (pollBudget <= 0) break;
    try {
      const state = record(
        await withinBudget(() => input.poll(input.id), pollBudget, input.signal),
      );
      lastError = undefined;
      if (TERMINAL.has(state)) {
        return { id: input.id, state, transitions, outcomeKnown: true, retrySafe: false };
      }
    } catch (error) {
      lastError = error;
    }

    const sleepBudget = remaining();
    if (sleepBudget <= 0 || input.signal?.aborted) break;
    try {
      await withinBudget(
        () => sleep(Math.min(intervalMs, sleepBudget), input.signal),
        sleepBudget,
        input.signal,
      );
    } catch {
      break;
    }
  }

  // Attempt one bounded reconciliation unless explicitly cancelled. This is a read,
  // never a retry of the order. Late callback results cannot change the returned receipt.
  if (!input.signal?.aborted) {
    try {
      const state = record(
        await withinBudget(() => input.poll(input.id), finalReadTimeoutMs, input.signal),
      );
      if (TERMINAL.has(state) || state === "confirmed") {
        return { id: input.id, state, transitions, outcomeKnown: true, retrySafe: false };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (transitions.at(-1)?.state !== "unknown") {
    transitions.push({
      state: "unknown",
      at: now().toISOString(),
      detail: finalDetail ?? (lastError instanceof Error ? lastError.message : lastError),
    });
  }
  return { id: input.id, state: "unknown", transitions, outcomeKnown: false, retrySafe: false };
}
