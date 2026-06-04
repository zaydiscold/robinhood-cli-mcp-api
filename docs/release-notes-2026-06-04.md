# Release notes — 2026-06-04

## Added

- **Signal-sourcing doctrine** (neutral, descriptive — not risk guidance). Encoded in `SKILL.md`
  ("Signal sourcing" + re-weighted "Sentiment / discovery" + deep-link sections), `AGENTS.md` §13, and
  the boot KB §1. Core: news = slow but authoritative for key/binary events; Twitter/X + Reddit = best
  signal-to-noise; X = fastest pulse; RH `midlands/news|ratings|tags` = the **slow, broker-native
  confirmer** that trails the off-platform pulse.
- **Ball Knowledge** (`ball-knowledge.md`, repo root) — a living, committed, append-only
  investing-memory ledger (themes, tickers, sources, hunches, preferences). Full rules in `SKILL.md`
  "Ball Knowledge"; short pointer in `AGENTS.md` §14; wired into the KB §0 boot checklist (step 7).
  Ledger stays messy; the skill carries interpretation (classify by type, minor recency bias, context
  not permission). Seeded generic-only.
- **Order-execution-evidence rule** — brokerage order history is the source of truth; no
  filled/pending/rejected/cancelled record (or position/cash/BP change) ⇒ treat as **non-executed**;
  screenshots/UI/logs are not proof. Lives in `SKILL.md` failure mode #20 + boot KB §1 + a §4 row.
- **`agent-operating-intelligence-2026-06-04.md`** — boot-smart KB (cardinal rule, account/order/
  signal decision frameworks, failure→fix tree, roadmap). `SKILL.md` points to it as boot step 0.
- **Index-options correction** (`index-options-1256-conclusion-2026-06-04.md`) — RH **does** offer
  cash-settled §1256 index options (SPX/SPXW/XSP/NDX/VIX/RUT) under `options/chains/?underlying_symbol=`;
  hidden from the consumer search bar. **`futures-fx-commodities-surface-2026-06-04.md`** — futures
  read-only (ceres TLS-walled), no spot FX, commodities via ETF proxies only.
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
