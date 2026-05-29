# AGENTS.md — driving robinhood-cli from an agent

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

1. **The route map** (`api-map/brokerage-routes.json`) — a catalog of ~277 real Robinhood
   API endpoints, reverse-engineered from the authenticated web app. Each entry records the
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
   **MCP server** (`mcp/dist/server.js`, 10 tools for agents). Both are thin wrappers over
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

---

## 3. ⚠️ Build footgun — rebuild after ANY map edit

The build copies `api-map/brokerage-routes.json` into `cli/dist/api-map/`, and the
runtime resolves the **dist copy first**. Editing the source map is a silent no-op at
runtime until you rebuild:

```bash
pnpm --filter @zaydiscold/robinhood-cli build       # CLI
pnpm --filter @zaydiscold/robinhood-cli-mcp build   # MCP
# verify (currently 277 routes):
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

```bash
# Dry-run (safe, proves the plan + body, sends nothing):
node cli/dist/index.js brokerage execute "https://api.robinhood.com/orders/" --method POST \
  --body-json '{"account":"https://api.robinhood.com/accounts/<ACCOUNT_NUMBER>/","instrument":"https://api.robinhood.com/instruments/<id>/","symbol":"F","type":"limit","time_in_force":"gfd","trigger":"immediate","price":"9.00","quantity":"1","side":"buy"}'

# Live — requires BOTH gates:
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js brokerage execute "https://api.robinhood.com/orders/" \
  --method POST --live-write --body-json '{...}'
```

Equity order body keys: `account`, `instrument`, `symbol`, `type` (`market`|`limit`),
`time_in_force` (`gfd`|`gtc`), `trigger` (`immediate`|`stop`), `price` (limit), `quantity`,
`side` (`buy`|`sell`), `ref_id` (UUID, recommended for idempotency).

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

Tools surface as `mcp__robinhood-cli__*` (10 tools: route inspection, brokerage
plan/execute, crypto routes/sign/plan/execute). Same engine → same auth, gate, and
method-aware routing as the CLI. The MCP mirrors the CLI gate: `liveWrite: true` plus
`ROBINHOOD_ALLOW_LIVE_WRITE=1` to send a write; otherwise forced dry-run.
