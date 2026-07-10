export type OrderLifecycleState = "planned" | "sent" | "confirmed" | "filled" | "rejected" | "cancelled" | "unknown";

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
  if (["confirmed", "queued", "placed", "unconfirmed", "partially_filled", "pending"].includes(state)) return "confirmed";
  return "unknown";
}

export async function watchOrderLifecycle(input: {
  id: string;
  poll: (id: string) => Promise<any>;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<{ id: string; state: OrderLifecycleState; transitions: OrderLifecycleTransition[]; outcomeKnown: boolean; retrySafe: false }> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? ((ms, signal) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason ?? new Error("aborted")); }, { once: true });
  }));
  const timeoutMs = Math.max(1, input.timeoutMs ?? 120_000);
  const intervalMs = Math.max(0, input.intervalMs ?? 2_000);
  const started = now().getTime();
  const transitions: OrderLifecycleTransition[] = [{ state: "sent", at: now().toISOString() }];
  let lastError: unknown;
  let finalDetail: unknown;

  const record = (detail: any) => {
    finalDetail = detail;
    const brokerState = detail?.state ?? detail?.status;
    const state = normalizeOrderLifecycleState(brokerState);
    if (transitions.at(-1)?.state !== state) transitions.push({ state, brokerState: String(brokerState ?? ""), at: now().toISOString(), detail });
    return state;
  };

  while (!input.signal?.aborted && now().getTime() - started < timeoutMs) {
    try {
      const state = record(await input.poll(input.id));
      lastError = undefined;
      if (TERMINAL.has(state)) return { id: input.id, state, transitions, outcomeKnown: true, retrySafe: false };
    } catch (error) { lastError = error; }
    try { await sleep(intervalMs, input.signal); } catch { break; }
  }

  // A final read is mandatory before declaring an unknown outcome. Never retry the order itself.
  if (!input.signal?.aborted) {
    try {
      const state = record(await input.poll(input.id));
      if (TERMINAL.has(state) || state === "confirmed") return { id: input.id, state, transitions, outcomeKnown: true, retrySafe: false };
    } catch (error) { lastError = error; }
  }
  if (transitions.at(-1)?.state !== "unknown") transitions.push({ state: "unknown", at: now().toISOString(), detail: finalDetail ?? (lastError instanceof Error ? lastError.message : lastError) });
  return { id: input.id, state: "unknown", transitions, outcomeKnown: false, retrySafe: false };
}
