import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { watchOrderLifecycle } from "../src/order-lifecycle.js";

const never = (): Promise<never> => new Promise(() => undefined);

/** A broken observer must fail this test instead of hanging the test runner. */
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Observer did not settle")), 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("order lifecycle deadlines", () => {
  it("bounds a stalled poll and its final reconciliation without resubmitting", async () => {
    let reads = 0;
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order",
      timeoutMs: 20,
      finalReadTimeoutMs: 20,
      poll: () => { reads += 1; return never(); },
    }));
    assert.equal(reads, 2);
    assert.equal(result.state, "unknown");
    assert.equal(result.outcomeKnown, false);
    assert.equal(result.retrySafe, false);
  });

  it("settles cancellation during a stalled poll and skips the final read", async () => {
    const controller = new AbortController();
    let reads = 0;
    const pending = watchOrderLifecycle({
      id: "synthetic-order",
      signal: controller.signal,
      poll: () => { reads += 1; return never(); },
    });
    controller.abort(new Error("operator cancelled observation"));
    const result = await bounded(pending);
    assert.equal(reads, 1);
    assert.equal(result.state, "unknown");
    assert.equal(result.retrySafe, false);
  });

  it("performs no reads when already cancelled", async () => {
    let reads = 0;
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order",
      signal: AbortSignal.abort(),
      poll: async () => { reads += 1; return { state: "filled" }; },
    }));
    assert.equal(reads, 0);
    assert.equal(result.outcomeKnown, false);
  });

  it("bounds the mandatory final read after the observation window expires", async () => {
    let ticks = 0;
    let reads = 0;
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order",
      timeoutMs: 1,
      finalReadTimeoutMs: 20,
      now: () => new Date(ticks++ === 0 ? 0 : 100),
      poll: () => { reads += 1; return never(); },
    }));
    assert.equal(reads, 1);
    assert.equal(result.state, "unknown");
  });

  it("caps a long sleep to the remaining budget and still reconciles", async () => {
    let reads = 0;
    let observedSleep = -1;
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order",
      timeoutMs: 50,
      intervalMs: 60_000,
      poll: async () => ({ state: ++reads === 1 ? "queued" : "filled" }),
      sleep: async (ms) => { observedSleep = ms; await delay(ms + 1); },
    }));
    assert.ok(observedSleep >= 0 && observedSleep <= 50);
    assert.equal(reads, 2);
    assert.equal(result.state, "filled");
  });

  it("bounds an injected sleep that ignores cancellation and deadlines", async () => {
    let reads = 0;
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order",
      timeoutMs: 30,
      poll: async () => ({ state: ++reads === 1 ? "queued" : "filled" }),
      sleep: never,
    }));
    assert.equal(reads, 2);
    assert.equal(result.state, "filled");
  });

  it("does not let a late poll completion mutate the returned receipt", async () => {
    let resolvePoll: (value: unknown) => void = () => undefined;
    const deferred = new Promise<unknown>((resolve) => { resolvePoll = resolve; });
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order",
      timeoutMs: 10,
      finalReadTimeoutMs: 10,
      poll: () => deferred,
    }));
    const receipt = JSON.stringify(result);
    resolvePoll({ state: "filled" });
    await delay(0);
    assert.equal(JSON.stringify(result), receipt);
  });

  it("consumes late rejections after cancellation", async () => {
    let rejectPoll: (error: Error) => void = () => undefined;
    const deferred = new Promise<unknown>((_, reject) => { rejectPoll = reject; });
    const controller = new AbortController();
    const pending = watchOrderLifecycle({
      id: "synthetic-order",
      signal: controller.signal,
      poll: () => deferred,
    });
    controller.abort();
    await bounded(pending);
    rejectPoll(new Error("late synthetic transport rejection"));
    await delay(0);
  });

  it("rejects invalid timer values before calling the broker callback", async () => {
    for (const key of ["timeoutMs", "intervalMs", "finalReadTimeoutMs"] as const) {
      for (const value of [NaN, Infinity, -1, 2_147_483_648]) {
        let reads = 0;
        await assert.rejects(watchOrderLifecycle({
          id: "synthetic-order",
          [key]: value,
          poll: async () => { reads += 1; return {}; },
        }), RangeError);
        assert.equal(reads, 0);
      }
    }
    for (const key of ["timeoutMs", "finalReadTimeoutMs"] as const) {
      await assert.rejects(watchOrderLifecycle({
        id: "synthetic-order", [key]: 0, poll: never,
      }), RangeError);
    }
  });

  it("keeps zero-interval polling, state deduplication, and terminal success", async () => {
    const states = ["queued", "queued", "partially_filled", "filled"];
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order",
      intervalMs: 0,
      poll: async () => ({ state: states.shift() }),
      sleep: async () => undefined,
    }));
    assert.deepEqual(result.transitions.map((row) => row.state), ["sent", "confirmed", "filled"]);
    assert.equal(result.outcomeKnown, true);
    assert.equal(result.retrySafe, false);
  });

  it("retains final reconciliation with an injected clock", async () => {
    let reads = 0;
    const times = [0, 2, 3, 4].map((ms) => new Date(ms));
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order", timeoutMs: 1, intervalMs: 0,
      now: () => times.shift() ?? new Date(5),
      sleep: async () => undefined,
      poll: async () => { reads += 1; throw new Error("transport unknown"); },
    }));
    assert.ok(reads >= 1);
    assert.equal(result.state, "unknown");
    assert.equal(result.retrySafe, false);
  });

  it("does not let a backwards wall clock extend a stalled observation", async () => {
    let ticks = 0;
    const result = await bounded(watchOrderLifecycle({
      id: "synthetic-order", timeoutMs: 10, finalReadTimeoutMs: 10,
      now: () => new Date(ticks++ === 0 ? 100_000 : 0),
      poll: never,
    }));
    assert.equal(result.state, "unknown");
  });
});
