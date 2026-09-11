# Deposit operations

Use `deposit-inventory` to discover owned destinations and observed funding source × rail rows. Use `deposit-execute` only after exact authorization for the chosen source ID, destination ID, amount, and rail.

## Execution contract

- The loader reads the action-scoped capture at an operator-private path; no captured body, cookie, CSRF value, or account identifier is packaged.
- `pre_create` and `create` are both financial POSTs. The engine sends them once, in that order, with one fresh client ID. It does not classify `pre_create` as a quote and never blindly retries.
- A missing final response is `transport_ambiguous`; run `deposit-status` to reconcile before any new deposit attempt.
- Deposit execution checks that the selected destination is owned/deposit-enabled and the source × rail is currently observed/eligible. It does not synthesize a debit-card source or a contract for an uncaptured rail.
- Fees and dynamic limits are observed route data. Unknown fee/limit values remain unknown; published limits and remaining account quota are distinct.

## Commands

```bash
node cli/dist/index.js deposit-inventory
node cli/dist/index.js deposit-execute --source-id <id> --destination-id <id> --amount 1.00 --method bank_standard --contract-path <private-jsonl>
node cli/dist/index.js deposit-status --source-id <id> --destination-id <id> --amount 1.00 --method bank_standard
```

`ROBINHOOD_ALLOW_LIVE_WRITE=1` is required for a send. Use a one-process environment setting. `deposit-status` is the receipt verification path and never resends.

## Published timing references

The repository records the published cadence separately from account-specific availability: standard bank-transfer limits reset at 7 PM Eastern on business days; instant/debit daily limits reset at midnight Eastern. Settlement and availability vary by account and transfer; read the current authenticated route data rather than converting a published maximum into remaining quota.

- Robinhood Support, [Bank transfers and linking](https://robinhood.com/support/bank-transfers-and-linking/)
- Robinhood Support, [Deposit money into your Robinhood account](https://robinhood.com/support/articles/deposit-money-into-your-robinhood-account/)
- Robinhood Support, [Transfer limits](https://robinhood.com/support/articles/transfer-limits/)
