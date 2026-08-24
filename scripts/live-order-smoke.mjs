#!/usr/bin/env node
// Retired compatibility entrypoint.
//
// The former implementation discovered contracts, posted option orders, and cancelled them through
// a second HTTP client outside the shared CLI/MCP engine. Keeping a shadow money-moving path meant
// write policy, account ownership checks, notional controls, order evidence, retries, and logging
// could drift from the first-class implementation.

const message = `scripts/live-order-smoke.mjs has been retired.

Live lifecycle proofs must use the first-class CLI/MCP path and an operator-approved exact account,
contract, side, quantity, and limit. Do not auto-select a held contract and place a probe order.

Use the supported flow instead:
  1. resolve and inspect the exact option contract
  2. build and review the exact dry-run order body
  3. obtain explicit approval for that exact body
  4. submit through the shared brokerage write engine
  5. verify through order history
  6. cancel through the shared cancel engine and verify cancellation

Nothing was sent.`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`${message}\n`);
  process.exitCode = 0;
} else {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
