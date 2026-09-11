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

Observed standard-bank create body: `POST https://bonfire.robinhood.com/transfer/create/` with `source.type=rhs`, ACH sink, `currency: "usd"`, `frequency: "once"`. There is no `pre_create` on the captured withdrawal path.

If the broker returns `suv_check_pending`, the CLI/MCP reports `verification_required` and prompts for phone approval. Use `money-movement-verify` under the **original CLI session**, then `money-movement-resume` with the recorded operation ID. Do not create a second request identity. WireBrowser sessions cannot consume another session’s workflow.

## Commands

```bash
node cli/dist/index.js money-movement-quote --source-id <id> --destination-id <id> --amount 1.00 --kind withdrawal --rail bank_standard
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js withdrawal-execute --source-id <id> --destination-id <id> --amount 1.00 --rail bank_standard --live-write
node cli/dist/index.js money-movement-verify --workflow-id <id>
node cli/dist/index.js money-movement-resume --operation-id <id>
```
