# Agent Operating Intelligence — robinhood-cli

**Date:** 2026-06-04
**Audience:** any agent (Claude / Hermes / Codex) about to operate this tool.
**Purpose:** not a reference dump — this is the hard-won operational judgment that
turns a route map into safe, correct action. `SKILL.md` and `AGENTS.md` tell you
*what the commands are*; this doc tells you *how to think* so you don't lose money,
misreport a non-event as a fill, or act on the wrong account. Read it once, top to
bottom, before your first account-touching call.

Everything below is grounded in live verification (read/dry-run only on 2026-06-04
unless noted). Account numbers are masked to last-4.

---

## 0. Boot checklist — what to read and run, in order

Do this before any account-specific operation. It fails you fast instead of
mid-batch.

1. **Read the safety model first** (§ below + `SKILL.md` "Failure modes"). The cost
   of skipping it is real money; the cost of reading it is 90 seconds.
2. **`date`** — expirations, staged rolls, after-hours behavior, the §1256 1-year
   line, and recurring timing all depend on knowing today.
3. **Auth/login is live?** `node scripts/equity-buy.mjs --preflight` — one call,
   prints `PREFLIGHT: OK — auth live, N accounts` or `FAIL`. On FAIL →
   `pnpm auth:refresh`, retry once. Do NOT spin up browser sessions to "check login."
4. **CLI builds + runs?** `node cli/dist/index.js --help >/dev/null`. The built
   `cli/dist/` is the source of truth — the runtime reads `dist`, never the `src`/
   source JSON. If you edited the route map and didn't `pnpm build`, your edit does
   nothing.
5. **Enumerate every account the RIGHT way** (see §2 — this is the trap):
   `node cli/dist/index.js accounts --json` (first-class, capability-annotated) or
   `brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full`.
   **Never** trust bare `accounts/` and **never** hardcode account numbers.
6. **Confirm the gate is off by default.** A POST without `--live-write` must return
   `liveWriteBlocked`. If it doesn't, stop — something is misconfigured (e.g. the env
   var got exported into your shell, which is itself a bug — see §1 rule 3).

