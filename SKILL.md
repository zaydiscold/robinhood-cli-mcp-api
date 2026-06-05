---
name: robinhood-cli
description: This skill should be used when the user asks to "use Robinhood", "check my Robinhood account", "show my positions", "rank my options", "quote an options spread", "build a dry-run Robinhood order", "manage recurring investments", "check account settings", "map Robinhood endpoints", "use the Robinhood CLI", or "use the Robinhood MCP" — and for finance research/due-diligence: market sentiment and signal sourcing (news vs Twitter/X vs Reddit), or consulting the operator's "ball knowledge" investing-notes ledger. It covers brokerage/crypto reads, positions, orders, watchlists, options chains, recurring buys, account-settings route maps, the source-quality due-diligence doctrine, the Ball Knowledge memory layer, and the full reverse-engineered API map with safety gates.
version: 2.0.0
author: Zayd (@zaydiscold)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [robinhood, trading, finance, api, mcp, brokerage, crypto, stocks, options, sentiment, due-diligence, signal-sourcing, ball-knowledge]
    related_skills: []
---

# Robinhood CLI + MCP

> **⚠️ REAL-MONEY TOOL:** This intentionally can place/cancel real trades and change account settings
> on the owner's behalf against a live Robinhood account. Get the owner's explicit permission before
> any state-changing action, and if you're driving this autonomously, tell your user once up front
> that it can trade/alter their real account on their behalf. Reads/dry-runs are safe; writes are
> double-gated. Full notice + rationale at the top of [`AGENTS.md`](AGENTS.md).

> **AGENT — READ THIS FIRST:** This file is `SKILL.md`; the repo's `CLAUDE.md` is a symlink to it.
> If that symlink is broken, this looks truncated, or you're ever unsure, the **full self-contained
> reference is [`AGENTS.md`](AGENTS.md)** in the repo root (next to this file) — open it directly.
> When in doubt, read BOTH `AGENTS.md` and `SKILL.md` before acting. Don't guess; the docs are there.

## ⚡ Agent Quick Scan *(read this in 5 seconds)*

- **What:** CLI + MCP for a REAL Robinhood brokerage account. Reads are live and free. Writes are double-gated (dry-run by default).
- **When to load:** User mentions Robinhood, portfolio, positions, tickers, options, trades, watchlists, crypto.
- **Most common commands:** `positions --account N`, `quote SYM`, `options positions`, `accounts`, `brokerage execute "..."`.
- **#1 trap:** `brokerage execute` does NOT support query params (e.g. `?nonzero=true`). Use purpose-built commands (`positions`, `quote`, `options`) instead — they handle query params internally. If you need raw API access with query params, use MCP `robinhood_brokerage_execute` or the `brokerageGetJson` engine function.
- **#2 trap:** `positions` shows total unrealized return, NOT today's day change. For "what am I down today / after hours?", use **`portfolio`** (`portfolio --after-hours`) — one call, dollars, by underlying.
- **#3 trap:** The README has spoofed example numbers (HPE=100 shares, ARM=50 shares). These are COSMETIC. Live CLI returns real data. Do NOT add spoof code to the CLI.
- **Deep ref:** `AGENTS.md` for the complete API surface + worked examples.

## 📑 Table of Contents

