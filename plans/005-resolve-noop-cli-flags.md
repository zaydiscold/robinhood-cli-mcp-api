# Plan 005: Resolve no-op CLI flags for brokerage buy and cancel

> Executor instructions: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise.
>
> Drift check: `git diff --stat e6cdb44..HEAD -- cli/src/index.ts cli/src/lib.ts cli/test/equity-order.test.ts cli/test/evidence-panic-pretrade-close.test.ts`
> If in-scope code changed, compare the excerpts below against live code before editing.

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: dx
- Planned at: commit `e6cdb44`, 2026-07-06, with uncommitted WIP present

## Why this matters

No-op flags are dangerous in a trading CLI because they make the operator believe a safety or order-shape choice was honored. Two command flags are currently accepted but not forwarded to the shared engine.

## Current state

- `cli/src/index.ts:752` exposes `brokerage buy <symbol> --tif <gfd|gtc>`.
- `cli/src/index.ts:759-780` accepts `opts.tif` in the type but never passes it to `placeEquityOrder`.
- `cli/src/lib.ts:3407-3409` chooses `time_in_force` internally: market or OTC auto-limit becomes `gfd`, explicit limits become `gtc`.
- `cli/src/index.ts:3280` exposes top-level `cancel --force`.
- `cli/src/index.ts:3282-3287` never reads or forwards `opts.force` to `cancelOrder`.
- `cancelOrder` currently has no `force` parameter.
- Top-level `buy` and `sell` `--force` are real: `cli/src/index.ts:3197-3213` and `cli/src/index.ts:3240-3255` forward to `placeEquityOrder`.

## Scope

In scope:
- `cli/src/index.ts`
- `cli/src/lib.ts` only if adding real support for a flag
- relevant tests under `cli/test`

Out of scope:
- Do not redesign order TIF semantics across options strategy planners.
- Do not change MCP schemas unless you choose to add matching support intentionally.

## Steps

1. For `brokerage buy --tif`, choose one:
- Remove the flag and type field if the shared engine owns TIF policy.
- Or add `timeInForce?: "gfd" | "gtc"` to `EquityOrderInput`, validate it, and have `placeEquityOrder` honor it where Robinhood supports it.

2. If keeping TIF support, add guardrails:
- fractional dollar market orders must remain valid for Robinhood
- OTC auto-limit should not accidentally become long-lived unless the operator explicitly chose that and tests cover it

3. For `cancel --force`, choose one:
- Remove the flag because cancel has no duplicate-order preflight to skip.
- Or add a real `force` meaning, for example bypass a fail-closed account pre-read introduced by Plan 002. If you choose this, the help text must say exactly what it bypasses.

4. Add tests or command parser coverage proving accepted flags are either gone or honored.

## Test plan

- Run `corepack pnpm --filter @zaydiscold/robinhood-cli test -- equity-order`.
- Run `corepack pnpm --filter @zaydiscold/robinhood-cli test -- evidence-panic-pretrade-close`.
- Run `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck`.

## Done criteria

- [x] No accepted CLI flag is silently ignored on `brokerage buy`.
- [x] No accepted CLI flag is silently ignored on `cancel`.
- [x] Help text matches actual behavior.
- [x] Tests cover the chosen behavior.

## STOP conditions

- Stop if removing a flag would break documented examples in README, SKILL.md, AGENTS.md, or docs. Report the doc references and update the plan.

## Maintenance notes

When a CLI option is added, add one test that proves it changes the engine input or output. This is cheaper than rediscovering no-op flags later.
