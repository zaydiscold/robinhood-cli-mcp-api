# Plan 002: Fail closed on account ownership and live-order dedup preflight

> Executor instructions: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise.
>
> Drift check: `git diff --stat e6cdb44..HEAD -- cli/src/lib.ts cli/test/equity-order.test.ts cli/test/evidence-panic-pretrade-close.test.ts`
> If in-scope code changed, compare the excerpts below against live code before editing.

## Status

- Priority: P0
- Effort: M
- Risk: MED
- Depends on: none
- Category: security
- Planned at: commit `e6cdb44`, 2026-07-06, with uncommitted WIP present

## Why this matters

For real-money writes, an unknown account-ownership state and an unavailable duplicate-order check are not equivalent to "safe." Current code refuses confirmed-unowned accounts, but it proceeds when the pre-read itself fails. That is useful for availability, but it is the wrong default for a live trading path: if the safety check cannot run, the order should not send unless the operator explicitly bypasses the specific check.

## Current state

- `cli/src/lib.ts:2466-2471` returns with only a warning when `loadOwnedAccounts()` fails.
- `cli/src/lib.ts:3360-3365` calls `assertAccountOwned()` in `placeEquityOrder`, but because `assertAccountOwned()` can warn-and-return, live orders can proceed with ownership unverified.
- `cli/src/lib.ts:3420-3438` runs live-order dedup, but if the read fails and the error is not an actual duplicate, it catches and continues.
- `cli/src/lib.ts:3696-3718` live cancels pre-read the order account, but if the pre-read fails for a non-ownership reason, the cancel proceeds.
- Tests currently document some gaps: `cli/test/owner-call-guards.test.ts:120-123` calls account-less cancel a documented gap, and the running test suite prints warnings about proceeding when lookups fail.

## Scope

In scope:
- `cli/src/lib.ts`
- `cli/test/equity-order.test.ts`
- `cli/test/evidence-panic-pretrade-close.test.ts`
- `cli/test/owner-call-guards.test.ts`

Out of scope:
- Do not change the dry-run behavior. Dry-runs should still work when account/dedup reads fail.
- Do not add a global network dependency to unit tests.
- Do not remove `--force`; tighten what it bypasses.

## Steps

1. Split ownership validation into two policies: dry/read paths may warn on lookup failure, but live writes fail closed when ownership cannot be verified.

2. Update `placeEquityOrder` so live order placement throws or returns a blocked result when `loadOwnedAccounts()` fails. Keep dry-runs previewable.

3. Update dedup behavior for live equity orders. A positive duplicate still blocks. A failed dedup read should block the live send unless `force` is set. `force` should bypass dedup only; it must not bypass ownership verification.

4. Update `cancelOrder` so live cancels fail closed when the pre-read cannot determine the order's account. If the repo needs an emergency escape hatch for cancel, make it explicit and separately named; do not overload `force` unless the command already accepts and forwards it.

5. Add focused regression tests:
- live buy with ownership lookup failure blocks
- dry-run buy with ownership lookup failure previews
- live buy with dedup read failure blocks
- live buy with dedup read failure and `force: true` sends
- live cancel with account pre-read failure blocks

## Test plan

- Model new tests after `cli/test/equity-order.test.ts` and `cli/test/evidence-panic-pretrade-close.test.ts`.
- Run `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck`.
- Run `corepack pnpm --filter @zaydiscold/robinhood-cli test`.
- Run `corepack pnpm test` after Plan 006 has fixed the MCP sentinel.

## Done criteria

- [x] No live order send can proceed when account ownership could not be verified.
- [x] No live order send can proceed after a failed dedup read unless the operator explicitly used the dedup bypass.
- [x] Dry-runs remain non-blocked and informative.
- [x] New tests cover all blocked and bypass paths.

## STOP conditions

- Stop if existing docs explicitly require fail-open live writes for offline operation. Report the doc/code conflict.
- Stop if blocking failed cancel pre-reads creates an unacceptable inability to cancel orders; propose a separately named emergency path instead.

## Maintenance notes

Reviewers should check that "force" does not become a universal safety bypass. It may skip duplicate-order detection, but it should not skip wrong-account defense.
