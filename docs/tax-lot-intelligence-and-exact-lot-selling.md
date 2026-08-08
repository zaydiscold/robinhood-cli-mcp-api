# Tax-Lot Intelligence and Exact-Lot Selling

> Evidence date: 2026-08-08. Educational decision support, not individualized tax advice. Robinhood estimates are not tax-reporting records; reconcile against final 1099-B/Form 8949 data and a qualified tax professional.

## Product thesis

A position is not one homogeneous block. Every acquisition creates a lot with its own acquisition date, quantity, adjusted tax basis, holding period, and potential gain/loss. Choosing which units to sell can legally change the timing and character of realized gains and losses. The CLI/MCP therefore treats tax lots as first-class inventory with stable backend IDs—not dates, average cost, or implied FIFO.

## Evidence-backed Robinhood contract

### Read routes

| Route                                                  | Purpose                                                                                | Evidence                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Account type + open-lot `is_selectable`                | Derive taxable-account custom-lot eligibility without inventing an unverified endpoint | Live account graph + live open-lot response                               |
| `GET /tax_lots/open/{account_number}/{instrument_id}/` | Open lots for one owned position                                                       | Live authenticated GET returned HTTP 200 on 2026-08-08                    |
| `GET /tax_lots/order/{order_id}/selected/`             | Lots selected on an existing order                                                     | Robinhood production contract + independently implemented upstream client |
| `GET /tax_lots/order/{order_id}/closed/`               | Closed/realized lots for an order                                                      | Robinhood production contract + independently implemented upstream client |

The open-lot read accepts `sort_type`, `sort_direction`, `fetch_max_abs_values`, and scenario/current `price`.

Observed open-lot fields:

- `open_lot_id` — stable execution identifier
- `quantity`, `quantity_available`
- `book_cost_basis`, `book_proceeds`
- `tax_cost_basis`, `cost_per_share`
- `open_date`, `term`
- `is_selectable`
- `account_number`, `instrument_id`, `order_id`, `open_tran_type`

Book/display basis and adjusted tax basis are distinct. Tax analysis uses `tax_cost_basis`; missing tax basis is `not_evaluated`, never zero.

### Exact-lot order-body candidate

An independently implemented upstream client reports this branch on the ordinary equity order body:

```json
{
  "quantity": "4",
  "tax_lot_selection_type": "custom",
  "tax_lots": [
    { "open_lot_id": "<stable-id-1>", "quantity": "3.5" },
    { "open_lot_id": "<stable-id-2>", "quantity": "0.5" }
  ]
}
```

The engine re-reads live `quantity_available` and selectability before every plan. It rejects unknown IDs, unavailable lots, over-allocation, and selection totals that do not exactly equal requested shares. The body is emitted for inspection only: generic order-route evidence does not establish Robinhood's authenticated exact-lot review/submit contract, so every live submission fails closed.

## CLI and MCP

```bash
# Enumerate live lots
robinhood tax-lots list HPE --account <account> --json

# AI/objective-assisted dry-run selection
robinhood tax-lots plan-sell HPE --account <account> --shares 4 --objective harvest_loss --json

# Exact stable IDs; repeat --lot
robinhood tax-lots plan-sell HPE --account <account> \
  --lot <open_lot_id>:3.5 --lot <open_lot_id>:0.5 --json

# Assumption-labeled federal estimate
robinhood tax-lots plan-sell HPE --account <account> --shares 4 \
  --objective minimize_gain --short-term-rate 0.32 --long-term-rate 0.15 --json

# Exercise the submission boundary as a dry-run; --live-write is intentionally rejected
robinhood tax-lots sell HPE --account <account> --lot <open_lot_id>:1 --json
```

MCP tools:

- `robinhood_tax_lots` — sensitive read
- `robinhood_tax_lot_order` — selected/closed-lot post-order verification
- `robinhood_tax_lot_plan` — dry-run analysis only
- `robinhood_tax_lot_sell` — dry-run boundary only; every live request fails closed until the authenticated review/submit contract is mapped

## Objectives and what they actually mean

| Objective          | Ordering                                  | Typical use                              | Critical caveat                                                 |
| ------------------ | ----------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `specific`         | Caller-selected stable IDs                | Exact accountant/user direction          | Selection is only as good as supplied IDs and quantities        |
| `fifo`             | Oldest acquisition first                  | Mirror default disposal intent           | Can realize large low-basis gains                               |
| `highest_basis`    | Highest adjusted basis/share first        | Often minimizes current realized gain    | Could consume a near-long-term lot or generate a wash-sale loss |
| `lowest_basis`     | Lowest basis/share first                  | Deliberately realize gains / reset basis | Usually maximizes current gain                                  |
| `harvest_loss`     | Highest basis/share / greatest loss first | Realize losses in taxable accounts       | Wash-sale and portfolio-substitution analysis is mandatory      |
| `minimize_gain`    | Highest basis/share first                 | Reduce immediate gain                    | Tax-rate, term, and portfolio effects can change the optimum    |
| `long_term_first`  | Long-term lots before short-term          | Prefer long-term character               | May realize a larger absolute gain                              |
| `short_term_first` | Short-term lots before long-term          | Deliberate short-term cleanup            | Short-term gains generally face ordinary-rate treatment         |

These are transparent deterministic objectives, not opaque “AI recommends.” The output shows every selected lot and estimate.

## Federal tax model

### Holding period

