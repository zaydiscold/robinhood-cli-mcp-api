// live-gate.mjs — shared live-write gate for standalone Node scripts.
//
// Mirrors the engine's contract (cli/src/lib.ts): a live write requires BOTH the
// script's explicit --live intent AND the master switch ROBINHOOD_ALLOW_LIVE_WRITE=1.
// With either missing the script MUST stay in dry-run — print the exact body it
// would send, and send nothing. scripts/live-order-smoke.mjs is the canonical
// example this helper generalizes so every write-capable script gates identically.

/** True only when BOTH --live intent AND ROBINHOOD_ALLOW_LIVE_WRITE=1 are present. */
export function isLiveWriteEnabled(argv = process.argv, env = process.env) {
  return argv.includes("--live") && env.ROBINHOOD_ALLOW_LIVE_WRITE === "1";
}

/** True when the operator asked for --live but the master switch is missing. */
export function liveIntentWithoutSwitch(argv = process.argv, env = process.env) {
  return argv.includes("--live") && env.ROBINHOOD_ALLOW_LIVE_WRITE !== "1";
}

/** Human warning to print (stderr) when --live is ignored for lack of the switch. */
export const LIVE_SWITCH_MISSING_NOTICE =
  "⚠️  --live ignored: ROBINHOOD_ALLOW_LIVE_WRITE=1 is not set — running DRY-RUN (bodies printed, nothing sent).";

// Zayd Khan // cold // www.zayd.wtf
