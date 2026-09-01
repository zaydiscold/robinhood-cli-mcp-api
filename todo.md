# Robinhood CLI TODO

## 2026-08-31 — postmarket cron
*Source: scheduled postmarket portfolio brief*

### Authentication
- [ ] Log into Robinhood in a supported browser session, run `pnpm auth:refresh`, and verify a parseable nonempty authenticated `accounts --json`
- [ ] Rerun `capture_daily.py postmarket` after auth; complete portfolio, options, margin, 3-day history, open-order, expiry, and quote reconciliation

## 2026-08-31 — midday cron
*Source: scheduled midday portfolio brief*

### Authentication
- [ ] Re-authenticate Robinhood in a supported local browser/capture profile and verify nonempty authenticated `accounts --json`
- [ ] Rerun `capture_daily.py midday` after auth; verify portfolio, options, margin, 3-day history, and SPY/QQQ quote reads