IRS Topic 409: generally, one year or less is short-term; more than one year is long-term. The engine reports Robinhood's server-supplied `term`, acquisition date, holding days, and an informational days-to-long-term clock. Corporate actions and transferred holding periods can complicate a naïve date calculation, so the server term remains visible.

### Estimated gain/loss

For each selected lot:

```text
(current/scenario price − adjusted tax basis per share) × selected quantity
```

The estimate separates short-term and long-term amounts. It does not treat average cost as execution basis.

### Estimated tax impact

No tax-dollar estimate appears unless the caller supplies both marginal short-term and long-term rates as decimals. Then:

```text
(short-term gain/loss × supplied ST rate) + (long-term gain/loss × supplied LT rate)
```

The result is explicitly labeled as excluding:

- state/local tax
- 3.8% net investment income tax
- capital-loss carryovers
- annual short/long category netting
- ordinary-income limits and tax-profile-specific deductions
- special rates/rules (collectibles, QSBS, straddles, constructive sales, etc.)

A negative estimate means an estimated reduction/deferral under the supplied assumptions—not guaranteed cash savings.

### Capital-loss netting

IRS Topic 409 governs annual netting: short-term and long-term gains/losses are netted by category and then against each other. If net losses remain, individuals generally deduct up to the annual statutory limit against other income and carry the rest forward. The engine does not pretend one sale's stand-alone estimate is the final return result without year-to-date/carryover inputs.

## Wash-sale model: fail closed

A wash sale can arise when a loss sale is paired with acquiring substantially identical stock/securities—or a contract/option to acquire them—within 30 calendar days before or after the sale. Including sale day, this is a 61-day window.

Scope is taxpayer-wide:

- every Robinhood account
- outside brokerages
- spouse activity where applicable
- recurring buys and DRIP
- options/contracts
- IRA and Roth IRA acquisitions

Robinhood explicitly says cross-account/outside-account tracking is the customer's responsibility. IRS Revenue Ruling 2008-5 adds the IRA trap: a taxable loss followed by an IRA/Roth IRA purchase of substantially identical securities can be disallowed, and unlike an ordinary taxable-account wash sale the disallowed loss is not added to IRA basis.

Therefore the planner returns:

```json
{
  "washSale": {
    "status": "not_evaluated",
    "requiredInputs": ["acquisitions61DayWindow", "replacementIntent"]
  }
}
```

unless complete cross-account acquisition history and forward replacement intent are supplied. It never says “wash-sale safe” from Robinhood-only history.

## Robinhood operational rules

From Robinhood's Tax lots help article (retrieved 2026-08-08):

- available only for US taxable investing accounts
- same-day lots, ACAT transfers, and corporate actions can temporarily block selection
- each selected lot can have an exact quantity
- lots fill in the submitted sort order; highest listed priority fills first
- another order can consume selected shares first; unavailable remainder falls back to the account's default FIFO method
- post-order corrections require contacting Robinhood before 9 PM ET on settlement date
- displayed gain/loss and cost-per-share are estimates; use end-of-year tax forms for filing
- transferred securities may lack basis; obtain it from the delivering broker
- lot selection is account-local; lots cannot be selected from another account

Product consequences:

1. Preserve caller/strategy lot order in `tax_lots`—do not sort IDs after selection.
2. Re-read availability immediately before producing the final plan.
3. Warn that concurrent orders can defeat the intended disposition.
4. Verify selected lots from the order-specific route after submission, then closed lots after fill.
5. Surface the 9 PM ET settlement-date remediation deadline.
6. Never infer missing basis or use displayed estimates as tax filing truth.

## Best-practice workflow

1. Confirm this is a taxable account; do not pitch harvesting inside an IRA.
2. Read every open lot and eligibility state live.
3. Reconcile missing/adjusted basis before optimization.
4. State the objective: cash need, minimize current gain, harvest loss, preserve long-term clock, diversify, donate appreciated shares, etc.
5. Pull year-to-date realized short/long results and carryovers if available.
6. Search the full 61-day wash window across all accounts and planned buys; pause DRIP/recurring buys only by explicit user decision.
7. Compare replacement securities for exposure continuity without declaring “substantially identical” as a certainty.
8. Show exact stable IDs, quantities, term, basis, estimated realization, assumptions, and caveats.
9. Re-read lot availability immediately before finalizing the dry-run plan.
10. Stop at the dry-run boundary until the authenticated Robinhood review/submit contract is captured and implemented.
11. For orders placed through Robinhood itself, verify order state and selected lots; verify closed lots after fill.
12. Reconcile against final 1099-B/Form 8949 and retain the evidence.

## Sources

- Robinhood, [Tax lots](https://robinhood.com/us/en/support/articles/tax-lots/), retrieved 2026-08-08, Reference No. 5341054.
- Robinhood, [Wash sales](https://robinhood.com/us/en/support/articles/wash-sales/), retrieved 2026-08-08, Reference No. 5195097.
- IRS, [Publication 550 (2025), Investment Income and Expenses](https://www.irs.gov/publications/p550), current page located 2026-08-08.
- IRS, [Topic No. 409, Capital Gains and Losses](https://www.irs.gov/taxtopics/tc409), current page located 2026-08-08.
- IRS, [Revenue Ruling 2008-5](https://www.irs.gov/pub/irs-drop/rr-08-05.pdf), wash sales involving IRA/Roth IRA replacement purchases.
- `robin_stocks` PR [#1648](https://github.com/jmfernandes/robin_stocks/pull/1648), independent implementation/report of Robinhood tax-lot endpoints and exact order-body fields; used as corroboration, not as sole live proof.
