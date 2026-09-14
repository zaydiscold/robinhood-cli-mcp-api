# Deposit operations

Use `deposit-inventory` to discover owned destinations and observed funding source × rail rows. Use `deposit-execute` only after exact authorization for the chosen source ID, destination ID, amount, and rail.

## Execution contract

- Native bank deposits (`bank_standard` and `bank_instant`) and debit-card deposits (`dcf` source type) use the observed Bonfire `pre_create` then `create` sequence. Private capture files are optional diagnostics, not a product requirement.
- Both POSTs are financial mutations. The engine sends them once, in that order, with one client ID. It does not classify `pre_create` as a quote and never blindly retries.
- Immediately before a live send, the engine reads complete PaymentHub history. The same client ID always blocks; an active same-route/source/destination/amount row also blocks. A completed row with a different client ID does not prevent a later intentional transfer.
- Before that read, an atomic intent lock serializes equivalent source/destination/rail/normalized-amount/retirement semantics across processes. It survives verification-required and ambiguous outcomes and is released only after a terminal rejection or exact-receipt reconciliation.
- Instant bank deposits are selected only when the broker actually offers `rfp_upsell`. Instant eligibility is **RFP**, not withdrawal-oriented RTP.
- Retirement contribution type/year is included only for retirement destinations, with `additional_data.entry_point=0`. Taxable deposits use `entry_point=5` and must not carry IRA fields.
- A missing final response is `transport_ambiguous`; run `deposit-status` or `money-movement-receipt` with the exact server receipt ID before any new deposit attempt.
- Fees and dynamic limits come from authenticated `transfer/service_fee/` and `limitshub/v1/limits/`. LimitHub's observed buckets are product + direction scoped and contain no source identifier, so they are reported as shared across sources; a missing bucket remains unknown.

## Commands

```bash
node cli/dist/index.js deposit-inventory
node cli/dist/index.js money-movement-quote --source-id <id> --destination-id <id> --amount 1.00 --kind deposit --rail bank_standard
node cli/dist/index.js deposit-execute --source-id <id> --destination-id <id> --amount 1.00 --method bank_standard
node cli/dist/index.js deposit-status --source-id <id> --destination-id <id> --amount 1.00 --method bank_standard
```

`ROBINHOOD_ALLOW_LIVE_WRITE=1` is required for a send. Instant deposits may require the funding bank to accept a payment request; that is not a second deposit. Debit-card deposits may require a radar session; the observed source type is `dcf`.

The inventory is pair-oriented rather than user-specific: enumerate the current external source rows and owned destinations, then quote the exact source × rail × destination. A source or destination absent from the authenticated inventory is `not_evaluated`, not silently generalized. On the 2026-09-13 reference account, the debit-card UI offered taxable destinations but did not offer the IRA destination; other users must trust their own live inventory rather than this example.

## Published timing references

Standard bank-transfer limits reset at 7 PM Eastern on business days; instant/debit daily limits reset at midnight Eastern. Settlement and availability vary by account and transfer.

- [Deposit money into your Robinhood account](https://robinhood.com/us/en/support/articles/deposit-money-into-your-robinhood-account/)
- [Transfer types](https://robinhood.com/us/en/support/articles/transfer-types/)
- [RHF Fee Schedule](https://cdn.robinhood.com/assets/robinhood/legal/RHF%20Fee%20Schedule.pdf) — debit-card **deposits** are listed at $0; the up-to-1.75% fee applies to **withdrawals**.
