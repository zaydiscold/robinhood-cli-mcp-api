# TODO — robinhood-cli hardening roadmap

## Execution safeties — checks and balances (added 2026-06-11)

- [x] **`pretrade` gate command** (BUILT 2026-06-11: CLI `pretrade` + MCP `robinhood_pretrade`, PASS/WARN/BLOCK checklist, marketability left as manual gated POST): one shot that runs buying power + options collateral + marketability +
  min-tick + account-capability checks before any order. Routes already mapped (`options/orders/review`,
  `options/orders/marketability/`, `options/orders/collateral/`, `accounts/{account}/options_buying_power`) —
  wire them into one command + MCP tool that emits PASS/BLOCK per check.
- [x] **Post-send evidence verification in code** (BUILT 2026-06-11: `verifyOrderEvidence()` in engine; buy/sell/cancel attach evidence{confirmed,state,id}): after any live send, auto re-read `orders/` /
  `options/orders/` and print the order record (id + state). Failure mode #20 is currently a doc rule;
  make it engine behavior so "order placed" claims are impossible without evidence.
- [ ] **Notional guardrails**: configurable per-order and per-session dollar caps (e.g. `local/guardrails.json`),
  exceeded only with an explicit `--override-cap` flag. The checks-and-balances layer for agentic sends.
- [x] **`panic` command** (BUILT 2026-06-11: CLI `panic` + MCP `robinhood_panic` + `orders open` view; per-cancel gating + evidence): cancel ALL open orders across ALL accounts (double-gated). Kill switch.
- [ ] **`order watch`**: place → poll until filled/rejected/cancelled → report; single command lifecycle.
- [ ] **Payoff in strategy-quote summary**: print max profit / max loss / breakevens on the human output
  (the reviewContract requires them; today the table shows legs + limit but not payoff. Live example:
  GOOGL 340/350 call debit @ $6.37 should print max loss $637 / max profit $363 / breakeven $346.37).

## New surfaces probed live 2026-06-11 (all reads, real auth)

- [x] **`dividends` first-class command** (BUILT 2026-06-11: cadence detection incl weekly, held-only projection, --upcoming/--by-month; MCP robinhood_dividends): `dividends/` is live-verified (102 records: amount, rate,
  ex/record/payable dates, withholding, per-dividend drip_enabled). Build: income by symbol/year,
  upcoming payouts, `--account N`, `--json`. Map entry upgraded to verified fields.
- [x] **`documents` first-class command** (BUILT 2026-06-11: list+download, tax-year aware, 1099 prefix match; MCP robinhood_documents): `documents/` is live-verified (cursor-paginated; types:
  1099, 1099_crypto, 1099r_roth, 5498_roth, account_statement, trade_confirm; `download_url` serves
  the PDF). Build: list + filter by type/year + download-all-1099s. Tax-season one-shot.
- [x] **`margin` health command** (BUILT 2026-06-11: all-account scan, money-object unwrap, plain-English borrow line; MCP robinhood_margin): `margin/{account_number}/investing_info/` live-verified on the api
  host — amount_borrowed, margin_interest_rate, next_billing_date, projected intraday BP. Surface in
  `portfolio` too: an account borrowing on margin should say so.
- [ ] **phoenix.robinhood.com is TLS-walled** (handshake refused, like ceres futures) — the app-only
  unified-balances host. Don't chase it; the per-account composition already covers balances.
- [ ] **Options per-position P&L endpoint still unknown** (web UI shows it) — needs a CDP capture pass
  on the options position page.
- [ ] **Doc contradictions to reconcile (found 2026-06-11, 9 items)**: iron-condor leg names differ
  between SKILL.md sections (catalog JSON ids are authoritative); naked-short-call leg id; after-hours
  options self-contradiction in SKILL.md; wash-sale strictness differs between rolling deep-dive and
  tax doc; SKILL 38 vs TODO 37 tool count; account-mask format inconsistent between two docs; `?account=` vs
  `?account_number=` in order-templates doc; PDT-lifted vs vestigial PDT toggles; "18 strategy
  workflows" vs 20 catalog ids.


## Feature ideas backlog (2026-06-11 pass — beginner through veteran)

