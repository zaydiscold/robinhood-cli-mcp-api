# Evidence-Backed Claims Audit — 2026-06-11

Sweep of execution-affecting capability claims in `README.md`, `SKILL.md`, `AGENTS.md`,
`knowledge/*.md`, `knowledge/playbooks/*.md`, `docs/error-code-reference-2026-06-11.md`,
`docs/agent-operating-intelligence-2026-06-04.md`, and `mcp/README.md`, verified against ground truth
in `cli/src/lib.ts`, `cli/src/index.ts`, `mcp/src/server.ts`, `api-map/brokerage-routes.json`,
`api-map/recipes.json`, and `cli/test/*`.

Context: a prior pass found a real lie (docs claimed the shared engine auto-limits OTC orders at the
ask/bid, but the engine had no OTC handling — it only lived in `scripts/equity-buy.mjs`). That is now
**fixed in the engine AND regression-tested** (see row OTC-1). This pass hunts for every other instance.

## Summary

- **Verified: 30** · **Fixed: 4** · **Removed: 0** · **Could-not-verify: 3**
- Build: `tsc` clean (0 errors). Tests: **205 passed / 12 files** (docs-only edits, nothing broke).

### Worst findings first

1. **MCP tool count was stale in THREE docs and inconsistent across them** — SKILL said `48`,
   AGENTS said `38` (twice), README said `40+`. Live `tools/list` and the source both register **50**.
   A wrong hard count is the kind of rot that makes an agent distrust the live check. FIXED (SKILL 50,
   AGENTS 50×2). README's `40+` left as-is (hedged + true). (`mcp/src/server.ts`: 50 `registerTool`;
   live `tools/list` = 50.)
2. **SKILL still called the DRIP write "unproven / research"** (failure-mode/live-write section), which
   was true for the OLD `drip/enrollment/` endpoint (GET-only, 405) but STALE for the real wired write
   `PATCH corp_actions/drip/account_settings/{account_number}/`. That write is now a first-class command
   (`settings drip`), has a PATCH route in the map, and is marked PROVEN in the capability map. FIXED.
3. **DRIP route is a method-split DOUBLE entry** (GET at one index, PATCH at another, same URL). This is
   correct and resolves via `selectRouteByQueryAndMethod`, but it is NOT pinned by any test — a future
   map edit that drops the PATCH entry would silently break `settings drip` with a fail-closed "no route"
   error and no test would catch it. VERIFIED-but-fragile (see recommended tests).
4. **No fewer than 12 registered MCP tools are absent from the SKILL MCP-tools table** (`robinhood_dividends`,
   `_documents`, `_hotlist`, `_knowledge`, `_margin`, `_options_close`, `_orders_open`, `_panic`,
   `_pretrade`, `_review`, `_review_note`, `_roll_ledger`). Not a false claim, but it is the mechanical
   cause of the count drift. COULD-NOT-VERIFY-as-complete (flagged; not auto-expanded to preserve voice).

---

## Claim table

### Order construction / engine behaviors (highest money-risk)

