# Account Settings Capability Map

This is the account-page operational map for the CLI, MCP server, and skill. It
separates first-class support from route-map support and from browser-only
research. No live account-setting mutation is recorded here.

## What Was Checked

- The runtime brokerage route map was audited for account-page surfaces:
  funding, recurring investments, DRIP, high-yield cash/sweeps, stock lending,
  options, futures, event contracts, account type, and margin.
- Mixed read/write routes were split by method in `api-map/brokerage-routes.json`
  so reads stay live and writes stay double-gated.
- The MCP server exposes the same route map through
  `robinhood_brokerage_routes`, `robinhood_brokerage_plan`, and
  `robinhood_brokerage_execute`.
- Browser read checks loaded the account-pinned investing settings page, stock
  lending page, recurring investments page, and account hub. The checks verified
  page reachability and visible control/status surfaces only; no settings were
  toggled and no financial details are included in this public doc.

## Capability Matrix

| Surface | Current support | Routes / commands | Live-write rule |
|---------|-----------------|-------------------|-----------------|
| Account enumeration | Live read, first-class route-map use | `bonfire.robinhood.com/transfer/accounts/`, `accounts/?default_to_all_accounts=true` | Read-only |
| Deposit / withdraw / funding sources | Live reads mapped; transfer/link writes are route-map dry-runs only | `ach/relationships/`, `ach/transfers/`, `cashier.robinhood.com/ach/relationships/`, `cashier.robinhood.com/ach/deposit_schedules/`, `payment_instruments/v2/`, `paymenthub/unified_transfers/` | Never mutate without fresh body capture and exact user approval |
| Recurring investments | First-class list/pause/resume; create/edit/delete route-map only | `recurring list`, `recurring pause`, `recurring resume`, `bonfire.robinhood.com/recurring_schedules/` | Pause/resume are hardened double-gated writes; create/edit amount/funding source needs fresh body capture |
| Dividend reinvestment | **Read + write PROVEN** (browser-captured 2026-06-03) | account-wide: `corp_actions/drip/account_settings/{account}/` (GET + PATCH); per-stock: `corp_actions/drip/instrument_settings/{account}/` (GET list) and `.../{account}/{instrument_id}/` (PATCH) | `PATCH {"drip_enabled":bool}` double-gated; verify with GET. NOTE: the old `corp_actions/drip/enrollment/{num}/` is GET-only (405 on writes) — wrong endpoint; the two above are the real ones |
| High-yield cash / sweep | Live reads mapped; enable/disable route not proven | `accounts/sweeps/`, `accounts/sweeps/interest/`, `accounts/sweeps/timeline_summary/`, `gold/sweep_flow_splash/` | Do not claim toggle support until a fresh browser capture provides the mutation route/body |
| Stock lending | Payment/status reads mapped; enable/disable route not proven | `accounts/stock_loan_payments/`; browser page `/account/stock-lending` has mixed account query behavior | Do not toggle until capture proves the write route/body |
| Options trading settings | Trading/position/order surfaces mapped; settings toggles are browser-observed only | `options/chains/`, `options/orders/`, `options/positions/`, `options/aggregate_positions/`, browser `/account/settings/investing?account_number=...` | Option orders use the hardened order gate; options-level/remove-options toggles need fresh capture |
| Futures trading | Eligibility/account/order reads mapped | `ceres/v1/futures_account_eligibility/{num}`, `ceres/v1/accounts`, `ceres/v1/accounts/{id}/orders`, `ceres/v1/user_settings` | Enable/disable route not first-class in this map |
| Event contracts | Event-related reads mapped | `options/events/`, `instruments/{uuid}/qa/event-info/`, `instruments/{uuid}/qa/events-section/` | Trading enable/disable route not proven |
| Account type / margin | Margin and eligibility reads mapped; switching cash/margin is not first-class | `margin/{num}/upgrade_restrictions`, `bonfire.robinhood.com/margin/{id}/settings/`, `eligibility`, `investing_info/`, `buying_power_hub_view` | Do not switch account type or margin settings without a fresh mutation capture and explicit approval |
| Agentic account config | Read and dry-run PATCH route mapped | `robinhood/agentic/` split into `GET` and `PATCH` routes | Double-gated account-setting write |

## CLI Recipes

