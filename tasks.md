# tasks.md — the single consolidated grind list
<!-- Zayd Khan // cold // www.zayd.wtf -->
Consolidated 2026-06-11. ONE list to grind line by line. Supersedes local/tasks.md's OPEN section
(personal notes stay in local/). TODO.md keeps the long-form context/history for these items.

## Now (highest value)
- [ ] Evidence-backed claims audit: sweep SKILL/AGENTS/README/knowledge for execution-affecting claims, verify each against code, fix + write docs/claims-audit report (the OTC doc-vs-code bug proves why)
- [ ] Options order LIVE test through the first-class path (far-from-market limit, place -> evidence -> cancel) — last unchecked high-priority core item
- [ ] Payoff lines (max profit / max loss / breakevens) in `options strategy-quote` human output
- [ ] Notional guardrails (per-order/per-session $ caps, explicit override flag)
- [ ] `order watch` (place -> poll -> report fill/reject)

## CDP crawl session (needs your logged-in Chrome on :9222)
- [ ] Capture during a LIVE OPTIONS order placement (full request flow, enrich map)
- [ ] Capture during a LIVE SHARES order placement
- [ ] Account management surface: open/close/RENAME accounts (goal: designate an empty account as the dividend account)
- [ ] Deposits / transfers / withdrawals write bodies (read routes mapped; writes need fresh capture)
- [ ] Options per-position P&L endpoint (web UI shows it; route unknown)
- [ ] Margin page full endpoint sweep; documents page; price alerts; ~50 unmapped bonfire endpoints
- [ ] Re-capture: `slip/{account}/status/` real path (404 at api host) + `accounts/{account}/options_buying_power` real path (404)
- [ ] Triage the ~200 subfinder subdomains (enumerated, unexplored)
- [ ] Upgrade the DOM-extraction/capture tool into a proper crawler (page -> enumerated links -> API map candidates)

## Probes / mapping (no browser needed)
- [ ] portfolios/historicals/{account}/ (performance windows: YTD/1w/1m/1y/5y) -> first-class `performance` command candidate
- [ ] ACH relationships + transfers READ surface; sweeps interest history; retirement contributions; minerva transactions
- [ ] Reconcile the 9 doc contradictions (iron-condor leg names, AH options self-contradiction, wash-sale strictness, masks, `?account=` vs `?account_number=`, vestigial PDT, 18 vs 20 workflows)
- [ ] Agent-driven full route re-verification pass (operator: "go back over the entire route eventually, iron out bits and pieces")

