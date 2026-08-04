# Privacy-safe account-service reads

This release adds read-only account-service intelligence to the shared Robinhood CLI/MCP engine. It deliberately does **not** submit IPO interest, alter cash-sweep enrollment or Gold status, read message text, or expose referral identities.

## One shared path

Every feature is implemented in `cli/src/lib.ts` and then exposed by both front doors:

| Intent | CLI | MCP |
| --- | --- | --- |
| Cash-sweep APY | `sweep-interest [--account N] --json` | `robinhood_sweep_interest` |
| Gold billing history | `gold-fees [--account N --offset N --limit N] --json` | `robinhood_gold_fees` |
| Stock-reward summary | `rewards --json` | `robinhood_rewards` |
| Inbox aggregates | `inbox-summary --json` | `robinhood_inbox_summary` |
| IPO Access list / one symbol | `ipo-access list --json`; `ipo-access show JMKE --json` | `robinhood_ipo_access` (`symbol` optional) |

All are `sensitive-read` capabilities and are available in the default MCP profile. They do not use the live-write environment switch.

## Privacy contract

- **Rewards** return section/type counts and normalized reward fields only. Referred-person identities, emails, phone numbers, and referral objects are discarded before output.
- **Inbox** returns counts, badges, latest activity timestamp, and pagination state only. It never returns sender names, preview text, messages, or raw threads.
- **IPO Access** returns public offering fields and aggregate account eligibility. It does not return account identifiers and never sends an indication of interest.
- **Gold fees** retain only provider-supplied identifiers; missing identifiers are `null`, never synthetic/random values.

## Mapped versus live evidence

The routes below are allow-listed in the brokerage map and were exercised against the authenticated web session during the fresh pass. The output contract is intentionally narrower than the upstream payload.

| Surface | Mapped upstream family | What the product promises |
| --- | --- | --- |
| Sweep interest | `gold/sweep_flow_splash/` → `accounts/sweeps/interest/` fallback | current displayed APY, evidence source, and only provider-supplied rate/date fields |
| Gold fees | `gold/get_subscription_fee_list/` | paginated billing amount, type, status, period |
| Rewards | `rewards/reward/stocks/` | privacy-safe reward counts and metadata |
| Inbox | `inbox/notifications/badge`, `inbox/threads/` | aggregate badge and thread state only |
| IPO Access | discovery list, instrument resolver, IPO summary viewmodel, accounts | list returns offering status/dates; direct show attempts price/participation details and reports unavailable summary data honestly |

Routes and upstream fields can change; mapped status alone is not proof of a live response. The fresh 2026-08-04 pass found that the account sweep endpoint exposed enrollment/account context while the Gold product surface carried the authoritative displayed APY. The engine therefore prefers the product surface and labels the fallback rather than inventing a base rate. Treat a current command result as the source of truth and report unavailable/empty data honestly.

## Safe examples

```bash
# Assumes a valid local `.env`; these are reads only.
node cli/dist/index.js rewards --json
node cli/dist/index.js inbox-summary --json
node cli/dist/index.js ipo-access show JMKE --json
node cli/dist/index.js sweep-interest --json
node cli/dist/index.js gold-fees --limit 20 --json
```

For scripts, source `.env` rather than parsing the bearer value:

```bash
set -a && source .env && set +a
node cli/dist/index.js inbox-summary --json
```

Never paste raw upstream response bodies into a shared artifact: the privacy guard exists at the engine boundary, not in arbitrary `brokerage execute` output.