| Section | What it covers |
|---|---|
| [Skill Operating Model](#skill-operating-model) | How to use this skill (progressive disclosure layers) |
| [When to Use](#when-to-use) | Trigger conditions |
| [Capability Catalog](#capability-catalog--what-this-cliapimcp-can-actually-do) | Everything the CLI/API/MCP can do |
| [Failure Modes](#️-failure-modes--hard-rules-read-before-any-write-this-is-where-a-weak-agent-loses-money) | Ranked money-loss risks (read before ANY write) |
| [Quick Start + Auth](#quick-start) | Clone, build, auth |
| [CLI Usage 80/20](#cli-usage--the-8020) | Most-used commands |
| [Operating Playbook](#operating-playbook--when-to-use-what) | Intent → action routing table |
| [Options Greeks + Strategy Math](#options-greeks-and-strategy-math) | Greeks formulas, classification, payoff checks |
| [Options CLI Playbook](#options-cliapi-playbook) | Exact planning sequence + worked examples |
| [Live Write Lifecycle](#live-write--order-lifecycle-verified-2026-06-03) | Order creation, cancel, equity buying |
| [Sentiment + Signal Sourcing](#signal-sourcing--where-due-diligence-signal-comes-from-descriptive-not-risk-guidance) | News, Twitter/X, Reddit, institutional research |
| [Ball Knowledge + Trading Log](#ball-knowledge--the-operators-investing-memory-ledger-ball-knowledgemd) | Operator's market memory + execution history |
| [MCP Server](#mcp-server) | MCP tools, registration, safety gates |
| [Common Pitfalls](#common-pitfalls) | Route map, portfolio, watchlists, writes, cross-machine |
| [One-Shot Recipes](#one-shot-recipes) | Portfolio snapshot, options trade, recurring buys |
| [Verification Checklist](#verification-checklist) | Post-setup checks |

## 🧭 Navigation by Task *(what the user said → which section)*

| User says | Go to |
|---|---|
| "What do I own?" / "Show my positions" | [CLI Usage 80/20](#cli-usage--the-8020) → `positions` / `options positions` |
| "What am I down today?" / "Biggest losers" | `portfolio --day` (after hours: `portfolio --after-hours`) — one call, dollars, by underlying |
| "Place a trade" / "Buy X" | [Live Write Lifecycle](#live-write--order-lifecycle-verified-2026-06-03) |
| "Quote a spread" / "Price an iron condor" | [Options CLI Playbook](#options-cliapi-playbook) |
| "What can this account do?" | [Account-Aware Capabilities](#account-aware-capabilities--read-the-account-then-say-whats-allowed) |
| "Map a new endpoint" | [Research Methodology](#research-methodology--mapping-a-no-official-api-surface) |
| "MCP setup" / "Register tools" | [MCP Server](#mcp-server) |
| "I got a weird error" | [Failure Modes](#️-failure-modes--hard-rules-read-before-any-write-this-is-where-a-weak-agent-loses-money) + [Common Pitfalls](#common-pitfalls) |

---

Operate real Robinhood brokerage accounts from the terminal or via MCP tools.

**Repo:** `github.com/zaydiscold/robinhood-cli`
**Deep reference:** `AGENTS.md` in repo root — the complete API surface, worked examples, and every command. Hand that file to any agent and it's self-contained. This SKILL.md is the Hermes trigger + boot doc: quick-start, the 80/20 commands, and all the operational pitfalls learned across sessions.

> This is exactly the security-research mindset — a breakthrough is a waypoint, not a finish line.

---

## Skill Operating Model

This skill is a progressive-disclosure entrypoint, not the whole repository
loaded into context. Use it in layers:

0. **Boot smart.** Read `docs/agent-operating-intelligence-2026-06-04.md` first — the distilled
   operating intelligence (boot checklist, the "verify the API surface not the UI" cardinal rule,
   the account model + wrong-account trap, order lifecycle, a failure-mode→fix decision tree, the
   asset-class reality map, and the roadmap). It's what turns a cold agent into a competent operator.
1. **Boot from this file.** Read the safety model, auth rules, account discovery
   commands, and current read/write surface first.
2. **Pull focused references only when needed.** Use `AGENTS.md` for end-to-end
   operation, `docs/README.md` for the docs index, and the specific docs listed
   below for options/account-settings/deep-link work.
3. **Use deterministic commands over explanation.** Prefer CLI/MCP reads,
   route plans, dry-run order bodies, and browser verification evidence over
   hand-waving.
4. **Keep the user in control.** Reads and dry-runs can proceed. Live trades,
   transfers, account-setting toggles, cancels, unlinks, or margin/account-type
   changes require exact user approval plus both write gates.

For this use case, the skill teaches the workflow and guardrails; the MCP tools
provide execution. Do not overload the prompt with all route docs unless a task
requires a specific route family.

---

## When to Use

Load this skill when:
- The user asks about Robinhood — portfolio, positions, orders, watchlists, options chains
- You need to query account data (balances, positions, orders, watchlists, dividends)
- The user mentions any account they want operated (the operator designates which account to act on)
- You need to place or preview a trade (equity, options), cancel orders, resume/pause recurring buys
- The user mentions tickers, symbols, stock prices, or market data
- You're debugging the route map, the CLI, or the MCP server
- You need to discover new API endpoints or classify route risk
- The user mentions crypto trading or the official Robinhood Crypto API

Do NOT load for: general investing advice (that's not what this tool does), paper trading (this hits real accounts), or brokerages other than Robinhood.

---

## Capability Catalog — what this CLI/API/MCP can actually do

Read this first: it is the menu of supported operations so an agent has full context *before*
scanning the route map. (Far exceeds what one user would manually do.) Reads are live; every write
is double-gated (`--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1`).

**Equity**
- Buy by dollar-notional (fractional, market) or by shares (`brokerage buy`); OTC names auto-limit
  at the ask (whole shares only).
- Sell (shares / dollar), search the universe (`brokerage search`), live quotes, positions,
  unified history (equity+options+crypto+transfers), stock profile.

**Options — single-leg (the four primitives)**
- **Buy to open** — long call or long put (`side:buy, position_effect:open`).
- **Sell to close** — close a long (`side:sell, position_effect:close`).
- **Sell to open** — short call or short put / naked (`side:sell, position_effect:open`; needs option level + BP).
- **Buy to close** — cover a short (`side:buy, position_effect:close`).

**Options — multi-leg / strategies** (`options strategy-quote`, `api-map options-strategies`; 18+ workflows)
- Vertical spreads: call/put **debit** and **credit** spreads.
- **Covered call (CC)** and **cash-secured put (CSP)** (coverage/collateral checked); covered put.
- Straddles / strangles (long & short), butterflies, iron condors, calendars / diagonals.

**Rolling** (close one leg, open another — the tax/▸cash nuance matters)
- **Regular roll (margin):** close + open a new expiration/strike, single or staged (`options roll-plan`).
- **Kosher roll (cash accounts):** close **now** → open **next business day** with *settled* cash (T+1),
  to avoid good-faith violations (`options roll-plan --cash-account`). Cash can't fund the new leg same-day.
- **Roll a CSP / CC:** roll out (later expiry), up/down (strike) for a net credit; assignment- and
  ex-dividend-aware. Rolling a tested short is the core income-management move.
- Roll enumeration: bulk-enumerate **both** the near (close) and far (open) expirations — see
  "Option UUIDs — always bulk-enumerate".

**Tax-advantaged / account-aware knowledge** (surface this when planning)
- Account gating: **cash** (no margin/naked, T+1, good-faith) vs **margin** (rolls/spreads/shorts;
  PDT lifted on RH — no $25k cap) vs **Roth IRA** (long options + defined-risk + CC/CSP; no
  margin/naked). See the account-capability table + the PDT scale below.
- **Wash sale:** rolling a *losing* leg (or re-buying within 30d) can trigger a wash sale in a taxable
  account — flag it. In an **IRA** wash-sale tracking is moot but there's no tax-loss harvest either.
- **LEAPS** (>1yr) for long-term capital-gains treatment; rolling short-dated premium is ordinary income.
- DRIP (read), recurring buys (list/pause/resume).

**Sentiment / discovery** — `midlands/news`, `midlands/ratings` (analyst buy/hold/sell),
`midlands/tags/tag/{100-most-popular|top-movers|upcoming-earnings|technology|etf|...}`,
`midlands/movers/{index}/`, `marketdata/earnings/`. Feeds the signal→deeplink→order pipeline.
These RH-native feeds are the **slow, account-aware confirmer** — see "Signal sourcing" below: the
real-time pulse lives off-platform (X/Reddit), RH `midlands/*` trails it.

**Index options (verified 2026-06-04 — RH DOES offer these)** — true cash-settled, **§1256 60/40**
index options exist on RH: **SPX, SPXW (0DTE), XSP, NDX, VIX, RUT**. The consumer `search` bar and
`instruments/?symbol=` HIDE them (return only ETF proxies); they live under
`options/chains/?underlying_symbol=SPX` (`underlying_type:"index"`, empty `underlying_instruments` =
cash-settled). Opening may need an index-options entitlement tier. Picking SPX over SPY is the live
choice that gets §1256 + European-style box financing. Full evidence:
`docs/index-options-1256-conclusion-2026-06-04.md`.

**Futures / FX / commodities (verified 2026-06-04)** — **read/enumerate only, NOT placeable.** Real CME
futures (`/ESM26`, `/MGCQ26`, …) quote via `midlands/lists/items/`, but the futures host
`ceres.robinhood.com` refuses the TLS handshake (app-only cert allowlist) and the login has no
onboarded futures account. **No spot FX** (`currency_pairs` empty; DXY not tradable). **Commodities**
only via ETF proxies (USO/UVXY/BITO — normal equities, placeable via `brokerage buy`). Full evidence:
`docs/futures-fx-commodities-surface-2026-06-04.md`.

**Crypto** — official signed Crypto Trading API (separate Ed25519 auth).

**Owned-contract inspection** — `options holdings [--account N]` lists every held contract (UUID +
strike + bid/ask/last + qty + link) across accounts; `options inspect <uuid>` opens one contract's
full detail (metadata, Greeks, fill history, rare tax-timing note, buy/sell handoff).

### Strategy & tax knowledge (background — neutral, NOT risk guidance)
Reference docs that give the agent broad options/tax background to reason about ANY strategy a user
asks for. **Descriptive, not prescriptive** — they do NOT push a risk tolerance or steer toward "safe"
vs "aggressive." Risk is the user's call: surface the mechanics/options, then do what the user asks
(within the dry-run/live-write gates). Don't be timid and don't impose caution the user didn't ask for.
- `docs/options-strategies-knowledge-base-2026-06-03.md` — mechanics + use + payoff + Greeks across the
  full menu (directional, covered-call family, Wheel, PMCC, verticals, condors/flies, ratio/backspread,
  straddles, covered-call ETFs, 0DTE/QDTE income, box spreads) + a cross-cutting Greek mental model.
- `docs/tax-aware-options-strategies.md` — tax angles (CC rolling/deferral, qualified-covered-call
  holding-period taint, §1256 60/40 on SPX/XSP, box-spread financing, LEAPS, wash-sale, constructive sale).
- `docs/options-strategy-order-templates-2026-06-03.md` — exact per-strategy order bodies (live-validated 2026-06).

> Anything not listed as a verified first-class command is route-map research until a fresh capture
> proves the write body (see the account-settings capability map). Don't claim unproven writes.

### `?account_number=` — the universal account selector (verified 2026-06-03)

Almost every Robinhood surface is account-scoped, and **`?account_number=<ACCT>` (web) / the
`{account}` path segment (API) selects WHICH account it acts on — even where the UI hides the
selector.** Verified: appending `?account_number=` to `/account/investing` forces that account's
settings to render (e.g. an IRA's account_number → that IRA's settings), and every per-account settings
write carries the account in the path (`drip/account_settings/{account}/`,
`options/option_settings/{account}/`, `settings/margin/{account}/`).

**Apply by default — do not wait to be told:**
- Enumerate accounts first (`accounts` CLI / `robinhood_accounts` MCP / `transfer/accounts/`), then **always pass the account**
  (`?account_number=` on web URLs, the `{account}` path/param on API routes). The UI/bare endpoints
  often default to the *individual* account — not the one you intend.
- `/accounts/` (no id) = all accounts; `/accounts/{id}/…` or `?account_number={id}` = one account.
- This is the single biggest "which account am I acting on?" lever. Get it wrong and a trade or a
  settings change lands on the wrong account. When in doubt, set it explicitly.

---

## ⚠️ Failure modes — hard rules (read before ANY write; this is where a weak agent loses money)

Ranked by money-loss. Each is a real way an agent has tripped or would. Follow the rule, not the vibe.

**CRITICAL — real money / wrong account**
1. **Wrong account is the #1 risk.** Bare endpoints + the web UI default to the *individual* account,
   NOT the one you intend. Enumerate via `transfer/accounts/` (the bare `accounts/` under-reports —
   shows ~2 of 5), then pass `?account_number=` / the `{account}` segment on **every** op. Before any
   write, echo the resolved `account_number` + nickname and confirm it's the intended account.
2. **`--method` on writes, always.** `GET` and `POST` share a URL; omitting `--method POST` silently
   runs the **read** and returns a LIST — and a careless agent then reports "order placed" when nothing
   was sent. Pass `--method` for every write and confirm the response is a write result (e.g. `201` +
   an order `id`), not a list.
3. **Never export the live-write gate.** Do NOT put `ROBINHOOD_ALLOW_LIVE_WRITE=1` in your shell
   profile/`.bashrc`/`.zshrc`. Keep it **inline on the single command**. A persistent env var turns
   every later `--live-write` into a real send — including "tests." Two gates, per command, every time.
4. **OTC / non-fractional guard.** Before a dollar order, read `fractional_tradability`. If it's
   `position_closing_only` (OTC, e.g. RNECY) or anything ≠ `tradable`, a "$X of <ticker>" order is
   **impossible** — switch to whole shares + a marketable limit; don't retry the dollar body.
5. **Equity orders need `order_form_version: 7`** (+ the web headers the engine sends) or they 400
   "app version missing important stock trading updates." Add the field; don't spin on the vague error.

**HIGH — wrong/failed orders, unintended state**
6. **Bulk-enumerate option UUIDs FIRST.** `strategy-quote`/orders need the real `option_instrument_id`,
   never a strike or a guessed UUID. Run `options enumerate <SYM> --expiration <D>` before quoting/ordering.
7. **`recurring --all` is state-scoped:** `pause --all` only pauses *active* schedules; `resume --all`
   only resumes *paused* ones. Report what actually changed, not "all paused."
8. **Per-chain min-tick:** option limits below the chain's `cutoff_price` (~$3) must use `below_tick`
   (ARKG = $0.05). `$0.01` → 400. Read `options/chains/{id}` `min_ticks` first.
9. **GTC option opens are gated by *overnight* buying power**, not regular BP — regular BP looking fine
   does NOT mean the order clears.
10. **DRIP write = `PATCH corp_actions/drip/account_settings/{account}/` (account-wide) or
   `.../drip/instrument_settings/{account}/{instrument_id}/` (per-stock), body `{"drip_enabled":bool}`** —
   NOT `drip/enrollment/` (that's GET-only, 405 on writes). Before any settings write
   (DRIP/options/margin/sweep/lending), check `docs/account-settings-capability-map-2026-06-03.md`
   for which are **verified-live** vs **route-map-research-only** — don't claim an unproven write works.

**MEDIUM — silent misreads / classification**
11. Positions return instrument **UUIDs, not tickers** — resolve via `instruments/?ids=`; quotes need tickers.
12. Watchlist reads require `owner_type=custom`; rename uses `display_name` (sending `name` = silent 200 no-op).
13. On **429**: sleep the server-directed seconds, retry the **same `ref_id`** (a new ref_id risks a
   duplicate order). Don't fixed-sleep, don't give up after one.
14. Route map: use `{placeholder}` + `--param`, never raw values (substring match); rebuild (`pnpm build`)
   after map edits — runtime reads `dist`.
15. **Classify "sell a call/put" BEFORE building** — sell-to-close vs covered call vs credit spread vs
   naked short are different orders + risk. Ask if ambiguous; never default into naked/undefined-risk exposure.
   For exact per-strategy leg topology (side/position_effect/ratio/direction) see
   `docs/options-strategy-order-templates-2026-06-03.md` — hard templates so you can't botch the legs.
16. **Coverage/collateral up front:** covered call needs 100 shares in the SAME account; CSP needs the
   cash. Verify before building, not after a reject.
17. **Cash-account rolls are T+1:** close today, open next business day with settled cash
   (`options roll-plan --cash-account`); same-day open = good-faith violation.
18. **Crypto API uses separate auth** (API key + ed25519 signing), not the brokerage bearer.
19. **PDT lifted on Robinhood — no $25k day-trade cap.** FINRA eliminated the PDT designation + $25k
   minimum (Reg Notice 26-10, 2026-06-04) and RH has implemented it; margin accounts day-trade freely
   under dynamic intraday margin. (Cash accounts: T+1 / good-faith still apply.)

**EXECUTION EVIDENCE — what counts as proof an order happened**

20. **Brokerage order history is the source of truth.** An order *happened* only if it appears in the
   order history (`orders/`, `options/orders/`) as filled/pending/rejected/cancelled, or you see a
   position / cash / buying-power change. If **no** such record exists, treat the attempted action as
   **non-executed** — don't claim or imply it placed. Screenshots, UI/review screens, "the button was
   clicked", app state, or agent logs are **not** proof. (Lived this session: a "nothing executed"
   scare resolved by reading the orders list — and the place→cancel tests were confirmed the same way.)

> Golden rule: reads are free and live; **every write is dry-run until you deliberately pass both gates**.
> When unsure about account, side, position_effect, or amount — stop and confirm. A wrong write is real money.

---

## Quick Start

```bash
cd ~/Desktop && git clone https://github.com/zaydiscold/robinhood-cli.git
cd robinhood-cli
pnpm install
pnpm --filter @zaydiscold/robinhood-cli build
pnpm --filter @zaydiscold/robinhood-cli-mcp build
```

Requires: **Node >=20**, **pnpm**. If the package bin is not linked in the local workspace, use `node cli/dist/index.js ...`; the built entrypoint is the verification source.

---

## Auth

A single bearer token in `.env` (repo root, gitignored):

```
ROBINHOOD_BROKERAGE_TOKEN=<token>
```

**Token source:** Chrome's on-disk localStorage on a machine where Robinhood is logged in. The engine auto-loads `.env` on import and self-heals on 401 by re-running the refresh script — no browser popup, no manual login. Force a refresh with `pnpm auth:refresh`.

**Cross-machine auth:** Use Syncthing (the `home-sync` folder) or `scp` from the machine where Robinhood is logged in. Do NOT fight with broken SSH for multiple turns — check Syncthing first.

Full auth details: `AGENTS.md` §1.

### Agent Preflight

Run this short preflight before any account-specific operation:

```bash
date
node cli/dist/index.js --help >/dev/null                 # CLI builds + runs
node scripts/equity-buy.mjs --preflight                  # LIGHT LOGIN CHECK (one call): is auth live?
node cli/dist/index.js brokerage routes --json | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])"
```

Interpretation:

- **`--preflight` is the auth/login check — run it first.** It hits `accounts/` with the
  web-app headers and prints `PREFLIGHT: OK — auth live, N accounts: …` or
  `PREFLIGHT: FAIL`. This is the "is the MCP/CLI/API login good?" gate; do it before any
  account op so you fail fast instead of mid-batch. On FAIL → `pnpm auth:refresh`, retry once.
  Do NOT spin up random browser sessions.
- Date matters for options expirations, staged rolls, after-hours behavior, recurring timing.
- Route count: trust the live `brokerage routes --json` count (~300 and growing); the exact number changes as routes are captured, so never assert a hardcoded figure.
- Discover accounts via `transfer/accounts/` (full graph: numbers, types, deposit/recurring
  eligibility, labels). **Never hardcode account numbers.** Note: the bare `accounts/` endpoint
  may only return a subset for a given token — the full set comes from `transfer/accounts/` or
  the MCP `robinhood_accounts` tool; writes still work against any owned account by its number.

---

## CLI Usage — The 80/20

All commands run from repo root. Reads run live and free. Writes are double-gated (dry-run by default unless both `--live-write` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1` are set).

```bash
robinhood-cli api-map summary --json
robinhood-cli api-map account-context --json
robinhood-cli api-map options-strategies --json
robinhood-cli api-map options-strategy-plan iron-condor --json
robinhood-cli api-map routes --host trading.robinhood.com --json
robinhood-cli brokerage routes --risk read --json
robinhood-cli brokerage route "https://api.robinhood.com/accounts/" --json
robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --dry-run --json
robinhood-cli quote MRVL NVDA AAPL --json
robinhood-cli positions --json
robinhood-cli options positions --json
robinhood-cli options chain MRVL --width 6 --json
robinhood-cli options expirations MRVL --json
robinhood-cli watchlist list --json
robinhood-cli crypto routes --json
robinhood-cli crypto sign --api-key "$ROBINHOOD_API_KEY" --private-key-b64 "$ROBINHOOD_PRIVATE_KEY_B64" --path /api/v1/crypto/trading/accounts/ --method GET
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --dry-run --json
```

### Current Read/Write Surface

Keep this split current when editing the skill:

| Surface | Current state | Agent rule |
|---------|---------------|------------|
| API map | ~300 brokerage/account route entries (live count via `brokerage routes --json`) plus official Crypto API routes | Rebuild after edits; runtime reads `cli/dist/api-map/` |
| Read commands | `quote`, `positions`, `options positions`, `options expirations`, `options chain`, `watchlist list`, `recurring list`, route-map reads, crypto read plans | Live reads are allowed with caller-owned auth, but redact balances/tokens in shareable output |
| Options research/planning | 18 strategy workflows; `options-strategy-plan` emits `reviewContract` | Planning only until exact user approval and write gates |
| Equity/options order writes | Route-map executor against `orders/`, `options/orders/`, and cancel routes | Must use `--method`, exact body, `--live-write`, and `ROBINHOOD_ALLOW_LIVE_WRITE=1`; dry-run first |
| Recurring investments | First-class `recurring list`, `recurring resume`, `recurring pause`; route map also has GET one schedule and POST create | Resume/pause are the verified first-class writes. Create/edit amount/funding-source are route-map research unless a fresh capture verifies body shape |
| Money movement / funding | ACH relationships/transfers and cashier/deposit-schedule routes are mapped mostly as read or `write-or-sensitive` | Never mutate funding, ACH links, deposits, withdrawals, or transfers without a fresh route/body capture and explicit approval |
| DRIP/options/account settings | DRIP GET/PATCH is method-split; account-setting routes are mapped or browser-observed | Treat account-setting writes as dry-run first; plan, obtain exact approval, send only with both gates, then verify reload state |
| Crypto | Official Crypto API signing/planning/execution commands | Different auth from brokerage; crypto writes/cancels use the same double gate |

Do not overclaim first-class support. If a capability is route-map-only, say so and build a dry-run body from the current route map before considering implementation.

### Critical Query Patterns

| Task | Query | Notes |
|------|-------|-------|
| All accounts (complete) | `bonfire.robinhood.com/transfer/accounts/` | ONLY endpoint that lists every account |
| Primary account portfolio | `portfolios/` | List endpoint, includes `equity_previous_close` |
| Per-account portfolio | `portfolios/{num}/` | Use `--param num=X`. Does NOT include prev_close |
| Positions | `positions/?account_number={n}&nonzero=true` | Returns instrument UUIDs, not tickers |
| Instruments→tickers | `instruments/?ids={ids}` | Batch resolve UUIDs: `--param ids=uuid1,uuid2` |
| Quotes | `marketdata/quotes/?ids={ids}` | Batch resolve instrument UUIDs to prices |
| Watchlists | `discovery/lists/?owner_type=custom` | `owner_type=custom` is MANDATORY |
| Orders (read) | `orders/` | GET by default |
| Orders (create) | `orders/` | Requires `--method POST` |
| Options chain | `options/chains/{id}/` | Get expirations + tick rules |
| Options instruments | `options/instruments/?chain_id={id}&expiration_dates={date}&state=active&type=call` | Find specific strikes |
| Options orders | `options/orders/` | POST, same double-gate |
| Stock profile page | `stock profile <symbol> --account <n> --json` | Joins quote, description, fundamentals, shorting/borrow, buying-power, and margin reads |
| Recurring buys | `recurring` subcommand | `robinhood-cli recurring list` — dedicated command |
| Recurring pause/resume | `recurring pause|resume` | Verified first-class writes; double-gated |
| Recurring create/edit/funding source | `bonfire.robinhood.com/recurring_schedules/` | Route-map research only until fresh body capture verifies amount/source fields |
| Funding sources | `cashier.robinhood.com/ach/relationships/`, `payment_instruments/v2/` | Read first; writes are high-risk and not first-class |
| Account settings capability map | `docs/account-settings-capability-map-2026-06-03.md` | Defines what is first-class, route-map-only, browser-observed, or not yet proven |
| Crypto market data | `crypto execute "marketdata/best_bid_ask/" --query-param symbol=BTC-USD` | Official Crypto API |

### Account Context and Strategy Maps

| Task | Command | Notes |
|------|---------|-------|
| Browser account routing | `robinhood-cli api-map account-context` | Shows whether `?account_number=` propagates, is mixed, or is ignored on each web surface |
| Build web workflow URL | `robinhood-cli api-map account-url <id> --account <n> ...` | Navigation/research only; prefer direct API routes for automation |
| Options strategy catalog | `robinhood-cli api-map options-strategies` | Lists single legs, covered calls, cash-secured/naked puts, naked calls, debit/credit spreads, straddles, strangles, butterflies, iron condors, calendar rolls |
| Live strategy dry-run quote | `robinhood-cli options strategy-quote <id> --account <n> --symbol <s> --expiration <d> --leg leg_id=strike --json` | Resolves exact option ids, reads bid/ask/Greeks, computes natural/mid/protective limits, and fills a dry-run body; never sends |
| Cash-account staged roll | `robinhood-cli options roll-plan --account <n> --symbol <s> --type call|put --close-expiration <d1> --close-strike <k1> --open-expiration <d2> --open-strike <k2> --cash-account --json` | Emits close-now/open-later dry-run orders with next-business-day fresh-check gates |
| Strategy dry-run body | `robinhood-cli api-map options-strategy-plan <id> --param key=value` | Emits lookup steps + `options/orders/` body template; never sends |
| Exact contract navigation plan | `robinhood-cli api-map options-contract-plan --account <n> --symbol <s> --expiration <d> --type call|put --side buy|sell --strike <k> --json` | Emits the tested web account shell, candidate web URL probes, API resolution steps, and dry-run single-leg handoff |

Primary references:

- `docs/README.md` (docs index) and `docs/agent-operating-intelligence-2026-06-04.md` (**boot-smart KB — read first**)
- `ball-knowledge.md` (repo root) — the operator's investing-memory ledger; see SKILL "Ball Knowledge" + "Signal sourcing"
- `trading-log.md` (repo root) — execution + intent history; see SKILL "Trading log"
- `docs/strategy-deep-dive-the-wheel-2026-06-04.md`, `docs/strategy-deep-dive-rolling-options-2026-06-04.md` — multi-POV strategy deep-dives with dissertation-level Quant appendices
- `docs/institutional-outlook-2026-06-04.md` — year-ahead + CMA regime synthesis (info, not mandate; refresh each cycle)
- `docs/options-greeks-strategy-research-2026-06-02.md`
- `docs/options-quantitative-playbook-2026-06-03.md`
- `docs/options-strategy-execution-smoke-2026-06-03.md`
- `docs/options-contract-navigation-2026-06-03.md`
- `docs/index-options-1256-conclusion-2026-06-04.md`, `docs/futures-fx-commodities-surface-2026-06-04.md`
- `docs/release-notes-2026-06-03.md`, `docs/release-notes-2026-06-04.md`
- `docs/account-settings-capability-map-2026-06-03.md`
- `api-map/options-strategy-workflows-2026-06-02.json`
- `api-map/options-contract-navigation-workflows-2026-06-03.json`

### Browser Verification Rule

Use API/CLI/MCP first. Use browser automation only when validating web UI state
or discovering a UI-backed endpoint that the route map does not already cover.
When using a browser, attach to the existing logged-in debug session instead of
launching a new Chrome profile. Keep `?account_number=<ACCOUNT_NUMBER>` on
account-pinnable web URLs, but treat direct API account parameters as the source
of truth.

Preferred browser role:

- Verify that a stock page or option chain is logged in and on the intended
  account.
- Inspect visible bid/ask/mark/Greeks or account-setting UI state.
- Capture sanitized route shapes for missing mutation bodies.

Do not use browser clicks to send live financial actions unless the user gave
exact-action approval and the CLI/MCP route is already understood.

### Options Greeks and Strategy Math

Use this section when the user asks for options trading, options strategies, or
Greek exposure. It is research/planning guidance, not investment advice and not
permission to send a live order.

When viewing an options chain, do not stop at reporting strikes. Translate the
screen into a tradeable research object:

1. Resolve symbol -> instrument -> chain id -> expiration -> option instrument ids.
2. Quote individual legs with `marketdata/options/`; quote multi-leg packages
   with `marketdata/options/strategy/quotes/` when available.
3. Classify the strategy from the 18-workflow catalog before building an order.
4. Compute payoff math separately from Greek sensitivity math.
5. Emit missing fields and blockers before any dry-run body.

For every options read or plan, include:

```text
spot, expiration, dte, strike(s), call/put, bid/ask/mark, IV if available,
delta/gamma/theta/vega/rho with units, open/close effect, quantity,
natural/mid/limit price, max profit/loss, breakevens, assignment/expiration flags
```

Treat every multi-leg trade as a portfolio of signed legs. Long legs add Greek
exposure; short legs subtract it. Multiply by `ratio_quantity`, contract count,
and the 100-share multiplier:

```
net_delta = sum(leg_side * leg_delta * ratio_quantity * contracts * 100)
net_gamma = sum(leg_side * leg_gamma * ratio_quantity * contracts * 100)
net_theta = sum(leg_side * leg_theta * ratio_quantity * contracts * 100)
net_vega  = sum(leg_side * leg_vega  * ratio_quantity * contracts * 100)
net_rho   = sum(leg_side * leg_rho   * ratio_quantity * contracts * 100)
```

Where `leg_side` is `+1` for buy/long legs and `-1` for sell/short legs. Use
this as a live sensitivity snapshot, not a prediction: delta/gamma move with the
underlying, theta changes as expiration approaches, and vega changes with implied
volatility.

Pricing rules for dry-run strategy quotes:

```text
buy leg natural price  = ask
sell leg natural price = bid
leg mid price          = (bid + ask) / 2 when usable, else mark/last fallback
net credit/debit       = sum(sell prices * ratio) - sum(buy prices * ratio)
safe-sell-probe        = natural credit + $200, dry-run only
safe-buy-probe         = max($0.01, natural debit - $200), dry-run only
```

Prefer `robinhood-cli options strategy-quote` over manually filling
`options-strategy-plan` when the user asks about spreads or live pricing. It is
still dry-run: it resolves option ids, quotes bid/ask/Greeks, computes a limit,
and fills the body without calling `POST options/orders/`.

For quick scenarios:

```text
approx_pnl = net_delta*dS + 0.5*net_gamma*dS^2 + net_vega*dIV + net_theta*days
```

Label units. Broker Greeks may already be per day or per volatility point;
Black-Scholes outputs are often per year and per 1.00 volatility unit.

Black-Scholes baseline for sanity checks:

```text
d1 = (ln(S / K) + (r - q + sigma^2 / 2) * T) / (sigma * sqrt(T))
d2 = d1 - sigma * sqrt(T)
call_delta = exp(-qT) * N(d1)
put_delta  = exp(-qT) * (N(d1) - 1)
gamma      = exp(-qT) * phi(d1) / (S * sigma * sqrt(T))
vega       = S * exp(-qT) * phi(d1) * sqrt(T)
```

Operational scaling: divide vega by 100 for one volatility point, theta by 365
for a rough per-day value, and rho by 100 for one rate point. Prefer Robinhood's
live `marketdata/options/` Greeks when present, then use formulas only to check
sign and magnitude.

Core interpretations:

| Greek | Meaning for an agent |
|-------|----------------------|
| Delta | Directional exposure. Positive benefits from up moves; negative benefits from down moves. |
| Gamma | How fast delta changes. Long gamma likes movement; short gamma can lose faster as price moves against it. |
| Theta | Time decay. Positive theta collects decay; negative theta pays decay. |
| Vega | Implied-volatility exposure. Long vega benefits from IV expansion; short vega benefits from IV crush. |
| Rho | Interest-rate exposure. Usually less important intraday but include it in summaries. |

### Options Strategy Classification

First classify the requested trade. Never infer naked exposure from loose
language. If the user says "sell a call", distinguish sell-to-close, covered
call, call credit spread, and naked short call before planning an order.

| Strategy family | Typical posture | Aggression |
|-----------------|-----------------|------------|
| Long call / put | Defined-risk directional debit; long gamma, long vega, negative theta | Moderate |
| Sell-to-close | Reduces an existing long option; should use `position_effect=close` | Conservative |
| Covered call | Short call against 100 owned shares; income but caps upside and can assign shares | Conservative |
| Cash-secured put | Short put backed by cash for 100 shares; bullish income with assignment risk | Moderate |
| Covered put | Short stock plus short put; not the same as cash-secured, keeps short-stock upside risk | Aggressive |
| Naked short call / short straddle | Undefined-risk short-volatility exposure | Aggressive |
| Naked/margin short put | Short put without verified full cash collateral | Aggressive |
| Vertical credit spread | Defined-risk premium selling; short gamma/vega with long wing protection | Moderate |
| Vertical debit spread | Defined-risk directional debit; capped gain and capped loss | Moderate |
| Long straddle | Defined-risk long-volatility trade; long gamma/vega, heavy negative theta | Moderate |
| Short straddle / short strangle | Short-volatility income with undefined risk | Aggressive |
| Long strangle | Defined-risk long-volatility trade with OTM call and OTM put | Moderate |
| Butterfly / iron condor | Defined-risk range/pin or short-volatility structures | Moderate |
| Calendar roll | Close one option and open another expiration/strike; compare realized close and new open risk | Moderate |

Payoff checks:

| Strategy | Quant check |
|----------|-------------|
| Long call | Max loss = debit * 100; breakeven = strike + debit |
| Long put | Max loss = debit * 100; breakeven = strike - debit |
| Covered call | Verify 100 shares per short call in same account; upside capped above strike |
| Cash-secured put | Verify cash collateral; max loss = (strike - credit) * 100 |
| Naked short call | Max profit = credit * 100; max loss theoretically unlimited |
| Credit spread | Max profit = credit * 100; max loss = (width - credit) * 100 |
| Debit spread | Max loss = debit * 100; max profit = (width - debit) * 100 |
| Long straddle | Max loss = debit * 100; breakevens = strike +/- debit |
| Long strangle | Max loss = debit * 100; breakevens = call strike + debit and put strike - debit |
| Short strangle | Max profit = credit * 100; undefined call-side risk and large put-side downside |
| Iron condor | Max profit = credit * 100; max loss = widest wing - credit, scaled by 100 |
| Calendar roll | Net = close credit - open debit; compare old and new Greeks, duration, and assignment risk |

Ambiguous wording:

| User says | Clarify before planning |
|-----------|-------------------------|
| Sell a call | Sell-to-close, covered call, call credit spread, or naked short call |
| Sell a put | Cash-secured put, put credit spread, or margin/naked short put |
| Covered short put | Cash-secured put or covered put; these are not the same |
| Straddle | Long debit straddle or short undefined-risk straddle |
| Roll | Which legs close, which legs open, and whether net risk increases |

Use the risk-score heuristic in
`docs/options-greeks-strategy-research-2026-06-02.md` for aggressive vs.
non-aggressive gating. Inputs include undefined loss, naked short calls,
short gamma/vega, assignment sensitivity, near-expiration risk, wide spreads,
margin use, defined-risk wings, collateral/coverage, and closing-only status.

Every dry-run summary should include strategy id, conservative/moderate/aggressive
label, max profit/loss, breakevens, collateral/coverage check, net Greeks,
liquidity flags, expiration flags, exact order body, missing fields, and write-gate
state.

### Quant Review Heuristics

Use these rules to turn "quant talk" into reliable agent behavior:

- Greeks are local derivatives, not payoff guarantees. Always separate current
  sensitivity from expiration payoff.
- Credit received is max profit only for short premium structures; debit paid is
  max loss only for defined-risk long premium structures.
- Short gamma near expiration is a risk amplifier. Flag near-expiration shorts,
  wide bid/ask spreads, stale package quotes, and 0DTE exposure.
- A covered call is covered only if the same account has at least 100 shares per
  short call. A cash-secured put is secured only if cash collateral is verified.
- Naked short calls, short straddles, and short strangles are aggressive even
  when the premium looks small because loss can expand nonlinearly.
- For rolls, compare closed-leg Greeks/payoff to opened-leg Greeks/payoff and
  state whether risk increased, duration changed, or undefined exposure appeared.
- In cash accounts, do not assume close proceeds can fund the replacement leg on
  the same day. Use `options roll-plan --cash-account`; treat the open leg as a
  next-business-day task that must recheck settled cash and fresh bid/ask.

### Options Review Contract

`options-strategy-plan` emits a machine-readable `reviewContract`. Treat it as a
hard checklist, not decoration. Before any order body can leave dry-run mode,
an agent must satisfy or explicitly block every field:

```bash
robinhood-cli api-map options-strategy-plan covered-call \
  --param account_number=<ACCOUNT_NUMBER> \
  --param symbol=<SYMBOL> \
  --param chain_id=<CHAIN_ID> \
  --param expiration=<YYYY-MM-DD> \
  --param short_call_option_id=<OPTION_ID> \
  --param limit_price=<PRICE> \
  --param quantity=1 \
  --param time_in_force=gfd \
  --param ref_id=<UUID> \
  --json
```

The `reviewContract` requires:

- account, symbol, chain, expiration, every option instrument id, every strike,
  side, `position_effect`, `ratio_quantity`, quantity, limit price, time in
  force, and `ref_id`;
- payoff checks for max profit, max loss, and breakevens from the actual debit
  or credit;
- signed-leg net Greeks with unit labels;
- scenario rows for spot +/-1%, IV +/-5 vol points, one day of theta, breakevens,
  and max-loss boundary;
- variant resolution for phrases like "sell a call", "sell a put", "covered
  short put", "straddle", and "strangle";
- hard blockers for missing instrument ids, unclear open/close effects,
  unverified coverage/collateral, stale package quotes, and missing live-write
  gates.

When the user asks for "covered short put", first run:

```bash
robinhood-cli api-map options-strategies --query "covered short put" --json
```

Then explain the ambiguity: common retail wording often means cash-secured put,
while a true covered put means short stock plus short put. Pick neither
automatically.

### Options CLI/API Playbook

Use this exact planning sequence:

1. `robinhood-cli api-map account-context --json` to understand browser account routing. Prefer explicit API `account_number` fields over URL state.
2. For an exact contract, run `robinhood-cli api-map options-contract-plan --account <N> --symbol <SYMBOL> --expiration <DATE> --type call|put --side buy|sell --strike <K> --json`.
3. `robinhood-cli options expirations <SYMBOL> --json` and `robinhood-cli options chain <SYMBOL> --expiration <DATE> --type call|put --json` to inspect available contracts.
4. `robinhood-cli api-map options-strategies --json` to choose the strategy id and leg ids.
5. For spreads/straddles/condors, run `robinhood-cli options strategy-quote <id> --account <N> --symbol <SYMBOL> --expiration <DATE> --leg <leg_id>=<strike> ... --pricing-mode mid --json`.
6. For calendar rolls, pass per-leg expirations: `--param close_call_expiration=<old> --param open_call_expiration=<new>` or use `options roll-plan` for a two-order staged plan.
7. Use `--pricing-mode safe-sell-probe` only as a dry-run control when proving a sell/credit body is far from the market.
8. If exact ids are already known, `robinhood-cli api-map options-strategy-plan <id> --param key=value --json` can still emit the raw template body.
9. Only after the dry-run body is exact should any live route be considered, and only with `--live-write` plus `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

Worked dry-run examples:

```bash
robinhood-cli options strategy-quote long-call --account <N> --symbol <S> --expiration <D> --leg long_call=<K> --pricing-mode mid --json
robinhood-cli options strategy-quote naked-short-call --account <N> --symbol <S> --expiration <D> --leg naked_call=<K> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote call-credit-spread --account <N> --symbol <S> --expiration <D> --leg short_call=<K1> --leg long_call=<K2> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote call-debit-spread --account <N> --symbol <S> --expiration <D> --leg long_call=<K1> --leg short_call=<K2> --pricing-mode mid --json
robinhood-cli options strategy-quote put-credit-spread --account <N> --symbol <S> --expiration <D> --leg short_put=<K1> --leg long_put=<K2> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote iron-condor --account <N> --symbol <S> --expiration <D> --leg long_put_wing=<K1> --leg short_put_body=<K2> --leg short_call_body=<K3> --leg long_call_wing=<K4> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote call-calendar-roll --account <N> --symbol <S> --expiration <OLD_D> --leg close_call=<OLD_K> --leg open_call=<NEW_K> --param close_call_expiration=<OLD_D> --param open_call_expiration=<NEW_D> --pricing-mode mid --json
robinhood-cli options roll-plan --account <N> --symbol <S> --type call --close-expiration <OLD_D> --close-strike <OLD_K> --open-expiration <NEW_D> --open-strike <NEW_K> --cash-account --json
```

Required fields before a dry-run is acceptable: account, symbol, expiration,
every strike, every option instrument id, buy/sell side, `position_effect`,
quantity, limit price, time in force, and ref id. For closes, verify the open
position first and set `position_effect=close`.

### Options Chain Builder State

The web URL `https://robinhood.com/options/chains/<SYMBOL>` is not enough to
rebuild a selected order. It defaults to a nearby expiration and then stores the
selected expiration, buy/sell side, call/put side, strike, and Builder legs in
UI/API state rather than the location bar.

Map the UI to APIs like this:

| UI state | API state |
|----------|-----------|
| Symbol page | `options/chains/?account_number=<N>&underlying_symbol=<SYMBOL>` |
| Expiration dropdown | `options/instruments/?chain_id=<ID>&expiration_dates=<DATE>` |
| Call/put toggle | `type=call|put` |
| Strike rows | returned option instrument ids |
| Right-side price | `marketdata/options/?ids=<IDS>` |
| Spread/straddle/condor Builder | `marketdata/options/strategy/quotes/` plus multi-leg `options/orders/` body |

For a spread, never trust a label alone. Reconstruct every leg from option
instrument id, strike, expiration, side, ratio, and `position_effect`, then
quote the package and calculate max profit/loss before emitting the dry-run.

### Exact Contract Navigation Rules

Use `api-map options-contract-plan` when the user wants a specific contract
planned:

```bash
robinhood-cli api-map options-contract-plan \
  --account <ACCOUNT_NUMBER> \
  --symbol XBI \
  --expiration 2026-06-26 \
  --type call \
  --side buy \
  --strike 127 \
  --json
```

Interpret output this way:

- `options-chain-account-shell` is the observed web shell for account context.
- `options-chain-contract-query-candidate` and fragment variants are probes,
  not proof that Robinhood stores contract state in the URL.
- For unopened contracts, exactness comes from API resolution:
  `options/chains/` -> `options/instruments/` filtered by expiration/type/strike
  -> `marketdata/options/` -> optional `strategy/quotes/`.
- Do not claim a universal unopened-contract URL unless it has been verified in
  a logged-in browser/device pass across multiple symbols and expirations.

### Route Matching Gotchas

1. **Matching is substring-based.** `portfolios/<ACCOUNT_NUMBER>/` will NOT match — the route is `portfolios/{num}/` with a placeholder. Use brace syntax + `--param`.
2. **Method-aware routing.** `GET /orders/` and `POST /orders/` share a URL. To hit the POST route you MUST pass `--method POST`, otherwise you get the GET (read) route.
3. **`accounts/` under-reports.** Use `bonfire.robinhood.com/transfer/accounts/` for the full account list.
4. **Build after map edits.** The runtime reads `cli/dist/api-map/`, not the source. Editing `api-map/brokerage-routes.json` without rebuilding is a silent no-op.
5. **`url_template` vs `url`.** Some routes (watchlists, indices 263-271) used `url_template` instead of `url`. The engine only matches on `url`; keep source and dist route maps rebuilt after any repair.

Full details: `AGENTS.md` §3-§5.

### Skill Maintenance Rules

This skill should stay concise and operational. Detailed math and source-backed
research belong in:

- `docs/options-quantitative-playbook-2026-06-03.md`
- `docs/options-greeks-strategy-research-2026-06-02.md`
- `docs/options-strategy-execution-smoke-2026-06-03.md`
- `docs/options-contract-navigation-2026-06-03.md`
- `api-map/options-strategy-workflows-2026-06-02.json`
- `api-map/options-contract-navigation-workflows-2026-06-03.json`
- `AGENTS.md`

When updating the skill, follow progressive disclosure:

- Put only the command sequence, safety gates, and decision rules in `SKILL.md`.
- Link detailed docs instead of duplicating whole reference essays.
- Verify live command names with `node cli/dist/index.js --help`.
- Verify strategy count and `reviewContract` with `node cli/dist/index.js api-map options-strategies --json` and `node cli/dist/index.js api-map options-strategy-plan iron-condor --json`.
- Verify live strategy quoting with `node cli/dist/index.js options strategy-quote call-credit-spread --account <N> --symbol <S> --expiration <D> --leg short_call=<K1> --leg long_call=<K2> --pricing-mode safe-sell-probe --json`.
- If a route supports both read and write methods, state the method explicitly; do not rely on URL-only matching.
- If a body shape is inferred or unverified, label it route-map research, not supported automation.

---

## Operating Playbook — When To Use What

This repo gives an agent a typed, gated grip on a brokerage that ships **no public
brokerage API** (only the separate official Crypto API). Everything below the
crypto line is a mapped browser/app surface. So an agent's job is two things at
once: **(1) call the hardcoded actions correctly**, and **(2) reason like an
options trader** about what to call. This section routes intent to action; the
deep math lives in *Options Greeks and Strategy Math* above.

| User intent | Action | Command (verify with `--help`) |
|-------------|--------|--------------------------------|
| "What do I own / how are my accounts?" | discover accounts, then read | `accounts` (lists every account with cash/margin/IRA capabilities; unverified-type accounts flagged conservative); then portfolios/positions per account |
| **"Why am I down / what's bleeding me / how's my portfolio today / after hours?"** | **one command** | **`portfolio` (aliases `pnl`/`snapshot`; MCP `robinhood_portfolio`) — `--day`/`--after-hours`/`--by position`. One call → per-account day Δ + after-hours Δ, drivers by underlying in DOLLARS, + reconciliation. Don't hand-stitch or lead with percents. Details in "Portfolio loss attribution" below.** |
| "Quote X" / "what's the chain?" | live read | `quote <SYM>`, `options chain <SYM>`, `options expirations <SYM>` |
| "Best option position" / P&L | ranked read | `options positions` |
| "What transactions went through (today/yesterday)?" | unified history | `history --days <n> [--account <N>]` (merges equity + options + crypto orders + ACH transfers, newest first) |
| "Price a spread / iron condor" | dry-run strategy quote | `options strategy-quote <strategy> --account <N> --symbol <S> --expiration <D> --leg ...` |
| "Plan a named strategy" | catalog plan | `api-map options-strategies`, `api-map options-strategy-plan <id>` |
| "Open the exact contract for me" | resolve + navigate | `api-map options-contract-links ...` (emits the API-resolved contract + chain-id deeplink) |
| "Roll my position" | staged close+open plan | `options roll-plan ...` (cash-account aware; see below) |
| "Place / cancel an order" | gated write | `brokerage execute "options/orders/" --method POST --live-write` ... then `options/orders/{0}/cancel/` |
| "Change a setting (DRIP, recurring, etc.)" | gated write | `recurring pause|resume`; route-map writes via `brokerage execute --method ... --live-write` |

**Decision rule:** read first, classify the strategy, compute payoff + net Greeks,
emit blockers, *then* (only on explicit request + both write gates) send. Never
infer naked/undefined-risk exposure from loose wording — see *Options Strategy
Classification*.

### Portfolio loss attribution — "why am I down?" (answer in DOLLARS, not percents)

When the operator asks why they're down (or up), what's bleeding them, or how the portfolio is doing,
follow this exact order — it is the intuitive answer they actually want:

1. **Top-line, per account, in dollars first.** Read `portfolios/` → `equity` (or
   `extended_hours_equity`) vs `equity_previous_close`. The difference is the authoritative "$ down/up
   today" per account. Lead with this number. (Per-account `portfolios/{num}/` may lack
   `equity_previous_close`; the list endpoint has it for the primary.)
2. **Attribute by DOLLARS, never percents.** Rank holdings by *dollar* day-change, not %:
   - equity: `qty × last × dayPct`
   - **options:** `(adjusted_mark_price − previous_close_price) × 100 × qty` (from `marketdata/options/`).
   A −9% move on a $6 fractional position is −$0.50 and irrelevant; a −5% move on a $1,600 deep-ITM call
   is −$350 and the real story. **Percent leaderboards mislead — always weight by position size.**
3. **Roll up by UNDERLYING across ALL accounts.** Losses concentrate by ticker, not by account (e.g. HPE
   calls bleed across 3 accounts at once; GOOGL/NET winners can *mask* it inside one account so it nets
   positive). A per-account-only view buries the real driver. Group every leg by underlying, sum the
   dollar day-change, rank.
4. **"After hours" is its OWN number — compute it correctly, and do NOT hard-rule an asset class out.**
   When the operator asks "how am I down **after hours / today**," the after-hours $ per account is
   **`extended_hours_equity − equity`** (NOT `… − equity_previous_close`, which is the full day). Read it
   from `portfolios/{num}/` (param is literally `{num}`); it's the exact "−$X after hours" the app shows.
   Sum across accounts and lead with it. Per-name attribution: `qty × (last_extended_hours_trade_price −
   last_trade_price)` from `marketdata/quotes/` (equities/ETFs) and `marketdata/options/` (options).
   - **It is NOT "equities only."** Index/ETF options (SPX, SPXW, SPY, NDX, …) trade ~15 min past the bell
     and in extended sessions — they move after-hours too. Equities + leveraged single-stock ETFs are
     usually the bulk of the dollars, but **CHECK the actual extended marks; never assert a class can't
     be the cause.**
   - Overnight (between sessions) a name's `last_extended_hours_trade_price` may be null — but the
     account's `extended_hours_equity` still retains the last extended value. Use the account-level number
     and say per-name attribution needs a live extended session; never report "$0" or "can't capture it."

**NEVER say "I can't capture it" and stop.** A failed read is almost always a route/param mismatch — e.g.
`{num}` not `{n}`, `positions/?account_number={account_number}`, or ambiguous `portfolios/` needing the
full host URL. Fix the call and get the number. Find the field, fix the route, then answer.

**USE THE FIRST-CLASS COMMAND — don't hand-stitch.** This is `portfolio` (aliases `pnl`, `snapshot`),
also the MCP tool `robinhood_portfolio`:
- `portfolio` — all accounts, day Δ + after-hours Δ, drivers rolled up by underlying in dollars.
- `portfolio --after-hours` — rank by the after-hours move (the "what's nuking me after hours" answer).
- `portfolio --day` · `--by position|account|underlying` · `--account <n>` · `--json`.
One call returns the per-account top-line, the by-underlying dollar drivers, and a reconciliation line.
The manual composition below is only a FALLBACK if the command is unavailable: `portfolios/{num}/`
(equity / extended_hours_equity / **adjusted_equity_previous_close** — note: per-account
`equity_previous_close` is "0", use the adjusted field) + `positions/?account_number={account_number}` +
`options aggregate_positions/` + `marketdata/{quotes,options}/`. The deliverable is one ranked,
dollar-weighted, by-underlying answer across accounts, with the **after-hours number kept separate from
the full-day number** — not a per-account percent dump.

## Worked Build — Iron Condor, End to End

An iron condor = short put spread + short call spread (4 legs, net credit,
defined risk). Build it with the live tools, not by hand:

```bash
# 1. Resolve the chain + expiration
node cli/dist/index.js options chain <SYM> --json
node cli/dist/index.js options expirations <SYM> --json

# 2. Inspect the named strategy contract (legs it expects, review fields)
node cli/dist/index.js api-map options-strategy-plan iron-condor --json

# 3. Live dry-run quote the 4 legs (resolves ids, reads bid/ask/Greeks,
#    computes net credit + a safe limit, fills the order body — sends nothing)
node cli/dist/index.js options strategy-quote iron-condor \
  --account <N> --symbol <SYM> --expiration <D> \
  --leg short_put=<K1> --leg long_put=<K2> \
  --leg short_call=<K3> --leg long_call=<K4> \
  --pricing-mode safe-sell-probe --json
```

Before sending, the summary must show: strategy id, risk label, **net credit**,
**max profit = credit×100**, **max loss = (widest wing − credit)×100**, both
breakevens, net Greeks, liquidity/expiration flags, the exact `options/orders/`
body (`direction:"credit"`, 4 legs with `ratio_quantity`), and write-gate state.
Same pattern for verticals (2 legs), straddles/strangles, and butterflies — only
the leg set and `direction` change.

## Account-Aware Capabilities — read the account, then say what's allowed

Always read `account.type` and `brokerage_account_type` first and **annotate what
the account can and cannot do** before planning a write. This is required behavior,
not a nicety — operators typically hold a mix of cash, margin, and IRA accounts, and the
allowed actions differ by type:

| Account type | Can | Cannot / caution |
|--------------|-----|------------------|
| `cash` | buy/sell, cash-secured puts, covered calls, debit spreads | no margin borrowing, no naked/undefined-risk shorts, **rolling that needs margin won't work**, unsettled-cash (T+1) limits, watch good-faith violations |
| `margin` (individual) | the above + margin, rolls, spreads requiring buying power | **PDT lifted on RH — no $25k day-trade cap** (FINRA eliminated it 2026-06-04); maintenance margin still applies |
| `ira_roth` | long options, defined-risk spreads, covered calls | no margin, no naked shorts; contribution/withdrawal rules out of scope |

When a requested action is impossible for the account type, **say so and stop**:
e.g. "Account `…cash…` is a cash account — it can't roll on margin; options-level
rolling here is limited to closing then re-opening with settled cash." Read margin
state from `bonfire.robinhood.com/margin/{id}/investing_info/` and
`.../settings/`; read cash/sweep from `accounts/sweeps/`. Surface the constraint
in the plan output, the way the tool already reports buying power.

### Pattern Day Trading (PDT) — lifted on Robinhood (no $25k cap)

**FINRA eliminated the PDT designation, the day-trade count, and the $25k minimum** (Reg Notice 26-10,
effective 2026-06-04), replaced by dynamic intraday margin on real-time margin excess (standard margin
minimum $2,000). **Robinhood has implemented it** — so on RH margin accounts there is **no $25k
day-trade cap**; day-trade freely within margin / buying-power limits. (Buys alone never counted
anyway — only round trips did.) **Cash accounts are unchanged:** PDT never applied, but T+1 settlement
and good-faith violations still do — selling unsettled funds can flag it.

## Live Write & Order Lifecycle (verified 2026-06-03)

Verified live, not theorized:

- **Both gates fire and mutate:** `--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1`.
  A recurring `pause`→`resume` round-trip returned `200` both ways and restored
  state; an options order placed (`201`, state `queued`) and cancelled (`200`).
- **Order lifecycle:** `POST options/orders/` returns the order `id` → confirm it
  is `queued/confirmed` → `POST options/orders/{0}/cancel/` (brace syntax!) →
  re-read; a `403`/"cannot cancel" on a second cancel means it is already
  cancelled. Use a far-from-market limit (`$0.01` buy / natural+`$200` sell) for
  any test order so it physically cannot fill.
- **Two gotchas that bite live:** (1) keep the `{0}`/`{num}` **placeholder** in the
  query and pass the real value via `--param`; substituting the raw value fails to
  match the route. (2) pass `--method` explicitly for writes — GET and POST share
  a URL.
- **Do not trust a route-map write until it is live-verified.** Example: the map
  claimed DRIP toggles via `PATCH corp_actions/drip/enrollment/{num}/`; live, all
  of PATCH/POST/PUT return `405` — that endpoint is GET-only. A dry-run would have
  endorsed the bad body forever. Treat unverified write bodies as research.

### Equity buying — `buy` + `search` (verified live 2026-06-03)

- **Ground the ticker first.** With only a name/theme, run `brokerage search "<name>"`
  (Robinhood's own search bar, `midlands/search/`) and pick the exact symbol. **Never guess
  a ticker.** (A prior agent guessed `SSO` for an "Oracle 2x ETF"; `search "oracle 2x"` returns
  the real ones — `ORCX` / `ORCU`.) Search output flags `fractional` eligibility and `OTC`.
- **Place with `brokerage buy`** (single) or `scripts/equity-buy.mjs` (batches) — both build the
  web order body (`order_form_version: 7` + live bid/ask collar):
  - `brokerage buy ORCU --account <num> --dollars 5` → fractional dollar-notional (market).
  - `brokerage buy RNECY --account <num> --shares 1` → whole shares; **OTC auto-limits at ask**.
  - Dry-run by default; live needs `--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1`.
- **OTC / fractional guard.** Before a dollar order the tool reads `fractional_tradability` +
  `otc_market_tier`. OTC names (e.g. RNECY) are `position_closing_only` and **reject market
  orders** — buy them as **whole shares via a marketable limit**. "$X of <OTC>" is impossible;
  switch to `--shares` and say so rather than malforming an order.
- **Rate limit — agentic managers, NOT an HFT script.** `orders/` burst-limits *fractional*
  orders (~9, then HTTP **429**, ~48s cooldown). A web endpoint will never tolerate hammering.
  Pace ≥2.5s; on 429 sleep the server-directed seconds and retry the **same `ref_id`** (429 =
  nothing placed → idempotent). The batch script does this and **stops on "You can only purchase
  0 shares" / "Not enough buying power"** (account dry) instead of spamming dead orders.
- **Affordability.** Read `get_portfolio.buying_power` before a batch and size to fit — $3–5 DCA
  across dozens of names drains an account fast (a $40k account can show ~$1 buying power).

### Options order gotchas (verified live 2026-06-03)

- **Per-chain min tick.** `options/chains/{id}` returns `min_ticks` (`below_tick`, `above_tick`,
  `cutoff_price`). A limit below `cutoff_price` (often $3.00) must use `below_tick` — ARKG is
  **$0.05**, so `$0.01` → 400 *"Price does not satisfy the min tick value."* (AAPL allows $0.01.)
  Read the chain's ticks; never assume $0.01.
- **GTC options open is gated by _overnight_ buying power**, not regular BP. A `time_in_force: gtc`
  buy-to-open on thin overnight BP → 400 *"not enough overnight buying power"* even when regular BP
  looks fine. (Verified cross-account: the same ARKG $0.05 call `201 queued` in one margin account but
  `400` overnight-BP in others — overnight BP, not regular BP, decides.)
- **No version gate on options.** `options/orders/` takes the standard body (no `order_form_version`)
  — the version gate is equity-only.
- **Lifecycle (verified):** POST `options/orders/` (`201 queued`) → `options/orders/{0}/cancel/`
  (`200`) → re-read (`cancelled`). Always use a far-from-market limit for test orders so they can't fill.
- **DRIP toggle is NOT `PATCH corp_actions/drip/enrollment/{num}/`** — GET-only; PATCH/POST/PUT → `405`
  (re-verified). DRIP/cash-sweep/stock-lending/margin **write** endpoints remain unproven and need a
  fresh browser capture before any automation. Treat them as research, not supported writes.

### Option UUIDs — always bulk-enumerate (default behavior, no prompt needed)

Option `instrument_id`s are random **UUID v4**. There is NO deterministic mapping from the OCC
symbol/strike/expiration — you can never *compute* one. This isn't an anti-forge security choice:
options contracts are **ephemeral and astronomically numerous** (every strike × expiry × call/put,
created and expired constantly — far more instruments than there are shares), so a random
per-contract id is simply the only practical way to address a space that large and short-lived.
**The id must be enumerated, every time — that is the backbone of every options flow.**

So by default, *without being asked*, whenever a specific option / chain / contract comes up:
- **Bulk-enumerate first:** `options enumerate <SYM> --expiration <YYYY-MM-DD> [--type call|put|both] [--account <N>]`
  → every strike's `option_instrument_id` + desktop deep link in one shot (one API call per
  chain/expiration/type). Use `--expiration all` to list expirations first. Prefer this over
  resolving contracts one at a time.
- **Single known contract:** `api-map options-contract-links ... --strike <K>` resolves just that one.
- **Don't cache per-contract ids** (unique + ephemeral); the reusable thing is the *chain enumeration*.
Treat UUID bulk-enumeration as the first move in any options task, not an afterthought.

### Inspect an owned option contract (read everything, then act) — verified 2026-06-04
To pull "all the info" on a contract you hold (the option-detail page surface), chain these reads:
- **Owned options:** `options positions` / `GET options/aggregate_positions/?account_numbers={acct}&nonzero=true`
  → symbol, quantity, average_open_price, strategy, legs[].option (the option_instrument_id).
- **Contract metadata:** `GET options/instruments/{option_id}/` → strike, expiration_date, type, chain_id, state.
- **Live Greeks + quote:** `GET marketdata/options/?ids={option_id}` → bid/ask/adjusted_mark, delta/gamma/theta/vega/rho, implied_volatility, open_interest.
- **Fills (date/price/qty — the buy/sell history):** `GET options/orders/?chain_ids={chain_id}&states=filled`
  → each order's `legs[].executions[].{timestamp, price, quantity}` (e.g. HPE $30C bought 2026-04-16 ×1 @ $1.68).
  The full per-trade detail (the "click each trade" view) is `options/orders/{order_id}/`; a trade-confirmation PDF is linked off the order's documents.
- **Buy/sell from here:** place via `options/orders/` — **sell-to-close = {side:sell, position_effect:close}** (the others per the order-templates doc). TIF `gfd`|`gtc`; order types `limit`/`stop_limit`/`market`/`stop_market`.

> **Tax timing (rare — usually ignore):** holding period almost never matters and shouldn't be raised. The only times to flag it: a position within ~days/weeks of crossing the **1-year short→long-term capital-gains line**, or near a **tax-year boundary** (defer a close to January). Compute the holding period from the fill `timestamp` above; mention it ONLY in those edge cases. Deeper angles (qualified covered calls, §1256, deferral) in `docs/tax-aware-options-strategies.md`.

### Sentiment data + deep-link pipeline (mapped 2026-06-03)

RH exposes a live sentiment layer under `api.robinhood.com/midlands/` (risk `read`). Read it as the
**slow, account-native confirmer**, not the leading signal — it trails the real-time off-platform
pulse (see "Signal sourcing" below):
- `midlands/news/?symbol=<SYM>` — news articles per ticker.
- `midlands/ratings/{instrument_id}/` — analyst buy/hold/sell summary + dated texts.
- `midlands/tags/tag/{100-most-popular|top-movers|...}/` — crowd / momentum instrument lists.
(Per-instrument `instruments/{id}/popularity/` is now 404 — use the `tags` crowd lists instead.
Internal hosts `news./youfeed./charted./ai-realtime.` have no public TLS; `midlands/` is the surface.)

**Signal → deep link → order:** a signal ("SPY $1000c EOY", "+$100 from strike") → contract spec
→ resolve via `api-map options-contract-links` (symbol→chain→**bulk-enumerate** `options/instruments/`
→ match strike → `option_instrument_id`) → it emits `links.webContractPageDesktop`
(`robinhood.com/options/instruments/{uuid}/`, the verified desktop order ticket; `+?account_number=`
to pin). **Option UUIDs are random v4 — not generatable; bulk-enumerate a chain/expiration in one
call.** The URL carries no side; set `side`+`position_effect` in the `options/orders/` body
(buy/open, sell/close, sell/open, buy/close) for the agentic order.

### Signal sourcing — where due-diligence signal comes from (descriptive, NOT risk guidance)

A research-grade view of *where to look* and *how much to trust it*. This is a decision framework —
a tool in the kit — not a mandate to be cautious. Risk and sizing are the operator's call.

- **News is slow but authoritative for key/binary events.** Articles lag the real move by ~hours to
  a day; their value is the discrete, confirmable event — earnings, M&A, Fed, halts, guidance — where
  being *right* matters more than being *first*. Useful, just late. Don't treat it as early signal.
- **Every feed is noisy — but Twitter/X and Reddit carry the best signal-to-noise**, and **Twitter is
  the fastest finger on the pulse**, ahead of any news article. For DD on a thesis, a narrative, or an
  unfolding move, X/Reddit are first-class research sources (`bird search`, the `last30days` skill,
  r/options · r/thetagang · r/stocks), not gossip to wave off. Cross-checking the crowd's read in
  real time is legitimate due diligence.
- **Institutional research — the slow, regime-thesis layer.** Major firms publish a steady stream worth
  tapping: **BlackRock Investment Institute** (year-ahead outlook + "mega forces"), **Vanguard / J.P.
  Morgan / Goldman / Morgan Stanley** year-ahead theses and **long-term capital market assumptions**
  (1-yr and 5–10-yr expected returns by asset class). Lower frequency than the pulse — useful for the
  "what regime are we in / what's the decade thesis" frame. But a house view is **still a view**: these
  firms are routinely wrong and talk their book. It *informs* sector/ticker attention and feeds Ball
  Knowledge; it never dictates. Current synthesis: `docs/institutional-outlook-2026-06-04.md` (refresh
  each cycle — year-ahead drops Nov–Dec, CMAs annually).
- **Academic + dissertation-level math — the "why it works" foundation.** For any strategy the agent
  reasons about deeply, go past prose to the actual quant (Black-Scholes derivations, EV under the
  variance-risk-premium, N(d₂) assignment probability, Greeks calculus, management/sizing math) grounded
  in peer-reviewed / SSRN work. The strategy deep-dives carry rigorous **Quant appendices** for this —
  but a model is a *model*: every result rides assumptions (lognormal, constant σ, no early exercise,
  frictionless) that break in practice; the appendices say where. Math explains the *structure* of an
  edge, not a guarantee it persists.
- **None of these is gospel — they are information *on deck*.** The pulse, the house views, and the math
  are all *inputs to weigh by reliability*, never authority or permission to act. Same stance as Ball
  Knowledge: weigh them, cross-check, and decide — don't obey any of them. Rough ladder by
  speed-vs-conviction: **X/Reddit pulse → institutional outlooks → academic math**, all subordinate to
  live market data and brokerage order history for anything that touches a real trade.
- **Twitter's edge is conditional: fastest pulse AND fastest misinformation.** The high
  signal-to-noise only holds *if you know whom to read* — which accounts have earned signal vs. which
  are hype/promotion. The "who" is operator-specific and lives in the **Ball Knowledge** ledger
  (`ball-knowledge.md`, see its own section below) as source-lead entries; the committed file stays
  generic, and sensitive/personal source lists are the operator's discretion. Weight known,
  track-record sources over anonymous virality, and corroborate a single post before leaning on it.
- **Signal → (optional) validation → action.** Any feed — RH `midlands/*` or external X/Reddit — is a
  *direction input*. You *can* corroborate against live market data (bid/ask, Greeks, volume/OI,
  `quote`) before acting; presented as available reasoning, not a requirement. RH's own feeds sit at
  the *confirmer* end of this; the off-platform pulse leads.

> RH `midlands/news|ratings|tags` is the slow, broker-native layer. Lead due diligence with the
> real-time pulse (X/Reddit) and let RH's feeds confirm — not the reverse. (Trusted sources + themes
> accumulate in **Ball Knowledge** — see below.)

### Ball Knowledge — the operator's investing-memory ledger (`ball-knowledge.md`)

The repo root holds **`ball-knowledge.md`**, a living, chronological, append-only ledger of broad
investing context the operator (Zayd) intentionally wants remembered. Read it on any finance task; it
is the project's "market brain" memory layer. It is **context, not authority** — the rules below are
binding for this skill; the ledger file itself stays deliberately messy and unlabeled.

- **What it holds (broad basket):** alpha, thesis fragments, hot sectors, tickers, hunches, rumors,
  source leads / X accounts, analysts, earnings & investor-day notes, macro, catalysts, trading-style
  notes, dividend/income preferences, risk appetite, watchlist ideas — down to a single ticker or
  `@handle`. Rough/shorthand/speculative entries are valid.
- **Binding rule:** anything in the file was *intentionally added* → treat it as **important investing
  context**, even if rough. "Important context" = pay attention, frame analysis, prioritize research,
  remember themes/sources/preferences. It does **not** mean blindly obey.
- **Classify by type before using it** (the file is unlabeled — you infer): rumor → *consider, then
  verify before relying on it*; bare sector/ticker → *keep on the radar*; `@handle`/newsletter →
  *source lead, not verified truth*; "0DTE / balls-to-the-wall" → *high-risk style note — surface the
  risk plainly, don't normalize it as default*; "QDTE / dividend" → *income preference — weigh yield
  sustainability, taxes, downside*; "user wants X" → *preference/profile, reconfirm specifics*.
- **Minor recency bias only.** Newer entries are slightly more relevant; older ones still matter unless
  contradicted, marked obsolete, clearly stale, or removed. A timeline, not an expiring feed.
- **Influences vs. cannot do.** *Influences:* which sectors/tickers/sources/risks/catalysts the agent
  attends to, how it frames a thesis, what it researches. *Cannot:* authorize/place/cancel a trade,
  prove a rumor or thesis, or override user confirmation, live market data, or brokerage order history.
- **Neutral, not preachy.** Reflect the operator's own posture; surface risk where an entry implies it,
  but don't impose caution or sizing the operator didn't ask for (same stance as "Signal sourcing").
- **Adding entries — append-only, preserve the messy spirit.** Append to the **bottom**, in date order;
  never rewrite/delete older entries unless asked. Exact format:

  ```
  === BEGIN BALL KNOWLEDGE ENTRY
  DATE:    YYYY-MM-DD
  SUBJECT: <short>
  ===
  INVESTING NOTES:
  """
  <the note — a ticker, sector, person, @handle, rumor, thesis, strategy, preference, or thought>
  """
  === END BALL KNOWLEDGE ENTRY
  ```
- **When Ball Knowledge shapes an answer, say so plainly** ("your Ball Knowledge already flags
  semiconductors, so I'd start the universe at NVDA/TSMC/…"; "that reads as a source lead, not a
  verified thesis yet"). **Public file — keep committed entries generic;** sensitive/personal source
  lists are the operator's discretion (or a future private overlay), not the committed seed.

> **Two memory layers:** *Ball Knowledge* (`ball-knowledge.md`) = market context/beliefs;
> *Trading log* (`trading-log.md`, below) = execution + intent history. Read both on finance tasks.

### Trading log — execution + intent history (`trading-log.md`)

The repo root holds **`trading-log.md`**, an append-only, dated log of what the agent *executes*, with
the **intent** and the **strategy thread** behind each trade. Order history has price/qty/time; this
log adds the *why* and links legs into a thread, so the agent can reconstruct **what it's rolling
*from*** (e.g. a Wheel: CSP → assignment → CC → roll) instead of re-deriving it from raw history.

- **Log every execution** the agent performs via CLI/MCP — orders, cancels, settings changes, recurring
  pause/resume. **Append at the bottom** (newest last); never rewrite or delete prior entries.
- **Status is honest (order-evidence rule, failure mode #20):** mark a trade `executed` **only if
  brokerage order history confirms** it (filled/pending/cancelled record, or a position/cash/BP
  change). UI/screenshots/"clicked it" are not proof — if there's no record, it's `dry-run`/`rejected`/
  non-executed, and say so.
- **Always capture INTENT + THREAD.** On a wheel/roll, record what you're rolling *from* (prior leg,
  assignment date, old strike/DTE). This is the field that makes the log worth more than order history.
- **Entry format** (mirror `trading-log.md`'s header):

  ```
  === TRADE LOG ENTRY
  WHEN: YYYY-MM-DD HH:MM TZ | ACCOUNT: …<last4> | ACTION: <buy/sell/cancel/setting> <symbol/contract> (side/effect, type, TIF)
  SIZE: <qty> @ <price> | ORDER-ID: <id|n/a> | STATUS: executed|queued|cancelled|rejected|dry-run (order-history-confirmed?)
  INTENT: <why, 1-2 lines>
  THREAD: <strategy thread, e.g. "Wheel on F: leg 2 CC after CSP assigned YYYY-MM-DD; rolling from $K">
  === END
  ```
- **Public + committed — keep entries generic** (account masked to last-4). Real, sensitive personal
  logs stay generic here or in a gitignored private overlay (committed entries push to GitHub). Same
  neutral stance as Ball Knowledge: record faithfully, don't impose caution.

## Research Methodology — mapping a no-official-API surface

Because there is no official brokerage API, the surface is discovered, not
documented. To extend it safely:

1. **Capture, don't guess.** Drive the logged-in web UI with the network tab / CDP
   recording open, perform the action once, and capture the exact method, URL, and
   body. That capture is the source of truth (the DRIP write endpoint, for
   example, is only knowable this way).
2. **Add it to the map** (`api-map/brokerage-routes.json`), rebuild
   (`pnpm build`), then **live-verify** with a reversible action.
3. **Recon for surface, not exploits.** Passive enumeration (subfinder, dnsx,
   waybackurls) maps the host/endpoint space; cross-reference against the route
   map to spot anything missing. Note interesting hosts (`api-streaming` for
   websockets, `ceres` futures, `vgs` tokenization) without intrusive scanning.
4. **Document honestly.** Mark anything not live-verified as research; never claim
   working automation for an unconfirmed body. Keep raw/private captures in the
   gitignored `info/` folder; promote only sanitized, tested behavior to the public
   CLI/MCP/docs.

> Greeks as a math function: the full delta/gamma/theta/vega/rho model, net-Greek
> aggregation across legs, and the Black-Scholes sanity baseline are in *Options
> Greeks and Strategy Math* above. An agent can specialize there when asked for
> deep options analysis — but it is a tool in the kit, not the default mode.

---

## MCP Server

28 tools surfaced via Hermes MCP (route/strategy planning + generic executors, PLUS first-class parity tools mirroring the CLI verbs: `robinhood_accounts`, `robinhood_positions`, `robinhood_portfolio` (one-call P&L: day Δ + after-hours Δ, drivers by underlying in dollars), `robinhood_options_holdings`, `robinhood_options_inspect`, `robinhood_settings`, `robinhood_recurring`, `robinhood_quote`, `robinhood_history`, `robinhood_watchlist`, `robinhood_options_enumerate`). Same engine -> same auth, gate, and method-aware routing as the CLI.

> **Count note:** the *source/dist* registers 28 tools. A *running* MCP process started before the
> last tool additions will still advertise its old count until reloaded — run `/reload-mcp` (or restart
> the server) after pulling, then confirm the client lists all 27.

### Registration

```bash
hermes mcp add robinhood --command "node" \
  --args "C:/Users/ZaydK/Desktop/robinhood-cli/mcp/dist/server.js"
```

Or for Claude Code / other MCP clients:

```bash
claude mcp add robinhood-cli -s user -- \
  node /absolute/path/to/robinhood-cli/mcp/dist/server.js
```

### MCP Tools

| Tool | Purpose |
|------|---------|
| `robinhood_api_map_summary` | Summarize the route map |
| `robinhood_brokerage_routes` | List brokerage routes with filters |
| `robinhood_routes` | Unified route map (crypto + brokerage) |
| `robinhood_browser_routes` | Latest CDP-captured route templates |
| `robinhood_account_context_workflows` | Browser-observed account-number routing workflows |
| `robinhood_account_context_url` | Build a workflow URL from safe placeholders |
| `robinhood_options_strategy_workflows` | Strategy catalog with payoff and Greek posture |
| `robinhood_options_strategy_plan` | Dry-run strategy lookup steps + order body template |
| `robinhood_options_contract_plan` | Exact contract web navigation candidates + API resolution plan |
| `robinhood_options_contract_link_bundle` | Account-pinned option chain/link bundle for webhook handoff research |
| `robinhood_stock_profile` | Stock detail page quote/fundamental/borrow/margin read join |
| `robinhood_brokerage_plan` | Create a dry-run plan (no execution) |
| `robinhood_brokerage_execute` | Execute a brokerage request |
| `robinhood_crypto_routes` | List official Crypto API routes |
| `robinhood_crypto_sign` | Generate Crypto API auth headers |
| `robinhood_crypto_plan` | Dry-run plan for Crypto API |
| `robinhood_crypto_execute` | Execute a Crypto API request |
| `robinhood_accounts` | List every account (full graph via `transfer/accounts/`) with type/capabilities |
| `robinhood_positions` | Equity positions for an account (UUIDs resolved to tickers + quotes) |
| `robinhood_options_holdings` | Every held option contract (UUID + strike + bid/ask/last + qty + link) |
| `robinhood_options_inspect` | Full detail on one owned contract (metadata, Greeks, fills, buy/sell handoff) |
| `robinhood_settings` | Read/toggle account settings: DRIP, trade-on-expiration, PDT-protection, lending, sweep (double-gated) |
| `robinhood_recurring` | List/create/edit/end recurring investment schedules (double-gated writes) |
| `robinhood_quote` | Live quote(s) for one or more equity/ETF symbols |
| `robinhood_history` | Unified history (equity + options + crypto orders + transfers), newest first |
| `robinhood_watchlist` | Read custom watchlists (`owner_type=custom`) |
| `robinhood_options_enumerate` | Bulk-enumerate every strike's `option_instrument_id` for a chain/expiration |

### MCP Safety Gates

Same double-gate as CLI:
- **Reads run live** — no gate needed.
- **Writes are dry-run by default.** To go live: `liveWrite: true` + `ROBINHOOD_ALLOW_LIVE_WRITE=1` in the server's environment.
- `dryRun: true` always forces a plan, even with both gates set — a deliberate "preview this exact live call" escape hatch.

Reload MCP tools in-session with `/reload-mcp`.

Full details: `AGENTS.md` §6, §11.

---

## Accounts

**The operator designates which account(s) the agent may control.** Do not assume which account a
given action targets, do not assume which is "primary," and never hardcode account numbers. Discover
accounts at runtime (§2 of AGENTS.md — `transfer/accounts/` for the full list) and read buying power to
see which are funded; then act only on the account the operator names. Account types you may encounter:
individual brokerage (cash or margin), Roth IRA, and crypto — capabilities differ by type (see the
account-capability table). Some accounts may be nicknamed; a nickname implies nothing about funding or
priority. When the target account is unclear, ask.

**Never hardcode account numbers; never assume which account is "primary"; act only on accounts the
operator designates.**

---

## Cross-Machine Infrastructure

The user operates across multiple machines on a private Tailscale network:

- **mothership** (Windows 10): always-on GPU server, runs Hermes. Primary Robinhood CLI host.
- **frostbyte** (macOS): daily-driver laptop, also runs Hermes.

File transfer options, in priority order:
1. **Syncthing** — folder `home-sync` at `~/Sync`, shared between machines. Web UI at `:8384`. Primary channel for moving `.env` auth tokens and files.
2. **scp from frostbyte** — `scp <file> user@mothership-ip:<path>`
3. **SSH** — frostbyte→mothership works; mothership→frostbyte is broken (key rejected).

Always try Syncthing before fighting with SSH.

---

## Common Pitfalls

### Route Map & Build

1. **Editing source without rebuilding.** The runtime reads `cli/dist/api-map/`, not `api-map/`. Rebuild after every map edit: `pnpm --filter @zaydiscold/robinhood-cli build`.
2. **`url_template` vs `url`.** 9 watchlist routes use `url_template`; the engine matches on `url` only. Copy `url_template` → `url` in both copies. (Fixed locally, not pushed.)
3. **`accounts/` under-reports.** Shows only 2 accounts. Use `bonfire.robinhood.com/transfer/accounts/` for the complete list.
4. **Route matching is substring-based.** A raw account number won't match `portfolios/{num}/`. Use brace syntax + `--param`.

### Portfolio & Data

5. **Per-account portfolio lacks `equity_previous_close`.** The list endpoint (`portfolios/`) has it, but only for the primary account. For day-change across all accounts, use portfolio historicals or external pricing.
6. **Positions return UUIDs, not tickers.** Batch-resolve with `instruments/?ids={ids}` and `marketdata/quotes/?ids={ids}`.

### Watchlists

7. **`owner_type=custom` is MANDATORY.** Every watchlist read without it returns 400: `"owner_type of request must be specified"`.
8. **Rename uses `display_name`, not `name`.** Wrong field → 200 with no change.
9. **The Options Watchlist cannot be deleted.** Robinhood hard-blocks it server-side (not a CLI bug).
10. **Item add/remove/reorder is not yet mapped.** POST to `discovery/lists/items/` returns `"failed operations":""` with no detail.

### Writes & Safety

11. **Writes need BOTH gates.** `--live-write` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1`. One alone = dry-run. Never export the env var into your shell profile — keep it inline.
12. **Method-aware routing fails closed.** A forced `--method POST` (or PATCH/PUT/DELETE) on a URL with no matching write route now returns **no match** (clear error), instead of silently degrading to the GET route — so a forced write can never be mis-resolved into a read at the wrong risk class. (GET/HEAD stay permissive for legacy route entries without method metadata.)
13. **`dryRun: true` always wins in MCP.** Even with both gates set, it forces a plan. Use it to preview exact live calls.

### Cross-Machine

14. **Syncthing first, SSH last.** mothership→frostbyte SSH is broken. Use Syncthing (`~/Sync`) or scp from frostbyte.
15. **Token freshness.** If Robinhood was logged in on frostbyte, the token in Chrome's localStorage there is the freshest. Syncthing it to mothership's `.env` is the standard flow.

### Crypto API

16. **Crypto API uses a different auth scheme.** Requires API key + base64-encoded private key, not the brokerage bearer token. Sign headers with `robinhood_crypto_sign` before calling `robinhood_crypto_execute`.

---

## One-Shot Recipes

### Portfolio Snapshot (All Accounts)

```bash
# 1. Discover all accounts
node cli/dist/index.js brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full

# 2. For each account, get portfolio
node cli/dist/index.js brokerage execute "portfolios/{num}/" --param "num=<N>" --json --full

# 3. Get positions (returns instrument UUIDs)
node cli/dist/index.js brokerage execute "positions/?account_number={n}&nonzero=true" --param "n=<N>" --json --full

# 4. Resolve UUIDs to tickers + prices
node cli/dist/index.js brokerage execute "instruments/?ids={ids}" --param "ids=<uuid1,uuid2>" --json --full
node cli/dist/index.js brokerage execute "marketdata/quotes/?ids={ids}" --param "ids=<uuid1,uuid2>" --json --full
```

### Options Trade (End-to-End Preview)

```bash
# 1. Symbol → instrument + chain ID
node cli/dist/index.js brokerage execute "instruments/?symbol={symbol}" --param symbol=AAPL --json --full

# 2. Chain → expirations + tick rules
node cli/dist/index.js brokerage execute "options/chains/{id}/" --param id=<CHAIN_ID> --json --full

# 3. Find the strike
node cli/dist/index.js brokerage execute \
  "options/instruments/?chain_id={chain_id}&expiration_dates={date}&state=active&type=call" \
  --param chain_id=<CHAIN_ID> --param expiration_dates=<YYYY-MM-DD> --param type=call --json --full

# 4. Quote the option
node cli/dist/index.js brokerage execute "marketdata/options/?ids={ids}" \
  --param ids=<OPTION_INSTRUMENT_ID> --json --full

# 5. Dry-run the order (safe — sends nothing)
REF=$(python3 -c "import uuid;print(uuid.uuid4())")
node cli/dist/index.js brokerage execute "https://api.robinhood.com/options/orders/" --method POST \
  --body-json "{\"account\":\"...\",\"direction\":\"debit\",\"legs\":[{\"side\":\"buy\",\"option\":\"...\",\"position_effect\":\"open\",\"ratio_quantity\":1}],\"type\":\"limit\",\"time_in_force\":\"gtc\",\"trigger\":\"immediate\",\"price\":\"0.01\",\"quantity\":\"1\",\"ref_id\":\"$REF\"}" \
  --json --full
```

Full worked example with real placeholders: `AGENTS.md` §7.

### Recurring Buys (Resume All)

```bash
# List all recurring schedules (live read)
node cli/dist/index.js brokerage execute "recurring list" --json

# Resume all paused (dry-run first)
node cli/dist/index.js brokerage execute "recurring resume --all" --json

# Live resume — BOTH gates
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js brokerage execute \
  "recurring resume --all --live-write" --json
```

Full details: `AGENTS.md` §9.

### Add a New Route to the Map

1. Capture the endpoint from the authenticated web app (browser dev tools or CDP).
2. Add it to `api-map/brokerage-routes.json` with conservative risk classification.
3. Rebuild: `pnpm --filter @zaydiscold/robinhood-cli build`.
4. Verify: `node cli/dist/index.js brokerage execute "<new-route>" --json --full`.
5. Document the discovery method in `docs/undocumented-surface.md`.

### 📊 Day / After-Hours P&L — use the `portfolio` command (don't hand-compute)

"What am I down today / after hours / which names?" is **one command** — no manual quote math:

```bash
node cli/dist/index.js portfolio                # all accounts: day Δ + after-hours Δ, drivers by underlying ($)
node cli/dist/index.js portfolio --after-hours  # rank by the after-hours move
node cli/dist/index.js portfolio --day          # rank by the full-day move
node cli/dist/index.js portfolio --by position --top 10 --json
```
It composes accounts → `portfolios/{num}/` (day Δ = `equity − adjusted_equity_previous_close`;
after-hours Δ = `extended_hours_equity − equity`) → positions + quotes + option marks, attributes in
DOLLARS, rolls up by underlying across accounts, and prints a reconciliation line (drivers vs top-line).
After-hours is EQUITY-only (options don't print after-hours). Same engine as the MCP tool
`robinhood_portfolio`. **Don't** rebuild this by hand from `positions`+`quote` (percent math is size-blind
and gets the metric wrong), and **don't** use `equity_previous_close` (it's "0" per-account — the command
uses `adjusted_equity_previous_close`).

**Common mistake:** `brokerage execute "positions/?nonzero=true"` FAILS (`brokerage execute` doesn't take
query params) — use the `positions` command, or just `portfolio`.

---

## Verification Checklist

- [ ] `pnpm install && pnpm build` completes without errors
- [ ] `.env` exists with a valid `ROBINHOOD_BROKERAGE_TOKEN`
- [ ] `node cli/dist/index.js brokerage execute "accounts/" --json` returns 200
- [ ] `node cli/dist/index.js brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full` shows the full account list
- [ ] `node cli/dist/index.js brokerage execute "portfolios/" --json --full` returns portfolio data
- [ ] MCP server starts: `node mcp/dist/server.js` (or `hermes mcp add` registered)
- [ ] Route map count: `node cli/dist/index.js brokerage routes --json | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])"` returns the live count (~300+ and growing — do NOT assert a hardcoded number; the count drifts as routes are captured)
- [ ] Watchlists work: `node cli/dist/index.js brokerage execute "discovery/lists/?owner_type=custom" --json` returns 200
- [ ] Dry-run gate works: a POST without `--live-write` returns `liveWriteBlocked`
- [ ] Live write gate works: a POST with `--live-write` but without `ROBINHOOD_ALLOW_LIVE_WRITE=1` returns `liveWriteBlocked`

---

## Agent Rules

- Treat `api-map/robinhood-routes.json` as the unified route map: official Robinhood Crypto OpenAPI + community seed + sanitized CDP capture.
- Treat `api-map/brokerage-routes.json` as the browser-backed brokerage/account subset used by `brokerage execute`.
- Reads run live and free. Writes default to dry-run unless BOTH gates are set.
- Never trade, transfer, cancel, unlink, or mutate unless the user explicitly asked for that exact live operation. Echo back the resolved account + symbol + side + qty + price and get a yes before sending.
- If you discover a route not in the map, add it, classify risk conservatively, rebuild, and document the discovery in `docs/undocumented-surface.md`.
- If you hit a 401: the engine self-heals. If it fails, run `pnpm auth:refresh` manually.
- The `recurring` subcommand is preferred over raw URL calls for recurring buys — it's idempotent and safer.