| # | Claim | Location (file:line) | Verdict | Evidence (file:line / output) | Action |
|---|-------|----------------------|---------|-------------------------------|--------|
| OTC-1 | Shared engine auto-limits OTC orders at the marketable side (buy=ask, sell=bid), whole shares only, gfd | SKILL.md:~447, README.md:44, AGENTS.md:271, docs/agent-operating-intelligence:248 | VERIFIED (was the prior lie; now real + tested) | `lib.ts:2599-2617` (auto-limit buy=ask/sell=bid, gfd, fallback to last); `equity-order.test.ts:136-163` pins ask/bid/gfd/fallback/explicit-untouched | none |
| ENG-2 | Dollar/fractional order on a non-`tradable` name is rejected in BOTH directions (failure mode #4) | SKILL.md:#4, error-code-ref:31 | VERIFIED | `lib.ts:2580-2584`; test `equity-order.test.ts:112-134` | none |
| ENG-3 | OTC names trade WHOLE shares only | SKILL.md (capability catalog) | VERIFIED | `lib.ts:2595-2597`; test `equity-order.test.ts:165-171` | none |
| ENG-4 | Dedup: pending same-side order on instrument+account inside a 5-min window blocks; `--force`/`force:true` skips; stale (>5 min) never blocks | SKILL.md (engine bullet), error-code-ref:28 | VERIFIED | `lib.ts:2492 DEDUP_WINDOW_MS=300_000`, `2499-2507 filterRecentPending`, `2624-2643` | none |
| ENG-5 | `ref_id` idempotency — a 429 retries the SAME ref_id (nothing was placed) | SKILL.md, error-code-ref:13 | VERIFIED | `lib.ts:2646 refId`, `2662 ref_id: refId`; classify `1946` rate_limited hint says retry same ref_id | none |
| ENG-6 | Dead-quote hard-fail (never qty=Infinity) | SKILL.md, agent-op-intel | VERIFIED | `lib.ts:2588-2589`; test `equity-order.test.ts:173` | none |
| ENG-7 | Equity orders carry `order_form_version: 7` + web headers; `ROBINHOOD_WEB_APP_VERSION` overridable | SKILL.md:#5, error-code-ref:18 | VERIFIED | `lib.ts:2661 order_form_version:"7"`, `2022 x-robinhood-web-app-version` reads env | none |
| ENG-8 | Min-tick / below_tick handling (ARKG $0.05 trap; reads `options/chains/{id}` min_ticks) | SKILL.md:#8, error-code-ref:16 | VERIFIED | `lib.ts:3192-3198` (pretrade min-tick check), `3379-3384` (mid limit tick-round) | none |
| ENG-9 | Post-send evidence re-read — a lone 201 is not proof; re-read order history or warn UNCONFIRMED (failure mode #20) | SKILL.md:#20, README:wheel/proof, agent-op-intel | VERIFIED | `lib.ts:2687-2703 verifyOrderEvidence`, `2763`; test `evidence-panic-pretrade-close.test.ts:25-55,97` asserts `EVIDENCE UNCONFIRMED` | none |
| ENG-10 | Universal live-write log — every live write (orders/cancels/settings/recurring/raw execute) from CLI+MCP logs to a machine ledger | SKILL.md (MCP), AGENTS | VERIFIED | `lib.ts:2448-2466 gatedBrokerageWrite` logs to `local/trading-log.jsonl`; equity skips (own richer entry) `2648,2673-2685` | none |
| ENG-11 | Ask-collar on shares/OTC-limit orders; stale-collar sanity check | SKILL.md (live-write), AGENTS | VERIFIED | `lib.ts:5112-5122 collarSanity` | none |

### Gating / routing / safety

| # | Claim | Location | Verdict | Evidence | Action |
|---|-------|----------|---------|----------|--------|
| GATE-1 | Double-gate: live write needs `--live-write`/`liveWrite:true` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1`; either alone = dry-run | SKILL.md (many), README, AGENTS, mcp/README | VERIFIED | `lib.ts:1766-1807 resolveLiveWriteGate` (all 3 forced-dry-run branches) | none |
| GATE-2 | Verb floor: a write verb engages the gate even if the route risk is mis-classified as read | SKILL.md (#12 fail-closed), AGENTS | VERIFIED | `lib.ts:1775-1780 methodIsWrite \|\| riskIsWrite` | none |
| GATE-3 | Fail-closed resolver: a forced POST/PATCH/PUT/DELETE with no matching write route returns no-match, never degrades to GET | SKILL.md:#12, AGENTS | VERIFIED | `lib.ts:1718-1741 selectRouteByQueryAndMethod` (line 1733 returns undefined on write w/ no method match); `gatedBrokerageWrite:2439-2443` throws "fails closed"; tests `route-resolver.test.ts` (15) | none |
| GATE-4 | Fail-loud on ambiguity: a substring query matching >1 distinct URL throws AmbiguousRouteError | SKILL.md (route gotchas), AGENTS | VERIFIED | `lib.ts:1738-1739` | none |
| GATE-5 | Account-token aliasing: legacy `{num}`/`{account}`/`{n}`/`{acct}` resolve to `{account_number}` for match+substitution | SKILL.md (route gotchas #6) | VERIFIED | `lib.ts:591-615 ACCOUNT_TOKEN_ALIASES`, `canonicalToken`, `resolveParamValue` | none |
| GATE-6 | `dryRun:true` always wins in MCP even with both gates | SKILL.md (MCP safety), mcp/README | VERIFIED | `lib.ts:1781 if (input.dryRun ...) return allowed:true,forcedDryRun:false`; `gatedBrokerageWrite:2445 effectiveDryRun = dryRun || forcedDryRun` | none |

### Counts / routes (numbers that rot)

| # | Claim | Location | Verdict | Evidence | Action |
|---|-------|----------|---------|----------|--------|
| CNT-1 | MCP exposes 48 tools | SKILL.md:1255,1257 | FIXED → 50 | `server.ts` 50 `registerTool`; live `tools/list` = 50 | edited SKILL 1255+1257 to 50 |
| CNT-2 | MCP exposes 38 tools | AGENTS.md:61,617 | FIXED → 50 | same as CNT-1 | edited AGENTS 61+617 to 50 |
| CNT-3 | MCP exposes 40+ tools (hedged, "trust live tools/list") | README.md:45,283 | VERIFIED (true: 50 ≥ 40, properly hedged) | live `tools/list` = 50 | none (kept) |
| CNT-4 | mcp/README defers tool list to live `tools/list` (no hard count) | mcp/README.md:7,15 | VERIFIED (no rot — explicitly says counts rot, query the server) | mcp/README.md:7 | none |
| CNT-5 | Route map ~300 and growing; trust the live `brokerage routes --json` count, never assert a hardcoded figure | SKILL.md:381,423,1500; AGENTS:42 | VERIFIED (correctly hedged; live count = 310) | `brokerage routes --json` → 310 | none |
| CNT-6 | SKILL MCP-tools table is the full tool list | SKILL.md:1267-1310 | COULD-NOT-VERIFY-as-complete | 12 registered tools missing from the table (see Worst #4) — table is a subset, not false | flagged, not auto-expanded (preserve voice) |

### Route / endpoint provenance

| # | Claim | Location | Verdict | Evidence | Action |
|---|-------|----------|---------|----------|--------|
| RT-1 | DRIP write is `PATCH corp_actions/drip/account_settings/{account_number}/` (+ per-instrument), `{"drip_enabled":bool}`; old `enrollment/` is GET-only/405 | SKILL.md:#10, capability-map:29 | VERIFIED + FIXED stale "unproven" wording | route map: GET entry `brokerage-routes.json:8191`, PATCH entry `8383`; cmd `index.ts:1095-1110` PATCHes it; capability-map:29 "write PROVEN" | edited SKILL live-write DRIP bullet (was: "DRIP ... remain unproven") |
| RT-2 | `POST options/orders/` exists in the map | SKILL.md, AGENTS recipes | VERIFIED | `brokerage-routes.json` has `['POST'] options/orders/` | none |
| RT-3 | `recurring create/edit/end` are first-class commands; create/edit body shape vs live API is research-only | SKILL.md:427,453; README:44 | VERIFIED (commands exist + wired; SKILL hedge on body shape is legitimate) | `index.ts:980 create`,`1013 edit`,`1035 end` → `gatedBrokerageWrite` to `bonfire.robinhood.com/recurring_schedules/` (`835-836`) | none |
| RT-4 | `settings` group: drip/expiration/pdt/lending/sweep subcommands | SKILL.md:1304, README:44,86,235 | VERIFIED | `index.ts:1095 drip,1114 expiration,1129 pdt,1144 lending,1159 sweep` | none |
| RT-5 | DRIP/sweep/lending writes "several verified live" | README.md:86,495 | VERIFIED (consistent w/ capability-map: DRIP PROVEN; others flagged research there) | capability-map-2026-06-03.md:29 | none |

### Command / tool name + alias claims

| # | Claim | Location | Verdict | Evidence | Action |
|---|-------|----------|---------|----------|--------|
| CMD-1 | `portfolio` (aliases `pnl`,`snapshot`) — one-call day Δ + after-hours Δ by underlying in dollars | SKILL.md (playbook), README:44 | VERIFIED | `index.ts:2761 .command("portfolio").aliases(["pnl","snapshot"])`; engine `lib.ts:2178-2329` (AH = ext−equity, day = equity−adjusted_prev_close) | none |
| CMD-2 | `robinhood_buy`/`robinhood_sell` run the SAME shared engine as CLI buy/sell (verb parity, no drift) | SKILL.md (MCP), README:45,283 | VERIFIED | both call `placeEquityOrder` — CLI `index.ts:706`, MCP `server.ts:917,947` | none |
| CMD-3 | `panic` / `orders open` (`robinhood_orders_open`/`robinhood_panic`) — enumerate + cancel every open order, each double-gated | SKILL.md, README, AGENTS | VERIFIED | `index.ts:3363 panic`; `server.ts:985 orders_open,panic`; `lib.ts:2987-3023 panicCancelAll` | none |
| CMD-4 | `wheel`/`robinhood_wheel` — evidence-based stage from live positions, next-leg dry-run command | SKILL.md, README:45,283 | VERIFIED | `index.ts:3460 wheel`; `lib.ts:3481 classifyWheelStage`; test `wheel.test.ts` (13) | none |
| CMD-5 | `recipes`/`robinhood_recipes` — intent → the one command; after-hours intent routes to `portfolio --after-hours` | SKILL.md, README | VERIFIED | `recipes.json` id `down-today` → `portfolio --after-hours` / `robinhood_portfolio`; `lib.ts:768 loadRecipes` | none |

### Analytics engine claims

| # | Claim | Location | Verdict | Evidence | Action |
|---|-------|----------|---------|----------|--------|
| AN-1 | Session-coherent portfolio attribution: AH = `extended_hours_equity − equity` (NOT − prev_close); day = `equity − adjusted_equity_previous_close` (per-account `equity_previous_close` is "0") | SKILL.md (loss attribution), README | VERIFIED | `lib.ts:2178-2182,2229-2230` | none |
| AN-2 | Dividend cadence detection — median (not mean) payable-date gap classifies weekly/monthly/quarterly/etc., in-engine | SKILL.md (dividends), AGENTS | VERIFIED | `lib.ts:3729-3758 detectDividendCadence` (median); test `dividends-documents-margin.test.ts` | none |
| AN-3 | Held-only dividend projection — projects only symbols still held (cross-checked vs nonzero positions); sold payers listed, not counted | SKILL.md, AGENTS | VERIFIED | `lib.ts:3891-3906` | none |
| AN-4 | FIFO round-trip pairing — entries→exits FIFO per account+instrument, dollar realized P&L, holdDays, win/loss; notes attach by ref | SKILL.md (review), AGENTS | VERIFIED | `lib.ts:4263-4430` (FIFO consume, 8dp rounding); test `review-hotlist.test.ts` | none |
| AN-5 | Kosher-roll ledger — pending cash-account roll intent persists to `rolls.md`; add/done across sessions; misses fail loud | SKILL.md (rolling), knowledge/rolling.md | VERIFIED | `lib.ts:4709-4872 ROLLS_FILE="rolls.md", parsePendingRolls, addPendingRoll, completeRoll`; test `knowledge-rolls.test.ts` (11) | none |

### Could-not-verify (operator-specific / out of code scope)

| # | Claim | Location | Verdict | Note |
|---|-------|----------|---------|------|
| CNV-1 | Bulk `accounts/` under-reports "2 of 5" owned accounts | SKILL.md:270, README:129 | COULD-NOT-VERIFY | Live, operator-specific account-graph observation; not a code claim and not checkable without account reads. The mechanism (fall back to `transfer/accounts/` + per-account reads) is real; the exact "2 of 5" is the operator's environment. |
| CNV-2 | DRIP write PROVEN "browser-captured 2026-06-03" | capability-map:29 | COULD-NOT-VERIFY (provenance) | Out of the audited capability-claim scope (research doc), but it is the source RT-1/RT-5 lean on. The route+command are wired; the live-capture provenance itself was not re-verified this pass (no live write permitted). |
| CNV-3 | SKILL MCP-tools table completeness | SKILL.md:1267-1310 | COULD-NOT-VERIFY-as-complete | Table omits 12 registered tools (Worst #4). Subset, not false. |

---

## Files edited

- `SKILL.md` — tool count 48→50 (lines 1255, 1257); DRIP live-write bullet rewritten from "remain
  unproven / research" to point at the real wired `account_settings`/`instrument_settings` PATCH write
  (`settings drip`), narrowing "unproven" to cash-sweep/stock-lending/margin only.
- `AGENTS.md` — tool count 38→50 (lines 61 and 617).
- `docs/claims-audit-2026-06-11.md` — this file (new).

No prose, banners, the README SYSTEM MESSAGE block, the referral block, jokes, or signatures were
touched. All edits are factual count/wiring corrections.

## Recommended test additions (to pin behavior so it can't silently regress)

Critical (catch the next "doc claims a wired feature that isn't"):

1. **DRIP route method-split** — a `route-resolver` test asserting
   `selectRouteByQueryAndMethod(matches, "https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/", "PATCH")`
   returns the **PATCH (write-mutate)** entry, and `"GET"` returns the GET entry. The map currently
   carries two same-URL entries; dropping the PATCH one would silently break `settings drip` with a
   fail-closed error and no test would notice. (Pairs with RT-1 / Worst #3.)
2. **Tool-count guard** — a tiny test (or CI assertion) that the MCP `tools/list` count equals the number
   of `registerTool` calls, and optionally that every tool named in the SKILL table is registered. This is
   exactly the rot that produced 38/40+/48-vs-actual-50. (Pairs with CNT-1/2/6.)

Nice-to-have:

3. **Universal-write-log** — assert `gatedBrokerageWrite` with a non-equity write + `effectiveDryRun=false`
   appends a `kind:"live-write"` entry, and that a dry-run does NOT (pins ENG-10).
4. **`settings drip` command wiring** — a command-level test that `settings drip --enable --account X`
   (dry-run) issues a PATCH with body `{"drip_enabled":true}` to the account_settings URL (pins RT-1 +
   RT-4 end-to-end through the resolver).
