# GET /accounts/%7Baccount_number%7D/options_buying_power

Mutation: no
Risk: sensitive-read

Host: bonfire.robinhood.com
Categories: account, options
Source: cdp-2026-06-04-dram-option-order-flow (observed; the real options-BP gate the web reads before an option open)
Operation ID: n/a

Route template:

```text
https://bonfire.robinhood.com/accounts/{account_number}/options_buying_power
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