7. **On any finance / research / due-diligence task, read `ball-knowledge.md`** (repo root — the
   operator's investing-memory ledger) and apply the **Signal-sourcing** framework (§1 "Signal is a
   surface" + SKILL.md "Signal sourcing" / "Ball Knowledge"): lead DD with the off-platform pulse
   (X/Reddit), treat RH `midlands/*` + news as the slow confirmer, classify each ledger entry by type,
   and treat it all as context — never permission to trade.

If all seven pass, you're cleared for reads and dry-runs. Live writes still require
explicit user approval + both gates, every single command.

---

## 1. The cardinal rule: verify the API surface, not the consumer surface

**This is the deepest lesson in the whole repo. Internalize it.** The thing the app
*shows a human* (the search bar, the bare endpoint, the "obvious" route) is a
lossy, sometimes actively misleading projection of what the API can actually do.
Three separate confident-but-wrong defaults fell over the moment they were checked
against the real API on 2026-06-04. Each would have caused a wrong action or a wrong
answer:

1. **A fabricated position.** A position-spoof / assumed-holdings shortcut invented
   holdings that weren't there. The fix is never to assume what's held — read it:
   `options positions` / `positions` / `options holdings`, resolved against the live
   API, is the only truth about what exists.
2. **The route resolver silently picking the wrong "orders/" route.** There are ~11
   distinct `orders/`-family routes including the **destructive cancel** route. A bare
   substring query is ambiguous; a careless resolver could grab cancel when you meant
   read. (The engine now *fails closed* on forced writes with no match and *fails
   loud* — `AmbiguousRouteError` with the candidate list — on ambiguous substrings.
   Respect those errors; they are catching exactly this.)
3. **"Robinhood has no index options" — FALSE.** The consumer `search` bar and
   `instruments/?symbol=SPX` return *only ETF proxies and empty result sets*, which
   produces the false conclusion. But true cash-settled §1256 index options
   (**SPX, SPXW, XSP, NDX, VIX, RUT** + PM/weekly variants) live under
   `options/chains/?underlying_symbol=SPX` with `underlying_type:"index"` and an
   **empty `underlying_instruments` array** (the structural fingerprint of cash
   settlement). The whole §1256 / European-box tax surface is reachable on RH — it was
   declared absent only because nobody queried the right endpoint.

**The operating principle that falls out of this:**

> Before you assert a capability is absent, a position exists, or a route is "the
> obvious one," query the authoritative API endpoint and read the actual response.
> The consumer UI / search bar / bare endpoint is the *narrowest* view, not the
> *complete* one. When a UI surface and an API surface disagree, the API wins and the
> UI is hiding something.

Practical corollaries:
- "Search returned nothing" ≠ "doesn't exist." Try the structural endpoint
  (`options/chains/?underlying_symbol=`, `midlands/lists/items/`, `transfer/accounts/`).
- "The bare endpoint returned 2 accounts" ≠ "there are 2 accounts."
- Pass exact URLs for writes; let the resolver's fail-closed/fail-loud behavior catch
  ambiguity rather than guessing past it.

### Signal is a surface too — not gospel, and not where you think

The same "verify, don't assume" instinct applies to *research signal*, not just routes. Where signal
comes from changes how much it's worth — and the platform's own feed is the *slowest* view:
- **RH `midlands/news|ratings|tags` is the slow, broker-native confirmer**, not the leading signal.
  It trails the real-time off-platform pulse by hours-to-a-day.
- **The real-time pulse lives on Twitter/X + Reddit** — noisy, but the best signal-to-noise, and X is
  fastest. First-class due-diligence sources (`bird`, the `last30days` skill, r/options · r/thetagang),
  *if you know whom to read* (X is fastest pulse AND fastest misinformation — corroborate a lone post).
- **News** is laggy but authoritative for **key/binary events** (earnings, M&A, Fed, halts) — right
  beats first there. Lead DD with X/Reddit; let news + RH feeds confirm.
- This is a *framework for sourcing*, not a sizing/risk rule — the operator decides what to do with it.
  Themes + trusted sources accumulate in the **Ball Knowledge** ledger (`ball-knowledge.md`) — read it
  on finance tasks as the operator's investing-memory layer (context, not permission; classify entries
  by type; minor recency bias). Full version: SKILL.md "Signal sourcing" + "Ball Knowledge"; AGENTS §13/§14.

**And the same instinct applies to whether an order happened.** An order *exists* only if the brokerage
**order history** shows it (filled/pending/rejected/cancelled) or a position/cash/buying-power change
confirms it. No record → treat the attempt as **non-executed**; screenshots, UI/review screens, "the
button was clicked", or agent logs are **not** proof. (This session: a "nothing executed" scare was
resolved by reading the orders list; the place→cancel tests were confirmed the same way.) Read
`orders/` / `options/orders/` / positions before ever claiming a trade went through.

---

## 2. Account model + the wrong-account trap

**Wrong account is the #1 money-loss risk in this tool.** Bare endpoints and the web
UI default to the *individual* account — not the one you intend.

The login has **5 trading accounts** (masked, types from the live graph):

| Masked | Type | Practical state |
|--------|------|-----------------|
| …9919 | rhs / individual (cash, per index-options read context) | ~$0 buying power |
| …6346 | ira_roth | margin-style options (long/defined-risk/CC/CSP), near-zero BP |
| …0497 | rhs / individual margin | near-zero BP |
| …9911 | rhs / individual margin | near-zero BP |
| …7523 | rhs / individual margin | near-zero BP |

Plus funding-only accounts (`ach`/`dcf`) that are NOT trading accounts. **Near-zero
buying power is the normal resting state** of these accounts — the funded value sits
where it sits, and the Agentic accounts are built up through trading. This directly
shapes what orders will clear (see §3: $0 accounts reject overnight-BP buys).

**The trap, stated precisely:** `accounts/` (bare) **under-reports — it showed ~2 of
the 5** in a real session and caused a genuine miss. The **complete** list comes only
from `bonfire.robinhood.com/transfer/accounts/` (or the first-class
`node cli/dist/index.js accounts`, or MCP `get_accounts`). Writes still work against
any owned account by number — so under-reporting doesn't block you, it *hides options
from you* and lets you act on a default you didn't choose.

