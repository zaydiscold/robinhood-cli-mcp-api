# GET /positions/

Mutation: no
Risk: sensitive-read

Host: api.robinhood.com
Categories: account
Source: cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized; cdp-2026-07-14-authenticated-sanitized-v2; placeholder filled via --param; self-extension 2026-05-28: templated account_number form so any account (individual, Roth/IRA, etc.) can be queried, not just primary
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/positions/?account_number=
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
