# Robinhood CLI TODO

## 2026-09-03 — postmarket cron
*Source: scheduled postmarket portfolio brief*

### Completed
- [x] Verify live America/Los_Angeles timestamp and mothership machine
- [x] Verify custom CLI dist and parseable authenticated nonempty `accounts --json`: 5 accounts, 4 funded
- [x] Run `capture_daily.py postmarket`: 23 option rows, 0 capture errors
- [x] Complete serialized postmarket sweep: portfolio/day/after-hours, positions, options, full Greeks, margin, buying power, risk, open orders, 3-day history, expirations/events, movers, quotes, and audit artifacts
- [x] Verify strict Telegram render: 0 collection errors, 0 capture errors, 0 material conflicts; far 9mo plus remains CRITICAL at 0.06% excess maintenance/equity

### Follow-up
- [ ] Establish a supported local Robinhood browser session before the imported bearer expires, then verify `pnpm auth:refresh` locally
- [ ] Review the live CRITICAL maintenance band on `far 9mo plus` before any new deployment

## 2026-09-03 — midday cron
*Source: scheduled midday portfolio brief*

### Completed
- [x] Verify live America/Los_Angeles timestamp and mothership machine
- [x] Verify custom CLI dist and parseable nonempty authenticated `accounts --json`: 5 accounts, 4 funded
- [x] Run `capture_daily.py midday`: 23 option rows, 0 errors
- [x] Complete serialized midday sweep: portfolio/day/after-hours, positions, options, full Greeks, margin, buying power, open orders, 3-day history, expirations/events, movers, and quotes
- [x] Verify V3 render and canonical audit artifacts: 0 errors, 5 drivers, 4 funded, format valid

### Follow-up
- [ ] Establish a supported local Robinhood browser session before the imported bearer expires, then verify `pnpm auth:refresh` locally
- [ ] Review the live CRITICAL maintenance band on `far 9mo plus` before any new deployment

## 2026-09-02 — postmarket cron
*Source: scheduled postmarket portfolio brief*

### Completed
- [x] Verify live America/Los_Angeles timestamp and mothership machine
- [x] Verify custom CLI dist and authenticated nonempty `accounts --json`: 5 accounts, 4 funded
- [x] Run `capture_daily.py postmarket`: 23 option rows, 0 errors
- [x] Complete serialized postmarket sweep: portfolio/day/after-hours, positions, options, full Greeks, margin, buying power, risk, open orders, 3-day history, expirations/events, movers, quotes, and audit artifacts
- [x] Verify strict Telegram render: 0 collection errors, 0 capture errors, 0 material conflicts

### Follow-up
- [ ] Establish a supported local Robinhood browser session before the imported bearer expires, then verify `pnpm auth:refresh` locally
- [ ] Review the live ACTIVE CALL state on `far 9mo plus` before any new deployment

## 2026-09-01 — postmarket cron
*Source: scheduled postmarket portfolio brief*

### Completed
- [x] Recover an independently verified brokerage session from frostbyte CDP and import it without printing the bearer
- [x] Verify live `accounts --json`: 5 parseable authenticated accounts, 4 funded
- [x] Run `capture_daily.py postmarket`: 23 option rows, 0 capture errors
- [x] Complete the serialized postmarket sweep: portfolio/day/after-hours, positions, options, Greeks, margin, buying power, risk, orders, history, expirations, events, quotes, and audit artifacts

### Follow-up
- [ ] Establish a supported local Robinhood browser session before the imported bearer expires, then verify `pnpm auth:refresh` locally

## 2026-09-01 — premarket cron
*Source: scheduled premarket portfolio brief*

### Authentication
- [ ] Log into Robinhood in a supported browser session, run `pnpm auth:refresh`, and verify a parseable nonempty authenticated `accounts --json`
- [ ] Rerun `capture_daily.py premarket`; complete portfolio, options, margin, 3-day history, open-order, expiry, and quote reconciliation

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