- [ ] `order watch` — place → poll → report fill/reject; one-command lifecycle.
- [ ] Notional caps — per-order/per-session dollar ceilings, explicit override flag.
- [ ] `whatif` — Greeks-based scenario calc: spot ±X%, IV ±N pts, T-n days → position P&L in dollars.
- [ ] `calendar` — upcoming events for HELD names: option expirations, ex-div dates (assignment risk on covered calls), earnings.
- [ ] `risk` — portfolio scan: max loss across open positions, assignment exposure, undercovered short legs, margin-call distance.
- [ ] `income` — combined income view: dividends + option premium collected, by month, in dollars.
- [ ] `coach` mode — beginner tier: explain any held position/order in plain English with the math shown (possible revival of the old `explain` idea).
- [ ] Auto-journal nudge — after a fill, prompt a `review note` so film-study notes accumulate at the moment of the trade.
- [ ] `exposure` — concentration by underlying/sector + portfolio-wide net Greeks.

## Watchlist writes — add/remove/create — SHIPPED 2026-06-15

The watchlist surface is now read **+ write**, wired across all three places behind the double gate.
**Correction to the original assumption:** the write endpoint is **`discovery/lists/items/`**, NOT
`midlands/lists/items/` — captured + verified live 2026-06-15 (the `midlands/lists/*` entries are
unrelated read routes). Contract: `POST discovery/lists/items/` with a list-id-keyed batch body
`{ "<list_id>": [ {object_id, object_type, operation: create|delete} ] }`; create = `POST
discovery/lists/` (201); delete-list = `DELETE discovery/lists/{id}/` (204). Full write-up in
`docs/undocumented-surface.md`.

- [x] **Captured the write contract** (CDP network capture, then API-verified add/remove/create/delete).
- [x] **Route map** — added `discovery/lists/items/` POST (`write-mutate`); create/delete-list entries
  already present. Rebuilt + regenerated api-map markdown/openapi/curl.
- [x] **Engine** (`cli/src/lib.ts`) — `resolveInstrumentId`, `resolveWatchlist`, `watchlistMutateItems`,
  `createWatchlist`, `deleteWatchlist` — all through `gatedBrokerageWrite`. No logic in the front doors.
- [x] **CLI** — `watchlist add|remove <list> <SYM...>`, `watchlist create <name>` (thin wrappers).
- [x] **MCP** — `robinhood_watchlist_add|remove|create` (tool count 50 → 53).
- [x] **Test** — `cli/test/watchlist-write.test.ts` (method + URL + body shape); `mcp-tool-count` bumped.
- [x] **Live-verified** — created "Homie index" + "Og handle fund", batched adds, add→remove round-trip
  (all 200/201, readbacks confirmed) + recipes added for the intent router.

## Undocumented route-body audit (2026-06-14)

Audit of `api-map/brokerage-routes.json`: **219 of 310 routes are `fieldsSource: "undocumented"`** (51
verified, 40 inferred). That number is *not* a 219-item backlog — read it correctly:

- **137 are `sensitive-read` GETs** (balances, PII, profile, portfolios). They are **usable today** — you
  call them and read the response; the empty `fields` only means the *response shape* isn't catalogued.
  Optional polish (backfill response fields for nicer typed output), **not** a capability blocker.
- **50 are plain `read`** — same story, usable now.
- **32 are write-tier** (`write-safe`/`write-mutate`/`write-or-sensitive`/`destructive`) — these are the
  ones where a **missing request body = the capability can't be used** (the watchlist-items case). Of
  those 32: ~12 are **already wired** (the engine builds the body even though `fields` is empty: `orders/`
  + cancel, `options/orders/` + cancel, `nummus/orders/` crypto + cancel, account-wide DRIP,
  `recurring_schedules`, `marketability`/`review` via `pretrade`); 5 are **already tracked** below in
  "Live auth needed" (sweep, instrument DRIP, `settings/margin`, slip/stock-lending, options_settings).

### Genuinely untracked write bodies to reverse-engineer (CDP capture → fields + method → rebuild)

- [ ] **Whole-watchlist CRUD** — `POST discovery/lists/` (create a custom list), `DELETE/PATCH
  discovery/lists/{id}/` (delete/rename). Both `destructive`, category `watchlists`, empty fields.
  Natural companion to the items add/remove in the Watchlist-writes section above — capture them in the
  same session.
- [ ] **DRIP enrollment** — `corp_actions/drip/enrollment/{account_number}/` (`write-or-sensitive`,
  empty fields). Distinct from the account-wide `drip/account_settings/` toggle that's already built;
  capture the enroll/unenroll body.