**Rules:**
- Enumerate via `transfer/accounts/` (or `accounts`), never bare `accounts/`.
- `?account_number=<ACCT>` (web) / the `{account}` path segment (API) selects WHICH
  account *every* op acts on. Pass it explicitly on every account-scoped call. Don't
  wait to be told.
- Before ANY write, echo the resolved `account_number` + nickname + the intended
  side/qty/price and get a yes. A settings toggle or trade on the wrong account is
  the same class of error as a wrong trade.
- Read `account.type` / `brokerage_account_type` and state what the account can and
  cannot do *before* planning a write (cash: no margin/naked, T+1, good-faith;
  margin: rolls/spreads/shorts, PDT if <$25k; Roth: long + defined-risk + CC/CSP, no
  margin/naked). The first-class `accounts` command annotates this for you.

---

## 3. Order lifecycle + after-hours vs market-hours behavior

All of this is **live-verified**, not theorized. It is the difference between "I
placed an order" being true vs. a hallucinated non-event.

**The lifecycle that actually works (after-hours, far-from-market limits):**
`POST orders/` or `POST options/orders/` → **201** with an order `id`, state
`queued` → confirm queued → `POST .../orders/{0}/cancel/` (keep the `{0}`
placeholder, pass the real id via `--param`) → **200** → re-read shows `cancelled`.
A `403`/"cannot cancel" on a second cancel means it was already cancelled. Always use
a limit that **physically cannot fill** for any test (buy `$0.01` where the tick
allows / sell at natural + $200).

**The behaviors that decide whether a real order clears:**

- **Sells need no buying power.** A sell-to-close placed *above the ask* clears with
  zero BP — you're delivering, not paying. This is why a sell test works on a dry
  account.
- **Buys need buying power; GTC opens need *overnight* BP specifically.** A
  `time_in_force: gtc` buy-to-open is gated by **overnight** buying power, not regular
  BP. Regular BP looking fine does NOT mean it clears. On the **$0 accounts you get a
  flat 400 "no overnight buying power."** (Cross-account: an ARKG $0.05 call → `201
  queued` in the account with BP, `400` overnight-BP in the Roth + a near-3mo
  individual.)
- **Fractional equity orders burst-limit.** ~9 fractional orders in quick succession,
  then **HTTP 429** ("too many requests for fractional orders") with a ~48s cooldown.
  We are agentic managers, **not an HFT script** — a web endpoint will never tolerate
  hammering. Pace ≥2.5s; on 429, sleep the *server-directed* seconds and retry the
  **same `ref_id`** (429 = nothing placed → same ref_id is idempotent; a new ref_id
  risks a duplicate). Stop the batch on "you can only purchase 0 shares" / "not enough
  buying power" — the account is dry, more calls just waste quota.
- **Option min-tick uses `below_tick` under the cutoff.** Each chain's
  `options/chains/{id}` returns `min_ticks` (`below_tick`, `above_tick`,
  `cutoff_price` ~$3). A limit below cutoff must use `below_tick` — ARKG is **$0.05**,
  so `$0.01` → 400 "price does not satisfy the min tick value." (AAPL allows $0.01;
  SPX is 0.05/0.10.) Read the chain's ticks; never assume $0.01.
- **A stale after-hours ask makes a market collar meaningless.** The bid/ask collar in
  an equity order body reflects the last-known quote; after hours that quote is stale,
  so a "marketable" limit built off it may be nowhere near where the security will
  actually trade at the open. Treat after-hours collars as plumbing-correct but
  price-meaningless; don't reason about fill probability from a stale ask.
- **Equity orders need `order_form_version: 7`** + the web headers the engine sends,
  or they 400 "app version missing important stock trading updates." Options orders do
  **not** carry the version gate — that's equity-only.

---

## 4. Failure-mode → diagnosis → fix decision tree

When a call misbehaves, match the symptom here before retrying. Most of these are
misuse, not a broken tool — read the actual error first.

