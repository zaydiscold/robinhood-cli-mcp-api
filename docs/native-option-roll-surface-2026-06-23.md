# Native Option Roll — full API surface (captured 2026-06-23)

> **What this is:** the complete, browser-captured reverse-engineering of Robinhood's **native
> "Roll this position"** flow for a long option, on a real account (Roth IRA `…6346`). Captured via
> CDP network interception while driving the logged-in web UI. Market was closed and the test account
> had `$0` options buying power, so the order was **blocked at the review/collateral gate — nothing was
> placed** (verified: page showed *"Not Enough Buying Power"*, no `POST options/orders/` final submit
> fired). This documents the real wire shape so the CLI/MCP can build a roll for **any** underlying /
> expiration / strike **without loading the page**.
>
> **Why it matters:** before this capture, `options roll-plan` only ever emitted the **cash-account
> "kosher" roll** — two *separate* single-leg orders (close today, open next business day). That is the
> CORRECT model for a **cash** account (good-faith / T+1 settlement), but it was wrongly the *only*
> model. The native Roll button on **margin / IRA** accounts submits **ONE atomic two-leg order**. That
> atomic path was never captured, so it didn't exist in the tool. This doc is the fix's spec.

---

## TL;DR — the account-type dispatch rule (the hardened default)

| Account type | Correct roll | Why |
|---|---|---|
| **margin** (individual) | **Atomic native roll** — one 2-leg `options/orders/` order | Margin can hold both legs simultaneously; this is what the UI does. |
| **ira_roth / ira** | **Atomic native roll** — one 2-leg order | IRAs roll atomically too (no margin borrow needed for a debit roll with cash/coverage). |
| **cash** | **Kosher roll** — close today, open next business day (two orders) | T+1 settlement + good-faith rule: close proceeds aren't settled same-day, so the open leg must wait. |

**When the operator says "roll an option," default to the ATOMIC native roll. Only fall back to the
two-order kosher staging when the account is a CASH account.** Detect the type from `accounts`
(`brokerage_account_type` / `type`) — do not require a `--cash-account` flag to get it right.

---

## The full native-roll request sequence (long-call roll, observed)

| # | Method | Endpoint | Purpose |
|---|---|---|---|
| 1 | GET | `options/maximum_rollable_quantity/{strategy_code}/?account_number={acct}` | How many contracts of the held leg can be rolled. |
| 2 | GET | `options/instruments/?chain_id={cid}&expiration_dates={date}&type={call\|put}&state=active` | Enumerate destination strikes for the chosen expiration. |
| 3 | GET | `marketdata/options/?ids={uuid,uuid,…}&include_all_sessions=true` | Bulk-quote the whole destination ladder (~40 UUIDs per batch). |
| 4 | POST | `bonfire.robinhood.com/options/orders/review` | Validate the 2-leg roll (soft checks → `check_overrides`). |
| 5 | GET | `options/orders/collateral/?order={url-encoded order JSON}` | Collateral (cash/equity) required for the roll. |
| 6 | POST | `api.robinhood.com/options/orders/` | **Final submit** — the same 2-leg body. *(Not reached here: $0 BP blocked it at the gate.)* |

`strategy_code` = `{option_instrument_id}_L1` for a **long** held leg (observed). For a **short** held
leg it is presumed `{option_instrument_id}_S1` (from the contract metadata's
`long_strategy_code` / `short_strategy_code` fields — not yet live-verified on a short).

---

## The atomic roll order body (the crown jewel)

Captured `POST bonfire.robinhood.com/options/orders/review` body (GOOGL long-call roll,
$550 8/21 → $365 10/16 used as the live capture target; the $500 10/16 target has identical shape with
`option_id` = `a1f043eb-e9de-4cb3-9b6a-3c9b6066aad8`):

```json
{
  "account": "https://api.robinhood.com/accounts/{account_number}/",
  "direction": "debit",
  "form_source": "strategy_roll",
  "check_overrides": ["override_wide_bid_ask_spread"],
  "client_bid_at_submission": "20.36",
  "client_ask_at_submission": "21.94",
  "legs": [
    {
      "side": "sell",
      "position_effect": "close",
      "ratio_quantity": 1,
      "option": "https://api.robinhood.com/options/instruments/{close_option_id}/",
      "option_id": "{close_option_id}",
      "leg_metadata": {
        "option_quote": { "bid_price": "0.010000", "ask_price": "0.440000", "bid_size": 138, "ask_size": 228, "open_interest": 564 }
      }
    },
    {
      "side": "buy",
      "position_effect": "open",
      "ratio_quantity": 1,
      "option": "https://api.robinhood.com/options/instruments/{open_option_id}/",
      "option_id": "{open_option_id}",
      "leg_metadata": {
        "option_quote": { "bid_price": "20.800000", "ask_price": "21.950000", "bid_size": 10, "ask_size": 51, "open_interest": 823 }
      }
    }
  ],
  "market_hours": "regular_hours",
  "override_day_trade_checks": false,
  "price": "21.15",
  "quantity": "1",
  "ref_id": "{uuid}",
  "time_in_force": "gfd",
  "trigger": "immediate",
  "type": "limit",
  "metadata": {
    "brokerage_account_type": "ira_roth",
    "is_direction_explicit": false,
    "number_of_accounts": 5,
    "number_of_checks_seen": 1,
    "options_buying_power": "0.0000"
  },
  "order_path_experiments": []
}
```

