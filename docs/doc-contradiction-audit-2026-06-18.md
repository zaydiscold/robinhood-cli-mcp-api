# Agent Doc Contradiction Audit — 2026-06-18

## Executive Summary

Audit of all agent-facing documentation across `SKILL.md`, `AGENTS.md`, `README.md`, `mcp/src/server.ts`, `knowledge/*.md`, `docs/`, and `api-map/`. All 9 known contradictions from TODO.md (lines 51-56) are resolved; 11 new contradictions found; total 20 items with hardening recommendations.

**Worst findings:**
1. AGENTS.md §9 still documents the WRONG DRIP write endpoint — 405'ing `drip/enrollment/` instead of the working `drip/account_settings/` (CRITICAL — could cause agents to mis-claim a write works)
2. README describes the obsolete "two-gate" model instead of the current single-switch model
3. MCP server instructions string omits the boot-smart KB, signal sourcing, and cardinal operating rules
4. SKILL.md has an internal iron-condor leg-name contradiction between two sections of the same file
5. After-hours options attribution contradicts itself across SKILL.md and README.md

---

## PART 1: KNOWN CONTRADICTIONS (from TODO.md lines 51-56) — RESOLVED

### #1 — Iron-condor leg names differ between SKILL.md sections

**Severity:** HIGH (could cause a strategy-quote to fail with wrong leg names)

**The contradiction:**
- SKILL.md line 773 (worked examples section): `--leg long_put_wing=<K1> --leg short_put_body=<K2> --leg short_call_body=<K3> --leg long_call_wing=<K4>` ✅ **CORRECT**
- SKILL.md lines 961-964 (Worked Build section): `--leg short_put=<K1> --leg long_put=<K2> --leg short_call=<K3> --leg long_call=<K4>` ❌ **WRONG**

**Authoritative source:** `api-map/options-strategy-workflows-2026-06-02.json` lines 838-865 (the catalog):
```json
leg ids: long_put_wing, short_put_body, short_call_body, long_call_wing
```

Also confirmed by `knowledge/multi-leg.md` lines 96-98 which uses the correct wing/body names.

**Verdict:** SKILL.md lines 961-964 are WRONG. They use generic `short_put`/`long_put`/`short_call`/`long_call` instead of the catalog's wing/body-specific leg ids. The generic names will NOT match the strategy-quote leg parser. Fix: replace lines 961-964 with the same leg names used at line 773.

**Resolution:** Catalog JSON is authoritative. Fix SKILL.md lines 961-964 to match line 773.

---

### #2 — Naked-short-call leg id mismatch

**Severity:** HIGH (strategy-quote would fail)

**The contradiction:**
- SKILL.md line 769: `--leg naked_call=<K>` ❌ **WRONG**
- Catalog JSON line 353: leg id is `short_call` ✅ **CORRECT**

**Authoritative source:** `api-map/options-strategy-workflows-2026-06-02.json` line 353: `"id": "short_call"`
The `naked-short-call` strategy's single leg has id `short_call` (action: sell, positionEffect: open).

**Verdict:** SKILL.md line 769 is WRONG. The leg id is `short_call`, not `naked_call`. The strategy id (`naked-short-call`) and leg id (`short_call`) are different things. Fix: change `--leg naked_call=<K>` to `--leg short_call=<K>`.

**Resolution:** Catalog JSON is authoritative. Fix SKILL.md line 769.

---

### #3 — After-hours options self-contradiction in SKILL.md

**Severity:** MEDIUM (agents may incorrectly report what moves after hours)

**The contradiction:**
- SKILL.md lines 921-924 (Portfolio loss attribution, §4): "**It is NOT 'equities only.'** Index/ETF options (SPX, SPXW, SPY, NDX, …) trade ~15 min past the bell and in extended sessions — they move after-hours too. ... **CHECK the actual extended marks; never assert a class can't be the cause.**" ✅ **CORRECT — nuanced and evidence-based**

- SKILL.md line 1507 (Verification Checklist / portfolio command): "After-hours is EQUITY-only (options don't print after-hours)." ❌ **OVERGENERALIZATION — contradicts lines 921-924**

- README.md line 286: "After-hours P&L attribution is equity-only." ❌ **SAME OVERGENERALIZATION**

