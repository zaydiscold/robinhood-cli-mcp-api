# Robinhood brokerage route curl notes

# These templates are commented. The personal CLI is preferred for live sends
# because it emits risk warnings and supports --dry-run.

# sensitive-read GET https://api.robinhood.com/acats-aggregation/fee_reimbursements/history
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/acats-aggregation/fee_reimbursements/history'

# sensitive-read GET https://api.robinhood.com/acats/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/acats/'

# sensitive-read GET https://api.robinhood.com/accounts/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/'

# sensitive-read GET https://api.robinhood.com/accounts/{account_number}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/{account_number}/'

# sensitive-read GET https://api.robinhood.com/accounts/?default_to_all_accounts=true
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/?default_to_all_accounts=true'

# sensitive-read GET https://api.robinhood.com/accounts/{0}/recent_day_trades/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/{0}/recent_day_trades/'

# sensitive-read GET https://api.robinhood.com/accounts/{account_number}/buying_power_breakdown
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/{account_number}/buying_power_breakdown'

# sensitive-read GET https://api.robinhood.com/accounts/stock_loan_payments/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/stock_loan_payments/'

# sensitive-read GET https://api.robinhood.com/accounts/sweeps/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/sweeps/'

# sensitive-read GET https://api.robinhood.com/accounts/sweeps/interest/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/sweeps/interest/'

# sensitive-read GET https://api.robinhood.com/accounts/sweeps/timeline_summary/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/sweeps/timeline_summary/'

# read GET https://api.robinhood.com/ach/received/transfers/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/received/transfers/'

# sensitive-read GET https://api.robinhood.com/ach/relationships/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/relationships/'

# write-or-sensitive POST https://api.robinhood.com/ach/relationships/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/relationships/'

# sensitive-read GET https://api.robinhood.com/ach/relationships/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/relationships/{0}/'

# destructive DELETE https://api.robinhood.com/ach/relationships/{0}/
# curl -sS -X DELETE -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/relationships/{0}/'

# destructive POST https://api.robinhood.com/ach/relationships/{0}/unlink/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/relationships/{0}/unlink/'

# sensitive-read GET https://api.robinhood.com/ach/transfers/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/transfers/'

# write-or-sensitive POST https://api.robinhood.com/ach/transfers/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ach/transfers/'

# sensitive-read GET https://api.robinhood.com/banking/cross-sell/creditcard/applications/{uuid}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/banking/cross-sell/creditcard/applications/{uuid}'

# sensitive-read GET https://api.robinhood.com/bw/config
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/bw/config'

# read GET https://api.robinhood.com/cash_journal/margin_interest_charges/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/cash_journal/margin_interest_charges/'

# sensitive-read GET https://api.robinhood.com/ceres/v1/{id}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/{id}'

# sensitive-read GET https://api.robinhood.com/ceres/v1/{id}/{id}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/{id}/{id}'

# sensitive-read GET https://api.robinhood.com/ceres/v1/accounts
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/accounts'

# sensitive-read GET https://api.robinhood.com/ceres/v1/accounts/{id}/aggregated_positions
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/accounts/{id}/aggregated_positions'

# sensitive-read GET https://api.robinhood.com/ceres/v1/accounts/{id}/orders
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/accounts/{id}/orders'

# sensitive-read GET https://api.robinhood.com/ceres/v1/accounts/{id}/pnl_cost_basis
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/accounts/{id}/pnl_cost_basis'

# sensitive-read GET https://api.robinhood.com/ceres/v1/cash_settlement_executions
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/cash_settlement_executions'

# sensitive-read GET https://api.robinhood.com/ceres/v1/futures_account_eligibility/{account_number}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/futures_account_eligibility/{account_number}'

# sensitive-read GET https://api.robinhood.com/ceres/v1/manual_cash_correction
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/manual_cash_correction'

# sensitive-read GET https://api.robinhood.com/ceres/v1/user_settings
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/ceres/v1/user_settings'

# read GET https://api.robinhood.com/challenge/{0}/respond/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/challenge/{0}/respond/'

# sensitive-read GET https://api.robinhood.com/combo/orders/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/combo/orders/'

# sensitive-read GET https://api.robinhood.com/corp_actions/adr_fees/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/adr_fees/'

# sensitive-read GET https://api.robinhood.com/corp_actions/drip/enrollment/{account_number}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/drip/enrollment/{account_number}/'

