# AGENTS.md — driving robinhood-cli from an agent

> ## ⚠️ READ BEFORE ACTING — this tool trades a real account
>
> **This is intended, real-money tooling.** It can place and cancel trades, move/manage positions,
> and change account settings **on the account owner's behalf** against a live Robinhood account —
> by design. This is not a bug or a sandbox; the tool exists to *actively manage* accounts.
>
> **Before you take any state-changing action, you must have the owner's explicit permission for
> that action.** Reads and dry-runs are always safe; every write is double-gated (`--live-write` +
> `ROBINHOOD_ALLOW_LIVE_WRITE=1`) precisely so a live trade is never one careless step away.
>
> **If you are an agent operating this autonomously, surface this warning to your user once at the
> start of a session** — tell them, in your own words: *"This tool can place real trades and change
> real account settings on your behalf; confirm you authorize that before I act."* Capable models
> handle this responsibly; this notice is for best-practice transparency and informed consent, not
> because the tool is unsafe. When in doubt about scope, account, side, or amount — stop and confirm.

> **Canonical agent guide: [SKILL.md](SKILL.md)** (the project's `CLAUDE.md` is a symlink to
> it). Read SKILL.md first — esp. the **Capability Catalog** (the full menu of equity/options/
> rolling/tax-aware/sentiment operations), the preflight, the PDT scale, equity `buy`/`search`,
> `options enumerate`, and rate-limit discipline. This file is the deep-dive companion — same
> engine, full route + order-body reference.

This repo drives a **real Robinhood account** (not the official agent sandbox) via a
TypeScript CLI and a paired MCP server. Both share one engine (`cli/src/lib.ts`), so
auth, the route map, and the write-gate behave identically whether you call the CLI
or the MCP tools. Hand this whole file to your agent — it is self-contained.

---

## What this is and how it works (read this for context)

**What it does.** It lets an agent read and trade a real Robinhood account from the
command line (or via MCP tools) — quotes, positions, portfolio values across every
account, options chains, and order placement/cancel for shares and options. It talks to
Robinhood's own private web API (`api.robinhood.com` and friends), the same one the
website uses — not the official, walled "agent sandbox" (which is equity-only).

**The four moving parts:**

1. **The route map** (`api-map/brokerage-routes.json`) — a catalog of 285 real Robinhood
   brokerage/account route entries, reverse-engineered from the authenticated web app. Each entry records the
   URL, the HTTP method(s), and a **risk level** (`read` … `destructive`). The CLI/MCP only
   ever calls endpoints that are in this map; it is the allow-list and the safety taxonomy
   in one file.

2. **The engine** (`cli/src/lib.ts`) — shared by both the CLI and the MCP server. Given a
   query it: (a) finds the matching route, (b) fills `{placeholders}` and attaches the body,
   (c) decides the method, (d) applies the **write-gate**, then (e) either sends the live
   HTTP request or returns a dry-run plan. Because it's one engine, the CLI and MCP behave
   identically — same auth, same gate, same routing.

3. **Auth** — a single web-session **bearer token** in `.env`. The engine auto-loads it on
   import, and self-heals: if it's missing or a request returns `401`, it re-reads the
   freshest token from Chrome's on-disk storage and retries once. No browser popup, no
   manual login. (Details in §1.)

4. **Two front doors** — the **CLI** (`cli/dist/index.js`, for humans/scripts) and the
   **MCP server** (`mcp/dist/server.js`, 17 tools for agents). Both are thin wrappers over
   the engine.

**How a single call flows:** you give a query string → the engine substring-matches it
against the route map → fills params/body → infers or honors the method → checks the risk
level against the write-gate → **reads go live, writes dry-run unless both gates are set**
→ returns the response or the plan. That gate is the core safety property: the default
outcome of any mutating call is "planned but not sent."

**Why the rebuild matters:** the build copies the route map into `cli/dist/`, and the
runtime reads that **copy**, not the source — so map edits do nothing until you rebuild
(§3). This is the single most common way to get confused.

---

## 0. TL;DR for an agent

- **Reads run live, free.** Writes (trade / cancel / transfer) are **double-gated** and
  default to a safe dry-run.
