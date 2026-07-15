# MCP Efficiency and Maintainability Upgrade

Date: 2026-07-14
Branch: `codex/mcp-efficiency-hardening`
Baseline: `178b2100a909f2c6d0873f0295f832441be0b7db`

## Why this work exists

The CLI and MCP are functionally healthy, but agents pay too much context and
runtime overhead before they do useful work. The current `full` MCP profile
advertises 78 tools at roughly 20,500 `o200k` tokens. The portable `SKILL.md`
is another roughly 30,500 tokens, and the required knowledge-index call can add
roughly 7,300 more. A repo-local trading session can therefore spend close to
65,000 tokens on instructions and discovery before answering the operator.

Historical local usage showed that a smaller profile is useful as an option, but
it does not justify hiding capabilities in the owner's personal default. In the inspectable Claude
history, 46 calls across nine sessions used 13 tools. Seven calls failed, mostly
because broad raw-route tools were hard to steer. Large results were also common:
259,171 output characters across the 46 calls, with individual responses above
30,000 characters.

This document is sanitized. It contains counts, tool names, commands, and paths,
but no account numbers, balances, credentials, cookies, order identifiers, or
raw brokerage responses.

The retained desktop histories add a useful caveat. The Windows machine had 55
deferred Robinhood MCP tool references in one Claude session but no direct MCP
invocation record in the JSON histories that remain. It did contain five actual
Claude shell-runner records across three sessions that invoked `robinhood-cli`.
Retained Codex and Hermes JSON histories contained no structured Robinhood call
record. That is evidence about the available logs, not evidence that the tools
were never used: rotation, older client formats, and unretained terminal history
can all create gaps. The scan counted record types and tool names only; it did
not extract commands, arguments, account data, or result values.

## What already exists

- `cli/src/capabilities.ts` inventories every CLI/MCP capability and already
  supports `core`, `trading`, `research`, `admin`, and `full` profiles.
- `mcp/src/server.ts` uses the official TypeScript MCP SDK, Zod schemas,
  structured content, tool annotations, resources, prompts, and stdio.
- `cli/src/doctor.ts` checks build freshness, auth-file hygiene, route provenance,
  permissions, the write gate, and the selected profile.
- CLI and MCP share the execution engine in `cli/src/lib.ts`.
- Protocol tests already connect to the built stdio server and compare the full
  tool roster with the capability registry.
- `SKILL.md` is the comprehensive agent operating handbook. `knowledge/` and
  `docs/` supplement it; they are not substitutes for the incorporated contract.

The upgrade reuses these parts. It does not add a second router, second MCP
server, proxy daemon, or parallel financial engine.

## Target architecture

```text
operator request
      |
      v
comprehensive SKILL handbook (full operating context)
      |
      +---------------------+
      |                     |
      v                     v
focused knowledge       MCP tools/list
module, on demand       full profile by default
                              |
                              v
                  typed capability registry
                    |        |        |
                    v        v        v
                  schema   policy   handler
                    \        |        /
                     \       |       /
                      shared CLI engine
                              |
                    read or gated dry-run/live write
                              |
                    compact structured result
```

Compatibility remains explicit and reversible:

```text
ROBINHOOD_MCP_PROFILE
  unset      -> full personal default
  core       -> read-oriented operating set
  trading    -> trading workflows and writes
  research   -> analysis workflows
  admin      -> route/developer/account-control workflows
  full       -> all tools, compatibility and debugging
  invalid    -> startup/Doctor failure with allowed values
```

## Measured result

The built stdio server now produces these discovery payloads:

| Profile | Tools | `tools/list` bytes | Exact `o200k_base` tokens | Instruction bytes |
|---|---:|---:|---:|---:|
| `lean` (explicit opt-in) | 15 | 14,414 | 3,545 | 620 |
| `full` (default) | 78 | 82,781 | 20,894 | 2,060 |

Lean discovery remains **83.03% smaller by exact tokens** and **82.59% smaller by bytes** as an
explicit constrained-agent option,
but the personal default exposes every capability. `SKILL.md` was restored and
expanded from the rejected 4,216-token router to 31,544 `o200k_base` tokens—about
7.48x as much incorporated operating context and slightly more detail than the
original 30,536-token handbook.

Large route, recipe, workflow, knowledge, and Crypto catalogs are paged at 25 entries by default.
Route catalogs additionally return lossless routing summaries by default and retain the complete
captured schemas behind `detail: "full"` or the one-route describe tool:

