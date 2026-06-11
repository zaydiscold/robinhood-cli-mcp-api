# Error code reference — Robinhood API failures and their fixes

**What this is:** the taxonomy of Robinhood API errors this repo knows how to recognize, what each
one actually means, and the fix — matching `classifyRobinhoodError()` in `cli/src/lib.ts`
one-for-one (that function is the single source; if you teach the engine a new error, add it there
first, then mirror it here). **What it's for:** turning a vague 400 into the one-line fix instead of
a debugging session.

## HTTP-level errors (classified by `classifyRobinhoodError`)

| Kind | Trigger (status / body pattern) | What it means | Fix | Retryable |
|------|-------------------------------|----------------|-----|-----------|
| `rate_limited` | 429, "too many requests", "rate limit" | Burst limit hit (fractional `orders/` allows ~9, then ~48s cooldown) | Sleep the server-directed seconds, then retry the **SAME `ref_id`** — a 429 means nothing was placed, so the retry is idempotent. Never mint a new `ref_id` here (duplicate-order risk). | ✅ (after wait) |
| `overnight_buying_power` | "overnight buying power" | GTC option opens are gated by **overnight** BP, not regular BP — regular BP looking fine is irrelevant | Use a day (`gfd`) order, or fund the account | ❌ |
| `insufficient_buying_power` | "buying power", "not enough", "only purchase 0" | Account can't cover the order size | Reduce size; read `buying-power` first when batching | ❌ |
| `below_min_tick` | "min tick", "does not satisfy" | Limit below the chain's `cutoff_price` (~$3) must use `below_tick` — e.g. ARKG is $0.05; $0.01 → 400 | Read `options/chains/{id}` `min_ticks`, reprice to a valid tick | ❌ |
| `otc_market_order` | "market order" + "otc"/"not eligible" | OTC names reject market/fractional orders | Whole shares + a marketable limit (the equity engine's OTC guard catches this **before** the send) | ❌ |
| `app_version_gate` | "app version", "important stock trading updates" | Equity orders need `order_form_version: 7` + the web headers (the engine sends both) | If Robinhood rotated the web build, set `ROBINHOOD_WEB_APP_VERSION` to the current `x-robinhood-web-app-version` header (grab it from any logged-in robinhood.com request) and retry | ❌ |
| `unauthorized` | 401 | Token expired (~weekly) | The engine self-heals once automatically; manually: `pnpm auth:refresh` | ✅ (401 only) |
| `unauthorized` | 403 | Forbidden — entitlement/permission (e.g. index-options tier), or a second cancel on an already-cancelled order | Check the account's entitlement; a 403 on `cancel` usually means it already cancelled — re-read the order | ❌ |
| `not_found` | 404 | Route/resource doesn't exist (e.g. the old `drip/enrollment` PATCH, `instruments/{id}/popularity/`) | Check the route map (`brokerage describe`); the surface may have moved | ❌ |
| `bad_request` | 400 (no other pattern) | Malformed body — wrong field names, missing required fields | Diff your body against the route's template (`brokerage describe`, AGENTS.md §7 templates) | ❌ |

## Engine-level blocks (not HTTP — the request never left the machine)

| Error | What it means | Fix |
|-------|----------------|-----|
| `DEDUP: N pending <side> order(s) … already exist` | A same-side order on this instrument+account is pending and < 5 min old — you (or an agent retry) are about to double-fire | If intentional, pass `--force` (CLI) / `force: true` (MCP). Stale (>5 min) pendings never trigger this. |
| `liveWriteBlocked` | A write ran without BOTH gates (`--live-write` / `liveWrite: true` **and** `ROBINHOOD_ALLOW_LIVE_WRITE=1`) | Set both — deliberately, inline, never exported in your shell profile |
| `No <METHOD> route for <url> — … fails closed` | A forced write (POST/PATCH/PUT/DELETE) matched no write route — the resolver refuses to degrade it into a read | Check the route map; rebuild (`pnpm build`) after map edits — the runtime reads `cli/dist/api-map/` |
| `<SYM>: fractional_tradability=… — cannot place a dollar/fractional order` | OTC/non-fractional name; a "$X of SYM" order is impossible | Switch to whole shares + a marketable limit |
| `Invalid or missing quote for <SYM>` | The quote came back dead (`last_trade_price` 0/absent) — sizing math would divide by zero | Check the symbol/halt status; retry when a live quote exists |
| `Must specify amount (dollars) or shares (quantity)` / `not both` | buy/sell input validation | Pass exactly one sizing argument |
| `405` on DRIP `drip/enrollment/` writes | That endpoint is GET-only — the map's old claim was wrong | The verified write is `PATCH corp_actions/drip/account_settings/{account}/` (or `instrument_settings/{account}/{id}/`), body `{"drip_enabled": bool}` |
| Watchlist read 400 `"owner_type of request must be specified"` | `owner_type=custom` is mandatory on `discovery/lists/` | Use the `watchlist` command (sends it for you) |
| Watchlist rename 200 but nothing changed | Sent `name` instead of `display_name` — silent no-op | Use `display_name` |

## Reading the taxonomy programmatically

`classifyRobinhoodError(status, bodyText, headers)` is exported from the lib and pure (no I/O):
`kind`, `detail`, `retryable`, `retryAfterMs` (429 only), and a human `hint`. The CLI, MCP, and the
batch scripts all route failures through it, so messaging and retry decisions stay uniform. Tests:
`cli/test/lib.test.ts` pins the classification patterns.

**Source:** consolidated 2026-06-11 from live-verified failures recorded in `SKILL.md` (failure
modes), `AGENTS.md`, and the 06-03/06-04 execution-smoke docs. Reproduce any row by triggering the
listed condition against a dry-run or far-from-market test order — never a fillable live order.