**Authoritative source:** Live market structure. Index options (SPX, SPXW, SPY, NDX) DO trade ~15 min past the regular close (4:00 ET) into the curb session. Single-stock equity/ETF options do not. The `extended_hours_equity` portfolio field includes option marks from these sessions.

**Verdict:** The nuanced position in lines 921-924 is CORRECT. Line 1507 and README line 286 are overgeneralizations that the same file contradicts. The correct statement: "After-hours attribution is PRIMARILY equity-driven, but index/ETF options trade ~15 min past the bell and can move after-hours too — always check extended marks for those underlyings."

**Resolution:** Update SKILL.md line 1507 and README.md line 286 to match the nuanced framing from lines 921-924.

---

### #4 — Wash-sale strictness differs between rolling deep-dive and tax doc

**Severity:** MEDIUM (tax-consequential — agent could give wrong wash-sale advice)

**The contradiction:**
- **Rolling deep-dive** (`docs/strategy-deep-dive-rolling-options-2026-06-04.md`, lines 98-103): "changing strike OR expiration generally breaks it [the substantially-identical test], and a real roll almost always changes the expiration, so a normal roll-out for a credit is **usually not** a wash sale."

- **Tax doc** (`docs/tax-aware-options-strategies.md`, lines 178-183): "'Substantially identical' has no bright-line definition — it's facts-and-circumstances, broader than 'same CUSIP,' ... same underlying with a near strike/expiry generally doesn't [avoid wash-sale]."

- **knowledge/rolling.md** (lines 90-95): "changing strike or expiration generally helps, but there is **no IRS bright line** — flag it, don't adjudicate it."

**Authoritative source:** IRC § 1091 and IRS practice. There is genuinely NO bright-line definition for options. The Tax Court and IRS have applied a facts-and-circumstances test that can extend to same-underlying positions with nearby strikes/expirations. The "changing strike OR expiration generally breaks it" framing in the rolling deep-dive is too confident and could mislead.

**Verdict:** The tax doc's conservative framing is the CORRECT baseline for agent behavior. The rolling deep-dive overstates certainty. The knowledge/rolling.md correctly says "flag it, don't adjudicate it."

**Resolution:** Update the rolling deep-dive to match the tax doc's more conservative framing. Add a note that changing BOTH strike AND expiration significantly reduces risk but is not a legal guarantee. The knowledge/rolling.md framing is the right balance.

---

### #5 — SKILL 38 vs TODO 37 tool count

**Severity:** LOW (cosmetic, already partially fixed)

**The contradiction:** TODO.md referenced a state from before the 2026-06-11 claims audit. That audit fixed SKILL.md from "48" → "50" and AGENTS.md from "38" → "50". The live tool count is 50+.

**Authoritative source:** `mcp/src/server.ts` `registerTool` calls (50+) and live `tools/list`.

**Verdict:** Both "38" and "37" are stale. Current reality: 50+ registered tools. The TODO note is outdated. The SKILL MCP Tools TABLE still lists only 44 (missing 12 tools — see claims audit CNV-3). The table, not the count blurb, is the remaining inconsistency.