# write-or-sensitive PATCH https://api.robinhood.com/corp_actions/drip/enrollment/{account_number}/
# curl -sS -X PATCH -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/drip/enrollment/{account_number}/'

# sensitive-read GET https://api.robinhood.com/options/option_settings/{account_number}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/option_settings/{account_number}/'

# write-or-sensitive PATCH https://api.robinhood.com/options/option_settings/{account_number}/
# curl -sS -X PATCH -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/option_settings/{account_number}/'

# sensitive-read GET https://api.robinhood.com/corp_actions/v2/split_payments/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/v2/split_payments/'

# sensitive-read GET https://api.robinhood.com/crypto-transfers/account/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/crypto-transfers/account/'

# sensitive-read GET https://api.robinhood.com/devices/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/devices/'

# sensitive-read GET https://api.robinhood.com/devices/disable_remove_device/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/devices/disable_remove_device/'

# read GET https://api.robinhood.com/discovery/ratings/{id}/overview/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/ratings/{id}/overview/'

# sensitive-read GET https://api.robinhood.com/dividends/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/dividends/'

# sensitive-read GET https://api.robinhood.com/documents/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/documents/'

# sensitive-read GET https://api.robinhood.com/documents/edocs_v2/custodial/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/documents/edocs_v2/custodial/'

# sensitive-read GET https://api.robinhood.com/documents/edocs_v2/ira/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/documents/edocs_v2/ira/'

# sensitive-read GET https://api.robinhood.com/documents/edocs_v2/managed/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/documents/edocs_v2/managed/'

# sensitive-read GET https://api.robinhood.com/documents/edocs_v2/rhc/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/documents/edocs_v2/rhc/'

# sensitive-read GET https://api.robinhood.com/documents/edocs_v2/rhd/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/documents/edocs_v2/rhd/'

# sensitive-read GET https://api.robinhood.com/documents/joint_account
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/documents/joint_account'

# read GET https://api.robinhood.com/fundamentals/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/fundamentals/'

# write-safe POST https://api.robinhood.com/goku/{id}
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/goku/{id}'

# write-safe POST https://api.robinhood.com/goku/lcm
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/goku/lcm'

# write-safe POST https://api.robinhood.com/goku/lcmv2
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/goku/lcmv2'

# write-safe POST https://api.robinhood.com/goku/live_frontend_log_events
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/goku/live_frontend_log_events'

# read GET https://api.robinhood.com/hippo/ux-flags
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/hippo/ux-flags'

# sensitive-read GET https://api.robinhood.com/inbox/notifications/badge
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/inbox/notifications/badge'

# sensitive-read GET https://api.robinhood.com/inbox/threads/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/inbox/threads/'

# read GET https://api.robinhood.com/instruments/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/instruments/'

# read GET https://api.robinhood.com/instruments/{0}/popularity/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/instruments/{0}/popularity/'

# read GET https://api.robinhood.com/instruments/{0}/splits/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/instruments/{0}/splits/'

# read GET https://api.robinhood.com/instruments/{id}/shorting/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/instruments/{id}/shorting/'

# read GET https://api.robinhood.com/kaizen/experiments/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/kaizen/experiments/{id}/'

# sensitive-read GET https://api.robinhood.com/margin/{account_number}/upgrade_restrictions
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/margin/{account_number}/upgrade_restrictions'

# sensitive-read GET https://api.robinhood.com/margin/{account_number}/upgrade_restrictions/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/margin/{account_number}/upgrade_restrictions/'

# read GET https://api.robinhood.com/margin/calls/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/margin/calls/'

# read GET https://api.robinhood.com/marketdata/earnings/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/earnings/'

# read GET https://api.robinhood.com/marketdata/equities/summary/robinhood/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/equities/summary/robinhood/{id}/'

# read GET https://api.robinhood.com/marketdata/forex/estimated_price/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/forex/estimated_price/{uuid}/'

# read GET https://api.robinhood.com/marketdata/forex/fundamentals/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/forex/fundamentals/{uuid}/'

# read GET https://api.robinhood.com/marketdata/forex/historicals/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/forex/historicals/'

# read GET https://api.robinhood.com/marketdata/forex/historicals/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/forex/historicals/{0}/'

# read GET https://api.robinhood.com/marketdata/forex/quotes/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/forex/quotes/'

# read GET https://api.robinhood.com/marketdata/forex/quotes/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/forex/quotes/{0}/'

# read GET https://api.robinhood.com/marketdata/fundamentals/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/fundamentals/{id}/'