| Symptom / error | Diagnosis | Fix |
|---|---|---|
| HTTP **429**, "too many requests for fractional orders" | Burst limit (~9 fractional, ~48s cooldown) | Sleep the *server-directed* seconds, retry the **same `ref_id`**. Don't fixed-sleep, don't give up after one, don't mint a new ref_id (dup risk). Pace ≥2.5s. |
| **400 "no overnight buying power"** on a GTC buy-to-open | GTC opens gated by overnight BP; this account has ~$0 | Not a bug — the account can't afford it. Either fund/switch account, or use a sell/close (no BP needed), or drop GTC. State the constraint; don't retry the same body. |
| **400 "price does not satisfy the min tick value"** | Limit below the chain's `cutoff_price` while not on `below_tick` | Read `options/chains/{id}` `min_ticks`; snap the limit to `below_tick` (e.g. $0.05 for ARKG/SPX). Never assume $0.01. |
| **OTC name rejects `type: market`** / "$X of <ticker>" fails | OTC (`otc_market_tier` set / `fractional_tradability: position_closing_only`, e.g. RNECY) | Switch to whole `--shares` + a marketable **limit at the ask**. Dollar-notional is impossible for OTC; say so, don't re-send the dollar body. |
| **400 "app version is missing important stock trading updates"** | Legacy mobile equity body, missing version field | Add `order_form_version: 7` (engine sends the web headers). Don't spin on the vague message. Options orders are exempt. |
| **`AmbiguousRouteError`** with a candidate list | Your substring matched >1 distinct route (the ~11 `orders/` family is the classic) | Pass the **exact URL** for the route you mean. The error is protecting you from the cancel/destructive route — don't bypass it. |
| Forced write returns **no match / nothing** | Resolver failed closed: a forced `--method POST/PATCH/...` with no matching write route | The route you want isn't mapped as a write, or the method is wrong. Don't let it degrade to the GET route — capture the real route/body first (§ Research). |
| **405** on a PATCH/POST/PUT (e.g. `corp_actions/drip/enrollment/{num}/`) | Wrong endpoint — that one is GET-only | Use the *verified* write route: DRIP is `PATCH corp_actions/drip/account_settings/{account}/` (account-wide) or `.../drip/instrument_settings/{account}/{instrument_id}/`, body `{"drip_enabled":bool}`. Check the capability map before claiming any settings write. |
| **400 "owner_type of request must be specified"** on a watchlist read | `owner_type=custom` is mandatory on every list read | Append `?owner_type=custom`. |
| Rename "succeeds" (200) but nothing changed | Sent `name` instead of `display_name` | Use `display_name`; `name` is a silent 200 no-op. |
| "Order placed!" but the response was a **list** | Omitted `--method` on a write; GET and POST share the URL → you ran the read | Always pass `--method` for writes; confirm the response is a write result (201 + order `id`), not a list. |
| Route-map edit had no effect | Runtime reads `cli/dist/`, not source | `pnpm --filter @zaydiscold/robinhood-cli build`, then re-verify count. |
| `ceres.robinhood.com` / futures order endpoint won't connect (TLS handshake fail) | App-only TLS allowlist; not reachable from any non-app client | Not fixable from here. Futures trading is unsupported (§5). Don't re-probe; don't treat it as a transient network error. |
| Leaning on RH `midlands/news`/`ratings` as the *primary* signal | That's the slow, broker-native confirmer — it trails the real-time pulse | Lead DD with the off-platform pulse (X/Reddit via `bird` / `last30days`); use RH feeds + news to confirm, not to discover. News is authoritative only for key/binary events (§1 "Signal is a surface"). Sourcing framework, not a sizing rule. |
| About to report "order placed/executed" | The only proof is the **order record** — UI/screenshots/logs are not | Read `orders/` / `options/orders/` (or a position/cash/buying-power change). No filled/pending/rejected/cancelled record → it did **not** execute; say so, don't imply otherwise (§1 "whether an order happened"). |
| 401 mid-session | Token expired (~7.8d life) | Engine self-heals once; if it fails, `pnpm auth:refresh`. Don't open browser sessions. |

