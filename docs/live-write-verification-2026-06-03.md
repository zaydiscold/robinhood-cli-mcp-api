# Live-write verification — 2026-06-03

Evidence that the double-gated write path (`--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1`)
actually mutates a real Robinhood account and that reverts work. All account
numbers and schedule ids are redacted here; the raw run is local-only.

## Recurring schedule pause → resume (round-trip, verified)

A first-class, money-free, fully reversible mutation was used to prove the write
path end-to-end:

1. **Read** original state of one `$3` recurring schedule → `active`.
2. **Dry-run** `recurring pause` → printed plan, sent nothing.
3. **Live** `recurring pause --id <ID> --live-write` → HTTP `200`, `mode: live`.
4. **Verify** → state `paused`.
5. **Live** `recurring resume --id <ID> --live-write` → HTTP `200`, `mode: live`.
6. **Verify** → state `active` (original restored).

Result: the live-write gate fires, the mutation lands, and the inverse command
restores state. No funds moved.

## DRIP toggle — documented method is WRONG (write endpoint unknown)

Reading dividend-reinvestment works:

```bash
robinhood-cli brokerage execute "corp_actions/drip/enrollment/{num}/" \
  --param num=<ACCOUNT_NUMBER> --json --full
# -> {"drip_enrolled": true, "account_number": "<ACCOUNT_NUMBER>"}
```

But every write method against that endpoint is rejected (verified live):

| Method | Result |
|--------|--------|
| `PATCH` | `405 Method "PATCH" not allowed.` |
| `POST`  | `405 Method "POST" not allowed.` |
| `PUT`   | `405 Method "PUT" not allowed.` |

So the prior "PATCH `{drip_enrolled}`" note was incorrect — that endpoint is
GET-only. The real toggle most likely lives at
`corp_actions/drip/account_settings/{account_number}/` and must be captured from
the web UI (flip the dividend-reinvestment switch with the network tab / CDP
recording open) before any DRIP write is claimed working. The capability map and
route summaries have been corrected to reflect this.

## Takeaway

Dry-runs validate *shape*, not *acceptance*. A dry-run would have endorsed the
bad DRIP body indefinitely; only a live request exposed the `405`. Treat any
route-mapped write as unproven until a live call (or a captured web request)
confirms the method and body.