# read GET https://api.robinhood.com/marketdata/fundamentals/short/v1/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/fundamentals/short/v1/'

# read GET https://api.robinhood.com/marketdata/hedgefunds/summary/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/hedgefunds/summary/{id}/'

# read GET https://api.robinhood.com/marketdata/hedgefunds/transactions/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/hedgefunds/transactions/{id}/'

# read GET https://api.robinhood.com/marketdata/historicals/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/historicals/'

# read GET https://api.robinhood.com/marketdata/historicals/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/historicals/{id}/'

# read GET https://api.robinhood.com/marketdata/insiders/summary/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/insiders/summary/{id}/'

# read GET https://api.robinhood.com/marketdata/insiders/transactions/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/insiders/transactions/{id}/'

# read GET https://api.robinhood.com/marketdata/options/?ids={ids}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/options/?ids={ids}'

# read GET https://api.robinhood.com/marketdata/options/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/options/'

# read GET https://api.robinhood.com/marketdata/options/historicals/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/options/historicals/{0}/'

# read GET https://api.robinhood.com/marketdata/options/historicals/?ids={ids}&interval={interval}&span={span}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/options/historicals/?ids={ids}&interval={interval}&span={span}'

# read GET https://api.robinhood.com/marketdata/options/strategy/quotes/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/options/strategy/quotes/'

# read GET https://api.robinhood.com/marketdata/quotes/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/quotes/'

# read GET https://api.robinhood.com/marketdata/quotes/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/quotes/{id}/'

# read GET https://api.robinhood.com/markets/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/markets/'

# read GET https://api.robinhood.com/markets/{}/hours/{}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/markets/{}/hours/{}/'

# read GET https://api.robinhood.com/markets/{market}/hours/{date}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/markets/{market}/hours/{date}/'

# sensitive-read GET https://api.robinhood.com/midlands/ach/iav_banks/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/ach/iav_banks/{id}/'

# read GET https://api.robinhood.com/midlands/lists/default/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/lists/default/'

# read GET https://api.robinhood.com/midlands/lists/items/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/lists/items/'

# read GET https://api.robinhood.com/midlands/movers/sp500/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/movers/sp500/'

# read GET https://api.robinhood.com/midlands/news/{0}/?
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/news/{0}/?'

# sensitive-read GET https://api.robinhood.com/midlands/notification_settings/ui_resources/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/notification_settings/ui_resources/'

# sensitive-read GET https://api.robinhood.com/midlands/notifications/notification_tracker/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/notifications/notification_tracker/'

# sensitive-read GET https://api.robinhood.com/midlands/notifications/stack/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/notifications/stack/'

# read GET https://api.robinhood.com/midlands/ratings/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/ratings/'

# read GET https://api.robinhood.com/midlands/ratings/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/ratings/{0}/'

# read GET https://api.robinhood.com/midlands/ratings/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/ratings/{id}/'

# read GET https://api.robinhood.com/midlands/referral/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/referral/'

# read GET https://api.robinhood.com/midlands/tags/tag/{}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/tags/tag/{}/'

# read GET https://api.robinhood.com/midlands/tags/tag/100-most-popular/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/tags/tag/100-most-popular/'

# read GET https://api.robinhood.com/midlands/tags/tag/top-movers/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/tags/tag/top-movers/'

# sensitive-read GET https://api.robinhood.com/nimbus/v1/asset_transfers
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/nimbus/v1/asset_transfers'

# sensitive-read GET https://api.robinhood.com/notifications/devices/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/notifications/devices/'

# read GET https://api.robinhood.com/oauth2/token/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/oauth2/token/'

# sensitive-read GET https://api.robinhood.com/options-product/tooltips/home-tab/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options-product/tooltips/home-tab/'

# sensitive-read GET https://api.robinhood.com/options/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/{id}/'

# sensitive-read GET https://api.robinhood.com/options/aggregate_positions/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/aggregate_positions/'

# sensitive-read GET https://api.robinhood.com/options/aggregate_positions/?account_numbers=
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/aggregate_positions/?account_numbers='

# sensitive-read GET https://api.robinhood.com/options/chains/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/chains/'

# read GET https://api.robinhood.com/options/chains/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/chains/{0}/'

# sensitive-read GET https://api.robinhood.com/options/chains/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/chains/{id}/'

# sensitive-read GET https://api.robinhood.com/options/chains/{id}/collateral/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/chains/{id}/collateral/'

