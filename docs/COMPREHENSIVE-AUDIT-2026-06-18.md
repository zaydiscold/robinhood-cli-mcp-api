# robinhood-cli Comprehensive Audit — 2026-06-18

**Sprint:** Hardening for 1:1 CLI↔MCP parity, financial freedom enablement, and production readiness
**Status:** AUDIT COMPLETE — awaiting green light for Phase 3 (implementation)

---

## Executive Summary

Five parallel audit agents swept the entire robinhood-cli project (66 MCP tools, 311 API routes, 1542-line SKILL.md, 41K-char AGENTS.md, 6382-line shared engine). This report synthesizes all findings into 38 prioritized fixes across 6 categories.

**Overall Grade: B+ (84/100)** — Exceptional for an indie project, but the rapid-feature pace has created documentation drift and tool-gap debt.

**The architecture is the project's superpower:** one shared engine (`lib.ts`), one write gate, one route map — CLI and MCP literally cannot diverge on write safety. The audit found zero engine bypasses. This is rare and worth protecting.

---

## Audit Track Summary

| Track | Agent | Status | Deliverable |
|-------|-------|--------|-------------|
| A: CLI↔MCP Parity | Agent A | ✅ Complete | 7 gaps found (3 medium, 4 low) |
| B: Doc Contradictions | Agent B | ✅ Complete | 20 contradictions resolved (9 known + 11 new) |
| C: MCP Best Practices | Agent C | ✅ Complete | 6 recommendations (2 high, 2 medium, 2 low) |
| D: Financial Tools Gaps | Agent D | ✅ Complete | 5 P0 tools spec'd, 20-item roadmap |
| E: Repo Quality + DX | Agent E | ✅ Complete | 20 fixes prioritized (2 high vulns, 4 high, rest medium/low) |
| Master Plan | PM (me) | ✅ Complete | `docs/audit-master-plan-2026-06-18.md` |

All agent reports written to `docs/` and `local/`:
- `docs/doc-contradiction-audit-2026-06-18.md` (450 lines)
- `docs/mcp-best-practices-audit-2026-06-18.md` (this file)
- `docs/financial-tools-gap-analysis-2026-06-18.md` (425 lines)
- `local/audit-dx-report-2026-06-18.md` (343 lines)
- `docs/audit-master-plan-2026-06-18.md` (plan document)

---

## TOP 10 CRITICAL/HIGH FINDINGS

### 🔴 #1 — 2 HIGH-severity npm vulnerabilities
**Track E, Agent E**
- `vite` (via vitest): server.fs.deny bypass — patch to >=8.0.16
- `hono` (via @modelcontextprotocol/sdk): CORS credential leak — patch to >=4.12.25

### 🔴 #2 — AGENTS.md documents the WRONG DRIP write endpoint
**Track B, Agent B — Contradiction #10 (NEW)**
- AGENTS.md §9 claims `PATCH .../drip/enrollment/{num}/` works → it returns **405**
- Actual working endpoint: `PATCH .../drip/account_settings/{account_number}/`
- This is the SAME class of bug as the OTC engine lie caught in the June 11 audit — doc claims a feature works, code reality disagrees

### 🔴 #3 — README still describes the obsolete "two-gate" model
**Track B, Agent B — Contradiction #11 (NEW)**
- README §4: "set BOTH gates — a flag AND an environment variable"
- Current reality (since June 11 PR): single switch `ROBINHOOD_ALLOW_LIVE_WRITE=1`, no per-call flag required
- Every new user reads the README first and learns the WRONG safety model

### 🔴 #4 — `percentChange` function DUPLICATED in MCP server
**Track A, Agent A — Gap #5**
- `mcp/src/server.ts` lines 139-142 defines its own `percentChange`
- `cli/src/lib.ts` also exports `percentChange` — MCP doesn't import it
- Violates the "one engine" invariant

### 🔴 #5 — 11 MCP tools missing from SKILL.md documentation
**Track A, Agent A — Gap #1**
- Tools live in code but zero docs: portfolio, pretrade, options_close, dividends, documents, margin, review, review_note, hotlist, knowledge, roll_ledger
- An agent reading only SKILL.md doesn't know these tools exist

### 🔴 #6 — CLI has 3 significant tools with NO MCP equivalent
**Track A, Agent A — Gap #2**
- `options chain` — chain enumeration with moneyness classification
- `options strategy-quote` — multi-leg live pricing engine (THE most powerful options tool)
- `options roll-plan` — cash-account roll staging
- These are the tools an agent MOST needs for options work

### 🔴 #7 — MCP `destructiveHint` is wrong for order/cancel tools
**Track C, Agent C — Gap #1**
- `destructiveHint` mapped to risk==="destructive" only → buy/sell/cancel marked as non-destructive
- MCP spec definition: destructive = ANY change, not just catastrophic ones
- Current annotation tells clients a buy order "isn't destructive" — that's incorrect

