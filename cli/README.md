# @zaydiscold/robinhood-cli

Personal live Robinhood API map CLI.

```bash
robinhood-cli api-map summary --json
robinhood-cli api-map routes --host trading.robinhood.com --json
robinhood-cli brokerage routes --risk sensitive-read --json
robinhood-cli brokerage plan "https://api.robinhood.com/accounts/{0}/recent_day_trades/" --param 0=ACCOUNT_ID --json
robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --dry-run --json
ROBINHOOD_BROKERAGE_TOKEN=... robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --json
robinhood-cli crypto routes --json
robinhood-cli crypto sign --api-key "$ROBINHOOD_API_KEY" --private-key-b64 "$ROBINHOOD_PRIVATE_KEY_B64" --path /api/v1/crypto/trading/accounts/ --method GET
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --dry-run --json
ROBINHOOD_CRYPTO_API_KEY=... ROBINHOOD_CRYPTO_PRIVATE_KEY_B64=... robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --json
```

`brokerage execute` sends live requests when `ROBINHOOD_BROKERAGE_TOKEN` or `ROBINHOOD_COOKIE` is set. Pass `--dry-run` to avoid sending.
`crypto execute` sends live requests to Robinhood's official Crypto Trading API when `ROBINHOOD_CRYPTO_API_KEY` and `ROBINHOOD_CRYPTO_PRIVATE_KEY_B64` are set. Pass `--dry-run` to avoid sending.
