# Multi-leg options — hard order-body templates (2026-06-03)

The exact `POST https://api.robinhood.com/options/orders/` body per strategy, so a weak agent can
copy the leg structure and never botch `side` / `position_effect` / `ratio_quantity` / `direction`.
Resolve every `option_instrument_id` via `options enumerate <SYM> --expiration <DATE> [--type call|put]`
FIRST (UUIDs are random v4 — enumerate, never guess). Account goes in `account` (and pass `?account=`
on any web/preview call). Preview without placing via `POST bonfire/options/orders/review` (+
`/marketability/`) using the same `legs` shape.

## Envelope (every order)
```json
{
  "account": "https://api.robinhood.com/accounts/{ACCOUNT}/",
  "direction": "debit | credit",
  "legs": [ { "option": "https://api.robinhood.com/options/instruments/{OPTION_ID}/",
              "position_effect": "open | close", "ratio_quantity": 1, "side": "buy | sell" } ],
  "type": "limit", "time_in_force": "gfd | gtc", "trigger": "immediate",
  "price": "<net debit/credit per share, on-tick>", "quantity": "<# of spreads>", "ref_id": "<uuid>"
}
```
`price` = net debit (you pay) or net credit (you receive) **per share** — obey the chain's `min_ticks`.
`quantity` = number of spread units (not legs). For GTC opens, mind **overnight** buying power.

## Per-strategy leg tables (direction + each leg: side / position_effect / ratio)
| Strategy | direction | legs (role → side/effect/ratio) |
|---|---|---|
| **Long call / long put** | debit | the call(or put) → buy/open/1 |
| **Sell-to-close** (exit a long) | credit | the held option → sell/close/1 |
| **Covered call (CC)** | credit | OTM call → sell/open/1  *(needs 100 sh same account)* |
| **Cash-secured put (CSP)** | credit | OTM put → sell/open/1  *(needs cash collateral)* |
| **Call debit spread** | debit | lower call → buy/open/1 ; higher call → sell/open/1 |
| **Call credit spread** | credit | lower call → sell/open/1 ; higher call → buy/open/1 |
| **Put credit spread** | credit | higher put → sell/open/1 ; lower put → buy/open/1 |
| **Put debit spread** | debit | higher put → buy/open/1 ; lower put → sell/open/1 |
| **Long straddle** | debit | ATM call → buy/open/1 ; ATM put → buy/open/1 (same strike) |
| **Long strangle** | debit | OTM call → buy/open/1 ; OTM put → buy/open/1 (diff strikes) |
| **Iron condor** | credit | short put → sell/open/1 ; long put wing (lower) → buy/open/1 ; short call → sell/open/1 ; long call wing (higher) → buy/open/1 |
| **Call butterfly** | debit | low call → buy/open/1 ; mid call → sell/open/**2** ; high call → buy/open/1 |
| **Calendar (call)** | debit | near-exp call → sell/open/1 ; far-exp call → buy/open/1 (same strike, two expirations) |

## Closing a multi-leg (roll / exit)
Same legs with `position_effect: "close"` and the sides **inverted** (buy↔sell). A **roll** = a close
order + a fresh open order; cash accounts must stage the open to the next business day (T+1 settled
cash) — use `options roll-plan --cash-account`.

## Build it with the tooling (don't hand-assemble)
- `options enumerate <SYM> --expiration <DATE>` → every strike's `option_instrument_id`.
- `options strategy-quote <id> --account <N> --symbol <S> --expiration <D> --leg <role>=<strike> …`
  resolves the legs, reads bid/ask/Greeks, computes a net price, and emits the dry-run body — preferred
  over copying these tables by hand. The tables exist so the leg topology is unambiguous.
- Preview server-side (no placement): `POST bonfire/options/orders/review` with the `legs` array above.
