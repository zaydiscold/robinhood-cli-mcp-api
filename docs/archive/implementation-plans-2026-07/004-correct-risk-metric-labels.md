# Plan 004: Correct risk metric labels for margin use and defined-risk spreads

> Executor instructions: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise.
>
> Drift check: `git diff --stat e6cdb44..HEAD -- cli/src/lib.ts cli/src/index.ts cli/test/financial-tools.test.ts`
> If in-scope code changed, compare the excerpts below against live code before editing.

## Status

- Priority: P1
- Effort: S
- Risk: MED
- Depends on: none
- Category: bug
- Planned at: commit `e6cdb44`, 2026-07-06, with uncommitted WIP present

## Why this matters

The `risk` command is a financial readout. Labels that overstate precision or call defined-risk spreads "unlimited" can mislead the operator. The engine can be conservative, but the UI text must be mathematically honest.

## Current state

- `cli/src/lib.ts:6779-6780` computes `marginCallDistancePct` as `totalBorrowed / totalEquity * 100`.
- `cli/src/index.ts:3542` renders that value as `Margin-call buffer`.
- That value is margin utilization, not a broker margin-call buffer. A real margin-call distance depends on maintenance requirement and asset haircuts, which this function does not compute.
- `cli/src/lib.ts:6754` sets `maxLoss = null` whenever an option position has a short leg.
- `cli/src/lib.ts:6757-6762` notes that spread defined risk is intentionally left unmodeled.
- `cli/src/index.ts:3553` renders any `maxLossUsd === null` as `unlimited`.
- `cli/test/financial-tools.test.ts:605-632` explicitly asserts a defined-risk credit spread returns `maxLossUsd` null, but the CLI would print that as `unlimited`.

## Scope

In scope:
- `cli/src/lib.ts`
- `cli/src/index.ts`
- `cli/test/financial-tools.test.ts`

Out of scope:
- Do not implement a full broker margin model in this plan.
- Do not implement complete spread payoff math unless it is a small, well-tested addition.
- Do not change the public command name.

## Steps

1. Rename or supplement `marginCallDistancePct` in the returned object. Preferred shape:
- keep `marginCallDistancePct` temporarily for compatibility if needed
- add `marginUtilizationPct`
- render `Margin utilization` in the CLI
- add a warning/note that margin-call distance is not computed unless a true maintenance threshold is available

2. Change CLI rendering for `maxLossUsd === null`. It should not always say `unlimited`. Use wording like `not modeled` or `unknown/undefined` unless the engine positively classifies the position as undefined-risk.

3. If the position strategy or legs clearly indicate a defined-risk vertical spread, render `defined-risk, not modeled` rather than `unlimited`. If the engine cannot classify it, prefer `not modeled` over `unlimited`.

4. Add tests:
- margin utilization value remains `1200/6000*100 = 20` but the field/label is not called a buffer
- a short call spread does not render as `unlimited`
- truly naked short call/short strangle output can still display `unlimited` if classification is explicit

## Test plan

- Run `corepack pnpm --filter @zaydiscold/robinhood-cli test -- financial-tools`.
- Run `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck`.

## Done criteria

- [x] The CLI no longer labels borrowed/equity as a margin-call buffer.
- [x] Defined-risk spreads are not displayed as unlimited loss merely because `maxLossUsd` is null.
- [x] Tests lock the revised labels and conservative fallback behavior.

## STOP conditions

- Stop if downstream MCP clients depend on the exact `marginCallDistancePct` key. Preserve the key and add a new better-named field instead.

## Maintenance notes

If a future plan adds true maintenance-margin math, it can reintroduce a real `marginCallDistancePct` with a documented formula.