# sensitive-read GET https://api.robinhood.com/options/corp_actions/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/corp_actions/'

# read GET https://api.robinhood.com/options/events/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/events/'

# read GET https://api.robinhood.com/options/instruments/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/instruments/'

# read GET https://api.robinhood.com/options/instruments/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/instruments/{0}/'

# sensitive-read GET https://api.robinhood.com/options/orders/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/orders/'

# destructive POST https://api.robinhood.com/options/orders/{0}/cancel/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/orders/{0}/cancel/'

# sensitive-read GET https://api.robinhood.com/options/positions/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/positions/'

# sensitive-read GET https://api.robinhood.com/options/positions/?account_numbers=
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/positions/?account_numbers='

# sensitive-read GET https://api.robinhood.com/options/should_show_options_upgrade_on_sdp/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/should_show_options_upgrade_on_sdp/'

# sensitive-read GET https://api.robinhood.com/options/strategies/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/strategies/'

# sensitive-read GET https://api.robinhood.com/orders/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/orders/'

# destructive POST https://api.robinhood.com/orders/{0}/cancel/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/orders/{0}/cancel/'

# sensitive-read GET https://api.robinhood.com/orders/session/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/orders/session/'

# sensitive-read GET https://api.robinhood.com/pathfinder/concierge/plus/status/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/pathfinder/concierge/plus/status/'

# sensitive-read GET https://api.robinhood.com/pathfinder/issues/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/pathfinder/issues/'

# sensitive-read GET https://api.robinhood.com/pathfinder/support_chats/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/pathfinder/support_chats/'

# sensitive-read GET https://api.robinhood.com/pluto/historical_activities/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/pluto/historical_activities/'

# sensitive-read GET https://api.robinhood.com/portfolios/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/portfolios/'

# sensitive-read GET https://api.robinhood.com/portfolios/{account_number}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/portfolios/{account_number}/'

# sensitive-read GET https://api.robinhood.com/portfolios/historicals/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/portfolios/historicals/{0}/'

# sensitive-read GET https://api.robinhood.com/positions/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/positions/'

# sensitive-read GET https://api.robinhood.com/positions/?account_number=
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/positions/?account_number='

# sensitive-read GET https://api.robinhood.com/positions/?account_number={account_number}&nonzero=true
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/positions/?account_number={account_number}&nonzero=true'

# read GET https://api.robinhood.com/quotes/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/quotes/'

# read GET https://api.robinhood.com/quotes/historicals/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/quotes/historicals/'

# sensitive-read GET https://api.robinhood.com/settings/education_state/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/settings/education_state/{id}/'

# write-or-sensitive POST https://api.robinhood.com/subscription/subscription_fees/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/subscription/subscription_fees/'

# sensitive-read GET https://api.robinhood.com/user/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/user/'

# sensitive-read GET https://api.robinhood.com/user/additional_info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/user/additional_info/'

# sensitive-read GET https://api.robinhood.com/user/basic_info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/user/basic_info/'

# sensitive-read GET https://api.robinhood.com/user/investment_profile/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/user/investment_profile/'

# sensitive-read GET https://api.robinhood.com/user/verify/email/info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/user/verify/email/info/'

# write-or-sensitive POST https://api.robinhood.com/wire/transfers
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/wire/transfers'

# sensitive-read GET https://api.robinhood.com/wonka/promotions/upsell_configs/BADGE
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/wonka/promotions/upsell_configs/BADGE'

# sensitive-read GET https://api.robinhood.com/wonka/promotions/upsell_configs/TRANSFER_HUB_ROW_UPSELL
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/wonka/promotions/upsell_configs/TRANSFER_HUB_ROW_UPSELL'

# sensitive-read GET https://api.robinhood.com/yoda/v1/list_advisor_trades
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/yoda/v1/list_advisor_trades'

# sensitive-read GET https://bonfire.robinhood.com/acats/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/acats/'

# sensitive-read GET https://bonfire.robinhood.com/account_switcher/instrument/v2/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/account_switcher/instrument/v2/{uuid}/'

# sensitive-read GET https://bonfire.robinhood.com/accounts/{id}/{id}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/accounts/{id}/{id}'

# sensitive-read GET https://bonfire.robinhood.com/accounts/{id}/currency_buying_power/{uuid}/info_alert
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/accounts/{id}/currency_buying_power/{uuid}/info_alert'

