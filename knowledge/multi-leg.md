# Multi-leg strategies — leg topology, payoffs, exact invocations

> **When to load this:** the user asks to price/plan/place a vertical, straddle, strangle,
> butterfly, iron condor, calendar, or diagonal — or you need the exact `options strategy-quote`
> leg names and the order-body leg structure. The leg tables here are RH-live-validated; copy
> them, never improvise `side`/`position_effect`/`ratio_quantity`. Risk posture is the operator's
> call; this module supplies mechanics and dollar payoffs.

## Order envelope (every options order)

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

`price` is the **net per share** and must obey the chain's `min_ticks` (read
`options/chains/{id}` — limits below `cutoff_price` ≈ $3 must use `below_tick`; ARKG/SPX = $0.05).
`quantity` = number of spread units, not legs. GTC opens are gated by **overnight** buying power.
**Always bulk-enumerate UUIDs first** — `options enumerate <SYM> --expiration <D> --type call|put`;
call legs come from `--type call`, put legs from `--type put`; never reuse a UUID across type or
expiration.

## Leg topology per strategy (direction + side/effect/ratio) — RH-validated 2026-06-03

| Strategy | direction | Legs (role → side/effect/ratio) |
|---|---|---|
| Long call / long put | debit | the option → buy/open/1 |
| Sell-to-close (exit a long) | credit | the held option → sell/close/1 |
| Covered call | credit | OTM call → sell/open/1 *(100 sh same account)* |
| Cash-secured put | credit | OTM put → sell/open/1 *(cash collateral)* |
| Call debit spread | debit | lower call → buy/open/1; higher call → sell/open/1 |
| Call credit spread | credit | lower call → sell/open/1; higher call → buy/open/1 |
| Put credit spread | credit | higher put → sell/open/1; lower put → buy/open/1 |
| Put debit spread | debit | higher put → buy/open/1; lower put → sell/open/1 |
| Long straddle | debit | ATM call → buy/open/1; ATM put → buy/open/1 (same strike) |
| Long strangle | debit | OTM call → buy/open/1; OTM put → buy/open/1 (different strikes) |
| Iron condor | credit | short put → sell/open/1; long put wing (lower) → buy/open/1; short call → sell/open/1; long call wing (higher) → buy/open/1 |
| Call butterfly | debit | low call → buy/open/1; mid call → sell/open/**2**; high call → buy/open/1 |
| Calendar (call) | debit | near-exp call → sell/open/1; far-exp call → buy/open/1 (same strike, two expirations) |

**Strike geometry (low → high):** vertical = 2 strikes, same type+expiry, width `|K_hi − K_lo|` =
max risk/share. Iron condor = `longPutWing < shortPut < spot < shortCall < longCallWing` (wings
further OTM than the shorts). Butterfly = equally spaced `low < mid < high`. Straddle = same ATM
strike; strangle = `putStrike < spot < callStrike`. Calendar/diagonal is the only family where
legs carry different expirations — enumerate each expiration separately.

**Closing/rolling a multi-leg:** same legs with `position_effect: "close"` and the sides
**inverted** (buy↔sell). A roll = a close order + a fresh open order (cash accounts: stage the
open next business day — `knowledge/rolling.md`).

## Payoff formulas (dollars; credit/debit are per share, × 100 per contract)

| Family | Max loss | Max profit | Breakeven(s) |
|---|---|---|---|
| Long call | debit × 100 | uncapped | strike + debit |
| Long put | debit × 100 | (strike − debit) × 100 | strike − debit |
| Debit vertical | debit × 100 | (width − debit) × 100 | call: long strike + debit; put: long strike − debit |
| Credit vertical | (width − credit) × 100 | credit × 100 | call: short strike + credit; put: short strike − credit |
| Long straddle | debit × 100 | uncapped (call side) | strike ± debit |
| Long strangle | debit × 100 | uncapped (call side) | call strike + debit; put strike − debit |
| Short strangle/straddle | **undefined call-side**; large put-side | credit × 100 | short strikes ± credit |
| Long butterfly (1:−2:1) | debit × 100 | (wing width − debit) × 100 near mid | mid ± remaining value |
| Iron condor | (widest wing − credit) × 100 | credit × 100 | short put − credit; short call + credit |
| Calendar roll | compare closed vs opened leg | net = close credit − open debit | model-dependent; quote the package |

## Exact `options strategy-quote` invocations (leg names from the strategy catalog)

`strategy-quote` resolves the option ids, reads live bid/ask/Greeks, computes natural/mid/safe
limits, and fills the dry-run `options/orders/` body — it never sends. Pricing modes: `natural`,
`mid`, `safe-sell-probe` (natural credit + $200, dry-run control), `safe-buy-probe`
(max($0.01, natural debit − $200)). Verify ids live: `api-map options-strategies --json`.

```bash
# Verticals
options strategy-quote call-debit-spread  --account <N> --symbol <S> --expiration <D> --leg long_call=<K1>  --leg short_call=<K2> --pricing-mode mid --json
options strategy-quote call-credit-spread --account <N> --symbol <S> --expiration <D> --leg short_call=<K1> --leg long_call=<K2>  --pricing-mode safe-sell-probe --json
options strategy-quote put-credit-spread  --account <N> --symbol <S> --expiration <D> --leg short_put=<K1>  --leg long_put=<K2>   --pricing-mode safe-sell-probe --json
options strategy-quote put-debit-spread   --account <N> --symbol <S> --expiration <D> --leg long_put=<K1>   --leg short_put=<K2>  --pricing-mode mid --json

# Straddles / strangles
options strategy-quote long-straddle  --account <N> --symbol <S> --expiration <D> --leg long_call=<K> --leg long_put=<K> --pricing-mode mid --json
options strategy-quote long-strangle  --account <N> --symbol <S> --expiration <D> --leg long_put=<K1> --leg long_call=<K2> --pricing-mode mid --json
options strategy-quote short-strangle --account <N> --symbol <S> --expiration <D> --leg short_put=<K1> --leg short_call=<K2> --pricing-mode safe-sell-probe --json

# Butterfly (mid leg ratio 2 is built in)
options strategy-quote long-call-butterfly --account <N> --symbol <S> --expiration <D> \
  --leg long_lower_call=<K1> --leg short_middle_call=<K2> --leg long_upper_call=<K3> --pricing-mode mid --json

# Iron condor (wing/body leg names per the strategy catalog JSON)
options strategy-quote iron-condor --account <N> --symbol <S> --expiration <D> \
  --leg long_put_wing=<K1> --leg short_put_body=<K2> --leg short_call_body=<K3> --leg long_call_wing=<K4> \
  --pricing-mode safe-sell-probe --json

# Calendars (per-leg expirations via --param)
options strategy-quote call-calendar-roll --account <N> --symbol <S> --expiration <OLD_D> \
  --leg close_call=<OLD_K> --leg open_call=<NEW_K> \
  --param close_call_expiration=<OLD_D> --param open_call_expiration=<NEW_D> --pricing-mode mid --json
```

(Single legs: `long-call`/`long-put` with `--leg long_call=<K>` / `--leg long_put=<K>`;
covered call / CSP invocations live in `knowledge/wheel.md`.)

## Worked build — iron condor end to end

Short put spread + short call spread: 4 legs, net credit, defined risk.

```bash
# 1. Chain + expirations
node cli/dist/index.js options chain <SYM> --json
node cli/dist/index.js options expirations <SYM> --json

# 2. Inspect the named strategy contract (legs + review fields)
node cli/dist/index.js api-map options-strategy-plan iron-condor --json

# 3. Live dry-run quote — resolves ids, reads bid/ask/Greeks, computes net credit + limit,
#    fills the order body; sends NOTHING
node cli/dist/index.js options strategy-quote iron-condor \
  --account <N> --symbol <SYM> --expiration <D> \
  --leg long_put_wing=<K1> --leg short_put_body=<K2> \
  --leg short_call_body=<K3> --leg long_call_wing=<K4> \
  --pricing-mode safe-sell-probe --json
```

Before any send, the summary must show: strategy id, risk label, **net credit**, **max profit =
credit × 100**, **max loss = (widest wing − credit) × 100**, both breakevens, net Greeks
(signed, ×100, unit-labeled — `knowledge/greeks.md`), liquidity/expiration flags, the exact
`options/orders/` body (`direction:"credit"`, 4 legs with `ratio_quantity`), and write-gate
state. Verticals (2 legs), straddles/strangles, and butterflies follow the same pattern — only
the leg set and `direction` change.

**Live-validation status (2026-06-03, place→verify→cancel):** long call/put, both debit spreads,
straddle, strangle, butterfly (ratio 2), calendar all placed `201` and cancelled — leg topologies
RH-accepted. Credit spreads + iron condor parsed structurally then hit the **overnight
buying-power** gate (legs valid; needs collateral). A standalone short call without backing
shares is correctly rejected as "infinite risk".

## Deep dives

- `docs/options-strategy-order-templates-2026-06-03.md` — the hard order-body templates + live validation log.
- `docs/options-strategies-knowledge-base-2026-06-03.md` — what/who/why per strategy, Greek posture, the cross-cutting mental model.
- `docs/options-quantitative-playbook-2026-06-03.md` and `api-map/options-strategy-workflows-2026-06-02.json` — the reviewContract and the full strategy catalog.
- `knowledge/greeks.md` — net-Greek aggregation; `knowledge/execution-safety.md` — gates and evidence.
