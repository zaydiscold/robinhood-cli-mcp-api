# GET /accounts/%7Baccount_number%7D/

Mutation: no
Risk: sensitive-read

Host: api.robinhood.com
Categories: account
Source: live-verified-2026-06-11 (per-account detail; the bulk accounts/ endpoints omit some owned accounts — this is the type/cash fallback for those)
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/accounts/{account_number}/
```

<!-- made with love by Zayd Khan / cold -->