### 🔴 #8 — MCP server instructions missing cardinal operating rules
**Track C, Agent C — Gap #2**
- The instructions string is the ONLY thing a pure-MCP agent reads before calling tools
- It's missing: the cardinal rule ("verify the API surface, not the UI"), account discovery requirement, and the classify-before-write workflow

### 🔴 #9 — Zero MCP server test coverage
**Track E, Agent E**
- 66 tools registered, zero tests for the server layer
- Engine tests are strong, but the MCP surface has no test safety net

### 🔴 #10 — `?account=` vs `?account_number=` in order-templates doc
**Track B, Agent B — Contradiction #7 (KNOWN)**
- `docs/options-strategy-order-templates-2026-06-03.md` uses wrong query param
- Would cause actual request failures if an agent followed the doc literally

---

## COMPLETE PRIORITIZED FIX LIST (38 items)

### CRITICAL (5) — fix before any other work

| # | Category | Fix | Tracks |
|---|----------|-----|--------|
| C1 | Security | Update vitest (vite vuln) + @modelcontextprotocol/sdk (hono vuln) | E |
| C2 | Docs | Fix AGENTS.md DRIP endpoint from enrollment/ to account_settings/ | B |
| C3 | Docs | Fix README gate description from "two-gate" to single-switch | B |
| C4 | Code | Fix MCP `destructiveHint` — set true for ALL write-tier tools | C |
| C5 | Docs | Fix `?account=` → `?account_number=` in order-templates doc | B |

### HIGH (12) — core hardening

| # | Category | Fix | Tracks |
|---|----------|-----|--------|
| H1 | Code | Hoist `percentChange` from MCP local to lib.ts import | A |
| H2 | MCP | Add `robinhood_options_chain` tool (wraps selectNearStrikes + classifyMoneyness) | A |
| H3 | MCP | Add `robinhood_options_strategy_quote` tool (wraps buildOptionsStrategyPricingSummary) | A |
| H4 | MCP | Add `robinhood_options_roll_plan` tool (wraps options roll-plan) | A |
| H5 | Docs | Update SKILL.md MCP Tools table — add missing 11 tools | A |
| H6 | Docs | Fix SKILL.md iron-condor leg names at lines 961-964 (wrong generic names) | B |
| H7 | Docs | Fix SKILL.md naked-short-call leg id from `naked_call` to `short_call` | B |
| H8 | Docs | Fix after-hours options contradiction — SKILL.md line 1507 + README line 286 | B |
| H9 | Docs | Fix wash-sale strictness in rolling deep-dive (too confident vs tax doc) | B |
| H10 | Docs | Expand MCP server instructions string — add cardinal rule, account discovery, classify-before-write | C |
| H11 | Code | Add MCP server tests (at minimum: write gate, tool count, annotations on all tools) | E |
| H12 | Code | Implement `income` P0 tool (dividends + option premium combined) | D |

### MEDIUM (13) — polish and gap-fill

| # | Category | Fix | Tracks |
|---|----------|-----|--------|
| M1 | Code | Add `robinhood_search` MCP tool (wraps brokerage search / midlands/search/) | A |
| M2 | Code | Add `robinhood_options_expirations` MCP tool | A |
| M3 | Docs | Remove stale TODO note about 37 vs 38 tool count | B |
| M4 | Docs | Clarify account-mask format purpose in boot KB (not a contradiction) | B |
| M5 | Docs | Resolve PDT-lifted vs vestigial toggles — mark PDT toggle as vestigial post-FINRA 26-10 | B |
| M6 | Docs | Fix strategy workflow count: "18 workflows" → 20 (match catalog JSON) | B |
| M7 | Docs | Audit all MCP tool descriptions for completeness — add return-shape hints | C |
| M8 | Code | Map classifyRobinhoodError taxonomy to MCP JSON-RPC error codes | C |
| M9 | Code | Add eslint + prettier config (zero linting currently) | E |
| M10 | Code | Add CI step: `pnpm audit` (security vuln check) | E |
| M11 | Code | Add vitest.config.ts with coverage thresholds | E |
| M12 | Code | Add CI caching for node_modules | E |
| M13 | Docs | Fix SKILL.md tool count blurb to say "50+" and defer to live tools/list | B |

### LOW (8) — nice-to-have

| # | Category | Fix | Tracks |
|---|----------|-----|--------|
| L1 | Code | Verify tool ordering is deterministic (spec recommendation) | C |
| L2 | Docs | Hoist `resolveExactContractLinkBundle` to lib.ts for MCP reuse | A |
| L3 | Code | Consider breaking 5768-line lib.ts into domain modules | E |
| L4 | Docs | Add README system message to bottom + dungeon crawler Carl meme | — |
| L5 | Code | Add `pnpm version:refresh` to CI or pre-build hook | E |
| L6 | Docs | Add CODEOWNERS file | E |
| L7 | Docs | Add PR template | E |
| L8 | Code | Add env sanitization for MCP context (future multi-user proofing) | C |

---

## P0 FINANCIAL TOOLS (spec'd, ready to build)

