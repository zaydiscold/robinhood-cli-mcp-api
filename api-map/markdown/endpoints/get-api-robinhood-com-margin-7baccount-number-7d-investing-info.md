# GET /margin/%7Baccount_number%7D/investing_info/

Mutation: no
Risk: sensitive-read

Host: api.robinhood.com
Categories: account, margin
Source: live-verified-2026-06-11 on the api host (200 with amount_borrowed/margin_interest_rate/next_billing_date). The margin-health read: answers 'am I borrowing, at what rate, billed when'. Sibling day_trades_card/ returns 404 (retired with the PDT elimination, FINRA 26-10).
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/margin/{account_number}/investing_info/
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