| Brokerage catalog mode | Bytes | Exact `o200k_base` tokens | Change |
|---|---:|---:|---:|
| Default: 25 summary rows | 22,944 | 6,146 | baseline agent path |
| 25 full-schema rows | 99,423 | 22,990 | default is 73.27% fewer tokens |
| 200 full-schema rows | 832,782 | 196,329 | default is 96.87% fewer tokens |

Non-full MCP results treat `structuredContent` as authoritative and keep the text fallback compact;
`full` retains the legacy duplicate text for compatibility.

## Direct authenticated API regression found and fixed

The release check sourced the existing local credential environment, explicitly removed
`ROBINHOOD_ALLOW_LIVE_WRITE`, and ran the built `quote AAPL --json` command. The first direct read
failed before network I/O because the latest CDP capture correctly consolidated query variants into
one path plus `queryKeys`, while `brokerageGetJson` still expected the old query-bearing route URL.
After query-aware route matching was added, a second direct read reached the instruments endpoint but
the planned request dropped `?ids=...`, causing a Robinhood `400` from the quote endpoint.

The permanent fix preserves a caller's templated query string only after its origin, path, method, and
query-key names match the sanitized captured route. Unknown query keys still fail closed. Regression
tests cover template and concrete URLs, rejected unobserved keys, and the final executed URL. The same
safe live read then succeeded with an AAPL symbol match and the expected bid/ask/last quote shape. No
account identifiers, token values, quote values, or raw responses were recorded, and no write was sent.

Reproduction (the final parser must print shape and key presence only, never quote values):

```sh
unset ROBINHOOD_ALLOW_LIVE_WRITE
node cli/dist/index.js quote AAPL --json | <shape-only JSON parser>
```

## Engineering decisions

### 1. Full is the personal default; lean remains available

The owner's personal setup must expose every route browser, account/settings tool,
research workflow, strategy helper, and guarded write tool without requiring an
environment override. The 15-tool `lean` profile remains useful for intentionally
constrained agents, but it is never silently selected.

Profile membership must be explicit capability data. Tool-name regular
expressions are too clever for a real-money control surface.

### 2. Profile validation fails loudly

Today an invalid profile registers no tools, omits the MCP tools capability, and
causes `tools/list` to fail with JSON-RPC `-32601`, while Doctor reports a pass.
Startup and Doctor must validate the same enum and produce one actionable error.

### 3. Discovery and results have budgets

High-cardinality discovery calls should return summaries or bounded pages by
default. A caller can explicitly request more. The wire result may retain both
text and structured content for MCP compatibility, but the text fallback should
be compact and large collections must not be duplicated without an explicit
request.

Budgets belong in tests:

- lean `tools/list`: under 20,000 bytes
- full `tools/list`: measured and capped against accidental growth
- default knowledge index: under 5,000 bytes
- common result fallback text: under 1,000 bytes where practical
- `SKILL.md`: at least 120,000 UTF-8 bytes with all required operating sections;
  no maximum-size benchmark

### 4. Quality gates ratchet; they do not demand a rewrite

The baseline is 363 ESLint warnings: 349 explicit `any`, 12 unused variables,
and two `prefer-const` warnings. CI currently prints them and exits zero. The
first change sets a ceiling so warning count cannot grow. Each focused refactor
lowers the ceiling. External API boundaries and MCP registration types come
first; naming-only churn comes last.

Patch/minor dependency updates are in scope. MCP SDK v2, TypeScript 7, and
Commander 15 are not, because each is a major migration with no measured benefit
for this change.

### 5. Refactor adapters before splitting the whole engine

The first DRY pass extracts only duplicated high-value workflows shared by CLI
and MCP. `cli/src/lib.ts` remains the package compatibility barrel. A complete
7,600-line module split is valuable, but mixing a full engine reorganization
with profile and output behavior changes would increase blast radius.

## Test plan

```text
PROFILE SELECTION
  unset --------> exact full roster, including settings/admin      [protocol]
  core ---------> required/forbidden roster                       [protocol]
  trading ------> write tools present, developer tools absent     [protocol]
  research -----> quote/search dependencies + analysis tools      [protocol]
  admin --------> developer/account-control tools                 [protocol]
  full ----------> exact registry/server parity                   [protocol]
  typo ----------> actionable startup error + Doctor fail         [unit+protocol]

PAYLOAD CONTROL
  tools/list ----> byte/token budget per profile                   [protocol]
  empty query ---> compact summary or first page                   [unit+protocol]
  filtered query -> matching rows only                             [unit+protocol]
  explicit full -> compatibility path remains available           [protocol]
  tool failure --> isError=true with retryable/actionable fields  [protocol]

SKILL ROUTING
  safety rules --------------------------> present                 [text contract]
  complete handbook sections ------------> present                 [text contract]
  local deep links ----------------------> reachable               [link check]
  size/detail floor, with no maximum ----> preserved               [CI]

QUALITY/DISTRIBUTION
  typecheck, lint ceiling, format check, dead code, coverage       [CI]
  Node 20 + 22 on Linux/macOS/Windows                              [existing CI]
  direct MCP launch + PATH symlink launch from outside repo        [runtime]
  local SHA == origin/GitHub SHA after landing                     [parity]
```

