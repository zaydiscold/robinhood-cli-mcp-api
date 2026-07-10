# Adversarial enhancement audit — 2026-07-05

Scope: the Robinhood CLI, shared engine, MCP server, route map, scripts, tests, documentation, and active backlogs.

This was a read-only account audit. No Robinhood write was executed. The repository had uncommitted
enhancement work during the audit; that work is treated as reviewable WIP, not as an accepted fix.

## The read

The project is unusually capable: one shared TypeScript engine drives a broad CLI and a 73-tool MCP
server, with account discovery, options workflows, write gating, preflight checks, order-history
evidence, and substantial tests. Its biggest weakness is not missing features. It is that the safety
model is described as universal while important alternate paths, fail-open behavior, and financial
metrics violate that model.

The single highest-leverage move is to make one transaction coordinator the only code allowed to
send authenticated mutations. Features should wait until that invariant is enforced.

## Evidence and reproduction

Commands used:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @zaydiscold/robinhood-cli test --coverage
node cli/dist/index.js --help
jq/rg audits of api-map/brokerage-routes.json, cli/src, mcp/src, scripts, tasks.md, and TODO.md
MCP in-memory initialize/tools/resources/prompts/call protocol test
bird search "MCP tool overload"
```

Observed:

- 383 CLI tests and 3 MCP protocol tests pass in the current WIP.
- Typecheck and build pass.
- Lint reports 344 warnings.
- Earlier coverage run: roughly 52% global lines; the CLI adapter was effectively uncovered.
- Top-level CLI help is 196 lines / 13.7 KB.
- Main implementation files are approximately 7.3K, 4.1K, and 2.5K lines.
- MCP advertises 73 tools, 47 resources, and 3 prompts.
- The route map contains 43 entries without methods, including two `write-or-sensitive` routes.
- The route map carries many write routes whose body/verification status is not machine-enforced.
- Sensitive local files and trading logs are commonly mode `0644`.

Raw evidence is source-local and contains no bearer tokens or account numbers:

- `scripts/validate-strategies.mjs:13,61-73`
- `scripts/equity-buy.mjs:211`
- `cli/src/lib.ts:2419-2469,3418-3438,3717,5041-5090,6771-6780`
- `cli/src/index.ts:752,3280,3542`
- `mcp/src/server.ts:1625`
- `api-map/brokerage-routes.json` entries for methodless and inferred write routes

## What is bad — ranked

### P0 — control-plane integrity

1. **Standalone scripts bypass the shared engine.** `equity-buy.mjs --live` does not require the
   documented master switch. `validate-strategies.mjs` directly posts and cancels real options
   orders without either gate and includes naked and ratio structures. Its “place then cancel”
   assumption is not a safety boundary: cancellation can fail or race a fill.
2. **Account ownership fails open.** A failed account-graph lookup prints “Proceeding” and permits a
   live write. Cancel ownership pre-reads also fail open.
3. **Duplicate protection fails open.** If the open-orders read fails, a live equity order proceeds.
   Network degradation is exactly when duplicate submission risk is highest.
4. **The env gate is machine authorization, not per-action consent.** Once the server is armed,
   first-class tools can mutate state without proving that the user approved the exact account,
   quantity, price, and body currently being sent.
5. **Retry policy is not idempotency-aware.** Generic 429 retries apply beyond order requests. A POST
   without a stable idempotency key must not be retried automatically.
6. **Order outcomes are not exactly-once.** A timeout/disconnect after broker acceptance can produce
   an “unknown” outcome that callers may retry. Current evidence checks happen only after a response.
7. **Risk caps are incomplete and process-local.** Session spend resets on restart, races across
   processes, misses some raw/generic/crypto writes, and premium notional is not max loss for short
   options.
8. **Undefined-risk enforcement is documentation-level.** The raw order executor can bypass strategy
   classification, collateral review, and the “never infer naked exposure” contract.
9. **Auth egress is not globally constrained.** Current WIP adds an allow-list to the main transport,
   but document downloads attach the bearer to an API-provided `download_url`, and standalone scripts
   still build authenticated fetches independently.
10. **Owned-account cache is unbounded and not token-scoped.** A token refresh or login change can
    leave account authorization decisions based on the previous identity.

### P0/P1 — financial correctness

11. **`marginCallDistancePct` is borrowed/equity, not distance to a margin call.** CLI renders it as
    “Margin-call buffer,” which is materially misleading.
12. **Risk “max loss” is missing for defined-risk spreads.** Any short leg produces `null`, while the
    human renderer displays that as `unlimited`, misclassifying credit spreads.
13. **Concentration is calculated from invested position values, excluding cash and using option
    premium value.** It is not portfolio weight or underlying exposure despite the label.
14. **Calendar claims earnings coverage but the current engine does not fetch earnings.**
15. **What-if output is a local Greek Taylor approximation.** It needs explicit validity bounds and
    “approximation,” staleness, and nonlinear-risk warnings for large moves or long time steps.
16. **Degraded reads are inconsistent.** Some commands expose warnings/partial flags; others silently
    skip accounts or return success-shaped error objects.

### P1 — reliability and maintainability

17. The active 30-second timeout WIP conflicts with server-directed 429 cooldowns near 48–50 seconds.
    Timeout budgets must span attempts intentionally, not accidentally cancel every valid retry.
18. There is no shared per-host concurrency limiter, token bucket, or circuit breaker.
19. Analytics repeatedly fetch overlapping account/position/quote data, producing excess traffic and
    internally inconsistent timestamps.
20. Private API payloads remain mostly `any`; malformed or changed fields can silently become `NaN`,
    zero, or incomplete risk output.
21. `lib.ts`, `index.ts`, and `server.ts` are oversized and mix transport, policy, domain logic,
    rendering, and persistence.
22. CLI and MCP adapters are still manually registered, so flags, schemas, descriptions, and behavior
    drift. Examples: `brokerage buy --tif` is ignored; `cancel --force` is unused.
23. Two equity-buy command surfaces expose different terminology and options.
24. The default MCP tool list is too large. Current ecosystem guidance consistently places practical
    tool-selection degradation around large flat catalogs.
25. MCP errors are inconsistent, and most tools lack declared output schemas.
26. Existing test depth is concentrated in the shared engine. CLI parsing, scripts, concurrency,
    timeout ambiguity, client cancellation, route drift, and end-to-end write policy need coverage.
27. Generated route/docs artifacts lack a strict regenerate-and-diff CI gate.
28. Route entries need machine-readable verification and idempotency metadata; prose notes such as
    “inferred” cannot drive enforcement.
29. Backlogs are stale and duplicated: several shipped tools remain unchecked while the same ideas
    recur across `tasks.md`, `TODO.md`, `ideas.md`, and encrypted local plans.
30. Sensitive local artifacts use normal user-readable filesystem modes rather than explicit `0600`.

## Remove

1. Remove direct mutation logic from `equity-buy.mjs`, `validate-strategies.mjs`, and
   `live-order-smoke.mjs`. Keep only thin wrappers over the shared engine, or delete them.
2. Remove “place then immediately cancel” as a validation technique. Use order-review endpoints,
   recorded fixtures, and dry-run contract validation.
3. Remove the duplicate top-level/brokerage equity order implementations.
4. Remove ignored flags (`--tif`, cancel `--force`) or implement them through the domain contract.
5. Remove hard-coded tool counts as correctness assertions; snapshot names and schemas instead.
6. Remove stale completed items and duplicate backlog entries.
7. Remove full signed document URLs from normal MCP/model-facing responses.
8. Remove the 73-tool flat default profile.

## Change

### Transaction architecture

1. Introduce `TransactionCoordinator`: plan → validate → approve → send → reconcile → receipt.
2. Require a short-lived approval token bound to the exact body hash, account, quote timestamp,
   notional/risk, and expiration. The env switch arms the machine; the token approves one action.
3. Store an atomic intent lease keyed by an intent fingerprint. Reuse a deterministic broker
   `ref_id` for safe retries.
4. Return explicit outcomes: `planned`, `blocked`, `sent`, `confirmed`, `rejected`, `unknown`.
5. On timeout/connection loss, reconcile by `ref_id` and order history before permitting retry.
6. Make account verification and dedup fail closed for live opens. Permit an explicit audited
   override; previews may continue with warnings.
7. Key owned-account caches by auth identity hash, apply TTLs, and invalidate on token refresh.
8. Replace in-memory caps with a locked persistent risk ledger and policy packs:
   per-order, daily/session, account, symbol, strategy, max-loss, buying-power percentage, and
   undefined-risk rules.
9. Permit retries only when method/route metadata proves idempotency.
10. Make every authenticated network call use one transport with HTTPS and exact-host enforcement.

### Route and data contracts

11. Add route metadata: `verificationStatus`, `bodySchema`, `sideEffectClass`,
    `idempotencyClass`, `accountScope`, `authScope`, and `lastVerifiedAt`.
12. Block live execution of `inferred` or methodless mutation routes by default.
13. Add focused Zod parsers for accounts, quotes, positions, options marks, orders, and evidence.
14. Introduce a timestamped `BrokerageSnapshot` reused by portfolio/risk/exposure/calendar/sentinel.
15. Include freshness, source endpoint, formula version, partial status, and warnings in analytics.
16. Correct risk terminology and calculations before adding more risk features.

### CLI/MCP

17. Define commands once in a typed command registry and generate CLI, MCP schemas, docs, and tests.
18. Default MCP profile: 10–15 curated workflow tools plus `search_capabilities` and `execute`.
    Offer `trading`, `research`, `admin`, and `full` profiles.
19. Add `outputSchema` and `structuredContent` gradually, keeping concise text fallback.
20. Standardize errors: `{code,message,retryable,hint,details,traceId}` with `isError:true`.
21. Propagate cancellation and progress through all long-running engines, not only raw execute.
22. Replace verbose top-level help with grouped commands and examples; move essays to docs.
23. Correct tool annotations: destructive only when destructive, local/offline tools not open-world.

### Testing and operations

24. Add record/replay cassettes with automatic secret/account redaction.
25. Add fault-injection tests for 401, 429, timeouts before/after acceptance, partial reads, stale
    quotes, cancellation failure, and concurrent duplicate submissions.
26. Add property/fuzz tests for route resolution, placeholders, URL construction, schemas, and
    strategy leg classification.
27. Add mutation tests specifically against the write gate and account policy.
28. Add CLI subprocess tests and true MCP protocol tests.
29. Add a read-only route-contract canary with schema fingerprints and a generated drift report.
30. Add OpenTelemetry-compatible traces for tool → engine → route → evidence, with redaction.
31. Add `doctor`: auth freshness, route-map/build parity, write-policy state, account-cache identity,
    local permissions, API version freshness, and MCP profile.

## Add — features after hardening

1. **Order lifecycle task:** durable order watch with fill/partial-fill/reject/cancel transitions,
   reconnect-safe status, and evidence receipts.
2. **Options Workbench MCP App:** chain, payoff graph, Greeks, collateral, roll comparison, and exact
   approval card.
3. **Shadow execution:** compare intended order with Robinhood review/collateral response and explain
   every delta before commit.
4. **Explain this number:** endpoint provenance, timestamp, formula, inputs, and confidence for every
   portfolio/risk metric.
5. **Share-safe mode:** field-level sensitivity tags and automatic redaction for model/chat exports.
6. **Portfolio time machine:** timestamped snapshots, diffs, exposure drift, and “what changed?”
7. **Risk policy simulator:** evaluate a proposed order against all policies without sending.
8. **Strategy risk engine:** exact expiration payoff, max gain/loss, breakevens, assignment/call-away
   exposure, collateral, and pin risk.
9. **Smart roll comparator:** hold/close/roll alternatives ranked by net debit/credit, breakeven,
   Greeks, buying-power change, and tax implications.
10. **Advanced order surface:** replace/amend, bracket/OCO, stop and trailing orders where captured and
    verified; never infer bodies.
11. **Tax-lot engine:** realized/unrealized lots, wash-sale radar, holding period, harvest candidates,
    and tax-aware order review.
12. **Rebalance planner:** target allocations, tax-aware sells, buying-power constraints, and staged
    dry-run basket.
13. **IV surface:** term structure, skew, percentile/rank, expected move, and event-volatility view.
14. **Scanner/evaluator:** spreads ranked by return-on-risk, liquidity, slippage, Greeks, and max loss.
15. **Assignment guardian:** ex-dividend, borrow, ITM amount, extrinsic value, and early-assignment risk.
16. **Income quality:** distinguish dividends, realized option premium, mark-to-market premium, fees,
    and repeatable forward income.
17. **Alert engine:** price/Greek/risk/policy/assignment triggers with deduplicated notifications.
18. **Trade replay:** reconstruct decision context, quote, thesis, approval, fills, P&L, and lessons.
19. **Route lab:** sanitized capture import, schema diff, candidate route review, and safe promotion.
20. **Tool-selection evals:** benchmark common user intents against MCP profiles and fail CI when tool
    selection or argument accuracy regresses.

## Keep

- One shared engine behind CLI and MCP.
- Route allow-list and method-aware fail-closed resolver.
- Reads-live / writes-gated operating model.
- Explicit account selection, complete account graph, and account-aware output.
- Order-history evidence as the only execution proof.
- Options strategy classification and roll-ledger concepts.
- Dollar-weighted portfolio reporting rather than size-blind percentages.
- Cross-platform CI and dependency audit.
- Injectable dependencies in core functions; they make safe offline testing possible.

## Important forks

1. **Low friction vs per-action approval.** Recommendation: keep the env switch as machine arming, but
   require a body-bound approval token for money movement. This adds one meaningful confirmation,
   not arbitrary repeated flags.
2. **Many specialized tools vs a compact MCP.** Recommendation: preserve all capabilities but expose a
   small default workflow profile with progressive discovery.
3. **Private API exploration vs production reliability.** Recommendation: separate `route-lab`
   experimental routes from production routes; only captured, schema-validated contracts graduate.
4. **Fail-open continuity vs fail-closed safety.** Recommendation: live opens fail closed; reads and
   dry-runs degrade. Closes/cancels may use a narrowly audited emergency override.

## Recommended implementation sequence

1. Quarantine alternate write scripts and close fail-open ownership/dedup paths.
2. Build the transaction coordinator, approval token, intent lease, reconciliation, and persistent
   policy ledger.
3. Correct risk analytics and privacy/egress handling.
4. Introduce route/data contracts, snapshot engine, and fault-injection tests.
5. Generate CLI/MCP surfaces from one registry and ship compact MCP profiles.
6. Add order lifecycle tasks and the Options Workbench.
7. Build tax, scanner, IV, rebalance, alert, and replay features on the hardened foundation.

## External signal

- Current MCP community signal strongly favors curated tools plus progressive discovery instead of
  exposing every backend endpoint.
- Official MCP direction includes typed structured outputs, task-style long-running operations,
  MCP Apps, richer discovery, and OpenTelemetry-compatible tracing.
- Modern brokerage APIs commonly expose preview/sandbox flows, complex/multileg orders, streaming,
  portfolio history, advanced conditional orders, and structured activity/gain-loss data. These are
  useful comparison points, not contracts to infer against Robinhood's private API.
