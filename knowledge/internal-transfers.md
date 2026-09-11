# Internal account transfers

Use `internal-transfer-inventory` to discover owned Robinhood accounts. Use `internal-transfer-execute` / `robinhood_internal_transfer_execute` for a native owned-account transfer. Private capture files are not required.

## Observed contracts

`POST https://bonfire.robinhood.com/transfer/pre_create/` then `POST https://bonfire.robinhood.com/transfer/create/` with:

- `source.id` / `sink.id` = underlying `account_id` values (never a display-list `rhs-` prefix)
- `amount`, `currency: "usd"`, `frequency: "once"`
- taxable ↔ taxable: `source.type` / `sink.type` = `rhs`, `additional_data.entry_point: 5`
- taxable → Roth contribution: `source.type` = `rhs`, `sink.type` = `ira_roth`, `additional_data.entry_point: 0`, `additional_data.ira_contribution_data.contribution_type: "contribution"`, `additional_data.ira_contribution_data.tax_year` = the selected year
- contribution year is required only for a retirement destination; taxable transfers must not carry it

Live history correlation uses `originating_account_id` as the source and `receiving_account_id` as the destination. Independently verify with `money-movement-receipt` and the exact server `transfer_id`.

Retirement **sources** still require route-specific distribution/conversion inputs. This feature does not infer a distribution or rollover from an account type. If the live form shows `$0.00 available`, do not invent a send.

## Commands

```bash
node cli/dist/index.js internal-transfer-inventory
node cli/dist/index.js money-movement-quote --source-id <id> --destination-id <id> --amount 0.11 --kind internal
node cli/dist/index.js internal-transfer-execute --source-id <id> --destination-id <id> --amount 0.11 --contribution-year 2026
node cli/dist/index.js money-movement-receipt --receipt-id <id> --source-id <id> --destination-id <id> --amount 0.11 --kind internal
```

`ROBINHOOD_ALLOW_LIVE_WRITE=1` is required for a send. The MCP equivalent is `robinhood_internal_transfer_execute`.
