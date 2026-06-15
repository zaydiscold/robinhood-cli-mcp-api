# GET /options/orders/%7B0%7D/

Mutation: no
Risk: sensitive-read

Host: api.robinhood.com
Categories: options, orders
Source: self-extension 2026-06-11: single OPTIONS order lookup by ID, for the post-cancel/post-send evidence re-read (order-evidence rule). Live-verified 200 against a filled SPXW order.
Operation ID: n/a

Route template:

```text
https://api.robinhood.com/options/orders/{0}/
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
