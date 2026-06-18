# Options Strategy Dry-Run Smoke

## Scope

This is a live-read, dry-run-only verification pass for the option execution
surface. No live order was submitted. Every order body emitted `sent:false`.

Test symbol: `DRAM`.

Primary expiration used for spreads and condors: `2026-12-18`.

## Commands Exercised

The rebuilt CLI was used for the smoke pass:

```bash
node cli/dist/index.js options strategy-quote long-call ...
node cli/dist/index.js options strategy-quote naked-short-call ...
node cli/dist/index.js options strategy-quote call-credit-spread ...
node cli/dist/index.js options strategy-quote call-debit-spread ...
node cli/dist/index.js options strategy-quote put-credit-spread ...
node cli/dist/index.js options strategy-quote put-debit-spread ...
node cli/dist/index.js options strategy-quote iron-condor ...
node cli/dist/index.js options strategy-quote call-calendar-roll ...
node cli/dist/index.js options roll-plan --cash-account ...
```

## Evidence Summary

All strategy quote commands resolved real option instrument ids, read
`marketdata/options`, called `marketdata/options/strategy/quotes/`, filled an
`options/orders/` dry-run body, and returned no missing params.

| Case | Result | Pricing |
|------|--------|---------|
| Long call, Dec 18 $80C | dry-run debit | natural 14.50, mid/limit 13.92 |
| Naked short call, Dec 18 $80C | dry-run credit | natural 13.35, safe-sell limit 213.35 |
| Call credit spread, Dec 18 short $75C / long $80C | dry-run credit | natural 0.30, mid 1.23, safe-sell limit 200.30 |
| Call debit spread, Dec 18 long $70C / short $75C | dry-run debit | natural 2.75, mid/limit 2.12 |
| Put credit spread, Dec 18 short $65P / long $60P | dry-run credit | natural 1.65, mid 2.70, safe-sell limit 201.65 |
| Put debit spread, Dec 18 long $70P / short $65P | dry-run debit | natural 4.30, mid/limit 3.10 |
| Iron condor, Dec 18 $60P/$65P/$75C/$80C | dry-run credit | natural 1.95, mid 3.93, safe-sell limit 201.95 |
| Call calendar roll, close Jun 26 $70C / open Dec 18 $80C | dry-run debit | natural 8.50, mid/limit 7.67 |
| Cash-account staged roll | dry-run two-order plan | close limit 206.00, open limit 13.93, open not before next business day |

## Pricing Contract

The smoke pass confirms:

- buy-leg natural price uses ask;
- sell-leg natural price uses bid;
- mid uses `(bid + ask) / 2` when bid/ask are usable;
- spread/condor net price sums signed leg contributions;
- `safe-sell-probe` uses natural credit plus `$200`;
- `roll-plan --cash-account` emits two dry-run orders and requires fresh
  settled-cash and quote checks before the delayed open leg.

## Boundary

This proves live contract resolution, quote reading, strategy quote calls, and
dry-run body generation. It does not prove that a live Robinhood order would be
accepted or filled, because live order submission remains blocked by design
unless exact approval, `--live-write`, and `ROBINHOOD_ALLOW_LIVE_WRITE=1` are
all present.

<!-- Zayd Khan // cold // www.zayd.wtf -->