# sensitive-read GET https://bonfire.robinhood.com/accounts/{id}/currency_buying_power/USD
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/accounts/{id}/currency_buying_power/USD'

# sensitive-read GET https://bonfire.robinhood.com/accounts/{id}/instrument_buying_power/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/accounts/{id}/instrument_buying_power/{uuid}/'

# sensitive-read GET https://bonfire.robinhood.com/accounts/{id}/unified/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/accounts/{id}/unified/'

# sensitive-read GET https://bonfire.robinhood.com/advisory/fees/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/advisory/fees/'

# sensitive-read GET https://bonfire.robinhood.com/app-comms/batch/surface/info-banner/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/app-comms/batch/surface/info-banner/'

# write-mutate POST https://bonfire.robinhood.com/app-comms/receipt/seen/{uuid}/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/app-comms/receipt/seen/{uuid}/'

# sensitive-read GET https://bonfire.robinhood.com/app-comms/surface/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/app-comms/surface/{id}/'

# sensitive-read GET https://bonfire.robinhood.com/app-comms/surface/alert-sheet
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/app-comms/surface/alert-sheet'

# sensitive-read GET https://bonfire.robinhood.com/app-comms/surface/hero-card
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/app-comms/surface/hero-card'

# sensitive-read GET https://bonfire.robinhood.com/app-comms/surface/status-banner
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/app-comms/surface/status-banner'

# sensitive-read GET https://bonfire.robinhood.com/crypto-yields/v1/history/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/crypto-yields/v1/history/'

# sensitive-read GET https://bonfire.robinhood.com/crypto/crypto_migrations
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/crypto/crypto_migrations'

# sensitive-read GET https://bonfire.robinhood.com/crypto/cryptobility/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/crypto/cryptobility/{uuid}/'

# sensitive-read GET https://bonfire.robinhood.com/crypto/fundamental_stats/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/crypto/fundamental_stats/{uuid}/'

# sensitive-read GET https://bonfire.robinhood.com/crypto/transfers/history/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/crypto/transfers/history/'

# sensitive-read GET https://bonfire.robinhood.com/edocs_orchestrator/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/edocs_orchestrator/{id}/'

# sensitive-read GET https://bonfire.robinhood.com/education/tool_tips
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/education/tool_tips'

# sensitive-read GET https://bonfire.robinhood.com/education/tour/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/education/tour/'

# sensitive-read GET https://bonfire.robinhood.com/equities/history/{id}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/equities/history/{id}'

# sensitive-read GET https://bonfire.robinhood.com/equity_trading/order_type_selector/buy/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/equity_trading/order_type_selector/buy/'

# sensitive-read GET https://bonfire.robinhood.com/feature-discovery/features/investing_below_card
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/feature-discovery/features/investing_below_card'

# sensitive-read GET https://bonfire.robinhood.com/gold/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/gold/{id}/'

# sensitive-read GET https://bonfire.robinhood.com/gold/get_subscription_list/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/gold/get_subscription_list/'

# sensitive-read GET https://bonfire.robinhood.com/gold/pill
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/gold/pill'

# sensitive-read GET https://bonfire.robinhood.com/gold/sweep_flow_splash/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/gold/sweep_flow_splash/'

# sensitive-read GET https://bonfire.robinhood.com/home/account_switcher/v2
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/home/account_switcher/v2'

# read GET https://bonfire.robinhood.com/instruments/{uuid}/disclosures/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/disclosures/'

# read GET https://bonfire.robinhood.com/instruments/{uuid}/etp-details/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/etp-details/'

# read GET https://bonfire.robinhood.com/instruments/{uuid}/historical-chart/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/historical-chart/'

# sensitive-read GET https://bonfire.robinhood.com/instruments/{uuid}/margin-requirements/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/margin-requirements/'

# read GET https://bonfire.robinhood.com/instruments/{uuid}/qa/event-info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/qa/event-info/'

# read GET https://bonfire.robinhood.com/instruments/{uuid}/qa/events-section/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/qa/events-section/'

# read GET https://bonfire.robinhood.com/instruments/{uuid}/stock_detail/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/stock_detail/'

# read GET https://bonfire.robinhood.com/instruments/{uuid}/v2/warnings/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/{uuid}/v2/warnings/'

# read GET https://bonfire.robinhood.com/instruments/chart-bounds/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/chart-bounds/'

# read GET https://bonfire.robinhood.com/instruments/spans/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/instruments/spans/'