- [ ] **Sweep enroll (alt host)** — `bonfire .../sms/sweep/agree_and_enroll` (`write-mutate`). Same cash-
  sweep capability already tracked via `accounts/{account}/sweep_enrollment_state/`; capture both bodies
  when doing the sweep toggle so we know which host the web app actually uses.

### Explicitly NOT building (so nobody burns time capturing them)

- **Money-movement cluster** — `ach/transfers/`, `ach/relationships/` (+ `/unlink/`), `wire/transfers`,
  `acats/`, `nimbus/v1/asset_transfers`, `crypto-transfers/*`. These move **real cash off-platform**;
  out of scope for a reads+trades tool by default. Revisit ONLY on an explicit decision to add
  deposit/withdrawal automation.
- **Telemetry / cosmetics** — `goku/*` log events, `app-comms/receipt/seen/`, upsell/promo/tooltip/
  onboarding surfaces. No operator value.
- **Sensitive identity writes** — `identi .../user_info/agreements/v2/sign/`, `subscription_fees/`. High
  blast radius, near-zero operator benefit; leave parked.

## Social / showcase layer (parked 2026-06-11 — v2, after core)

- [ ] **Trade cards + success graphics framework**: HTML template framework that renders a trade
  (entry/exit, P&L in dollars, payoff diagram, thread context from trading-log.md) as a shareable
  card image, auto-generated per stock/play on command. For the groupchat + the GitHub readme.
- [ ] **Groupchat trade-share pipeline (pvp.trade angle)**: parse a friend's posted trade screenshot →
  canonical contract spec → dry-run quote in YOUR account with YOUR account-type gating → discuss → gated send.
  pvp.trade does social copy-trading on Hyperliquid; this is the brokerage-grade version: discuss + price +
  verify before any copy. Depends on: broker-call playbook (shipped in knowledge/playbooks/), trade cards above.

## High priority

- [x] **Web app version auto-scrape**: Done 2026-06-11 — `pnpm version:refresh` (`scripts/scrape-web-app-version.mjs`) CDP-attaches to a debug Chrome (port 9222), loads the login page (the SPA shell sends the header pre-auth, no RH login needed), captures `x-robinhood-web-app-version` from the network stream, and writes it to `.env`. Live-verified: captured `2026.24.3589+55c48b8f7a1c`. (Earlier finding: the version is NOT in the homepage HTML — the login-page network capture is the reliable route.)

- [x] **Order status ticker resolution**: ~~`order-status` shows instrument UUID instead of ticker symbol.~~ Done 2026-06-11 — shared `getOrderStatus()` resolves the UUID via `instruments/?ids=`; CLI `order-status` and MCP `robinhood_order_status` both use it.

- [ ] **Options order live test**: The `buy` command was tested live with equity orders. Options orders use a different body schema (legs, strategy, etc.) and need a live test pass to verify `order_form_version` and other fields.

- [x] **ref_id on all orders**: Done 2026-06-11 — `placeEquityOrder()` (shared engine) stamps `ref_id` on every buy/sell from BOTH the CLI and MCP surfaces.

## Medium priority

- [ ] **Summary/dashboard command**: Combine portfolio + bp + top positions into one view. `portfolio` already does most of this; a `summary` alias with different defaults would suffice.

- [ ] **Dollar-value aggregation in positions**: `positions` shows per-account breakdown. Add a `--all` flag that aggregates quantities and values across accounts by symbol.

- [x] **MCP dedup parity**: Done 2026-06-11 — CLI `buy`/`sell` and MCP `robinhood_buy`/`robinhood_sell` now call the SAME `placeEquityOrder()` engine (dedup + `logTrade` + `ref_id` + OTC guard); MCP tools gained the `force` param. Pinned by `cli/test/equity-order.test.ts`.

- [x] **Settings MCP read parity**: Verified 2026-06-11 — MCP `robinhood_settings` `action=show` reads the same DRIP/expiration/PDT/lending/sweep set as CLI `settings show`.

## Low priority

- [ ] **Bonfire endpoint mapping**: ~50 more endpoints on `bonfire.robinhood.com` are observable in the browser but not in our route map. Categories: dividends, tax documents, monthly statements, price alerts, instant deposits, debit card management.

- [ ] **Crypto endpoint live test**: Crypto routes exist in the map and MCP tools exist (`robinhood_crypto_*`) but haven't been tested for live order placement.

