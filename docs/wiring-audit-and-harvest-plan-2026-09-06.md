# Robinhood CLI / MCP wiring audit and harvest plan

Reviewed 2026-09-06 against main commit `0afb3a55dad02dcd3152fe54f5837195847cf4da`.

This is an implementation plan, not certification that every mapped Robinhood endpoint works. Preserve the complete personal MCP default, existing write gates, public command grammar, and account ownership checks. Do not replace the current functionality with an artificially restricted wrapper.

## 1. What was actually verified

The review inspected the CLI adapter, MCP registration and selected handlers, capability registry, doctor, lifecycle and snapshot modules, package scripts, CI workflow, architecture guidance, and existing feature tests. It also checked current primary-source Robinhood and MCP documentation. It did not inspect every line of the large shared engine or execute every command.

The original `cli/src/order-lifecycle.ts` was reconstructed locally and its Git blob SHA was verified as `08ec190e3b7960ed6bca5b8df07243311a49cbb8`, exactly matching GitHub. Two credential-free reproductions showed that a never-settling poll remained pending beyond both a 10 ms observation timeout and an explicit abort. These are observer failures, not evidence of a live broker outage.

This branch fixes that module and adds 12 regression cases. The module passed isolated strict TypeScript compilation. The test assertions passed locally using Node's native test runner with only the runner import and module path adapted from the committed Vitest file. This is not a claim that the full workspace Vitest suite, package build, or supported-OS matrix ran locally. Review the PR's actual CI results separately.

No brokerage authentication, live account data, orders, settings, transfers, or write gates were exercised or changed.

### Lifecycle patch contract

Observation is bounded by `timeoutMs`. One final reconciliation read has a separate `finalReadTimeoutMs`, defaulting to `min(timeoutMs, 5000)`. Total observation can therefore take the observation budget plus that final-read budget, subject to event-loop scheduling. Explicit cancellation skips reconciliation. Long sleeps cannot extend the observation window. Non-finite, negative, zero-invalid, and overflowing timer values fail before any poll.

The existing result shape, state normalization, and `retrySafe: false` remain unchanged. Late callback completion cannot change the returned receipt, and late rejection is consumed.

Important boundary: this patch stops waiting for legacy callbacks. It does not cancel underlying HTTP requests that do not accept a signal. The MCP order-watch adapter does not yet forward its request cancellation signal. Those are separate follow-up changes and must not be represented as already fixed.

## 2. Prioritized findings

| Priority | Finding and source | Required change and acceptance evidence |
| --- | --- | --- |
| P0 | `cli/src/order-lifecycle.ts` awaited poll and final poll without a deadline. | Patched here. Never-settling poll, final read, and sleep must settle; cancellation must stop observation; no order retry. |
| P0 | `mcp/src/server.ts:mcpError` derives retryability from message text such as timeout/ECONNRESET without operation or send-state context. | Typed error taxonomy: read retry, definite pre-send rejection, ambiguous write outcome, reconciliation required. A lost order response must never advertise safe order resubmission. Redact error messages as well as successful results. |
| P1 | MCP order-watch does not pass the request's cancellation signal to the watcher. Its poll callback also has no transport signal parameter. | Trace client cancellation through handler, service, pagination, sleep, and HTTP. Test cancellation during a pending transport read and prove no post-cancel follow-up poll starts. |
| P1 | Most legacy capability entries have no CLI mapping and use a permissive legacy object output contract. | Registry must explicitly join CLI grammar, MCP tool, shared service, provider operation, schemas, account scope, and evidence. A matching tool-name roster is not behavioral parity. |
| P1 | `runDoctor` checks Node major only, selected file presence, one map hash, and MCP source/dist timestamps. | Enforce the declared runtime minimum; catch corrupt/unreadable files as diagnostic failures; add a build manifest and real runtime probes. Never label offline checks as live API verification. |
| P1 | MCP snapshot capture accepts a caller-provided path and appends a local file while its annotations say read-only. | Separate brokerage read from local file write. Confine paths to an explicit private storage root, check symlinks, validate journal records, and accurately annotate capture versus list/diff. |
| P1 | Root `test` includes Node/Python auth-session scripts, whereas the inspected workflow invokes `test:built`. | Inspect any indirect coverage, then explicitly run the missing auth-session checks in the supported matrix. Keep credential-free fixtures and deny real network. |
| P2 | Current runtime guidance and official-service descriptions have drifted. | Update supported Node lanes and centralize factual provider guidance. Preserve Node 20 only as an explicitly labeled compatibility lane, not the recommended maintained runtime. |
| P2 | `lib.ts`, CLI registration, and MCP registration are large shared files. | Extract one domain at a time behind stable exports. Do not combine the audit with a wholesale rewrite or create separate CLI/MCP business logic. |