---

## 5. Asset-class reality map — tradable vs read-only vs absent

State this honestly; never overclaim a capability that isn't there, and never
*under*claim one that is (the index-options miss was an underclaim).

| Asset class | Status | What's true |
|---|---|---|
| **Equity / ETP** | **Placeable** | Dollar-notional (fractional, market) or whole shares; OTC auto-limits at the ask (whole only). Full lifecycle via `brokerage buy` / `orders/`. |
| **Single-leg + multi-leg options** | **Placeable** | The four primitives + 18+ strategy workflows; lifecycle verified (201→cancel 200). UUIDs are random v4 — **bulk-enumerate every time** (`options enumerate`); never compute/guess/cache a per-contract id. |
| **Index options (SPX/SPXW/XSP/NDX/VIX/RUT)** | **Present & chain-readable; opening needs an entitlement tier** | True cash-settled §1256 products — hidden from search & `instruments/?symbol=`, live under `options/chains/?underlying_symbol=`. `can_open_position:true` on reads, but actually opening may need index-options approval. Picking SPX over SPY is a *live* choice that buys §1256 60/40 + European-style box financing. |
| **Crypto** | **Placeable (separate auth)** | Official signed Crypto Trading API — Ed25519 key signing, NOT the brokerage bearer. Same double-gate. |
| **Futures (CME /ES, /MGC, /6E, …)** | **Read/enumerate only** | Real contracts quote via `midlands/lists/items/?list_id=…` (embedded bid/ask/last/margin). `brokerage search` *drops* the futures objects — use the lists endpoint. **Not placeable:** `ceres.robinhood.com` refuses TLS to all non-app clients, and this login has no onboarded futures account. |
| **Spot FX** | **Absent** | No spot-FX product at all (`currency_pairs` always `[]`; `/forex/` 404). Currency exposure = currency *futures* (read-only) or crypto pairs (separate API). DXY not tradable. |
| **Commodities** | **ETF proxies only (placeable); real futures read-only** | USO/UVXY/VXX/BITO etc. are normal equities, placeable via the equity engine. The underlying commodity futures (/CL, /GC, /SI) quote but route through ceres → not placeable. |

---

## 6. Tax-timing: when it matters (rare) and when to stay silent

Holding period **almost never matters** and raising it unprompted is noise. The
discipline here is restraint, not analysis.

**Stay silent** in the overwhelming majority of cases. Do not volunteer holding-period
or §1256 commentary on a routine quote, position read, or order.