# sensitive-read GET https://bonfire.robinhood.com/margin/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/margin/{id}/'

# sensitive-read GET https://bonfire.robinhood.com/margin/{id}/buying_power_hub_view
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/margin/{id}/buying_power_hub_view'

# sensitive-read GET https://bonfire.robinhood.com/margin/{id}/eligibility
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/margin/{id}/eligibility'

# sensitive-read GET https://bonfire.robinhood.com/margin/{id}/investing_info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/margin/{id}/investing_info/'

# sensitive-read GET https://api.robinhood.com/margin/{account_number}/investing_info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/margin/{account_number}/investing_info/'

# sensitive-read GET https://bonfire.robinhood.com/margin/{id}/settings/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/margin/{id}/settings/'

# sensitive-read GET https://bonfire.robinhood.com/market_indices
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/market_indices'

# sensitive-read GET https://bonfire.robinhood.com/onboarding/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/onboarding/{id}/'

# sensitive-read GET https://bonfire.robinhood.com/p2p/treatment/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/p2p/treatment/'

# sensitive-read GET https://bonfire.robinhood.com/payment_instruments/v2/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/payment_instruments/v2/'

# sensitive-read GET https://bonfire.robinhood.com/payment_instruments/v2/debitcard/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/payment_instruments/v2/debitcard/{uuid}/'

# sensitive-read GET https://bonfire.robinhood.com/paymenthub/unified_transfers/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/paymenthub/unified_transfers/'

# sensitive-read GET https://bonfire.robinhood.com/paymenthub/unified_transfers/{uuid}/contribution/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/paymenthub/unified_transfers/{uuid}/contribution/'

# sensitive-read GET https://bonfire.robinhood.com/portfolio/{id}/positions_v2
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/portfolio/{id}/positions_v2'

# sensitive-read GET https://bonfire.robinhood.com/portfolio/acats/bonus-promo-info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/portfolio/acats/bonus-promo-info/'

# sensitive-read GET https://bonfire.robinhood.com/portfolio/account/{id}/live
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/portfolio/account/{id}/live'

# sensitive-read GET https://bonfire.robinhood.com/portfolio/performance/{id}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/portfolio/performance/{id}'

# sensitive-read GET https://bonfire.robinhood.com/portfolio/performance/{id}/settings_v2/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/portfolio/performance/{id}/settings_v2/'

# sensitive-read GET https://bonfire.robinhood.com/psp/eligible_programs
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/psp/eligible_programs'

# sensitive-read GET https://bonfire.robinhood.com/psp/gifts/history/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/psp/gifts/history/'

# sensitive-read GET https://bonfire.robinhood.com/questionnaire/questionnaire-completed/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/questionnaire/questionnaire-completed/'

# sensitive-read GET https://bonfire.robinhood.com/rad/gifting/gifts
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/rad/gifting/gifts'

# sensitive-read GET https://bonfire.robinhood.com/recurring_schedules/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/recurring_schedules/'

# sensitive-read GET https://bonfire.robinhood.com/recurring_schedules/equity/next_investment_date/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/recurring_schedules/equity/next_investment_date/'

# sensitive-read GET https://bonfire.robinhood.com/recurring_tradability/equity/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/recurring_tradability/equity/{uuid}/'

# sensitive-read GET https://bonfire.robinhood.com/recurring_trade_logs/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/recurring_trade_logs/'

# sensitive-read GET https://bonfire.robinhood.com/region
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/region'

# sensitive-read GET https://bonfire.robinhood.com/retirement/history/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/retirement/history/'

# sensitive-read GET https://bonfire.robinhood.com/rewards/reward/gift/crypto/list/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/rewards/reward/gift/crypto/list/'

# sensitive-read GET https://bonfire.robinhood.com/rewards/reward/stocks/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/rewards/reward/stocks/'

# sensitive-read GET https://bonfire.robinhood.com/rewards/sdp_referral/card/{uuid}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/rewards/sdp_referral/card/{uuid}'

# sensitive-read GET https://bonfire.robinhood.com/rhy/accounts/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/rhy/accounts/'

# sensitive-read GET https://bonfire.robinhood.com/screeners
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/screeners'

# sensitive-read GET https://bonfire.robinhood.com/screeners/presets/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/screeners/presets/'

# sensitive-read GET https://bonfire.robinhood.com/settings_page//account_contact/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/settings_page//account_contact/'

# sensitive-read GET https://bonfire.robinhood.com/settings_page//account_preferences/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/settings_page//account_preferences/'