The current architecture already has a registry, profiles, structured results, doctor, order watching, snapshots, workbench, tax-lot reads/plans, Gold fee reads, and IPO research. Improve their contracts and orchestration rather than claiming these are new inventions. The open tax-strategy PR #98 is separate work and must be reviewed on its own branch, not silently duplicated or merged.

## 3. Modern MCP and provider strategy

### Keep explicit provider boundaries

Use a common domain service with distinct adapters for the current browser-backed brokerage API, the signed Crypto API, and an optional official Robinhood MCP integration. Capability records must identify both provider and eligible account class. Do not silently fall back between providers after authorization failures, especially for writes.

The repository's description of the official service as an equity-only sandbox is stale. Robinhood's current documentation lists equities, options, and crypto; its overview distinguishes broad account reads from trades limited to the Agentic account. Treat this as an optional integration, not a reason to remove ordinary-account functionality.

Public official tool names worth evaluating include `get_realized_pnl`, `get_pnl_trade_history`, `get_financials`, `get_equity_price_book`, `get_option_watchlist`, and `review_option_order`. These names are not harvested JSON schemas and do not imply equivalent private REST endpoints. Exact arguments, results, eligibility, pagination, and auth behavior remain capture work.

Sources checked 2026-09-06:
- https://robinhood.com/us/en/support/articles/trading-with-your-agent/
- https://robinhood.com/us/en/support/articles/agentic-trading-overview/

### Upgrade protocol behavior, not just the dependency version

The published MCP 2026-07-28 revision uses per-request protocol metadata and documents dual-era support alongside older initialization-based clients. Establish a tested client/server compatibility matrix before a major SDK migration. Preserve current stdio behavior until replacement behavior is demonstrated. A package bump is not protocol certification.

Keep `full` as the personal default. Compact profiles remain opt-in. Separate tool discovery from authorization; annotations are descriptive, not enforcement. Replace registry monkey-patching and broad `any` contracts incrementally with typed registration helpers and concrete output schemas.

Source: https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning

Node's current release page lists Node 20 as EOL and Node 24 as LTS. Align engines, doctor, install instructions, build tooling, and CI intentionally rather than changing only a workflow comment.

Source: https://nodejs.org/en/about/previous-releases

## 4. Prove every connection, not just every export

Proposed commands below are design targets, not commands shipped by this branch.

Add `api-map coverage --json` and an offline `doctor --wiring` mode. Their source should be a versioned capability manifest, not substring guesses. Each capability needs:

```text
capability ID
  -> canonical CLI command, aliases, options and defaults
  -> MCP tool and input/output schema versions
  -> shared domain service
  -> provider operation or HTTP method + route template
  -> account scope, entitlement and side effects
  -> fixture IDs, contract tests, source evidence and verification timestamps
```

Report distinct states: documented, mapped, reachable, fixture-tested, consented-live-read-verified, preview-only, blocked, stale, and unsupported. Missing evidence must not count as success. Preserve method-specific provenance, because observing GET says nothing about POST.

Build contract tests that invoke the actual compiled CLI parser and the MCP transport against the same synthetic fixtures. Assert the exact account, route/tool, query parameters, body, defaults, decimals, null handling, pagination, structured output, stderr/stdout separation, and exit/error state. An import test or `tools/list` test cannot prove these connections.

Every relevant capability needs happy-path and failure evidence: malformed inputs, unexpected options, wrong account, permission denied, rate limit, empty/partial pages, repeated cursor, stale quote, schema drift, timeout and cancellation. Mutation previews must send zero mutation requests even with the environment armed. Avoid asserting zero network for previews that intentionally perform prerequisite reads.

For financial calculations, use explicit missing/stale/partial values and reconciliation residuals. A missing source must not become zero; an equity change must not be labeled return without cash-flow treatment. For orders distinguish accepted, partial fill, terminal state, observed status, and unknown execution outcome.

### Readiness gates

1. Static graph: no new orphan capabilities or undocumented aliases; existing gaps remain visible.
2. Behavioral graph: paired CLI/MCP fixtures agree on request and response semantics.
3. Built artifact: clean install, public package exports, no source-only dependency, and build-manifest parity.
4. Operational checks: explicitly authorized read-only canaries with account scope and timestamps.
5. Mutation verification: only a separately authorized real operation may supply live-write evidence. Do not place a trade merely to make a test green.

## 5. User-facing improvements worth building

### Explain changes instead of returning another dump

