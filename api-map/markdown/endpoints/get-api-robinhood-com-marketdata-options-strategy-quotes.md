# GET /marketdata/options/strategy/quotes/

Mutation: no
Risk: read

Host: api.robinhood.com
Categories: marketdata, options
Source: cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/marketdata/options/strategy/quotes/
```

Observed working query shape:

```text
ids=<option_instrument_id,...>&ratios=<ratio,...>&types=<long|short,...>&include_all_sessions=true
```

`types` is leg exposure (`long` or `short`), not order side (`buy` or `sell`).
