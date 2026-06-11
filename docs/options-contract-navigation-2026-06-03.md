# Options Contract Navigation - 2026-06-03

This note records the current tested behavior for opening or planning a specific
Robinhood options contract from the CLI. It is operational guidance, not a live
order instruction.

## Current Answer

- The tested web account shell is:
  `https://robinhood.com/options/chains/<SYMBOL>?account_number=<ACCOUNT_NUMBER>`.
- A universal URL that opens an unopened exact contract by symbol, account,
  expiration, call/put, buy/sell, and strike has not been proven.
- The working exact-contract path is API-first:
  `options/chains/` -> `options/instruments/` filtered by expiration/type/strike
  -> `marketdata/options/` -> optional `marketdata/options/strategy/quotes/`
  -> dry-run `options/orders/` body.
- URL query/fragment keys for expiration, type, side, strike, and
  `position_effect` are emitted only as browser probe candidates. They are not
  treated as proven Robinhood state.

## CLI Flow

Build-only navigation/API plan:

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

Live API resolution plus link bundle:

```bash
robinhood-cli api-map options-contract-links \
  --account <ACCOUNT_NUMBER> \
  --symbol DRAM \
  --expiration 2026-12-18 \
  --type call \
  --side buy \
  --strike 80 \
  --json
```

The plan command is an account-aware navigation and API-resolution planner:

- returns the observed web account shell;
- returns candidate web query and fragment URLs for manual browser testing;
- returns deterministic API lookup steps;
- returns a dry-run single-leg order body template;
- does not open a browser, launch an app, or send an order.

The links command performs the authenticated live reads and adds:

- exact `chain_id` and `option_instrument_id`;
- option instrument URL and OCC symbol when available;
- bid/ask/mark/last, Greeks, and strategy quote URL;
- account-scoped web shell and chain-id app/web handoff links;
- safe sell/buy dry-run pricing controls using a $200 far offset.

## Account Context

Use `account_number` in the URL for browser navigation when the route preserves
it, but use explicit `account_number` API fields for automation. The options
chain page is mixed account-context behavior, so API response context is the
authority before building any order body.

## Boundaries

- No exact unopened-contract URL is claimed until it is verified in a logged-in
  browser/device pass across multiple symbols and expirations.
- The planner must not use a visible chain row as proof. It must resolve the
  exact option instrument id from API data.
- Live orders remain blocked unless exact user approval, `--live-write`, and
  `ROBINHOOD_ALLOW_LIVE_WRITE=1` are all present.

## Supplementary R&D

The public rule is narrow: promote only tested, additive handoff behavior into
CLI/API/MCP/docs; keep generated webhook builders, link bundles, and
account-specific payloads inside the gitignored `info/` folder.

<!-- made with love by Zayd Khan / cold -->
