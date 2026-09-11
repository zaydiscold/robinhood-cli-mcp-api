# Deposit operations

Use `deposit-inventory` to discover owned destinations and observed funding source × rail rows. Use `deposit-execute` only after exact authorization for the chosen source ID, destination ID, amount, and rail.

## Execution contract

- Native bank deposits (`bank_standard` and `bank_instant`) and debit-card deposits (`dcf` source type) use the observed Bonfire `pre_create` then `create` sequence. Private capture files are optional diagnostics, not a product requirement.
- Both POSTs are financial mutations. The engine sends them once, in that order, with one client ID. It does not classify `pre_create` as a quote and never blindly retries.
- Instant bank deposits are selected only when the broker actually offers `rfp_upsell`. Instant eligibility is **RFP**, not withdrawal-oriented RTP.
- Retirement contribution type/year is included only for retirement destinations. Taxable deposits must not carry those fields.
- A missing final response is `transport_ambiguous`; run `deposit-status` or `money-movement-receipt` with the exact server receipt ID before any new deposit attempt.
- Fees and dynamic limits come from authenticated `transfer/service_fee/` and `limitshub/v1/limits/`. Unknown values stay unknown.

## Commands

```bash
node cli/dist/index.js deposit-inventory
node cli/dist/index.js money-movement-quote --source-id <id> --destination-id <id> --amount 1.00 --kind deposit --rail bank_standard
node cli/dist/index.js deposit-execute --source-id <id> --destination-id <id> --amount 1.00 --method bank_standard
node cli/dist/index.js deposit-status --source-id <id> --destination-id <id> --amount 1.00 --method bank_standard
```

`ROBINHOOD_ALLOW_LIVE_WRITE=1` is required for a send. Instant deposits may require the funding bank to accept a payment request; that is not a second deposit. Debit-card deposits may require a radar session; the observed source type is `dcf`.

## Published timing references

Standard bank-transfer limits reset at 7 PM Eastern on business days; instant/debit daily limits reset at midnight Eastern. Settlement and availability vary by account and transfer.

- [Deposit money into your Robinhood account](https://robinhood.com/us/en/support/articles/deposit-money-into-your-robinhood-account/)
- [Transfer types](https://robinhood.com/us/en/support/articles/transfer-types/)
- [RHF Fee Schedule](https://cdn.robinhood.com/assets/robinhood/legal/RHF%20Fee%20Schedule.pdf) — debit-card **deposits** are listed at $0; the up-to-1.75% fee applies to **withdrawals**.