- [ ] **Browser CDP capture automation**: The route map was built from manual CDP captures. Automate: log into Robinhood in Chrome, drive through all feature pages, capture XHR requests, diff against existing routes, add new ones.

- [ ] **Order confirmation flow**: The web app shows a confirmation modal before placing orders. Capture that DOM flow for order review/safety patterns.

- [ ] **Per-instrument DRIP settings**: The CLI `settings` command shows account-wide DRIP. Per-instrument DRIP (toggle DRIP on/off per symbol) exists in the route map but no CLI command.

## Documentation

- [ ] **API map changelog**: Track route additions/removals over time so the map's freshness is auditable.
- [x] **MCP tool catalog in SKILL.md**: Done 2026-06-11 — full 37-tool table in SKILL.md §MCP Tools (counts de-hardcoded to "live truth: tools/list").
- [x] **Error code reference**: Done 2026-06-11 — `docs/error-code-reference-2026-06-11.md`, mirroring the `classifyRobinhoodError()` taxonomy one-for-one.

---

## Carried over — June 3, 2026 (from pre-hardening `todo.md`, consolidated at PR #1 merge)

### Auth
- [ ] Fix `pnpm auth:refresh` — can't find Chrome session (headless CDP browser ≠ real Chrome)
- [ ] Alternative: log into robinhood.com in real Chrome, let refresh-auth.sh pick up the token
- [ ] Or: manually copy bearer token from Chrome DevTools → .env

### Route map cleanup
- [x] Remove the 2 agentic GET/PATCH entries — both return 404, endpoint doesn't exist (removed, 307→305 routes)
- [ ] The `agentic_allowed` flag on accounts is a Robinhood server-side property, not toggleable via REST
- [ ] Good news: your own CLI doesn't need agentic_allowed — it trades on any account via web bearer token

### Live auth needed for these verified endpoints (all in api-map, just need working token):
- [x] `margin/{account_number}/investing_info/` — LIVE-VERIFIED 2026-06-11 on the **api host** (200): amount_borrowed, margin_interest_rate, next_billing_date, projected intraday BP. The margin-health read — first-class `margin` command candidate.
- [ ] `margin/{id}/settings/` — margin tier, PDT protection toggle (PUT)
- [x] ~~`margin/{id}/day_trades_card/` — PDT counter~~ — 404 live 2026-06-11; retired with the PDT elimination (FINRA 26-10). Drop from the map's promises.
- [ ] `settings/margin/{account}/` — PDT protection toggle
- [x] `corp_actions/drip/account_settings/{account}/` — GET LIVE-VERIFIED 2026-06-11 (200, `drip_enabled: true`); the PATCH toggle remains untested live.
- [ ] `corp_actions/drip/instrument_settings/{account}/{id}/` — per-stock DRIP (PATCH)
- [ ] `accounts/{account}/sweep_enrollment_state/` — cash sweep toggle (POST)
- [ ] `slip/{account}/status/` — stock lending toggle (PUT). NOTE 2026-06-11: 404 at `api.robinhood.com/slip/{account}/status/` — path/host needs a fresh CDP capture (likely bonfire or a different segment).
- [ ] `options/option_settings/{num}/` — options trading settings (PATCH verified!)
- [ ] `accounts/{account}/options_buying_power` — options buying power. NOTE 2026-06-11: 404 at that path — re-capture the real route from the web order ticket.
- [ ] `options/orders/collateral/` — options collateral pre-check
- [ ] `options/orders/review` — options order review (POST)
- [ ] `options/orders/marketability/` — marketability check (POST)

### Future dashboard ideas
- [ ] Build a `portfolio --deep` command that pulls margin + DRIP + sweep + lending + options settings in one shot
- [ ] Add after-hours tracking (positions endpoint has intraday_quantity, can diff vs yesterday)
- [ ] Map the Kaizen experiments response — shows which features are gated for your account
- [ ] Capture the options P&L endpoint (the web UI shows per-position options P&L, route unknown)
- [ ] Tax-loss harvesting helper (FRCB is $0.01, LWLG bleeding, UI underwater)

### Portfolio snapshot (Jun 3 live)
_Redacted — real account tails and exact balances removed. Pull a live snapshot with `portfolio` /
`accounts` when you need current numbers; don't commit real balances to the repo._

<!-- Zayd Khan // cold // www.zayd.wtf -->
