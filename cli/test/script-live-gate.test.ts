import { describe, expect, it } from "vitest";
// The standalone write scripts (equity-buy.mjs, validate-strategies.mjs) gate live
// sends through this shared pure predicate. Testing the helper directly proves the
// gate without hitting the network or placing a live order (Plan 001).
import {
  isLiveWriteEnabled,
  liveIntentWithoutSwitch,
  LIVE_SWITCH_MISSING_NOTICE
} from "../../scripts/lib/live-gate.mjs";

const LIVE_ON = { ROBINHOOD_ALLOW_LIVE_WRITE: "1" } as NodeJS.ProcessEnv;
const LIVE_OFF = {} as NodeJS.ProcessEnv;

describe("standalone script live-write gate", () => {
  it("is live ONLY when --live intent AND the master switch are both present", () => {
    expect(isLiveWriteEnabled(["--live"], LIVE_ON)).toBe(true);
  });

  it("--live alone (no master switch) never sends", () => {
    expect(isLiveWriteEnabled(["--live"], LIVE_OFF)).toBe(false);
  });

  it("master switch alone (no --live intent) never sends", () => {
    expect(isLiveWriteEnabled([], LIVE_ON)).toBe(false);
  });

  it("neither present never sends", () => {
    expect(isLiveWriteEnabled([], LIVE_OFF)).toBe(false);
  });

  it("a non-'1' switch value never sends even with --live", () => {
    expect(isLiveWriteEnabled(["--live"], { ROBINHOOD_ALLOW_LIVE_WRITE: "true" })).toBe(false);
    expect(isLiveWriteEnabled(["--live"], { ROBINHOOD_ALLOW_LIVE_WRITE: "0" })).toBe(false);
  });

  it("detects live intent that is missing the switch (so the script can warn)", () => {
    expect(liveIntentWithoutSwitch(["--live"], LIVE_OFF)).toBe(true);
    expect(liveIntentWithoutSwitch(["--live"], LIVE_ON)).toBe(false);
    expect(liveIntentWithoutSwitch([], LIVE_OFF)).toBe(false);
  });

  it("exposes a human notice for the ignored-intent case", () => {
    expect(LIVE_SWITCH_MISSING_NOTICE).toContain("ROBINHOOD_ALLOW_LIVE_WRITE=1");
    expect(LIVE_SWITCH_MISSING_NOTICE).toContain("DRY-RUN");
  });
});