## Engine / CLI polish
- [ ] `summary` dashboard alias; `positions --all` cross-account aggregation
- [ ] Per-instrument DRIP CLI command (route mapped)
- [ ] Helper-dedup remainder (3 duplicate defs in mcp/src/server.ts, 1 in cli/src/index.ts)
- [ ] Fix `pnpm auth:refresh` (can't find real Chrome session)
- [ ] Crypto order live test (separate auth)
- [ ] Kosher-roll ledger v2: auto-record pending roll when the close leg goes LIVE through the engine (today: prefilled `roll-ledger add` command from roll-plan)
- [ ] API map changelog (auditable freshness)
- [ ] Export command (T9) / IPO surface (T11) / CLI-MCP parity audit (T12) / global CLAUDE.md Twitter line (T14) — carried from local
- [ ] local/ restructure decision: keep local/ strictly personal (thesis, private captures); project work lives here
- [ ] GitHub SEO remainder (topics, social preview)

## Backlog additions (2026-06-13 pass)
Scoped from the 2026-06-13 ideas.md expansion. Unchecked, additive; existing tasks untouched.

### Beginner empowerment
- [ ] `coach explain <position|order>` command (cli/src/index.ts + new lib/coach.ts) — plain-English position/order breakdown with dollar math; pulls live positions + marketdata + knowledge/greeks.md; read-only. MCP twin `robinhood_coach`.
- [ ] `define <greek|term>` command — per-position dollar-denominated Greek/term explainer off live marketdata + knowledge/greeks.md; no new surface.
- [ ] `learn` guided first-trade walkthrough (cli/src/index.ts) — stepped dry-run-only order builder, narrates each field, gates stay on; reuses placeEquityOrder/options dry-run path.
- [ ] `sandbox` paper-trade mode — local JSON ledger of make-believe orders vs live quotes, fake P&L in dollars; never touches account. New lib/sandbox.ts + sandbox-ledger.json (gitignored).
- [ ] Ship knowledge/ glossary as `glossary` command + MCP resource (mcp/src/server.ts resources) — depends on MCP-resources task below.

### Pro / aggressive
- [ ] `ticket` multi-leg fast builder (cli/src/index.ts + lib reusing strategy-quote) — one-line strikes → auto-enumerate UUIDs → dry-run quote + payoff → gate-ready body. No new surface.
- [ ] `scan spreads <SYM>` vertical scanner — rank strike pairs by credit-per-width/breakeven/net-Greeks in dollars; loops existing options chain reads. No new surface.
- [ ] `pinradar` near-expiry assignment radar (cli + MCP) — short legs within N days: distance-to-strike in dollars, ITM/OTM, ex-div-before-expiry flag. Uses options positions + marketdata. No new surface.
- [ ] `delta target` strike resolver — name target delta → nearest chain strike → dry-run. No new surface.
- [ ] `ladder` strike/expiry ladder builder + quoter — one command, each rung dry-run-quoted. Builds on `ticket`.
- [ ] `ivrank <SYM>` / `termstructure <SYM>` — needs CDP/probe capture of a historical IV series endpoint (surface mapping); ship snapshot-only version (current-chain IVs) first.
- [ ] `0dte` guardrail wrapper — same-day-close reminder + gamma/theta-cliff dollar flag + refuse silent overnight roll. Layer over options order path in lib.

### Risk & safety
- [ ] `risk` portfolio risk scan (cli/src/index.ts + lib/risk.ts; MCP `robinhood_risk`) — portfolio max loss, assignment exposure, undercovered shorts, margin-call distance, expiry clusters, all in dollars. Composes positions + options + marketdata + buying-power.
- [ ] `exposure` concentration + portfolio net Greeks in dollars (cli + MCP) — by underlying/sector; reuses risk.ts joins.
- [ ] Notional guardrails in the shared order engine (placeEquityOrder + options order path in cli/src/lib.ts) — per-order & per-session $ caps + `--override`; scale suggestion to buying power. (Overlaps existing "Notional guardrails" Now item — fold together.)
- [ ] Scaled confirmation friction — re-typed account+symbol+side+qty+price confirmation above a $ threshold; in the confirmation-contract path (lib + MCP gate).
- [ ] `circuit breaker` session kill-switch — refuse opens after a user-set realized-day-loss $ threshold; reads/closes allowed; state in a local session file. Hooks the order engine.

### Income & tax
- [ ] `income` combined dividends + premium-collected view (cli + MCP `robinhood_income`) — by day/wk/mo/qtr/yr in dollars; joins dividends engine + options fills (premium = sell-to-open credits).
- [ ] `harvest` TLH candidate finder mapped to live lots (cli + MCP) — rank unrealized losers by harvestable $, flag 61-day wash window, suggest correlated replacements; wires knowledge/tax-loss-harvesting.md. Needs per-lot cost basis read (verify positions/lots route; may need surface mapping).
- [ ] `washradar` wash-sale scan — buys within 30d of a realized loss (or pending sell that trips it), $ disallowed; off history + open lots.
- [ ] `taxplan` year-end mode — realized YTD gain/loss, harvestable losses, §1256 positions, suggested December actions (dry-run). Depends on `harvest` + documents/tax engine.

### Research & memory
- [ ] `calendar` held-name events command (cli + MCP) — expirations + ex-div + earnings for held names; drives the morning brief. Uses options positions + marketdata/earnings/ + corp-actions reads.
- [ ] `brief signals` digest — RH midlands news/ratings/tags for held+hotlist, labeled by sourcing ladder; confirmer-layer. Reads only.
- [ ] `thesis track` — ball-knowledge ticker theses joined to live position/P&L in dollars; append-only notes. Reads ball-knowledge.md + positions.
- [ ] `review tape <SYM>` — join round-trips + trade-notes + ball-knowledge thesis into one per-name retro in dollars. Extends existing `review`.
- [ ] Auto-journal nudge after live fills — prompt `review note` at the evidence step (post-send path in lib + MCP). (Already in ideas; small wiring task.)

### Automation & scheduled
- [ ] `brief` morning command (cli + MCP `robinhood_brief`) — day-delta + pending rolls + today's calendar + hotlist movers in dollars. Composes portfolio + roll-ledger + `calendar` + hotlist.
- [ ] `recap` end-of-day command — fills, day P&L by underlying in dollars, tomorrow's expirations, journaling nudge. Composes history + portfolio + `calendar`.
- [ ] Pending-roll Monday reminder — surface staged kosher rolls from roll-ledger needing the second (open) leg; recheck settled cash + fresh bid/ask. Extends roll-ledger; ties to scheduled-tasks if available.
- [ ] Recurring-buy intelligence — flag recurring schedules that outpace buying power; sizing suggestion in dollars. Extends `recurring` read.
- [ ] `watch <SYM> <trigger>` — local polling watch-and-alert on $/level/option-mark crossings; native RH alerts need surface mapping (CDP capture of bonfire alert endpoints) for the non-polling version.
- [ ] Scheduled health-scan log — daily `risk`/`exposure` snapshot appended to a local log for drift tracking. Depends on `risk`/`exposure`.

### Platform / reach
- [ ] Multi-account roll-ups — `--all-accounts` variants of risk/exposure/income/brief with per-account dollar breakdown. Generalizes existing cross-account positions/wheel.
- [ ] Export/reporting expansion (`export` command) — CSV/JSON for positions, fills, income, realized P&L (tax-ready) + printable monthly statement. Builds on documents engine. (Overlaps carried T9 export task — fold.)
- [ ] MCP hardening (Tier 1 — see ideas.md 2026-06-19) — brand the ~26 bare `z.string()` inputs (account/symbol/uuid) with regex/`.uuid()` schemas; return input-validation failures as `isError` (SEP-1303); uniform error shape across the ~29 throw sites.
- [ ] MCP docs — generate `mcp/README.md` from `tools/list` (currently a 17-line stub) + a CI drift check.
- [ ] MCP package tests — in-memory boot asserting `tools/list` count + every write tool carries `destructiveHint:true`/`readOnlyHint:false` + a dry-run write returns `executed:false`.
- [ ] `structuredContent` + `outputSchema` on the top read tools (portfolio/positions/buying_power/quote/accounts) — return BOTH `content` + `structuredContent` (Cursor rejects declare-but-omit); roll out tool-by-tool.
- [ ] MCP resources for knowledge library (mcp/src/server.ts) — expose knowledge/*.md (+ glossary) as MCP resources alongside the existing robinhood_knowledge tool. (Tier 2 — after the hardening items above.)
- [ ] Trade-card / success-graphic generator — evidence-backed HTML render of a completed round-trip (entry/exit, $ P&L, payoff diagram, thread). Driven off `review` round-trip join.