Extend snapshots and history into a balance-change explanation: starting/ending value, cash movements, fees, income, position changes, and an unexplained residual. Carry account, time range, data coverage, pricing timestamp, and currency into the output. Add stable instrument identity and explicit added/removed positions rather than relying on display names in snapshot keys.

### Turn the existing workbench into a connected comparison workflow

Keep pure payoff math separate, then orchestrate contract resolution, timestamped quotes, strategy classification, collateral and broker review, alternatives, and a stable review card. Show stale data and unavailable approvals visibly. Do not present a body hash as proof that a broker accepted the order or that a user authorized it.

### Durable order receipts and recovery

Persist private receipts with operation ID, account/provider binding, request hash, dry-run versus sent state, broker reference when observed, partial fills, last reconciliation, and unresolved outcome. Recovery observes history instead of resubmitting. Approval, when required, binds the exact operation and expires on changes; the environment switch arms capability but does not establish user intent.

### Better discovery and terminal behavior

Offer an explain view showing which capability serves an intent, required arguments, data provenance, and why execution is blocked. Keep stable JSON for scripts, add compact human summaries with expandable detail, and preserve legacy text compatibility intentionally. Benchmark tool selection against realistic requests, including ambiguous accounts and unavailable live-write contracts.

## 6. Capture and harvest work packages

### H1: official MCP catalog, then high-value reads

Owner action: authenticate locally to the official service and export its complete paginated `tools/list` catalog. Capture schemas, annotations, protocol version, catalog hash, and date without tokens. Start with the six documented candidate tools above and include eligible, empty, forbidden, and pagination cases where applicable.

Deliverable: sanitized schema snapshot and synthetic response fixtures, followed by a typed provider adapter. No claim of REST equivalence. Reads and writes retain explicit provider/account selection. Do not submit orders during catalog collection.

### H2: exact tax-lot sale review and submission

Current state: inventory, planning, and order-lot readback exist. `robinhood_tax_lot_sell` intentionally refuses live submission until the exact contract is mapped. This is a correctly blocked feature, not an accidental missing gate to bypass.

Capture from the normal owned-account UI: stable open-lot IDs, selected quantities, account binding, review request/response, available-versus-selected validation, body shape, required acknowledgments and expiry, and any supported selection restrictions. Initial work stops at preview. A later independently authorized operation may supply submit and post-fill selected/closed-lot evidence. Do not infer field names from a generic sell request.

Acceptance: typed selection model, exact preview fixture, stale-lot rejection, fail-closed missing contract, and post-fill evidence that identifies the intended lots. Never promise tax results from a routing test.

### H3: IPO indication-of-interest lifecycle

Current state: `robinhood_ipo_access_request_plan` already gathers read-side readiness and explicitly does not submit interest.

Capture offering/account eligibility, disclosure acknowledgment and expiration, review payload, existing-request state, and precise submit/update/cancel semantics. Do not perform those mutations as discovery actions without separate permission. Preserve pending versus accepted interest versus allocation as different states.

Acceptance: read-only review first, then body-bound authorized operation and state readback. Capturing one screen does not certify the entire lifecycle.

### H4: entitlement-dependent and newly surfaced data

Evaluate Level 2, options watchlists, company financials, broker previews, and scanner coverage against the actual existing map before adding wrappers. Prefer the documented official tool where it fits. For uncovered web surfaces, capture the successful request plus empty/error/permission cases from the ordinary UI. A 403 means unknown or ineligible, not an empty account and not permission to try another provider silently.

### Common capture bundle

Keep raw captures only in private gitignored storage. The shareable bundle should contain:

```text
manifest.json: scenario, capturedAt, provider, account class, entitlement, provenance
request.schema.json: method/operation, path, query keys, header names, typed body
response.schema.json: field types, nullability, status, pagination and errors
fixtures/: synthetic success, empty, partial and failure cases
reproduce.md: ordinary UI steps, intended CLI/MCP mapping, stop conditions
```

Strip authorization/cookies, account and order identifiers, personal messages, balances, bank data, and signed URLs before sharing. Preserve structural relationships and numeric edge cases with synthetic substitutions. Run secret/privacy checks and manually inspect the sanitized output before committing. A HAR or cURL copy is not safe merely because it contains no password.

## 7. Delivery order and completion criteria

First land the narrowly scoped observer fix after reviewing CI. Next implement operation-aware error/retry semantics and cancellation propagation, then a vertical capability-manifest slice that proves actual CLI/MCP/transport parity. Add connected workbench and change-explanation views behind those contracts. Harvest H1 in parallel with local-only work; H2/H3 remain blocked until their exact evidence exists.

Done means the claim, implementation, built package, user-visible output, and evidence agree. A green offline suite is necessary evidence, not a substitute for live endpoint provenance, account eligibility, or permission.