### Field-by-field — what's new vs our old two-order model

| Field | Meaning | Did our CLI emit it? |
|---|---|---|
| `form_source: "strategy_roll"` | Marks the order as a roll (vs a plain multi-leg). | ❌ no |
| single `direction` (`debit`/`credit`) | **Net** of the two legs, not per-leg. `is_direction_explicit:false` = inferred by RH. | ❌ (we set per-leg) |
| single `price` | **Net** strategy limit (new-leg debit minus old-leg credit). Here `21.15` ≈ new $21.4 − old $0.23. | ❌ (we priced legs separately) |
| `legs[].position_effect` | `close` on the held leg, `open` on the new leg — **in one order**. | ⚠️ right effects, wrong topology (2 orders) |
| `legs[].option` **and** `option_id` | Both the URL and bare UUID are sent (redundant; send both). | partial (URL only) |
| `legs[].leg_metadata.option_quote` | Per-leg client quote snapshot (bid/ask/size/OI) at submission — anti-stale-fill. | ❌ no |
| `client_bid_at_submission` / `client_ask_at_submission` | Strategy-level (new-leg) client quote snapshot. | ❌ no |
| `check_overrides: []` | Soft-check acknowledgements. Observed: `override_wide_bid_ask_spread`. Others exist per warning. | ❌ no |
| `market_hours` | `regular_hours` even after hours (client-asserted session bucket). | ❌ no |
| `override_day_trade_checks` | PDT bypass flag (false here). | ❌ no |
| `metadata{}` | Telemetry: `brokerage_account_type`, `options_buying_power`, `number_of_accounts`, `number_of_checks_seen`, `is_direction_explicit`. | ❌ no |
| `order_path_experiments: []` | A/B routing array (empty here). | ❌ no |
| `ratio_quantity`, `quantity`, `type`, `trigger`, `time_in_force`, `ref_id` | Same as any options order. | ✅ yes |

> **Minimal vs full body:** the `collateral` pre-check (step 5) re-serialized the order with only the
> **core** fields — `account, check_overrides, direction, form_source, legs[{option,position_effect,
> ratio_quantity,side}], market_hours, override_day_trade_checks, price, quantity, ref_id,
> time_in_force, trigger, type`. So `leg_metadata`, `client_*_at_submission`, `metadata`, and
> `order_path_experiments` are **client telemetry / soft-check context** — almost certainly **not
> required** for the order to be accepted, but the `review`/submit path sends them. The CLI should send
> the core fields and MAY include the quote snapshots when it has fresh quotes.

---

## New read endpoints — response shapes (live-verified 2026-06-23)

### `GET options/maximum_rollable_quantity/{strategy_code}/?account_number={acct}`
```json
{
  "account_number": "…6346",
  "total_quantity": "1.0000",
  "pending_closing_quantity": "0.0000",
  "available_quantity": "1.0000",
  "strategy_type": "long_call",
  "strategy_code": "{option_id}_L1"
}
```
`available_quantity` is the rollable cap. Risk: **read**.

### `GET options/orders/collateral/?order={url-encoded order JSON}`
```json
{ "account_number": "…6346", "cash": { "amount": "0.0000", "direction": "debit", "infinite": false }, "equities": [] }
```
Returns the cash/equity collateral the roll consumes. For a debit roll in an IRA with coverage it can
be `$0`. Risk: **read** (takes the full order as a `?order=` query param; mutates nothing).

---

## Why `roll-plan` defaulted to kosher (the bug, explained)

The CLI's roll support was **built cash-account-first**: the hard case (T+1 good-faith, two-day staged
trade, sessions dying between legs → the `roll-ledger`) got implemented and documented first. The
common case — a margin/IRA account rolling **atomically in one order** — was never network-captured, so
no atomic-roll body existed in the code. `roll-plan` therefore always produced two single-leg orders
(`closeOrder` + `openOrder`), labelling them `kosher-roll` with `--cash-account` and
`manual-two-leg-roll` without. Neither was the real native roll. This capture closes that gap.

---

## Hardening checklist (implemented from this capture)

- [ ] Route map: add `options/maximum_rollable_quantity/{strategy_code}/`; enrich
      `bonfire:options/orders/review` with the roll body schema + `form_source:strategy_roll`; correct
      `options/orders/collateral/` response fields to `{cash{amount,direction,infinite},equities}` and
      record the `?order=` query param.
- [ ] CLI `roll-plan`: add an **atomic** mode that emits the single 2-leg `strategy_roll` body; make the
      DEFAULT auto-detect account type (atomic for margin/IRA, kosher for cash); keep `--cash-account`
      as an explicit override.
- [ ] MCP `robinhood_options_roll_plan`: surface the atomic body + the account-type dispatch.
- [ ] Docs: `SKILL.md` router, `knowledge/rolling.md`, and AGENTS.md rolling sections updated with
      the atomic-default rule and the body.

## Reproduction

1. `chrome-debug` + connect `browser-harness-js` to :9222.
2. Navigate `robinhood.com/options/instruments/{owned_option_id}/?account_number={acct}`.
3. Click **"Roll this position"** → set expiration → pick destination strike → **Continue** → **Review
   order** → final **Continue** (submit). Intercept `Network.requestWillBeSent`.
4. Raw artifacts: `info/roll-capture-2026-06-23/` (`roll-order-review-body.json`, `collateral-url.txt`,
   `requests-dedup.json`).
