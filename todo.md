# Robinhood CLI — TODO
## June 3, 2026

### Auth
- [ ] Fix `pnpm auth:refresh` — can't find Chrome session (headless CDP browser ≠ real Chrome)
- [ ] Alternative: log into robinhood.com in real Chrome, let refresh-auth.sh pick up the token
- [ ] Or: manually copy bearer token from Chrome DevTools → .env

### Route map cleanup
- [x] Remove the 2 agentic GET/PATCH entries — both return 404, endpoint doesn't exist (removed, 307→305 routes)
- [ ] The `agentic_allowed` flag on accounts is a Robinhood server-side property, not toggleable via REST
- [ ] Good news: your own CLI doesn't need agentic_allowed — it trades on any account via web bearer token

### Live auth needed for these verified endpoints (all in api-map, just need working token):
- [ ] `margin/{id}/investing_info/` — margin used, maintenance, available
- [ ] `margin/{id}/settings/` — margin tier, PDT protection toggle (PUT)
- [ ] `margin/{id}/day_trades_card/` — PDT counter
- [ ] `settings/margin/{account}/` — PDT protection toggle
- [ ] `corp_actions/drip/account_settings/{account}/` — DRIP toggle (PATCH)
- [ ] `corp_actions/drip/instrument_settings/{account}/{id}/` — per-stock DRIP (PATCH)
- [ ] `accounts/{account}/sweep_enrollment_state/` — cash sweep toggle (POST)
- [ ] `slip/{account}/status/` — stock lending toggle (PUT)
- [ ] `options/option_settings/{num}/` — options trading settings (PATCH verified!)
- [ ] `accounts/{account}/options_buying_power` — options buying power
- [ ] `options/orders/collateral/` — options collateral pre-check
- [ ] `options/orders/review` — options order review (POST)
- [ ] `options/orders/marketability/` — marketability check (POST)

### Future dashboard ideas
- [ ] Build a `portfolio --deep` command that pulls margin + DRIP + sweep + lending + options settings in one shot
- [ ] Add after-hours tracking (positions endpoint has intraday_quantity, can diff vs yesterday)
- [ ] Map the Kaizen experiments response — shows which features are gated for your account
- [ ] Capture the options P&L endpoint (the web UI shows per-position options P&L, route unknown)
- [ ] Tax-loss harvesting helper (FRCB is $0.01, LWLG bleeding, UI underwater)

### Portfolio snapshot (Jun 3 live)
| Account | Value |
|---------|-------|
| ••••6346 IRA Roth | $[redacted] (equity $[redacted] + options $[redacted]) |
| ••••0497 far 9mo plus | $[redacted] (equity $[redacted] + options $[redacted], margin $[redacted]) |
| ••••9919 near 3mo-roll | $[redacted] (equity $[redacted] + options $[redacted]) |
| ••••9911 Agentic | $0 |
| ••••2523 Agentic-long | $0 |
| **TOTAL** | **$[redacted]** |
