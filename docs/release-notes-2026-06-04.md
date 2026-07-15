# Release notes — 2026-06-04

## Added

- **Signal-sourcing doctrine** (neutral, descriptive — not risk guidance). Originally encoded in
  `SKILL.md` and now canonical in `knowledge/signals.md`, with `AGENTS.md` §13 and
  the boot KB §1. Core: news = slow but authoritative for key/binary events; Twitter/X + Reddit = best
  signal-to-noise; X = fastest pulse; RH `midlands/news|ratings|tags` = the **slow, broker-native
  confirmer** that trails the off-platform pulse.
- **Ball Knowledge** (`ball-knowledge.md`, repo root) — a living, committed, append-only
  investing-memory ledger (themes, tickers, sources, hunches, preferences). Full rules are now in
  `knowledge/signals.md`; short pointer in `AGENTS.md` §14; wired into the KB §0 boot checklist (step 7).
  Ledger stays messy; the skill carries interpretation (classify by type, minor recency bias, context
  not permission). Seeded generic-only.
- **Order-execution-evidence rule** — brokerage order history is the source of truth; no
  filled/pending/rejected/cancelled record (or position/cash/BP change) ⇒ treat as **non-executed**;
  screenshots/UI/logs are not proof. Now lives in the `SKILL.md` operating contract and
  `knowledge/execution-safety.md`, plus boot KB §1 and a §4 row.
- **`agent-operating-intelligence-2026-06-04.md`** — boot-smart KB (cardinal rule, account/order/
  signal decision frameworks, failure→fix tree, roadmap). `SKILL.md` points to it as boot step 0.
- **Index-options correction** (`index-options-1256-conclusion-2026-06-04.md`) — RH **does** offer
  cash-settled §1256 index options (SPX/SPXW/XSP/NDX/VIX/RUT) under `options/chains/?underlying_symbol=`;
  hidden from the consumer search bar. **`futures-fx-commodities-surface-2026-06-04.md`** — futures
  read-only (ceres TLS-walled), no spot FX, commodities via ETF proxies only.
- **Trading log** (`trading-log.md`, repo root) — append-only execution + **intent** history; logs what
  the agent executes with the *why* and the strategy thread ("what we're rolling from"), so wheel/roll
  state survives beyond raw order history. Instruction-driven (`knowledge/signals.md` + AGENTS §15 +
  KB §0 step 7); status `executed` only if order history confirms (ties to failure-mode #20). Seeded
  with masked `[EXAMPLE]` entries. (Code auto-logger parked as a future idea.)
- **Strategy deep-dives** (`strategy-deep-dive-the-wheel-2026-06-04.md`,
  `strategy-deep-dive-rolling-options-2026-06-04.md`) — advanced multi-perspective study (mechanics,
  Greeks, tax, current practitioner sentiment, decision rules, failure modes) extending the strategy KB,
  each with a **dissertation-level Quant appendix** (BS derivations, N(−d₂) assignment prob, VRP-as-edge,
  the gamma-theta identity, fractional-Kelly sizing; for rolling, the EV inequality for *when a credit-roll
  is just loss deferral*) — cited to Carr-Wu / Bakshi-Kapadia / Bondarenko / PUT-BXM index studies.
- **Institutional outlook layer** (`institutional-outlook-2026-06-04.md`) — major-firm regime view
  (BlackRock/Vanguard/JPM/GS/MS year-ahead + 5–10yr CMAs), synthesized consensus vs divergence + mega
  forces. Added to the **Signal sourcing** doctrine as the slow institutional tier. **All sources framed
  as information on deck — inputs to weigh by reliability, never gospel or permission** (pulse →
  institutional → academic math, all subordinate to live market data + order history).
- **First-class commands:** `options inspect <uuid>` (metadata + Greeks + fills + tax-timing + handoff),
  `options holdings` (all held contracts + UUIDs across accounts), `options strategies` / `options plan`
  (planning consolidated under `options`, `api-map` names kept as aliases), `settings show|drip|
  expiration|pdt|lending|sweep`, and `recurring create|edit|end` — all double-gated; live-verified
  reversibly.

## Fixed / hardened

- **Removed a position spoof** that fabricated holdings in `positions` output.
- **Ambiguous-route guard** — a substring query matching >1 distinct route now throws
  `AmbiguousRouteError` instead of silently picking one (e.g. the destructive cancel route).
- **Account-ownership validation** on `buy` — a typo'd/unowned account is refused; resolved nickname echoed.
- **Gate verb-floor** — a write verb engages the double gate even if a route's risk is mis-classified;
  plus a map-integrity test asserting write-verb routes carry write-class risk.
- **In-engine 429 retry** + `classifyRobinhoodError()` taxonomy; null/NaN/stale-collar guards on `buy`;
  `tradeability`→`tradability` OTC-guard fix; route-table renderer crash guard.
- **Shared-engine dedup** — `selectRouteByQueryAndMethod`, `brokerageGetJson`, `tryBrokerageGetJson`
  hoisted to `cli/src/lib.ts` (CLI + MCP import one copy). MCP write resolver fails closed.
- **README** position examples fabricated (privacy); real-money capability warning added atop
  `AGENTS.md`/`SKILL.md`.

## Tests
26 → 34 passing (collar sanity, route selection + ambiguity, error taxonomy + 429 retry, verb-floor,
map-integrity).

<!-- Zayd Khan // cold // www.zayd.wtf -->
