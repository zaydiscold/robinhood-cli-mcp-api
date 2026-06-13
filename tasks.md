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