- **Match a route by substring** of its URL, fill `{placeholders}` with `--param`.
- **Rebuild after editing the route map** or your edits are silently ignored (§3).
- **A live write needs BOTH `--live-write` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1`** (§6).
- **Never place an order the user didn't explicitly ask for.** Echo back the resolved
  account + symbol + side + qty + price and get a yes before sending (§8).

---

## 1. Auth (browser-free, self-healing)

- The brokerage bearer token lives in `.env` as `ROBINHOOD_BROKERAGE_TOKEN` (gitignored, chmod 600).
- `lib.ts` auto-loads `.env` on import; explicit process env wins.
- `scripts/refresh-auth.sh` reads the freshest token straight from Chrome's on-disk
  localStorage LevelDB (`web:auth_state`) — **no browser, no CDP, no network, no "Allow" prompt.**
- Self-heal: on a cold start with no token, and on any `401`, the engine runs the refresh
  script and retries once. Force a manual refresh with `pnpm auth:refresh`.
- Do **not** use the OAuth refresh-token grant — it rotates the refresh token and can
  invalidate the live web session. The disk read touches neither.
- This is **not** the `robinhood-trading` (official sandbox) MCP. That one is equity-only
  and uses a Keychain OAuth token. This CLI uses the real web-session bearer and reaches
  options, watchlists, transfers, every account.

---

## 2. Discover the accounts — never hardcode them

A login can have one account or many (multiple individual brokerage accounts, a Roth/IRA,
crypto via Nummus, futures via ceres) behind the in-app dropdown. **Do not assume a
count or specific account numbers — enumerate them at runtime.** Every per-account read
below takes the account number you discover here.

```bash
# Enumerate every equity account number + type for THIS login.
# (The plain accounts/ endpoint under-reports; the transfer graph is the complete list.)
node cli/dist/index.js brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full
node cli/dist/index.js brokerage execute "accounts/?default_to_all_accounts=true" --json --full
```

Read `account_number`, `brokerage_account_type` (e.g. `individual`, `ira_roth`), and the
nickname/balance fields off each result. Pick whichever account the user means (e.g. the
one holding their options book) and pass its number to the per-account reads in §4.
See §4 for the full enumeration recipe — the default endpoint hides most accounts.

Browser account-context routing is separately mapped:

```bash
node cli/dist/index.js api-map account-context
node cli/dist/index.js api-map account-url stock-detail-order-ticket \
  --account <ACCOUNT_NUMBER> --symbol XBI --instrument-id <INSTRUMENT_UUID>
```

The 2026-06-02 browser pass found that `?account_number=` propagates strongly on
stock-detail/order-ticket and investing settings routes, is mixed on options-chain,
stock lending, account hub, history/documents/tax, and recurring, and is ignored by
Legend/transfers in the sanitized capture. Treat this as navigation and endpoint
discovery evidence; for automation, pass account numbers directly to API routes. Full
notes: `docs/account-context-routing-2026-06-02.md` and
`docs/security-research-account-number-context-routing-2026-06-03.md`.

---

## 3. ⚠️ Build footgun — rebuild after ANY map edit

The build copies `api-map/brokerage-routes.json` into `cli/dist/api-map/`, and the
runtime resolves the **dist copy first**. Editing the source map is a silent no-op at
runtime until you rebuild:

```bash
pnpm --filter @zaydiscold/robinhood-cli build       # CLI
pnpm --filter @zaydiscold/robinhood-cli-mcp build   # MCP
# verify (currently 285 route entries):
node cli/dist/index.js brokerage routes --json | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])"
```

---

## 4. Reading across all accounts

The default endpoints under-report. Use the wider ones:

```bash
# Only the PRIMARY account:
node cli/dist/index.js brokerage execute "accounts/" --json --full
# Primary + Roth, but still hides some individuals:
node cli/dist/index.js brokerage execute "accounts/?default_to_all_accounts=true" --json --full
# The COMPLETE account-number graph (every rhs/individual + bank links):
node cli/dist/index.js brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full
```

Per-account reads (fill `--param` with an account number you discovered in §2):

```bash
node cli/dist/index.js brokerage execute "portfolios/{num}/" --param num=<ACCOUNT_NUMBER> --json --full
node cli/dist/index.js brokerage execute "positions/?account_number={account_number}&nonzero=true" --param account_number=<ACCOUNT_NUMBER> --json --full
```

Resolve holding UUIDs → tickers and quotes in bulk:

```bash
node cli/dist/index.js brokerage execute "instruments/?ids={ids}" --param ids=<id1,id2,...> --json --full
node cli/dist/index.js brokerage execute "marketdata/quotes/?ids={ids}" --param ids=<id1,id2,...> --json --full
```

---

## 5. Route matching — the two gotchas

`brokerage execute "<query>"` matches `query` as a **substring** of a route URL, then
fills `{placeholders}` from `--param name=value`.

- **Body is capped at 4000 chars** unless you pass `--full`.
- **Same URL, different verb:** `GET /orders/` and `POST /orders/` share a URL. Route
  selection is **method-aware** (`selectRouteByQueryAndMethod`) — to hit the POST route
  you **must** pass `--method POST`, otherwise you get the GET (read) route. (This also
  closes a safety hole: without it, a forced `--method POST` could resolve to the GET
  route, which is `sensitive-read`, and slip past the write-gate.)
- **There is no `--query-param`.** Arbitrary query strings can't be appended; the query
  must be a substring of a mapped route URL. To filter, use the templated routes whose
  URL already carries the `?key={key}` shape (see §7).

---

## 6. Writing — the double gate (non-negotiable)

Any route whose risk is `write-safe`, `write-mutate`, `write-or-sensitive`, or
`destructive` is **forced to a dry-run** unless BOTH gates are set:

1. the `--live-write` flag, **and**
2. the `ROBINHOOD_ALLOW_LIVE_WRITE=1` environment variable.

With one or neither, the request is planned but never sent; the result carries a
`liveWriteBlocked` reason.

### Turning dry-run off (going live)

A write is dry-run **by default**. To turn dry-run off and send a real order you must
flip **both** switches in the same invocation — there is no single "go live" flag:

```bash
# This is "dry-run OFF": both gates set, order is sent for real.
ROBINHOOD_ALLOW_LIVE_WRITE=1 \
  node cli/dist/index.js brokerage execute "<write-url>" --method POST --live-write --body-json '{...}'
