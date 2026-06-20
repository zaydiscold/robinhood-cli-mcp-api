# Audit Follow-up — 2026-06-19

**Context:** A fresh external audit pass (z.ai) re-ran Track A (CLI↔MCP parity) and Track C (MCP best
practices) from the [2026-06-18 comprehensive audit](COMPREHENSIVE-AUDIT-2026-06-18.md). That session
was cut off mid-analysis. This doc closes the loop: it verifies the external findings against the
**current** code, records what was already shipped, and lists what this pass actually changed.

**Headline:** ~90% of the 38-item 6-18 audit is already DONE. The external re-audit was largely
rediscovering completed work. Two genuine gaps remained; both are now closed.

---

## Verdict on the external (z.ai) session

| z.ai observation | Verdict | Reality |
|---|---|---|
| 72 MCP tools | ✅ Correct | `EXPECTED_TOOL_COUNT = 72`, verified live via `tools/list`. |
| `robinhood_cancel` / `robinhood_sell` have "no CLI equivalent?" | ❌ False positive | `cancel` and `sell` are **root-level** CLI commands (not under a parent). Parity holds. |
| `robinhood_positions` "ambiguous" | ❌ False positive | Maps cleanly to the root `positions` command. |
| `brokerage route` (singular) has no MCP tool | ⚠️ Technically true, not a gap | Covered by `robinhood_brokerage_describe` (the self-describing route card) + `robinhood_brokerage_routes`. No capability missing. |
| MCP best-practices review (annotations/instructions) | ✅ Worth doing — already mostly done | See below: the 2 HIGH items it would have flagged were already fixed; the missing piece was a **test** locking them in. |

**Net:** the session did not surface a new defect. Its value was prompting a full re-verification, which
confirmed the 6-18 fixes shipped and exposed the two residual gaps below.

---

## 6-18 audit items — current status (spot-verified against code)

**Already DONE (do not redo):**

- **C1** npm vulns — `pnpm.overrides` pins `vite@8.0.16` + `hono@4.12.25`; `pnpm audit --audit-level high`
  is clean (only 2 dev-only **low** esbuild transitives remain). CI runs the audit on every push.
- **C2** AGENTS.md DRIP endpoint — now `corp_actions/drip/account_settings/{account_number}/` with an
  explicit "enrollment/ is GET-only (405)" note.
- **C3** README "two-gate" model — gone; single-switch everywhere.
- **C4** `destructiveHint` — `toolAnnotations` now sets `destructiveHint = isWrite` for ALL write tiers.
- **C5** order-templates `?account=` → `?account_number=` — fixed.
- **H1** `percentChange` — imported from `lib.ts` (no MCP-local dup).
- **H2/H3/H4** — `robinhood_options_chain`, `_strategy_quote`, `_roll_plan` all exist.
- **H10** MCP instructions string — expanded (cardinal rule, account discovery, classify-before-write,
  order-evidence rule, signal-sourcing doctrine, key tool families).
- **H12 + D-track** — `income`, `risk`, `whatif`, `calendar`, `exposure` all shipped (CLI + MCP).
- **M1/M2** — `robinhood_search`, `robinhood_options_expirations` exist.
- **M9/M10/M12** — eslint flat config + prettier; CI runs lint + `pnpm audit` + pnpm cache + full
  ubuntu/macos/windows × node 20/22 matrix.
- Plus net-new since 6-18: `sentinel`, the 5 signal reads (`news`/`ratings`/`earnings`/`movers`/
  `options-events`), notional caps (N1 cancel allow-list, N4 options caps).

**Closed in THIS pass (2026-06-19):**

- **H11 (residual) / L1 — MCP annotation test coverage.** `mcp-server.test.ts` checked titles/
  descriptions/naming/write-gate but **nothing asserted annotations**. The C4 bug (a write tool flagged
  non-destructive) could have regressed silently. Added `cli/test/mcp-annotations.test.ts`: parses every
  `registerTool(...)`, asserts all 72 tools carry a literal `toolAnnotations(readOnly, risk)`, that
  `readOnly ⟺ read-tier risk`, that every write derives `destructiveHint:true / readOnlyHint:false` and
  every read the inverse, and pins the order-lifecycle tools (`buy`/`sell`/`cancel`/`panic`/...) as
  writes + non-idempotent. Proven to catch a mis-tag (negative check). 8 tests.
- **Notional-cap override wiring (`--override-cap` / `overrideCap`).** The engine enforced caps and the
  `NotionalCapError` message told users to "pass overrideCap to bypass" — but **no CLI/MCP surface
  exposed it**, and the options path (`gatedBrokerageWrite`) had no override parameter at all (a broken
  promise + unfinished TODO). Wired end-to-end, opt-in, default off (zero behavior change unless a cap
  is set):
  - engine: `gatedBrokerageWrite({ overrideCap })` → `checkNotionalCaps`; `buyWatchlistBasket` threads it per leg.
  - CLI: `--override-cap` on `buy` (root + `brokerage buy`), `sell`, `watchlist buy`.
  - MCP: `overrideCap` on `robinhood_buy`, `robinhood_sell`, `robinhood_watchlist_buy`.
  - tests: `equity-order.test.ts` — over-cap live order throws `NotionalCapError`; `overrideCap:true`
    sends; dry-run never blocked.
- **Discoverability** — documented `ROBINHOOD_MAX_ORDER_DOLLARS` / `ROBINHOOD_MAX_SESSION_DOLLARS` /
  `ROBINHOOD_ALLOWED_ACCOUNT` in `.env.example` (previously undocumented safety knobs).
- **TODO.md hygiene** — checked off the shipped notional-caps + whatif/calendar/risk/income/exposure
  entries that were stale.

---

## Remaining (deliberately deferred — low value or larger scope)

- **Options cap is bypassed by raw `brokerage execute`.** The N4 options notional cap only fires through
  `gatedBrokerageWrite`, but BOTH the CLI and MCP `brokerage execute` (the path agents actually use to
  place options orders) call `executeBrokerageRequest` directly. So in practice an options order placed
  via raw execute is **not capped**. Fixing this means routing execute writes through the gated engine —
  a broader consistency change with blast radius across every write type. Tracked in TODO.md.
- **M8** map `classifyRobinhoodError` → JSON-RPC error codes — low ROI for a stdio single-user server
  (the SDK already returns structured errors; the current pattern returns the richer taxonomy in the
  response body). Intentionally deferred.
- **M11** vitest coverage thresholds — `@vitest/coverage-v8` is installed but no `vitest.config` with
  thresholds. Minor.
- **L4** README cosmetic (system-message-to-bottom + meme), **L8** env sanitization for multi-user — both
  explicitly out of scope for a single-user tool.

---

## Verification

```
pnpm typecheck   # clean (cli + mcp)
pnpm lint        # 0 errors (334 pre-existing no-explicit-any warnings, none new)
pnpm test        # 360 passed (20 files) — +11 over the pre-pass 349
pnpm build       # clean (emits dist the runtime reads)
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