# sensitive-read GET https://bonfire.robinhood.com/settings_page//notifications/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/settings_page//notifications/'

# sensitive-read GET https://bonfire.robinhood.com/slip/{id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/slip/{id}/'

# sensitive-read GET https://bonfire.robinhood.com/slip/eligibility/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/slip/eligibility/'

# sensitive-read GET https://bonfire.robinhood.com/slip/hub-card/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/slip/hub-card/'

# sensitive-read GET https://bonfire.robinhood.com/sms/margin/{id}/{id}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/sms/margin/{id}/{id}'

# sensitive-read GET https://bonfire.robinhood.com/tax_info/instrument/{uuid}/withholding_status/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/tax_info/instrument/{uuid}/withholding_status/'

# sensitive-read GET https://bonfire.robinhood.com/tax_info/withheld_amount/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/tax_info/withheld_amount/'

# sensitive-read GET https://bonfire.robinhood.com/transfer/accounts/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/transfer/accounts/'

# sensitive-read GET https://bonfire.robinhood.com/user_status/stripe/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/user_status/stripe/'

# sensitive-read GET https://cashier.robinhood.com/ach/deposit_schedules/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://cashier.robinhood.com/ach/deposit_schedules/'

# sensitive-read GET https://cashier.robinhood.com/ach/relationships/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://cashier.robinhood.com/ach/relationships/'

# sensitive-read GET https://dora.robinhood.com/feed/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://dora.robinhood.com/feed/'

# sensitive-read GET https://dora.robinhood.com/feed/instrument/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://dora.robinhood.com/feed/instrument/{uuid}/'

# read GET https://dora.robinhood.com/instruments/similar/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://dora.robinhood.com/instruments/similar/{uuid}/'

# sensitive-read GET https://identi.robinhood.com/sorting_hat/v1/user_state/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/sorting_hat/v1/user_state/'

# sensitive-read GET https://identi.robinhood.com/sorting_hat/v4_web/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/sorting_hat/v4_web/'

# sensitive-read GET https://identi.robinhood.com/user_info/address/residential/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/user_info/address/residential/'

# sensitive-read GET https://identi.robinhood.com/user_info/opt_out_consent/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/user_info/opt_out_consent/'

# sensitive-read GET https://identi.robinhood.com/user_info/opt_out_consent/ccpa_marketing/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/user_info/opt_out_consent/ccpa_marketing/'

# sensitive-read GET https://identi.robinhood.com/user_info/privacy_consent/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/user_info/privacy_consent/'

# sensitive-read GET https://identi.robinhood.com/user_info/profile_info/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/user_info/profile_info/'

# sensitive-read GET https://identi.robinhood.com/user_info/trusted_contact/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/user_info/trusted_contact/'

# sensitive-read GET https://minerva.robinhood.com/accounts/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://minerva.robinhood.com/accounts/'

# sensitive-read GET https://minerva.robinhood.com/cards/declined_transactions/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://minerva.robinhood.com/cards/declined_transactions/'

# sensitive-read GET https://minerva.robinhood.com/history/transactions/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://minerva.robinhood.com/history/transactions/'

# sensitive-read GET https://nummus.robinhood.com/accounts/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/accounts/'

# sensitive-read GET https://nummus.robinhood.com/activations/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/activations/'

# read GET https://nummus.robinhood.com/currency_pairs/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/currency_pairs/'

# read GET https://nummus.robinhood.com/holdings/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/holdings/'

# sensitive-read GET https://nummus.robinhood.com/orders/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/orders/'

# write-mutate POST https://nummus.robinhood.com/orders/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/orders/'

# sensitive-read GET https://nummus.robinhood.com/orders/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/orders/{0}/'

# destructive POST https://nummus.robinhood.com/orders/{0}/cancel/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/orders/{0}/cancel/'

# sensitive-read GET https://nummus.robinhood.com/portfolios/{uuid}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://nummus.robinhood.com/portfolios/{uuid}/'

# sensitive-read GET https://phoenix.robinhood.com/accounts/unified
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://phoenix.robinhood.com/accounts/unified'

# write-mutate POST https://api.robinhood.com/orders/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/orders/'

# write-mutate POST https://api.robinhood.com/options/orders/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/orders/'

# read GET https://api.robinhood.com/instruments/?ids={ids}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/instruments/?ids={ids}'

