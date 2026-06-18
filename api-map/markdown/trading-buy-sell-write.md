# Robinhood Trading — Buy / Sell (write surface)

Captured 2026-05-28 (CDP). The CLI exposes buy/sell as commands; all writes default to **dry-run** and
require the `ROBINHOOD_ALLOW_LIVE_WRITE=1` env gate — the single master switch — before any real order.
Account-scoped: every order takes `--account <alias|number>` (cash / margin / roth → account id).

## Review (preview) — no order placed
- `POST api/orders/order_checks/presubmit_data/` — the **"Review order"** step. Send the prospective
  order body; returns collateral/buying-power/regulatory-fee checks + warnings. Safe: does not place.

## Equity buy / sell
- **Place:** `POST api/orders/`
- Body (standard Robinhood equity order):
  ```json
  {
    "account": "https://api.robinhood.com/accounts/<account_number>/",
    "instrument": "https://api.robinhood.com/instruments/<uuid>/",
    "symbol": "TSLA",
    "type": "limit",            // or "market"
    "side": "buy",              // or "sell"
    "quantity": "1",
    "price": "1.62",            // limit price (omit/append for market)
    "time_in_force": "gfd",     // gfd (good-for-day) | gtc
    "trigger": "immediate",     // or "stop" (+ stop_price)
    "extended_hours": false
  }
  ```
- **Cancel:** `POST api/orders/<order_id>/cancel/`
- **List/inspect:** `GET api/orders/` (+ `api/ceres/v1/orders`, `api/wormhole/bw/orders/recent`)

## Options buy / sell (incl. spreads & rolls — multi-leg)
- **Place:** `POST api/options/orders/`
- Body (multi-leg; single-leg = one entry in `legs`):
  ```json
  {
    "account": "https://api.robinhood.com/accounts/<account_number>/",
    "direction": "debit",        // debit | credit
    "type": "limit",
    "price": "1.62",
    "time_in_force": "gfd",
    "trigger": "immediate",
    "quantity": "1",
    "legs": [
      { "option": "https://api.robinhood.com/options/instruments/<uuid>/",
        "side": "buy",           // buy | sell
        "position_effect": "open",  // open | close
        "ratio_quantity": 1 }
      // a vertical spread / roll adds more legs with opposing side/strike/expiry
    ]
  }
  ```
- **Cancel:** `POST api/options/orders/<order_id>/cancel/`
- **Pricing for spreads/rolls:** `GET api/marketdata/options/strategy/quotes/?ids=<ids>&ratios=<ratios>&types=<long|short>&include_all_sessions=true` (multi-leg quote),
  `GET bonfire/options/lego_chain_eligibility/:uuid/` (multi-leg builder eligibility),
  `GET api/options/chains/:uuid/collateral/`.
- **Buying power:** `GET bonfire/accounts/:id/options_buying_power`.

## Greeks / contract detail (for the chain you pasted)
- `GET api/marketdata/options/` returns per-contract: bid/ask/mark, volume, open_interest,
  implied_volatility, and the Greeks (delta, gamma, theta, vega, rho), high/low/previous_close.
- `GET api/options/chains/{symbol}` → chain; `api/options/instruments/` → per-strike instruments.

## CLI command shape (planned)
```
robinhood-cli buy  <symbol> --qty N [--limit P] [--tif gfd|gtc] --account margin          # dry-run
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli buy  <symbol> --qty N [--limit P] [--tif gfd|gtc] --account margin
robinhood-cli sell <symbol> --qty N [--limit P] --account margin                        # dry-run
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli sell <symbol> --qty N [--limit P] --account margin
robinhood-cli options buy  <symbol> --strike S --expiry D --type call|put --qty N [--limit P] [--account ..]   # dry-run
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli options buy  <symbol> --strike S --expiry D --type call|put --qty N [--limit P] [--account ..]
robinhood-cli options spread/roll ...   # multi-leg legs[]
robinhood-cli orders review <...>        # presubmit_data preview (always safe)
```
Tickers are always a parameter (`<symbol>`); accounts always a `--account` selector.
