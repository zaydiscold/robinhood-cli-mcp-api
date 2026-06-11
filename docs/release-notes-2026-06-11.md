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

## Wheel engine — discuss & drive the Wheel from evidence

- **`wheel [symbol]` (CLI) + `robinhood_wheel` (MCP)**, both over the shared `computeWheelState()`:
  reads shares + short puts (CSP leg) + short calls (CC leg) per account — the aggregate-position
  legs are self-describing (`position_type`/`option_type`/`strike_price`/`expiration_date` inline,
  zero extra fetches) — classifies the stage (`not-started` → `cash-secured-put-open` →
  `shares-uncovered` → `covered-call-open`, plus `csp-plus-shares`, `sub-100-shares`, and the
  `short-call-undercovered` blocker), and emits the **literal next-leg dry-run command** using the
  verified strategy ids (`cash-secured-short-put`, `covered-call`, `options roll-plan`).
- Coverage math is the hard safety check: short calls beyond shares/100 are flagged as
  naked/undercovered, never normalized into a "wheel."
- **Discussion mode:** a requested symbol with no position still returns the leg-1 entry plan — so
  "let's talk about wheeling F" works with an empty account.
- 13 new tests (`cli/test/wheel.test.ts`) pin the classifier + composition. Descriptive, not
  prescriptive, per the repo doctrine; background stays in the Wheel deep-dive doc.

## Web-app version — auto-scrape SHIPPED (the CDP route)

- **`pnpm version:refresh`** (`scripts/scrape-web-app-version.mjs`): connects to a CDP-debuggable
  Chrome (the shared `chrome-debug` profile on 9222, or any `--remote-debugging-port` Chrome),
  loads the **login page** (the SPA shell sends `x-robinhood-web-app-version` pre-auth — no
  Robinhood login needed in the debug browser), captures the header from the network stream, and
  writes `ROBINHOOD_WEB_APP_VERSION` into `.env`. Verified live: captured `2026.24.3589+55c48b8f7a1c`
  (the baked fallback was `…2030+bc12ef34`); the lib fallback is refreshed to match.

## Recipes — six new intent routes

- `wheel-status`, `wheel-start-csp`, `wheel-covered-call`, `order-simple`, `order-status-check`,
  `buying-power` — free text like "got assigned, now what?" or "did my order go through" now routes
  to the one right command + MCP tool (27 recipes total; integrity pinned by `recipes.test.ts`).

## Smaller fixes

- `classifyRobinhoodError` app-version hint now names the `ROBINHOOD_WEB_APP_VERSION` env override
  and where to grab the current header value. (Auto-scrape investigated: the version string is NOT
  in the robinhood.com homepage HTML — it would need a bundle fetch or CDP capture; left on the
  roadmap, the env override is the working fix.)
- New `docs/error-code-reference-2026-06-11.md` — the error taxonomy (kind → trigger → fix),
  matching the `classifyRobinhoodError` implementation one-for-one.
- README rewritten to match the current surface (engine parity, `portfolio`, `recipes`, order
  lifecycle, 37 MCP tools); repo title/description shortened to "Robinhood API + MCP + CLI".

<!-- made with love by Zayd Khan / cold -->