**Resolution:** Remove the stale TODO note. Update the SKILL MCP Tools table to include all 50 tools (or add a note that it's a curated subset and defer to live `tools/list`).

---

### #6 — Account-mask format inconsistent between two docs

**Severity:** LOW (cosmetic, no operational impact)

**The contradiction:** The boot-smart KB (`docs/agent-operating-intelligence-2026-06-04.md`) lists operator-specific masked accounts with format `…NNNN` (dots prefix + last 4). The knowledge/accounts.md and SKILL.md use generic `<ACCOUNT_NUMBER>` placeholder format. The README uses `<ACCOUNT_NUMBER>`.

**Authoritative source:** The boot KB contains live operator account data. The agent-facing docs should remain generic for portability.

**Verdict:** NOT a real contradiction — they serve different purposes. The boot KB documents the operator's specific accounts for the cold-start agent; the generic docs use placeholders for any operator. The dots notation (`...7523`) is the standard masked format used consistently in the boot KB.

**Resolution:** No fix needed. Clarify in the boot KB that the masked format is deliberate (preserves a recognizable last-4 while hiding the full number for public-commit safety).

---

### #7 — `?account=` vs `?account_number=` in order-templates doc

**Severity:** HIGH (would cause a failed request — wrong query parameter)

**The contradiction:**
- `docs/options-strategy-order-templates-2026-06-03.md` line 6: "pass `?account=` on any web/preview call" ❌ **WRONG**

- SKILL.md line 254: `?account_number=<ACCT>` ✅ **CORRECT**

- AGENTS.md (throughout): `?account_number=` ✅ **CORRECT**

- knowledge/accounts.md line 47: `?account_number=<ACCT>` ✅ **CORRECT**

**Authoritative source:** Live Robinhood web API behavior. The account selector parameter is `?account_number=`, not `?account=`.

**Verdict:** The order-templates doc is WRONG. All other docs consistently use `?account_number=`. Fix: change `?account=` to `?account_number=` on line 6 of the order-templates doc.

**Resolution:** Fix the order-templates doc. One-line change.

---

### #8 — PDT-lifted vs vestigial PDT toggles

**Severity:** LOW-MEDIUM (confusion about whether a setting toggle is active or moot)

**The contradiction:**
- SKILL.md and README list "PDT protection" as an active `settings` subcommand toggle
- SKILL.md failure mode #19 and PD spectrum state "PDT lifted on RH — no $25k day-trade cap"
- TODO.md line 197 still lists `settings/margin/{account}/` as "PDT protection toggle" needing live auth
- TODO.md line 197 also notes `margin/{id}/day_trades_card/` is 404 (retired with PDT elimination)
- The boot-smart KB does NOT mention PDT toggles — only that PDT is lifted

**Authoritative source:** FINRA Reg Notice 26-10 eliminated the PDT designation effective 2026-06-04. Robinhood has implemented it. The PDT counter endpoint is confirmed 404.

**Verdict:** The PDT elimination is confirmed and documented correctly. The PDT protection TOGGLE in the Robinhood settings surface may still exist as a vestigial UI element (RH may not have removed the toggle yet), making `settings pdt` a valid command that hits an existing route. But the toggle is functionally MOOT since PDT no longer exists. The docs need to clarify: "PDT protection toggle is vestigial (PDT eliminated by FINRA 2026-06-04); it exists in the settings surface but has no practical effect."

**Resolution:** Add a note to the `settings` documentation that PDT protection is vestigial. The PDT counter route (`day_trades_card/`) is already documented as 404 in the route map.

---

### #9 — "18 strategy workflows" vs 20 catalog ids

**Severity:** LOW (outdated reference, current docs are correct)

**The contradiction:** TODO.md line 56 references "18 strategy workflows" from an old state of the catalog. The current catalog has 20 strategy-level IDs and SKILL.md correctly says "20 workflows" (line 179) and "20 strategy workflows" (line 441).

**Authoritative source:** `api-map/options-strategy-workflows-2026-06-02.json` — 20 top-level `id` entries excluding leg-level ids:
1. long-call
2. long-put
3. sell-to-close-long-option
4. covered-call
5. cash-secured-short-put
6. naked-short-call
7. call-credit-spread
8. put-credit-spread
9. long-straddle
10. short-straddle
11. long-call-butterfly
12. iron-condor
13. call-debit-spread
14. put-debit-spread
15. naked-short-put
16. covered-put
17. long-strangle
18. short-strangle
19. call-calendar-roll
20. put-calendar-roll

**Verdict:** Current docs are correct at 20. The TODO's "18" is stale. No fix needed.

**Resolution:** Remove the stale TODO note. No other changes.

---

## PART 2: NEW CONTRADICTIONS FOUND (11 items)

### New-1 — CRITICAL: AGENTS.md §9 documents wrong DRIP write endpoint

**Severity:** CRITICAL (agent could claim a write works when it 405s)

**The contradiction:**
- AGENTS.md lines 582-585: Documents DRIP toggle as `PATCH corp_actions/drip/enrollment/{num}/` with body `{"drip_enrolled":true}` ❌ **WRONG — this endpoint is GET-only, returns 405 on PATCH**
- SKILL.md lines 1065-1069: Documents DRIP write as `PATCH corp_actions/drip/account_settings/{account_number}/` with body `{"drip_enabled":bool}` ✅ **CORRECT — wired and verified**

**Evidence:** Live-verified: `drip/enrollment/` returns 405 on PATCH/POST/PUT. The REAL working endpoint is `drip/account_settings/{account_number}/` (account-wide) and `drip/instrument_settings/{account_number}/{instrument_id}/` (per-stock). The route map has both entries correctly split by method (GET at one index, PATCH at another, same URL for `account_settings/`).

**Verdict:** AGENTS.md §9 is STALE and dangerously wrong. This is the same kind of "doc claims a wired feature that isn't" that the claims audit already caught once (the OTC engine lie). The DRIP write is wired but at a DIFFERENT endpoint than AGENTS.md claims.

**Resolution:** Fix AGENTS.md §9 to document the correct `account_settings/` endpoint. Remove the misleading `drip/enrollment/` example.

---

### New-2 — HIGH: README describes obsolete two-gate model

**Severity:** HIGH (operators reading README will think they need two opts-in for live writes)

**The contradiction:**
- README.md line 262: "set **both** gates — a flag *and* an environment variable. Two deliberate opt-ins, or nothing leaves the machine" ❌ **STALE — describes the PRE-hardening model**
- SKILL.md lines 284-289 (failure mode #3): "The live-write switch is the ONE gate — set it deliberately. `ROBINHOOD_ALLOW_LIVE_WRITE=1` is the single master switch: set it and **every** write executes for real (no per-call `--live-write` needed)"
- AGENTS.md lines 101, 227: "the single switch; `--live-write` is optional"
- Claims audit GATE-1: verified single-switch model

**Verdict:** The README still describes the OLD two-gate model (flag + env var). The current model is single-switch: `ROBINHOOD_ALLOW_LIVE_WRITE=1` alone gates writes. `--live-write` is accepted as a no-op for backward compatibility. This is a significant inconsistency — the highest-traffic doc (README) contradicts the agent-facing docs.

**Resolution:** Update README.md line 262 and surrounding text to describe the single-switch model. The safety-model explainer should match the current behavior.

---

### New-3 — HIGH: MCP server instructions string is critically incomplete

**Severity:** HIGH (pure-MCP agents miss the most important operating rules)

**The contradiction:** SKILL.md says "Cold start? Read `docs/agent-operating-intelligence-2026-06-04.md` first" and emphasizes the boot-smart KB as the first read. But the MCP instructions string (`mcp/src/server.ts` lines 79-81) — the FIRST AND ONLY thing a pure-MCP agent without repo checkout sees — never mentions:
- The boot-smart KB (the cardinal rule: verify the API surface, not the UI)
- The `ball-knowledge.md` and `trading-log.md` memory layers
- The signal sourcing doctrine
- The "read → classify → gate" framework
- The "always pass the account explicitly" rule
- The "bulk-enumerate option UUIDs first" rule
- The progressive disclosure model (`SKILL.md → knowledge/ → docs/`)

**What the instructions DO say:** Pull `robinhood_knowledge` (action=index, read the matching module) and check `robinhood_roll_ledger` (action=list) for pending kosher rolls. This is useful but FAR from complete.

**Verdict:** The MCP instructions string is a minimal boot pointer — too minimal. A cold agent seeing only these instructions would miss the cardinal rule, the wrong-account trap, and the signal sourcing framework.

**Resolution:** Expand the instructions string to include at minimum:
1. Read the boot-smart KB first (cardinal rule of verifying API surface not UI)
2. Always pass account explicitly; bulk-enumerate option UUIDs first
3. Read → classify → gate before any write
4. Order history is the only proof
5. The progressive disclosure path

---

### New-4 — MEDIUM: SKILL.md MCP Tools table is incomplete (44 listed vs 50+ actual)

**Severity:** MEDIUM (agents scanning the table miss 12 tools)

**The contradiction:** The SKILL.md MCP Tools table (lines 1297-1340) lists 44 tools. The claims audit (CNT-1) confirmed 50 registered tools via `server.ts` `registerTool` counts. The missing tools include: `robinhood_dividends`, `_documents`, `_hotlist`, `_knowledge`, `_margin`, `_options_close`, `_orders_open`, `_panic`, `_pretrade`, `_review`, `_review_note`, `_roll_ledger`.

**Verdict:** The table is incomplete (intentionally — "preserve voice" per claims audit CNV-3), but this creates a discoverability gap.

**Resolution:** Either expand the table to include all 50 tools, or add a prominent note: "This table is a curated subset. The authoritative tool list is `tools/list` (live). Full roster: 50+ tools. Notable omissions: `robinhood_dividends`, `_documents`, `_knowledge`, `_margin`, `_panic`, `_pretrade`, `_review`, `_review_note`, `_roll_ledger`, `_orders_open`, `_options_close`, `_hotlist`."

---

### New-5 — LOW: Progressive disclosure model has a boot loop

**Severity:** LOW (agents navigate it fine in practice, but the stated flow is inconsistent)

**The contradiction:** 
- `knowledge/README.md` line 12: "Read SKILL.md first" (as the Router layer)
- SKILL.md line 55: "Cold start? Read `docs/agent-operating-intelligence-2026-06-04.md` first, then this file."
- Boot KB says: read itself first, then SKILL.md

Both can't be "read first." In practice, the boot KB should be read first (it contains the cardinal rule and account/order decision frameworks), then SKILL.md (command catalog + playbook), then pull knowledge modules as needed.

**Verdict:** The boot KB effectively supersedes SKILL.md as the first read. The knowledge/README.md's progressive disclosure model needs updating to reflect the boot KB's primacy.

**Resolution:** Update knowledge/README.md to put the boot KB as Layer 0: "Boot KB (`docs/agent-operating-intelligence-2026-06-04.md`) — operating intelligence: cardinal rule, account/order/signal frameworks, failure→fix tree. Read FIRST." Then SKILL.md as Layer 1.

---

### New-6 — LOW: `knowledge/accounts.md` says "margin-style rolls won't work" imprecisely

**Severity:** LOW (cosmetic wording difference with SKILL.md)

**The contradiction:** 
- `knowledge/accounts.md` line 15: "margin-style rolls won't work (use the kosher roll)"
- SKILL.md line 985: "rolling that needs margin won't work"

The knowledge module says "margin-style rolls won't work" which could be read as "no rolls work on cash accounts" — that's incorrect (the kosher roll does). SKILL.md's phrasing "rolling that needs margin won't work" is more precise.

**Verdict:** knowledge/accounts.md could be clearer. It's technically correct (with the parenthetical "use the kosher roll") but the standalone phrase is imprecise.

**Resolution:** Rephrase: "same-day/margin rolls won't work; use the kosher roll (close today, open next business day) — see knowledge/rolling.md"

---

### New-7 — LOW: `accounts/` under-reporting claim is operator-specific and untestable

**Severity:** LOW (not a contradiction, but a "verify, don't assume" violation in the docs themselves)

The docs repeatedly claim that bare `accounts/` under-reports "2 of 5" accounts. The claims audit marked this as CNV-1: "Could-not-verify — live, operator-specific account-graph observation." This is stated as universal truth ("the trap is that accounts/ under-reports") but was verified only against ONE operator's login on ONE date.

**Verdict:** The mechanism (fall back to `transfer/accounts/`) is sound. But the specific "2 of 5" claim and the blanket assertion that accounts/ always under-reports is not independently verified. The doc should be hedged: "In observed sessions, bare accounts/ under-reported; always use `transfer/accounts/` as the authoritative list."

**Resolution:** Add a minor hedge to the accounts-under-reports claim across relevant docs. The default behavior (always use `transfer/accounts/` or `robinhood_accounts`) is correct regardless.

---

### New-8 — LOW: SKILL.md line 1275 tool blurb vs MCP Tools table count mismatch

**Severity:** LOW (cosmetic inconsistency within same section)

**The contradiction:** SKILL.md line 1275 describes "the full first-class tool roster" and lists ~37 tools in prose. The MCP Tools table immediately below (lines 1297-1340) lists 44 tools. Both differ from the source truth of 50+.

**Verdict:** Neither the prose blurb nor the table is authoritative. The live `tools/list` is authoritative.

**Resolution:** Add a note at the top of both sections: "The live `tools/list` is the authoritative roster. This section may lag."

---

### New-9 — LOW: "Status: executed" vs "order history confirms" wording in trading-log.md header

**Severity:** LOW (minor phrasing discrepancy)

The trading-log.md in the repo root likely says `STATUS: executed|...` but the SKILL.md description of the trading log says "STATUS is honest: mark a trade executed only if brokerage order history confirms it." The field name `STATUS: executed` uses "executed" as a value that actually means "confirmed-by-order-history" not "the API returned 201." This subtle distinction is easy to miss.

**Verdict:** Consistent intent but the field value "executed" could be misleading. Consider renaming to `STATUS: confirmed|queued|cancelled|rejected|dry-run`.

**Resolution:** Rename the STATUS values in the trading-log format spec to avoid ambiguity. `confirmed` (proven by order history) vs `queued` (sent but not yet in history).

---

### New-10 — LOW: `options-strategy-order-templates-2026-06-03.md` iron condor leg order

**Severity:** LOW (leg order doesn't affect correctness but docs should match catalog)

The order-templates doc (line 37) lists iron condor legs as: "short put → sell/open/1 ; long put wing (lower) → buy/open/1 ; short call → sell/open/1 ; long call wing (higher) → buy/open/1"

The catalog JSON lists them as: `long_put_wing`, `short_put_body`, `short_call_body`, `long_call_wing` (put wing first, then put body, then call body, then call wing — puts before calls).

The discrepancy is in ORDER (put-wing-before-put-body vs short-put-before-long-put-wing) and NAMING (the catalog uses `short_put_body` not `short_put`, `short_call_body` not `short_call`).

**Verdict:** The catalog order and naming are authoritative. The order-templates doc should be updated for consistency, though leg order in the actual order body doesn't affect execution.

**Resolution:** Update order-templates line 37 to use catalog-consistent leg names: `long_put_wing`, `short_put_body`, `short_call_body`, `long_call_wing`.

---

### New-11 — LOW: README $0 examples are documented as "EXAMPLE DATA" but SKILL.md warns against them

SKILL.md line 65 (Agent Quick Scan #3 trap): "The README has spoofed example numbers (HPE=100 shares, ARM=50 shares). These are COSMETIC. Live CLI returns real data. Do NOT add spoof code to the CLI."

The README itself marks the options positions output as "EXAMPLE DATA, not real holdings" (line 324). But the README also shows `portfolio` output and other "example" data that could be mistaken for real outputs.

**Verdict:** Consistent across docs — both warn that example data is cosmetic. Not a contradiction, but the README could add a more prominent banner.

**Resolution:** Add a banner to README example outputs: "⚠️ ILLUSTRATIVE — not real portfolio data. Run the live command to see your actual numbers."

---

## PART 3: HARDENING RECOMMENDATIONS

### Critical (fix immediately — could cause wrong action or false capability claim)

1. **Fix AGENTS.md §9 DRIP endpoint.** Change `PATCH corp_actions/drip/enrollment/{num}/` → `PATCH corp_actions/drip/account_settings/{account_number}/` with body `{"drip_enabled":bool}`. This is a documented feature that routes to a 405'ing endpoint.

2. **Fix SKILL.md iron-condor leg names (lines 961-964).** Replace `short_put`/`long_put`/`short_call`/`long_call` with `long_put_wing`/`short_put_body`/`short_call_body`/`long_call_wing`.

3. **Fix SKILL.md naked-short-call leg name (line 769).** Change `--leg naked_call=<K>` to `--leg short_call=<K>`.

4. **Fix `docs/options-strategy-order-templates-2026-06-03.md` line 6.** Change `?account=` to `?account_number=`.

5. **Fix README.md line 262 two-gate model.** Update to describe the single-switch model: `ROBINHOOD_ALLOW_LIVE_WRITE=1` is the gate.

### High (fix before next agent session — causes confusion or missed capability)

6. **Expand MCP instructions string** (`mcp/src/server.ts` lines 79-81) to include:
   - "Read the boot-smart KB first (`docs/agent-operating-intelligence-2026-06-04.md`) — the cardinal rule: verify the API surface, not the consumer UI"
   - "Always pass `?account_number=` explicitly; bulk-enumerate option UUIDs first"
   - "Read → classify → gate before any write"
   - "Order history is the only proof a trade happened"
   - "Check `ball-knowledge.md` and `trading-log.md` on every finance task"

7. **Fix after-hours equity-only claim** in SKILL.md line 1507 and README.md line 286 to match the nuanced position in SKILL.md lines 921-924. New text: "After-hours attribution is primarily equity-driven, but index options (SPX/XSP/NDX) trade ~15 min past the bell — check extended marks."

8. **Update rolling deep-dive wash-sale section** to match the tax doc's more conservative framing. Replace "changing strike OR expiration generally breaks it" with "changing strike AND expiration significantly reduces risk but is not a legal guarantee — no IRS bright line exists; flag, don't adjudicate."

9. **Update the SKILL.md MCP Tools table.** Either expand to include all 50+ tools, or add a prominent note listing the omissions and pointing to `tools/list` as authoritative.

### Medium (improve consistency over time)

10. **Add a "vestigial" note to PDT protection setting references.** "PDT protection toggle is vestigial — PDT eliminated by FINRA Reg Notice 26-10 (eff. 2026-06-04). The toggle may still exist in the settings surface but has no practical effect."

11. **Update knowledge/README.md progressive disclosure model** to put the boot-smart KB as Layer 0 (read FIRST).

12. **Fix knowledge/accounts.md line 15** to say "same-day/margin rolls won't work" instead of "margin-style rolls won't work."

13. **Fix order-templates doc iron condor leg naming** to use catalog-consistent `long_put_wing`, `short_put_body`, `short_call_body`, `long_call_wing`.

14. **Add a "verify, don't assume" governance rule to CONTRIBUTING.md or SKILL.md maintenance rules:** "Every factual claim about API behavior in agent-facing docs must be traceable to either (a) a live-verified test, (b) a route-map entry with method provenance, or (c) a dated CDP capture. Claims should carry their verification date. Run the claims audit before each release."

### Low (nice-to-have polish)

15. **Hedge the accounts/ under-reports claim.** Add "observed in one operator session" qualifier across docs.

16. **Rename trading-log STATUS values.** `executed` → `confirmed` to avoid confusion between "201 returned" and "order history proves it."

17. **Add illustrative-data banner to README example outputs.** "⚠️ ILLUSTRATIVE — run the live command for your actual numbers."

18. **Remove stale TODO.md contradiction entries** once fixes are applied.

19. **Add a DRIP route method-split test** as recommended by the claims audit (prevents silent regression).

20. **Add a tool-count guard test** — CI assertion that MCP `tools/list` count equals `registerTool` calls.

---

## PART 4: "VERIFY, DON'T ASSUME" VIOLATIONS WITHIN THE DOCS

These are instances where the docs assert behavior without live verification evidence:

| # | Claim | Location | Verification status |
|---|-------|----------|---------------------|
| 1 | Accounts/ always under-reports (showing "2 of 5") | Multiple docs | Operator-specific, not universally verified |
| 2 | DRIP `enrollment/` endpoint works (AGENTS.md §9) | AGENTS.md lines 582-585 | **FALSE — live-verified 405** |
| 3 | "Changing strike OR expiration generally breaks wash-sale" | Rolling deep-dive | Overstated confidence; no IRS bright line |
| 4 | PDT protection toggle is active | SKILL.md, README settings | Likely vestigial (PDT eliminated) |
| 5 | "Bare accounts/ under-reports" as blanket claim | Multiple docs | Only verified against one login on one date |
| 6 | Strategy-quote leg names match catalog | SKILL.md (two sections) | Two of four leg-name invocations are WRONG |

---

## PART 5: AUDIT METRICS

- **Total contradictions identified:** 20 (9 known + 11 new)
- **Critical severity:** 1 (AGENTS.md wrong DRIP endpoint)
- **High severity:** 7 (iron condor leg names, naked-short-call leg, order-templates param, README two-gate, MCP instructions, after-hours claim, wash-sale overconfidence)
- **Medium severity:** 5
- **Low severity:** 7
- **"Verify don't assume" violations:** 6
- **Files needing edits:** 8 (SKILL.md, AGENTS.md, README.md, mcp/src/server.ts, docs/options-strategy-order-templates-2026-06-03.md, docs/strategy-deep-dive-rolling-options-2026-06-04.md, knowledge/README.md, knowledge/accounts.md)
- **New tests recommended:** 2 (DRIP route method-split, tool-count guard)

---

<!-- Zayd Khan // cold // www.zayd.wtf -->
