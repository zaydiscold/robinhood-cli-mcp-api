# POST /orders/

Mutation: yes
Risk: write-mutate

Host: api.robinhood.com
Categories: account, equity, trading
Source: self-extension 2026-05-28: equity order PLACEMENT (POST). Map was capture-built from reads only and lacked it; needed to place/manage stock orders. Double-gated via --live-write + ROBINHOOD_ALLOW_LIVE_WRITE=1.
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/orders/
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