```

- Drop **either** `ROBINHOOD_ALLOW_LIVE_WRITE=1` **or** `--live-write` → dry-run turns
  back **on** automatically and nothing is sent.
- Do **not** export `ROBINHOOD_ALLOW_LIVE_WRITE=1` into your shell profile — keep it inline
  on the one command, so dry-run is always the resting state.
- MCP equivalent: pass `liveWrite: true` **and** have `ROBINHOOD_ALLOW_LIVE_WRITE=1` in the
  server's environment. (Note: `dryRun: true` always wins — it forces a plan even with both
  gates set, a deliberate "I want to preview this exact live call" escape hatch.)

Order-placement routes:

- Equity: `https://api.robinhood.com/orders/` (POST, `write-mutate`)
- Options: `https://api.robinhood.com/options/orders/` (POST, `write-mutate`)
- Cancel: `POST /orders/{0}/cancel/` (equity) or `/options/orders/{0}/cancel/` (options) — `destructive`, same gate.

### Equity orders — the WEB body (verified live 2026-06-03)

The legacy mobile body (`type`/`quantity`/`price`/`side` only) is **rejected** by
`api.robinhood.com/orders/` with *"Your app version is missing important stock trading
updates. You can still place orders on the web."* — a client-version gate. Clearing it
takes **two** things:

1. **Web-app headers** — sent automatically by the engine (`cli/src/lib.ts` `send()`):
   `x-robinhood-api-version`, `x-robinhood-web-app-version`, `x-hyper-ex: enabled`, a web
   `user-agent`, and `origin`/`referer: https://robinhood.com`. Rotate stale values via
   `ROBINHOOD_API_VERSION` / `ROBINHOOD_WEB_APP_VERSION` / `ROBINHOOD_USER_AGENT`.
2. **`order_form_version: 7`** in the body + a live **bid/ask collar**
   (`bid_price`/`ask_price`/`bid_ask_timestamp`) + `market_hours` + `position_effect: open`.

**Dollar-notional (fractional) buy** — server computes shares from the live quote. Valid
only when `fractional_tradability == "tradable"` and `market_hours: "regular_hours"`:
```json
{
  "account": "https://api.robinhood.com/accounts/<ACCT>/",
  "instrument": "https://api.robinhood.com/instruments/<id>/",
  "symbol": "ORCU", "type": "market", "side": "buy",
  "time_in_force": "gfd", "trigger": "immediate", "position_effect": "open",
  "market_hours": "regular_hours", "order_form_version": 7,
  "bid_price": "21.87", "ask_price": "21.90", "bid_ask_timestamp": "2026-06-03T18:43:01Z",
  "dollar_based_amount": {"amount": "5.00", "currency_code": "USD"}, "ref_id": "<uuid>"
}
```