**Flag it only in these two edge cases:**
1. A position within ~days/weeks of crossing the **1-year short→long-term
   capital-gains line** — compute the holding period from the fill `timestamp`
   (`options inspect <uuid>` / the order's `executions[].timestamp`).
2. Near a **tax-year boundary**, where deferring a close into January moves the gain
   into the next tax year.

**The one structural fact worth knowing** (because §1 corrected it): §1256 60/40 +
year-end mark-to-market **is reachable on RH** via the real index options (SPX/XSP/
NDX/RUT/VIX), not just "go trade it elsewhere." So if a user is choosing between SPY
options and SPX options, the SPX route is the §1256-qualifying one and the ETF route
is the trap — that's a *live platform choice*, worth surfacing when the user is
picking the underlying. Deeper angles (qualified covered calls, box financing, LEAPS,
wash sale) live in `docs/tax-aware-options-strategies.md`. Everything here is
educational, not tax advice.

---

## 7. The safety model in one screen (so you act, not just read)

- **Double gate, per command, every time:** a write sends only with **both**
  `--live-write` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1` (MCP: `liveWrite:true` + the env
  var in the server's environment). With one or neither it's a dry-run.
- **Never export the env var** into your shell profile. Inline, single command, every
  time. A persistent gate turns every later `--live-write` — including "tests" — into
  a real send.
- **The resolver fails closed and fails loud:** forced writes with no matching write
  route return nothing; ambiguous substrings throw `AmbiguousRouteError`. Don't engineer
  around these — they're the safety net that caught the cancel-route mis-pick.
- **Account ownership is validated before writes**, and you must echo the resolved
  account before any live write.
- **Don't trust a route-map write until it's live-verified.** A dry-run will happily
  endorse a bad body forever (the DRIP `enrollment` 405 is the cautionary tale). Mark
  unverified bodies as research, not supported automation. The capability map
  (`docs/account-settings-capability-map-2026-06-03.md`) is the authority on what's
  verified-live vs research-only.
- **One engine, no duplicated logic.** CLI, MCP, and api-map share `cli/src/lib.ts`.
  Divergence has already caused a real write-safety bug (the MCP copy of the resolver
  once degraded forced writes to GET while the CLI failed closed). If you add a
  capability, wire all three (route + CLI command + MCP tool) and keep the gate intact.

---

## 8. Bridge-the-gap roadmap — highest-leverage next moves

Ranked by leverage (hardening first, then growth). Each is concrete enough to start.

1. **Promote the index-options surface to first-class, gated by entitlement check.**
   The §1256 discovery is the single biggest under-served capability. Add an
   `options chain SPX` path that hits `options/chains/?underlying_symbol=` (not the
   equity `instruments/` table), plus a `can_open_position` / entitlement preflight so
   the agent knows *before* building an order whether the account can actually open
   index options. This converts a buried finding into routine use.

2. **Live-verify or quarantine every unproven settings write.** The capability map
   lists stock-lending toggle and account-type switch as unproven, and several
   sweep/margin writes as browser-captured-but-not-CLI-verified. Either capture +
   live-verify each with a reversible action, or explicitly mark them
   research-only in the route map so a dry-run can't endorse a bad body. Closing this
   removes the exact failure class that produced the DRIP-405 trap.

3. **Add read-only `futures list` / `futures quote` commands.** `brokerage search`
   silently drops futures objects, so the only way to enumerate real CME contracts is
   the raw `midlands/lists/items/?list_id=` path. A thin first-class command
   (symbol + `object_id` + bid/ask/margin) closes a real blind spot — and record
   `ceres.robinhood.com` in the route map as **transport-blocked (app-only TLS)** so
   no future agent wastes cycles re-probing it.

4. **Hoist the remaining duplicated engine logic into `lib.ts`.**
   `brokerageGetJson` / `finiteNumber` / `percentChange` / the stock-profile read-join
   are still duplicated between CLI and MCP. Duplication here already caused one
   write-safety divergence; finish the consolidation before it bites again.

5. **Make the wrong-account trap structurally impossible.** Today correctness depends
   on the agent remembering to use `transfer/accounts/` and pass `?account_number=`.
   Harden it: have the engine refuse account-scoped writes that don't carry an explicit,
   ownership-validated account number, and have account enumeration default to the
   complete `transfer/accounts/` graph everywhere (never bare `accounts/`). Turn a
   discipline into a guardrail.

6. **Add a pre-trade affordability/eligibility preflight.** Before any buy/open, read
   buying power (regular + overnight) and account type, and refuse or warn when the
   order can't clear (the $0-account "no overnight BP" 400 should be a *predicted
   blocker*, not a server reject the agent discovers after sending). Combine with the
   PDT scale and min-tick read into one "can this order even work?" check.

7. **Own-the-market wedge — keep CLI/MCP/api-map aligned and lean into the niche.**
   RH's own "Agentic Trading" (launched 2026-05-27) is equities-only and sandboxed;
   this tool's wedge is **options + crypto + every owned account + an auditable
   double-gate**. The PDT $25k rule was eliminated 2026-06-04, which widens what
   margin accounts can do (update the PDT scale and the "≥$25k" branches accordingly).
   The durable advantage is breadth + auditability, so the maintenance invariant (no
   duplicated logic, gate intact across all three surfaces) is also the product moat —
   protect it.

8. **Capture-driven route expansion with honest labeling.** The surface is
   discovered, not documented. Keep extending via: drive the logged-in UI with the
   network tab open → capture the exact method/URL/body → add to the map with
   conservative risk → rebuild → live-verify with a reversible action → promote only
   sanitized, tested behavior to public docs (raw captures stay in gitignored
   `info/`). Never claim working automation for an unconfirmed body.
