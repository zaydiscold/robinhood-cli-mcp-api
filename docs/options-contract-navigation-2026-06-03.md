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

The command is an account-aware navigation and API-resolution planner:

- returns the observed web account shell;
- returns candidate web query and fragment URLs for manual browser testing;
- returns deterministic API lookup steps;
- returns a dry-run single-leg order body template;
- does not open a browser, launch an app, or send an order.

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

A current mobile-app source snapshot had useful hints for future testing:
internal options navigation appears to carry fields such as account context,
target strike, selected filter, and strategy legs. That is useful for deciding
which browser/device probes to try next, but it is not active CLI behavior and
is not emitted as a fallback unless it is verified in a real logged-in pass.
