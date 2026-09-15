# Withdrawal capability — evidence and operating boundary

**As of 2026-09-11.** Public rules below are citations. Account-specific eligibility, remaining allowance, and fees come from authenticated reads.

## Public rules (official Robinhood support)

- Standard bank (ACH): no published fee; receiving bank may take longer; limits reset 7 PM ET on business days
- Instant bank / RTP withdrawals: up to 1.75%, min $1, max $150; typically minutes; calendar-day reset at 12 AM ET
- External debit-card withdrawals: up to 1.75%, min $1, max $150

Official sources:

- [Withdraw money from Robinhood](https://robinhood.com/us/en/support/articles/withdraw-money-from-robinhood/)
- [Transfer types](https://robinhood.com/us/en/support/articles/transfer-types/)
- [RHF Fee Schedule](https://cdn.robinhood.com/assets/robinhood/legal/RHF%20Fee%20Schedule.pdf)

Do not substitute those published maxima for an authenticated quote.

## Product boundary

The engine quotes every **owned source × rail × destination × amount** with:

- `GET https://api.robinhood.com/bff-mm/transfer/validation`
- `GET https://bonfire.robinhood.com/limitshub/v1/limits/`
- `GET https://bonfire.robinhood.com/transfer/service_fee/`

Unknown numeric limits stay unknown. A successfully validated standard-bank route is not disabled just because a quota field is missing. Fees above the authorized maximum remain gated.
The observed LimitHub rows are product + direction buckets with no source identifier, so the quote reports them as shared across sources. A missing row remains unknown instead of being treated as zero.

Observed mutation matrix:

- taxable → standard ACH: `create` only; `source.type=rhs`, `sink.type=ach`, `additional_data={entry_point:5,is_instant_transfer:false}`
- taxable → instant bank: `pre_create` then `create`; the same account pair plus `is_instant_transfer:true`
- taxable → debit card: `pre_create` then `create`; `sink.type=dcf` and `additional_data={entry_point:5}` (no ACH instant flag)
- retirement source → bank/brokerage: `pre_create` then `create`, with explicit `ira_distribution_data`

The instant and debit-card rows were captured fail-closed on 2026-09-13: both final POSTs were intercepted before dispatch, so no fee-bearing withdrawal was sent. A prior debit-card withdrawal in authenticated history independently establishes that the UI class is a real supported route.

Roth-origin withdrawals use the same create URL plus `additional_data.ira_distribution_data` (`distribution_type`, `federal_tax_withholding_percent`, `state_tax_withholding_percent`, `state`). Read `GET /transfer/ira_distributions_questionnaire/?account_type={account_type}` and `GET /transfer/calculate_tax_withholdings/` first. Do not infer those fields. Captured Roth-origin paths (Roth → brokerage and Roth → bank) both use `pre_create` then `create` with that distribution object.

If the broker returns `suv_check_pending`, the CLI/MCP reports `verification_required` and prompts for phone approval. Use `money-movement-verify` under the **original CLI session**, then `money-movement-resume` with the recorded operation ID. Do not create a second request identity. WireBrowser sessions cannot consume another session’s workflow.
Resume first reconciles complete PaymentHub history by the original client identity and route. A 2xx create response is `transport_ambiguous` unless it contains Robinhood's observed `transfer_id`; only that exact ID can become a verified receipt.
Equivalent live intents are atomically serialized across CLI/MCP processes before preflight. IRA execution also requires the operator to pass the verified retirement eligibility result (`--retirement-eligibility-verified` in the CLI or `retirement.eligibilityVerified=true` in MCP) together with the explicit distribution and withholding fields.

## Commands

```bash
node cli/dist/index.js money-movement-quote --source-id <id> --destination-id <id> --amount 1.00 --kind withdrawal --rail bank_standard
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js withdrawal-execute --source-id <id> --destination-id <id> --amount 1.00 --rail bank_standard --live-write
node cli/dist/index.js money-movement-verify --workflow-id <id>
node cli/dist/index.js money-movement-resume --operation-id <id>
```
