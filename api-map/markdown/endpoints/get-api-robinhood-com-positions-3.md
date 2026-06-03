# GET /positions/

Mutation: no
Risk: sensitive-read

Host: api.robinhood.com
Categories: account
Source: self-extension 2026-05-28: templated account_number form so any account (individual, Roth/IRA, etc.) can be queried, not just primary; placeholder filled via --param
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/positions/?account_number={account_number}&nonzero=true
```
