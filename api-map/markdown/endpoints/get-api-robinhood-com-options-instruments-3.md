# GET /options/instruments/

Mutation: no
Risk: read

Host: api.robinhood.com
Categories: options, instruments, reference
Source: self-extension 2026-05-28: list option instruments for a chain/expiry/type -> find strike + option id
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