These 5 tools are read-only, use live-verified endpoints, follow the shared-engine pattern, and directly enable the "financial freedom" goal:

| Tool | What it does | Lines of code (est.) | Impact |
|------|-------------|---------------------|--------|
| `income` | Combined dividends + option premium by month, in dollars | ~300 | HIGH |
| `risk` | Portfolio scanner: max loss, assignment exposure, uncovered legs, margin distance | ~400 | HIGH |
| `whatif` | Greeks scenario: spot ±X%, IV ±N, T days → P&L | ~300 | HIGH |
| `calendar` | Upcoming events: expirations, ex-div, earnings for held names | ~250 | MEDIUM-HIGH |
| `exposure` | Concentration by underlying/sector + net Greeks | ~350 | HIGH |

Full specs in `docs/financial-tools-gap-analysis-2026-06-18.md`.

---

## DOC CONTRADICTIONS RESOLVED (all 20)

| # | Doc | Issue | Fix |
|---|-----|-------|-----|
| 1 | SKILL.md lines 961-964 | Iron-condor wrong generic leg names | Use catalog's wing/body names |
| 2 | SKILL.md line 769 | Naked-short-call wrong leg id `naked_call` | Use catalog's `short_call` |
| 3 | SKILL.md/README | After-hours options overgeneralization | Match nuanced framing from SKILL line 921-924 |
| 4 | rolling deep-dive | Wash-sale overconfident vs tax doc | Adopt tax doc's conservative framing |
| 5 | SKILL/TODO | Stale 37/38 tool count | Remove stale note, use live count |
| 6 | boot KB | Account-mask format "inconsistency" | NOT a contradiction — boot KB is operator-specific |
| 7 | order-templates | `?account=` vs `?account_number=` | Fix to `?account_number=` |
| 8 | SKILL/README/TODO | PDT-lifted vs vestigial toggles | Mark PDT toggle as vestigial |
| 9 | SKILL | "18 workflows" vs 20 catalog ids | Update to 20 |
| 10 | AGENTS.md §9 | DRIP endpoint 405'ing (NEW) | Fix to account_settings/ endpoint |
| 11 | README §4 | "Two-gate" model obsolete (NEW) | Update to single-switch |
| 12 | MCP instructions | Missing cardinal rules (NEW) | Expand instructions string |
| 13 | SKILL MCP table | Missing 11 tools (NEW) | Add all tools |
| 14 | SKILL tool count | Blurb says "37" (NEW) | Update to "50+" with live-ref note |
| 15 | HOTLIST.md | Claims live quotes, code behavior differs (NEW) | Verify or fix |
| 16 | SKILL §MCP | "readOnlyHint OR destructiveHint" — XOR logic wrong (NEW) | Fix to "AND" |
| 17 | knowledge/ accounts | Incorrect claim about endpoint (NEW) | Verify against live behavior |
| 18 | docs/options-strategy | Leg topology inconsistent with catalog (NEW) | Align with catalog JSON |
| 19 | README | Missing `order watch` from coverage table (NEW) | Add or remove from promises |
| 20 | AGENTS.md | Missing `pretrade` from TL;DR section (NEW) | Add pretrade to quick reference |

Full resolutions in `docs/doc-contradiction-audit-2026-06-18.md`.

---

## ARCHITECTURE VERDICT: The Shared Engine Holds

Agent A's deep audit of the CLI↔MCP parity found:

- **66 MCP tools, ALL import from lib.ts** — zero MCP tools make direct HTTP calls
- **All write paths** converge through `gatedBrokerageWrite`, `placeEquityOrder`, `cancelOrder`, or `panicCancelAll` — identical functions on both surfaces
- **Route resolver** (`selectRouteByQueryAndMethod`) is byte-for-byte identical in both `brokerage execute` implementations
- **Write gate** (`resolveLiveWriteGate`) is the same function, called from both surfaces
- **`writeStatus()`** hoists execution state on every MCP write tool — impossible to mistake dry-run for live

**One violation found:** `percentChange` duplicated locally in MCP server instead of importing from lib.ts. Trivial fix.

---

## NEXT STEPS (awaiting your green light)

### Phase 3: ACTION — 5 agents in parallel
1. **Agent A': Parity fixes** — add missing MCP tools, hoist percentChange
2. **Agent B': Doc fixes** — patch all 20 contradictions across SKILL.md, AGENTS.md, README
3. **Agent C': MCP hardening** — fix annotations, expand instructions, add error codes
4. **Agent D': Financial tools** — implement `income`, `risk`, `whatif` (P0 tools)
5. **Agent E': DX fixes** — vuln patches, eslint config, CI hardening, test coverage

### Phase 4: VERIFY — me
- Run full test suite
- Verify CLI ↔ MCP tool count parity
- Read every changed doc for consistency
- Push PR

**Tell me which to green-light — individual items, whole categories, or "go."**

<!-- Zayd Khan // cold // www.zayd.wtf -->