**Whole-share / OTC buy** — OTC names (`otc_market_tier` non-empty, or
`fractional_tradability: "position_closing_only"`, e.g. RNECY) **reject `type: market`**
(*"traded on the over-the-counter market…"*) and can't be bought fractionally. Use a
**marketable limit at the ask**, whole `quantity` (same envelope, swap the last line):
`"type": "limit", "price": "<ask>", "quantity": "1"` (drop `dollar_based_amount`).

**OTC / fractional guard:** before any dollar order, read `fractional_tradability`. If it is
not `"tradable"`, do NOT send a dollar order — switch to whole-share (limit for OTC). This is
what stops "$3 of RNECY" from malforming a real order.

**Rate limit (we are agentic managers, NOT an HFT script):** `orders/` burst-limits
**fractional** orders — ~9 in quick succession, then HTTP **429** (*"Too many requests for
fractional orders"* / *"throttled, available in N seconds"*, ~48s cooldown). A web endpoint
will never tolerate hammering. Pace ≥2.5s between orders; on 429 sleep the server-directed
seconds and retry with the **same `ref_id`** (429 = nothing placed, so same ref_id is
idempotent). Stop the batch on *"You can only purchase 0 shares"* / *"Not enough buying
power"* (account is dry — keep going only wastes calls).

**Reference impl:** `scripts/equity-buy.mjs` and the first-class `brokerage buy` command
build exactly this body (dollar/share, OTC auto-limit, fractional guard, 429 backoff,
buying-power early-stop, JSON receipts).

```bash
# Dry-run (safe, proves the plan + body, sends nothing):
node cli/dist/index.js brokerage execute "https://api.robinhood.com/orders/" --method POST \
  --body-json '{...web body above...}'
# Live — requires BOTH gates:
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js brokerage execute \
  "https://api.robinhood.com/orders/" --method POST --live-write --body-json '{...}'
```

Equity order body keys: `account`, `instrument`, `symbol`, `type` (`market`|`limit`),
`time_in_force` (`gfd`|`gtc`), `trigger`, `side`, `position_effect` (`open`|`close`),
`order_form_version` (7), `bid_price`/`ask_price`/`bid_ask_timestamp` (live collar),
`market_hours` (`regular_hours` for fractional), `dollar_based_amount` {amount, currency_code}
(fractional) **or** `price`+`quantity` (limit/whole-share), `ref_id` (UUID, idempotency).

---

## 7. Worked example — buy an options call end to end

This is the exact sequence to open **1 AAPL 2026-12-18 $100 Call** (the
"$100 strike, end of year" order). Every step below is a live read except the last,
which is shown as a dry-run. The UUIDs in the comments are **example outputs** — re-run
each step to get current values; don't hardcode them. The account number comes from §2.

**Step 1 — symbol → instrument + option chain id:**
```bash
node cli/dist/index.js brokerage execute "instruments/?symbol={symbol}" --param symbol=AAPL --json --full
# AAPL: instrument_id 450dfc6d-5510-4d40-abfb-f633b7d9be3e
#       tradable_chain_id 7dd906e5-7d4b-4161-a3fe-2c3b62038482
```

**Step 2 — chain → expiration dates + tick rules:**
```bash
node cli/dist/index.js brokerage execute "options/chains/{id}/" --param id=7dd906e5-7d4b-4161-a3fe-2c3b62038482 --json --full
# end-of-year 2026 expiration = 2026-12-18
# min_ticks: below 3.00 -> 0.01 tick, at/above 3.00 -> 0.05 tick
```

**Step 3 — list the chain's calls for that expiry, find the $100 strike:**
```bash
node cli/dist/index.js brokerage execute \
  "options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}" \
  --param chain_id=7dd906e5-7d4b-4161-a3fe-2c3b62038482 \
  --param expiration_dates=2026-12-18 --param type=call --json --full
# $100 call -> option_instrument_id 8d6d6f2b-d51c-41e6-8a6f-e0ec7fbed190
```

**Step 4 — quote the option (so your limit price is sane and on-tick):**
```bash
node cli/dist/index.js brokerage execute "marketdata/options/?ids={ids}" \
  --param ids=8d6d6f2b-d51c-41e6-8a6f-e0ec7fbed190 --json --full
# (deep ITM: bid ~$213 / ask ~$216, ~$21.4K per contract).
# "nearest $0.00" = the minimum tick, $0.01 — a resting bid that won't fill.
```

**Step 5 — place the order (dry-run shown; flip both gates for live):**
```bash
REF=$(python3 -c "import uuid;print(uuid.uuid4())")
node cli/dist/index.js brokerage execute "https://api.robinhood.com/options/orders/" --method POST \
  --body-json "{\"account\":\"https://api.robinhood.com/accounts/<ACCOUNT_NUMBER>/\",\"direction\":\"debit\",\"legs\":[{\"side\":\"buy\",\"option\":\"https://api.robinhood.com/options/instruments/<OPTION_INSTRUMENT_ID>/\",\"position_effect\":\"open\",\"ratio_quantity\":1}],\"type\":\"limit\",\"time_in_force\":\"gtc\",\"trigger\":\"immediate\",\"price\":\"0.01\",\"quantity\":\"1\",\"ref_id\":\"$REF\"}" \
  --json --full
# -> risk: write-mutate, mode: dry_run, liveWriteBlocked (no order sent).
# To send: prepend ROBINHOOD_ALLOW_LIVE_WRITE=1 and add --live-write.
```

Options order body shape: `account`, `direction` (`debit`|`credit`), `legs[]`
(`{side, option, position_effect: open|close, ratio_quantity}`), `type`, `time_in_force`,
`trigger`, `price`, `quantity`, `ref_id`.

---

## 7.1 Options strategy planning and Greeks

Options support is not just reporting. The repo now has a machine-readable strategy
catalog at `api-map/options-strategy-workflows-2026-06-02.json`, exposed through:

```bash
node cli/dist/index.js api-map options-strategies
node cli/dist/index.js api-map options-strategy-plan iron-condor --json
node cli/dist/index.js api-map options-strategy-plan naked-short-put --json
node cli/dist/index.js api-map options-strategy-plan short-strangle --json
node cli/dist/index.js api-map options-strategy-plan call-credit-spread \
  --param account_number=<ACCOUNT_NUMBER> \
  --param symbol=XBI \
  --param chain_id=<CHAIN_ID> \
  --param expiration=<YYYY-MM-DD> \
  --param short_call_option_id=<SHORT_CALL_OPTION_ID> \
  --param long_call_option_id=<LONG_CALL_OPTION_ID> \
  --param strategy_legs=<ENCODED_STRATEGY_LEGS> \
  --param limit_price=<CREDIT_OR_DEBIT> \
  --param quantity=1 \
  --param time_in_force=gfd \
  --param ref_id=$(python3 -c "import uuid;print(uuid.uuid4())") \
  --json
```

The planner emits lookup steps and an `options/orders/` body template only. It never
sends; live writes still need the normal double gate and exact user approval.

Agent decision rule: classify the user's language before building a plan. "Sell a call"
can mean:

- `sell-to-close-long-option`: closing an existing long call.
- `covered-call`: sell a call against 100 owned shares in the same account.
- `call-credit-spread`: defined-risk short call exposure with a long call wing.
- `naked-short-call`: undefined-risk margin short call.
- `naked-short-put`: margin/collateral-sensitive short put; not the same as a cash-secured put.
- `covered-put`: short stock plus short put; not the same as a cash-secured put.
- `call-debit-spread` / `put-debit-spread`: defined-risk directional debit spreads.
- `long-strangle` / `short-strangle`: volatility structures; short strangle is undefined-risk.

Do not infer naked exposure. Naked short calls, naked short puts, short straddles,
short strangles, and any other undefined-risk posture require the user to explicitly
request that exact strategy, then the agent must dry-run the order body and echo
account, symbol, expiration, strikes, side, quantity, limit price, max loss shape,
and gate state before any live send.

Greeks are netted over signed legs:

```text
net_delta = sum(side * delta * ratio_quantity * contracts * 100)
net_gamma = sum(side * gamma * ratio_quantity * contracts * 100)
net_theta = sum(side * theta * ratio_quantity * contracts * 100)
net_vega  = sum(side * vega  * ratio_quantity * contracts * 100)
```

Use them as current local sensitivities. Long debit options are usually long gamma/vega
and negative theta. Short premium structures are usually short gamma/vega and positive
theta. Defined-risk spreads cap max loss with a long wing; naked short options do not.

Full research notes:

- `docs/options-greeks-strategy-research-2026-06-02.md`
- `docs/options-quantitative-playbook-2026-06-03.md`

`options-strategy-plan` emits `reviewContract`. Treat that object as a hard
pre-execution checklist: required fields, required checks, signed-leg Greek
math, scenario rows, variant-resolution rules, and hard blockers. Missing
instrument ids, unclear `position_effect`, unverified coverage/collateral,
stale package quotes, or unconfirmed undefined-risk exposure keep the plan in
dry-run or blocked mode.

Options chain URL rule: `https://robinhood.com/options/chains/<SYMBOL>` does not
encode the selected expiration, strike, side, or Builder legs. Resolve those from
`options/chains`, `options/instruments`, `marketdata/options`, and
`marketdata/options/strategy/quotes` before building an `options/orders/` dry-run.

---

## 8. Worked example — managing watchlists (create / rename / delete)

Watchlists live under `discovery/lists/`. Every read AND the list endpoints need
`owner_type=custom` as a discriminator. All three write verbs are proven live through
the CLI (create 201, rename 200, delete 204).

```bash
# List every watchlist (id + display_name). owner_type is REQUIRED.
robinhood-cli brokerage execute \
  "https://api.robinhood.com/discovery/lists/?owner_type=custom" --json

# Read one list's items (object_id = instrument id, weight = sort order):
robinhood-cli brokerage execute \
  "https://api.robinhood.com/discovery/lists/items/?list_id={id}&owner_type=custom" \
  --param id=<LIST_ID> --json

# CREATE a list (POST, risk write-mutate). Field is display_name, NOT name.
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli brokerage execute \
  "https://api.robinhood.com/discovery/lists/" --method POST --live-write \
  --body-json '{"display_name":"My List","object_type":"instrument","owner_type":"custom"}'

# RENAME a list (PATCH). The mutable field is display_name — sending "name" is a
# silent no-op (200 but nothing changes).
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli brokerage execute \
  "https://api.robinhood.com/discovery/lists/{id}/" --method PATCH --live-write \
  --param id=<LIST_ID> --body-json '{"display_name":"Renamed"}'

# DELETE a list (DELETE, risk destructive -> 204 No Content, irreversible).
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli brokerage execute \
  "https://api.robinhood.com/discovery/lists/{id}/" --method DELETE --live-write \
  --param id=<LIST_ID>
```

Gotchas learned the hard way:
- **`owner_type=custom` is mandatory** on every list read; without it you get
  `["owner_type of request must be specified"]` (400).
- **Rename uses `display_name`**, not `name`. Wrong field → 200 with no change.
- **The Options Watchlist cannot be deleted.** Robinhood hard-blocks it server-side:
  `["Cannot delete options watchlist"]` (400). The web "Delete list" button fails on it
  too — it is not a CLI limitation. Every other list deletes cleanly.
- **Method-aware routing** picks the right verb when a URL has several (GET vs POST on
  `discovery/lists/`, PATCH vs DELETE on `discovery/lists/{id}/`) — always pass `--method`.
- Item add/remove/reorder (`discovery/lists/items/` POST) is **not yet mapped** — the
  server returns `{"failed operations":""}` with no detail, so the exact body is unconfirmed.

---

## 9. Recurring buys, DRIP, and money-movement writes

These write surfaces are mapped. **Bodies marked `inferred` in the route's `note`
are unverified — confirm against a live capture before trusting them, and never run a
live money write on an unverified body.**

For the consolidated account-page matrix, use
`docs/account-settings-capability-map-2026-06-03.md`. It records which account
settings are first-class, route-map-only, browser-observed, or not yet proven.

### First-class read commands: quote / positions / options / watchlist

Common reads have dedicated commands so you don't assemble multi-step joins by hand. All
are read-only (no gate), and all print per-share prices and percentages but never a summed
account total, so their output is safe to paste into shared artifacts:

```bash
robinhood-cli quote MRVL NVDA AAPL              # last, day %, bid/ask for one+ symbols
robinhood-cli positions                          # open equity positions ranked by return
robinhood-cli positions --sort symbol --json     # alpha sort + JSON for machine use
robinhood-cli options positions                  # open option positions ranked by % return
robinhood-cli options chain MRVL --width 6        # chain around the money, nearest expiry
robinhood-cli options chain NVDA --expiration 2026-07-02 --type put
robinhood-cli options expirations MRVL            # list expirations before pulling a chain
robinhood-cli watchlist list                      # custom watchlists + item counts
```

Each joins the mapped routes it needs (`positions` joins `positions/` → `marketdata/quotes/`;
`options chain` joins `instruments/` → `chains/` → `options/instruments/` → `marketdata/options/`)
through the shared plan/execute engine. `options positions`/`positions` compute return from cost
basis (`average_open_price` / `average_buy_price`) vs the live mark/last.

### Preferred: the first-class `recurring` command

Recurring buys have a dedicated command so you don't hand-craft URLs or bodies. It shares
the same engine + double-gate as everything else (reads run live, writes need both gates):

```bash
robinhood-cli recurring list                        # live read: symbol/state/amount/next/id
robinhood-cli recurring list --state paused --json   # filter + JSON for machine use

# Resume / pause. Without BOTH gates these DRY-RUN (plan only, send nothing):
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli recurring resume --all --live-write
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli recurring resume --id <SCHEDULE_ID> --live-write
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli recurring pause  --all --account <ACCOUNT_NUMBER> --live-write
```

`--all` resolves targets by current state (resume → all paused; pause → all active), so it
is idempotent and safe to re-run. Verified live: resume=`{"state":"active"}`, pause=`{"state":"paused"}`.

### Underlying raw recipes (what the command calls)

```bash
# RECURRING BUYS — list every schedule and its state (paused_by_user vs transfer_reversal):
robinhood-cli brokerage execute \
  "https://bonfire.robinhood.com/recurring_schedules/" --method GET --full

# RESUME a paused buy (PATCH; verb confirmed via OPTIONS, state field confirmed on the object).
# Dry-run first (sends nothing), then go live with BOTH gates:
robinhood-cli brokerage execute \
  "https://bonfire.robinhood.com/recurring_schedules/{0}/" --method PATCH \
  --param 0=<SCHEDULE_ID> --body-json '{"state":"active"}'         # dry-run
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli brokerage execute \
  "https://bonfire.robinhood.com/recurring_schedules/{0}/" --method PATCH \
  --param 0=<SCHEDULE_ID> --body-json '{"state":"active"}' --live-write   # PAUSE: "paused"

# DRIP — toggle dividend reinvestment per account (PATCH, body {"drip_enrolled": true|false}):
robinhood-cli brokerage execute \
  "https://api.robinhood.com/corp_actions/drip/enrollment/{num}/" --method PATCH \
  --param num=<ACCOUNT_NUMBER> --body-json '{"drip_enrolled":true}'   # dry-run unless gated

# CANCEL an order (POST, no body):
robinhood-cli brokerage execute \
  "https://api.robinhood.com/orders/{0}/cancel/" --method POST --param 0=<ORDER_ID> --live-write

# ACH transfer (POST). direction=deposit moves money IN, direction=withdraw moves money OUT:
robinhood-cli brokerage execute "https://api.robinhood.com/ach/transfers/" --method POST \
  --body-json '{"ach_relationship":"<REL_URL>","amount":"10.00","direction":"deposit"}'
```

Notes learned:
- **Resume/pause is reversible** (flip `state` back); **DELETE on a schedule is not.**
- **OPTIONS preflight is useless for schema discovery here** — the edge gateway returns an
  identical `DELETE, GET, OPTIONS, PATCH, POST, PUT` allow-list for *every* path, so it
  confirms nothing endpoint-specific. Bodies come from live capture, not preflight.
- **Don't black-box probe money endpoints** — empty/invalid PATCH bodies return 500/502,
  not helpful validation errors. Capture the real web request instead.
- DRIP reads as already-enrolled at both the account object (`drip_enabled`) and the
  dedicated endpoint (`drip_enrolled`); a Roth can show `drip_enabled:true` with
  `eligible_for_drip:false` (enrolled ≠ currently eligible).

---

## 10. Exact-action consent (non-negotiable)

Reads and dry-runs are free. A **live write** (trade, transfer, cancel, unlink) runs only
when the user asked for *that specific operation*. Before sending, echo the resolved
**account + symbol + side + qty + price + expiry** and get explicit confirmation.
Never place an order the user didn't ask for. Never create accounts, never change account
settings/permissions, never print the token value.

---

## 11. MCP registration

```bash
claude mcp add robinhood-cli -s user -- node /absolute/path/to/robinhood-cli/mcp/dist/server.js
```

Tools surface as `mcp__robinhood-cli__*` (17 tools: route inspection, browser/account
context, options strategy workflows/plans, exact-contract link bundles, stock
profile reads, brokerage plan/execute, and crypto routes/sign/plan/execute).
Same engine → same auth, gate, and method-aware routing as the CLI. The MCP mirrors the CLI gate: `liveWrite: true` plus
`ROBINHOOD_ALLOW_LIVE_WRITE=1` to send a write; otherwise forced dry-run.

---

## 12. Maintenance invariants (keep CLI + MCP + api-map aligned)

This is a hard rule, not a nicety — divergence here has already caused a write-safety bug.

- **One engine, no duplication.** Shared logic lives in `cli/src/lib.ts`; the CLI (`cli/src/index.ts`)
  and the MCP (`mcp/src/server.ts`) both import it. Never copy a function into both files — they drift.
  (The route resolver `selectRouteByQueryAndMethod` once diverged: the MCP copy silently degraded forced
  writes to GET while the CLI failed closed. Now hoisted to lib.ts — as are `brokerageGetJson` /
  `tryBrokerageGetJson`. Only the 3-line numeric helpers (`finiteNumber`/`quoteLast`) remain local.)
- **Rebuild after api-map edits.** The runtime reads `cli/dist/api-map/`, not the source JSON. A source
  edit without `pnpm --filter @zaydiscold/robinhood-cli build` is a silent no-op.
- **Resolver refuses to guess.** Forced writes with no matching write route fail closed (return nothing);
  an ambiguous substring query (>1 distinct route) throws `AmbiguousRouteError` with the candidate list.
  Pass exact URLs for writes.
- **New capability → wire all three places** (route in api-map, command in CLI, tool in MCP) and keep the
  double gate intact. Reads live by default; every write dry-run until both gates.

---

## 13. Signal sourcing & due diligence (descriptive — NOT risk guidance)

How to think about *where research signal comes from* and how much to trust it. A decision framework,
not a mandate — risk and sizing are the operator's call. Full version in SKILL.md "Signal sourcing".

- **News:** slow (lags the move by hours-to-a-day) but authoritative for **key/binary events**
  (earnings, M&A, Fed, halts, guidance) — being *right* beats being *first*. Late, not useless.
- **Twitter/X + Reddit:** noisy, but the **best signal-to-noise**, and **X is the fastest pulse** —
  ahead of any article. First-class DD sources (`bird search`, the `last30days` skill, r/options ·
  r/thetagang · r/stocks), not gossip to dismiss. X's edge is conditional: fastest pulse *and* fastest
  misinformation — high signal-to-noise only **if you know whom to read**, so corroborate a lone post.
- **RH `midlands/news|ratings|tags`:** the **slow, broker-native confirmer** — it trails the
  off-platform pulse. Lead DD with X/Reddit; let RH's feeds confirm, not the reverse.
- **Signal → optional validation → action:** any feed is a *direction input*; you *can* corroborate
  against live market data (bid/ask, Greeks, volume/OI) before acting — available reasoning, not a rule.
- **Personalized trusted sources** (specific accounts/communities the owner relies on) accumulate as
  source-lead entries in **Ball Knowledge** (`ball-knowledge.md`, §14); keep committed entries generic.

---

## 14. Ball Knowledge (`ball-knowledge.md`) — the investing-memory ledger

The repo root holds **`ball-knowledge.md`**, a living, chronological, append-only ledger of broad
investing context the operator intentionally wants remembered — it **influences the general
investing-thesis direction and trading-style notes**, the sectors/tickers/sources the agent attends
to, and how it frames analysis. Read it on finance tasks.

- It is **context, not authority**: never proof of a rumor, never permission to place/cancel a trade,
  never an override of confirmation, live market data, or order history. Treat entries as *intentional
  and important*, classify each by type (rumor → verify; `@handle` → source lead; "0DTE" → high-risk
  style note; "dividend/QDTE" → income preference), apply only a minor recency bias, and surface risk
  neutrally without imposing caution. **Full rules + the exact append format: SKILL.md "Ball Knowledge".**
- Order-execution evidence (canonical in **SKILL.md failure mode #20** + the boot KB §1): *brokerage
  order history is the source of truth; no record = treat as non-executed; screenshots/UI/logs are not proof.*