```bash
# Enumerate every account before doing per-account checks.
node cli/dist/index.js brokerage execute \
  "bonfire.robinhood.com/transfer/accounts/" --json --full

# Find funding and money-movement routes.
node cli/dist/index.js brokerage routes --query "ach/" --json
node cli/dist/index.js brokerage routes --query "payment_instruments" --json
node cli/dist/index.js brokerage routes --query "paymenthub/unified_transfers" --json

# Recurring investments: first-class read/pause/resume.
node cli/dist/index.js recurring list --json
node cli/dist/index.js recurring pause --id <SCHEDULE_ID> --json
node cli/dist/index.js recurring resume --id <SCHEDULE_ID> --json

# DRIP read and dry-run toggle plan.
node cli/dist/index.js brokerage execute \
  "corp_actions/drip/enrollment/{num}/" --method GET \
  --param num=<ACCOUNT_NUMBER> --json --full
node cli/dist/index.js brokerage execute \
  "corp_actions/drip/enrollment/{num}/" --method PATCH \
  --param num=<ACCOUNT_NUMBER> \
  --body-json '{"drip_enrolled":true}' --json --full

# Margin/account type read surface.
node cli/dist/index.js brokerage routes --query "margin" --json
node cli/dist/index.js brokerage execute \
  "bonfire.robinhood.com/margin/{id}/settings/" \
  --param id=<ACCOUNT_NUMBER> --json --full
```

The dry-run examples above send nothing unless both live-write gates are present:
`--live-write` and `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

## MCP Recipes

- `robinhood_brokerage_routes` with `query: "recurring_schedules"` or
  `query: "corp_actions/drip/enrollment"` lists the route entries.
- `robinhood_brokerage_plan` builds a dry-run request shape without sending.
- `robinhood_brokerage_execute` runs reads live; writes are forced dry-run unless
  `liveWrite: true` and `ROBINHOOD_ALLOW_LIVE_WRITE=1` are both set.

## Browser-captured write endpoints (PROVEN 2026-06-03)

Captured live via an in-page fetch/XHR interceptor (`Page.addScriptToEvaluateOnNewDocument`,
persisted to `sessionStorage`) while toggling settings across the cash, Roth, and 9mo accounts.
All are writes (double-gated); the account is in the path, so `?account_number=` / `{account}`
selects which account they hit.

| Setting | Method + route | Body |
|---|---|---|
| DRIP account-wide | `PATCH corp_actions/drip/account_settings/{account}/` | `{"drip_enabled":bool}` |
| DRIP per-stock | `PATCH corp_actions/drip/instrument_settings/{account}/{instrument_id}/` | `{"drip_enabled":bool}` |
| Options trade-on-expiration | `PATCH options/option_settings/{account}/` | `{"trading_on_expiration_state":"enabled"\|"disabled"}` |
| PDT protection | `PUT settings/margin/{account}/` | `{"day_trades_protection":bool}` |
| Cash sweep enroll | `POST bonfire…/sms/sweep/agree_and_enroll` | `{"account_number":"…"}` (pairs w/ agreement sign) |
| Cash sweep disable | `POST accounts/{account}/sweep_enrollment_state/` | `{"sweep_enrollment_action":"unenroll"}` |
| Agreement sign | `POST identi…/user_info/agreements/v2/sign/` | `{"agreement_id":…,"sha256":…}` |
| PDT resolution flow | `POST pathfinder/user_machine/` | `{"flow":"brokerage.pdt-resolution",…}` |
| Support chat open / end | `POST pathfinder/support_chats/[{id}/]` | `{"originating_app":"brokerage"}` / `{"operation":"end"}` |

**Read counterparts (GET, all 200):** `drip/account_settings/{account}/` → `{drip_enabled}`;
`drip/instrument_settings/{account}/` → per-stock `results[]`; `options/option_settings/{account}/` →
`{trading_on_expiration_state,default_price,short_shares_on_option_events_enabled,…}`;
`settings/margin/{account}/` → `{leverage,day_trades,advanced_buying_power,…}`;
`accounts/{account}/sweep_enrollment_state/` → `{sweep_enrolled}`. Together these are a full
per-account settings **read+write** surface. Raw capture (with real ids) in gitignored
`info/robinhood-research/settings-writes-raw-2026-06-03.json`.

**Still unproven:** stock-lending toggle (`/account/stock-lending`), account-type switch.

## Current Boundary

The account settings page contains useful UI controls that are not all promoted
to first-class CLI commands yet. The route map gives API/MCP access to the
known surfaces, but enable/disable toggles for high-yield cash, stock lending,
futures trading, event contracts, and switching cash/margin require a fresh
captured mutation route before they should be wired as live automation.