### Failure modes

| Failure | Test | Handling | Agent experience |
|---|---|---|---|
| Invalid profile removes tools capability | Required | Startup + Doctor reject value | Clear allowed-values error |
| Default profile hides a personal capability | Required | Unset profile equals exact full registry | Test fails before release |
| Large route/knowledge list overruns context | Required | Default bound + explicit continuation/full mode | Compact result with next action |
| Tool handler returns `{error}` as success | Required | Standard `isError` result | Model can retry or explain failure |
| Skill condensation removes operating detail | Required | Size floor, required sections, and link checks | CI blocks release |
| Dependency patch changes build output | Existing full suite | Frozen lockfile + build/test matrix | Release blocked |
| Client still launches stale dist | Existing Doctor plus runtime probe | Source/dist freshness check | Actionable reload/rebuild message |

No new path may fail silently without both error handling and a regression test.

## Parallel implementation lanes

| Lane | Modules | Depends on |
|---|---|---|
| A: profiles and payloads | `cli/src/capabilities`, `cli/src/doctor`, `mcp/src`, protocol tests | baseline measurements |
| B: comprehensive skill | `SKILL.md`, `knowledge/`, focused docs | existing safety contract |
| C: quality and dependencies | workspace config, CI, lint/coverage/dead-code tooling | current warning/test baseline |
| D: integration and documentation | architecture docs, usage evidence, installed runtime | A + B + C |

Lanes A, B, and C can run in parallel because their write surfaces do not overlap.
Lane D runs after they converge. Adapter refactors remain sequential with Lane A
because both touch MCP registration and shared exports.

## Evidence and reproducibility

```sh
# Local/GitHub pairing
git fetch --all --prune
git rev-parse HEAD
git rev-parse origin/main
gh api repos/zaydiscold/robinhood-cli-mcp-api/commits/main --jq .sha

# Quality baseline
corepack pnpm --filter @zaydiscold/robinhood-cli typecheck
corepack pnpm --filter @zaydiscold/robinhood-cli-mcp typecheck
corepack pnpm lint
corepack pnpm test

# Installed runtime from outside the checkout
cd /tmp
robinhood-cli doctor --json
realpath "$(command -v robinhood-cli-mcp)"

# Client registrations, values redacted by the clients
codex mcp get robinhood-cli
claude mcp get robinhood-cli
hermes mcp list
```

Usage-history inspection was read-only and searched local Codex, Claude, and
Hermes JSONL/log files for Robinhood MCP tool names, tool-use records, result
sizes, connection errors, and server startup messages. Raw arguments and result
content are intentionally excluded from this document.

## NOT in scope

- MCP SDK v2 migration. The official v1 SDK remains the production line.
- TypeScript 7 or Commander 15 major-version migrations.
- A shared HTTP MCP daemon. Stdio process duplication is measurable, but a daemon
  adds authentication, lifecycle, and network exposure to a real-money tool.
- A full rewrite of `cli/src/lib.ts` in the same change.
- Publishing either package to npm. Neither package is currently published.
- Any live trade, cancellation, account-setting mutation, or other brokerage write.
- Enabling or changing persistent live-write access without an explicit, separate
  verification step.

## Completion criteria

The upgrade is complete only when:

1. Default discovery is materially smaller and measured in CI.
2. Every documented profile has a tested contract and invalid values fail clearly.
3. High-cardinality tools are bounded by default without deleting the explicit
   compatibility path.
4. `SKILL.md` remains a comprehensive incorporated handbook, passes its integrity
   floor, and every supplemental topic remains reachable.
5. The dependency audit has no actionable advisory in the supported workflows.
6. Typecheck, lint ratchet, format check, dead-code check, coverage, tests, build,
   Doctor, protocol probes, and installed PATH launches pass.
7. The branch is documented, clean, reviewable, and can be reconciled with GitHub
   and the Mothership without guessing which artifact is current.
