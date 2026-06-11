# Release notes — 2026-06-11

Cycle theme: **merge the hardening PR, then finish what it started** — one shared order engine for
both surfaces, so the CLI and MCP can never disagree about how a real-money order is built.

## Merged

- **PR #1 (`harden-cli-mcp-2026-06-10`)** merged into `main` (merge commit `5d05df0`): first-class
  `buy`/`sell`/`cancel`/`order-status`/`buying-power` CLI commands + MCP tools, pending-order dedup
  with a 5-minute window, `ref_id` idempotency on buy/sell, the MCP cancel `{0}` template fix, the
  history timestamp fix, and removal of a duplicate `robinhood_settings` registration that crashed
  the MCP server. Two conflicts resolved against the 06-09/06-10 main line (`portfolio` P&L engine +
  recipes + api-map expansion):
  - `cli/src/lib.ts` — the PR's buying-power fetch now goes through `computePortfolioPnl`'s
    *injected* `getJson` (keeps the golden-fixture suite offline).
  - `api-map/brokerage-routes.json` — kept both sides; the PR's new `orders/{0}/` route gained the
    (test-enforced) `fields`/`fieldsSource` provenance keys.
  - `todo.md` → `TODO.md` consolidated to one tracked path (macOS case-collision).

## Shared equity-order engine (CLI ↔ MCP parity, the alignment invariant)

- **`placeEquityOrder()` in `cli/src/lib.ts`** is now the single code path behind the CLI
  `buy`/`sell` commands AND the MCP `robinhood_buy`/`robinhood_sell` tools. One place for:
  - amount-XOR-shares validation;
  - the **OTC/fractional guard** (failure mode #4): dollar orders on non-`tradable` fractional
    names are rejected with the whole-shares+limit guidance — previously only `brokerage buy` had this;
  - a **dead-quote hard-fail**: a 0/missing `last_trade_price` throws instead of sizing
    `qty = Infinity` (the prior MCP sell path could emit an Infinity-quantity body);
  - **pending-order dedup** (live sends only; 5-min window; terminal states and the other side never
    block; stale GTCs never block; *future-dated* pendings — clock skew — still block; `--force` /
    `force:true` skips; a failed dedup *read* degrades, only a positive hit blocks);
  - **`ref_id` idempotency** on every send (429 ⇒ retry the SAME `ref_id`; nothing was placed);
  - **trade logging** to `local/trading-log.jsonl` on live sends (order history stays the only proof).
- MCP `robinhood_buy`/`robinhood_sell` gained the `force` parameter and now log trades; `robinhood_sell`
  gained the validation it was missing (both-params, unknown symbol, dead quote).
- `extractOrderId()` shared helper — id-or-URL handling is now identical in CLI `cancel`/`order-status`
  and MCP `robinhood_cancel`/`robinhood_order_status`.

## Order status — ticker resolution

- **`getOrderStatus()`** (shared): single-order reads now resolve the instrument UUID to the real
  ticker via `instruments/?ids=` — `order-status` / `robinhood_order_status` print `MRVL`, not a
  UUID tail. Resolution is best-effort; the order is returned regardless.

## Tests

- New `cli/test/equity-order.test.ts` (22 tests): pins the dedup window semantics, the OTC guard,
  the dead-quote hard-fail, the exact dry-run body (`ref_id` format, `order_form_version: 7`,
  gfd/gtc selection, 4-dp sizing), dry-run-never-dedups/never-logs, live logging, and ticker
  resolution — all against injected deps, no network. Suite total: 101 passing.

## Smaller fixes

- `classifyRobinhoodError` app-version hint now names the `ROBINHOOD_WEB_APP_VERSION` env override
  and where to grab the current header value. (Auto-scrape investigated: the version string is NOT
  in the robinhood.com homepage HTML — it would need a bundle fetch or CDP capture; left on the
  roadmap, the env override is the working fix.)
- New `docs/error-code-reference-2026-06-11.md` — the error taxonomy (kind → trigger → fix),
  matching the `classifyRobinhoodError` implementation one-for-one.
- README rewritten to match the current surface (engine parity, `portfolio`, `recipes`, order
  lifecycle, 37 MCP tools); repo title/description shortened to "Robinhood API + MCP + CLI".