# read GET https://api.robinhood.com/marketdata/quotes/?ids={ids}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/quotes/?ids={ids}'

# read GET https://api.robinhood.com/instruments/?symbol={symbol}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/instruments/?symbol={symbol}'

# read GET https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}'

# sensitive-read GET https://api.robinhood.com/discovery/lists/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/'

# sensitive-read GET https://api.robinhood.com/discovery/lists/default/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/default/'

# sensitive-read GET https://api.robinhood.com/discovery/lists/items/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/items/'

# sensitive-read GET https://api.robinhood.com/discovery/lists/user_items/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/user_items/'

# sensitive-read GET https://api.robinhood.com/discovery/lists/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/{0}/'

# sensitive-read GET https://api.robinhood.com/discovery/lists/?owner_type=custom
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/?owner_type=custom'

# write-mutate POST https://api.robinhood.com/discovery/lists/items/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/items/'

# destructive PATCH https://api.robinhood.com/discovery/lists/{id}/
# curl -sS -X PATCH -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/{id}/'

# destructive POST https://api.robinhood.com/discovery/lists/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/discovery/lists/'

# destructive PATCH https://bonfire.robinhood.com/recurring_schedules/{0}/
# curl -sS -X PATCH -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/recurring_schedules/{0}/'

# destructive POST https://bonfire.robinhood.com/recurring_schedules/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/recurring_schedules/'

# sensitive-read GET https://bonfire.robinhood.com/recurring_schedules/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/recurring_schedules/{0}/'

# read GET https://api.robinhood.com/midlands/search/?query={query}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/search/?query={query}'

# read GET https://api.robinhood.com/midlands/news/?symbol={symbol}
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/news/?symbol={symbol}'

# read GET https://api.robinhood.com/midlands/tags/tag/{tag}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/midlands/tags/tag/{tag}/'

# read GET https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/'

# read GET https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/'

# write-mutate PATCH https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/{instrument_id}/
# curl -sS -X PATCH -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/{instrument_id}/'

# read GET https://api.robinhood.com/settings/margin/{account_number}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/settings/margin/{account_number}/'

# read GET https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/'

# write-mutate POST https://bonfire.robinhood.com/sms/sweep/agree_and_enroll
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/sms/sweep/agree_and_enroll'

# write-or-sensitive POST https://identi.robinhood.com/user_info/agreements/v2/sign/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://identi.robinhood.com/user_info/agreements/v2/sign/'

# write-safe POST https://bonfire.robinhood.com/options/orders/review
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/options/orders/review'

# write-safe POST https://bonfire.robinhood.com/options/orders/marketability/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/options/orders/marketability/'

# read GET https://bonfire.robinhood.com/slip/{account_number}/status/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/slip/{account_number}/status/'

# write-mutate PATCH https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/
# curl -sS -X PATCH -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/'

# write-mutate PUT https://api.robinhood.com/settings/margin/{account_number}/
# curl -sS -X PUT -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/settings/margin/{account_number}/'

# write-mutate PUT https://bonfire.robinhood.com/slip/{account_number}/status/
# curl -sS -X PUT -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/slip/{account_number}/status/'

# write-mutate POST https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/
# curl -sS -X POST -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/'

# sensitive-read GET https://bonfire.robinhood.com/accounts/{account_number}/options_buying_power
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/accounts/{account_number}/options_buying_power'

# read GET https://api.robinhood.com/options/orders/collateral/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/orders/collateral/'

# read GET https://api.robinhood.com/options/fees/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/fees/'

# read GET https://bonfire.robinhood.com/equity_trading/ipo_access/viewmodels/summary/{ipo_id}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/equity_trading/ipo_access/viewmodels/summary/{ipo_id}/'

# read GET https://bonfire.robinhood.com/equity_trading/order_type_selector/sell/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/equity_trading/order_type_selector/sell/'

# read GET https://api.robinhood.com/marketdata/historicals/{symbol}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/marketdata/historicals/{symbol}/'

# read GET https://bonfire.robinhood.com/options/{strategy_code}/historical-chart/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://bonfire.robinhood.com/options/{strategy_code}/historical-chart/'

# sensitive-read GET https://api.robinhood.com/orders/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/orders/{0}/'

# sensitive-read GET https://api.robinhood.com/options/orders/{0}/
# curl -sS -X GET -H 'Authorization: Bearer <REDACTED>' 'https://api.robinhood.com/options/orders/{0}/'

# Zayd Khan // cold // www.zayd.wtf
