# IPO Access + 24-Hour Equity Contract Map

Captured 2026-08-08 from authenticated read-only Robinhood surfaces and static production web assets. No IPO interest or equity order was submitted.

## Evidence

Robinhood web build: `2026.32.5622+fd5ce74d1fc4`

| Artifact | SHA-256 |
|---|---|
| `App-1b250e4b96c6a0f7abde.js` | `06cdf614f7653f7d6ef37e73b118076dae750bd74a1896142e4c6c34001e9c98` |
| `runtime-d4a2977b4ee337bbb05d.js` | `b842033eb09e592b08c8057a61efc18d93bc717a380542fd2a9cb9f1707fb27b` |
| `96049-1cc241f6c659f3ae3d5f.chunk.js` | `92b1fbb79f04e610c54fd16e9d71c1d0123a1327f9ba23619de0486114fdc7e1` |

Live RVII GETs verified the request-plan viewmodels and returned HTTP 200 on an owned account. Live NBIL instrument/quote reads verified `all_day_tradability: tradable`, ordinary fractional tradability, no extended-hours fractional support, and a current wide two-sided book.

## IPO Access product map

The education carousel is UX around one account-scoped request state. It is not five independent product operations. `ipo-access plan-request` and `robinhood_ipo_access_request_plan` collapse the following into one structured read:

1. Symbol/instrument resolution
2. Owned-account verification
3. Education splash and optional “don't show again” label
4. Indication-of-interest risk acknowledgement and acceptance label
5. Notification disclosure
6. Account-scoped order-entry form
7. Enrollment state
8. Phase/form-state ID
9. COB deadline and passed state
10. Available buying power
11. Existing request/order presence
12. New-order blockers and required actions
13. Review rows, order summary, and disclaimer

### Registered and exercised routes

| Route | Risk | Query |
|---|---|---|
| `/equity_trading/ipo_access/viewmodels/order_entry_splash/{instrument_id}/` | read | `endpoint_version=2021-10-13` |
| `/equity_trading/ipo_access/viewmodels/indication_of_interest/{instrument_id}/` | read | none |
| `/equity_trading/ipo_access/viewmodels/notification_disclosure/{instrument_id}/` | read | none |
| `/equity_trading/ipo_access/viewmodels/web_order_entry/{instrument_id}/` | sensitive-read | `account_number` |
| `/equity_trading/ipo_access/viewmodels/summary/{ipo_id}/` | read | none |

### Additional GET viewmodels found in the production bundle

- IPO announcement
- allocation learning hub
- allocation results
- post-deadline follow-up
- trade receipt
- shareable allocation results
- list card and IPO list viewmodels
- limit-type explanation
- web order entry and order-entry splash

These are mapped as product states but are not all invoked by the request-plan wrapper because they belong to later lifecycle phases.

### Current live RVII proof

- phase: `price_finalized`
- form state: `price_finalized2525`
- enrolled: true
- deadline evaluated and not passed
- buying power evaluated
- no existing request
- no request blockers

### IPO write boundary

The submit/update/cancel HTTP method, URL, and request serializer were not captured from a real review action. The wrapper therefore returns:

```json
{
  "submission": {
    "evaluated": false,
    "status": "not_evaluated",
    "missingInput": "The IPO submit/update/cancel HTTP method, URL, and request body have not been captured from a live review action; no order was built or sent."
  }
}
```

Do not infer a generic `/orders/` POST from the standard equity serializer. Capture the exact IPO review request before implementing a write.

## Equity execution-session map

Production enum values:

| Product meaning | `market_hours` |
|---|---|
| Regular session | `regular_hours` |
| Pre-market / after-hours | `extended_hours` |
| Overnight / 24 Hour Market | `all_day_hours` |
| Distinct legacy/internal enum; not used by this wrapper | `hyper_extended_hours` |

Instrument eligibility fields found in the web build:

- `all_day_tradability`
- `twenty_four_seven_tradability`
- `extended_hours_fractional_tradability`
- ordinary `tradability`

The web build also contains distinct checks for all-day symbol eligibility, all-day session kill-switches, fractional promotion/blocking, invalid time windows, quantity restrictions, price bands, and spreads. A screenshot proves the UI route, not account/session API eligibility.

## Implemented 24-hour dry-run contract

`--market-hours overnight` maps to `market_hours: all_day_hours` in the shared CLI/MCP order engine.

The engine requires:

- explicit share quantity
- whole shares
- explicit limit price
- `instrument.all_day_tradability === "tradable"`
- valid two-sided bid/ask
- spread at or below `ROBINHOOD_MAX_ALL_DAY_SPREAD_PCT` (default 5%)
- owned account
- forced dry-run while account-scoped order-check remains unmapped

Mapped request fields:

```json
{
  "type": "limit",
  "time_in_force": "gtc",
  "trigger": "immediate",
  "market_hours": "all_day_hours",
  "quantity": "1",
  "price": "20.55",
  "bid_price": "20.50",
  "ask_price": "20.64",
  "bid_ask_timestamp": "...",
  "order_form_version": "7",
  "position_effect": "close"
}
```

### NBIL proof and safety result

The requested screenshot contract (`1` share, `$20.55`, `$20.50 / $20.64`) is covered by regression tests and builds the expected body.

The current live NBIL quote at verification was `$18.90 / $21.00`, a 10.53% spread. The live dry-run correctly blocked before producing a ready plan:

```text
NBIL: 24-hour bid/ask spread is 10.53% (18.90 / 21.00), above the 5.00% safety cap. Refusing the plan.
```

## Remaining evidence needed before live 24-hour execution

Capture Robinhood's account-scoped order-check/preflight request and response for an all-day ticket, including:

- account eligibility
- instrument eligibility
- session open/kill-switch state
- supported TIF/order type
- whole/fractional rule
- limit-price bands
- bid/ask freshness
- spread/liquidity warning or block
- disclosure version/acceptance state
- review route and final serializer

Until then, non-regular live sends fail closed even when `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set.

- delilah 🌸
