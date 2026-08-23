# Plan 001: Gate standalone write scripts behind ROBINHOOD_ALLOW_LIVE_WRITE

> Executor instructions: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise.
>
> Drift check: `git diff --stat e6cdb44..HEAD -- scripts/equity-buy.mjs scripts/validate-strategies.mjs scripts/live-order-smoke.mjs cli/test`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts below against live code before editing.

## Status

- Priority: P0
- Effort: S
- Risk: MED
- Depends on: none
- Category: security
- Planned at: commit `e6cdb44`, 2026-07-06, with uncommitted WIP present

## Why this matters

This repo's public contract says every live write is gated by the single environment switch `ROBINHOOD_ALLOW_LIVE_WRITE=1`. The main CLI/MCP engine follows that rule, but two standalone scripts still bypass or weaken it. Because these scripts can place real orders, they must either call the shared engine or require the same switch before any POST to Robinhood.

## Current state

- `scripts/equity-buy.mjs` is a standalone equity order script. It says writes are dry-run unless `--live` is passed, but it does not also require `ROBINHOOD_ALLOW_LIVE_WRITE=1`.
- `scripts/equity-buy.mjs:141-155` sends `post("https://api.robinhood.com/orders/", built.body)` whenever `live` is true.
- `scripts/validate-strategies.mjs` is a live strategy topology validator. It has no dry-run mode or env gate.
- `scripts/validate-strategies.mjs:61-73` always POSTs to `https://api.robinhood.com/options/orders/` and then POSTs cancel when an order id is returned.
- `scripts/live-order-smoke.mjs:11-15` and `scripts/live-order-smoke.mjs:34` already show the desired pattern: `--live` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

Verification commands available in this repo:

| Purpose | Command | Expected on success |
|---|---|---|
| CLI typecheck | `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck` | exit 0 |
| MCP typecheck | `corepack pnpm --filter @zaydiscold/robinhood-cli-mcp typecheck` | exit 0 |
| Tests | `corepack pnpm test` | exit 0 after all active plans are resolved |

## Scope

In scope:
- `scripts/equity-buy.mjs`
- `scripts/validate-strategies.mjs`
- `cli/test` if adding script-behavior tests is practical

Out of scope:
- Do not rewrite these scripts into TypeScript.
- Do not change `scripts/live-order-smoke.mjs` unless you are extracting a tiny shared helper pattern.
- Do not place any live order during implementation or verification.

## Steps

1. Add a shared local predicate in each write script, or a small imported helper if the repo already has one suitable for scripts: live writes require both the script's explicit live intent and `process.env.ROBINHOOD_ALLOW_LIVE_WRITE === "1"`.

2. In `scripts/equity-buy.mjs`, keep `--live` as operator intent, but make `live` false unless the env switch is also set. When `--live` is present and the env switch is missing, print a clear stderr warning and return the exact dry-run body.

3. In `scripts/validate-strategies.mjs`, add a dry-preview default. Require `--live` plus `ROBINHOOD_ALLOW_LIVE_WRITE=1` before the first options order POST. If not live, emit the bodies that would be sent and skip both place and cancel POSTs.

4. Add focused tests if practical. A lightweight child-process test is enough: invoke the script without the env switch and assert it does not call a mocked POST path. If the current test harness is awkward for Node scripts, add a pure helper and test that helper.

## Test plan

- Add or update tests proving `--live` alone does not send.
- Add or update tests proving `--live` plus `ROBINHOOD_ALLOW_LIVE_WRITE=1` is the only live path.
- Run `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck`.
- Run the relevant CLI tests, then `corepack pnpm test` once the MCP sentinel plan is also fixed.

## Done criteria

- [x] No standalone script POSTs to an order or cancel endpoint unless `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set.
- [x] The operator still gets a useful dry-run body when the env switch is missing.
- [x] `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck` exits 0.
- [x] Tests cover the new gate or the helper that enforces it.

## STOP conditions

- Stop if the fix would require sending a live order to verify behavior.
- Stop if a script has been replaced by a first-class CLI command and the right change is deletion; report that instead of preserving dead code.

## Maintenance notes

Any future script that can POST, PATCH, PUT, DELETE, cancel, transfer, or change settings must use the same env switch as the engine. Treat `scripts/live-order-smoke.mjs` as the local example.
