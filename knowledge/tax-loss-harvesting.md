# Tax-loss harvesting — realize the loss, dodge the wash, keep the exposure

> **When to load this:** the user asks "can I harvest losses?", "sell my losers for taxes,"
> "offset my gains," or any December "what should I sell before year-end" question. This module
> is the mechanics plus the live-account procedure. Educational background only — not tax advice;
> surface the numbers and the flags, the operator (and their tax professional) decide. General
> tax law lives in `knowledge/tax.md`; this module is the *harvesting workflow* specifically.

## The mechanic, in dollars

Selling a position below basis **realizes a capital loss**. Realized losses are worth real money:

1. **Offset realized capital gains dollar-for-dollar.** Short-term losses net against short-term
   gains first (the most valuable offset — ST gains are taxed at ordinary rates up to 37%),
   long-term against long-term, then the nets cross over.
2. **Up to $3,000/yr against ordinary income** ($1,500 married filing separately) once gains are
   exhausted.
3. **Indefinite carryforward** of the excess — a big harvested loss is a multi-year asset.

Rough value math: a $5,000 harvested short-term loss against short-term gains at a 32% marginal
rate ≈ **$1,600 of tax deferred this year**. Harvesting **defers** tax (the replacement has a
lower basis → bigger gain later) — it only *eliminates* tax if you later realize at a lower rate,
donate the appreciated replacement, or get a step-up. Still usually worth it: deferral is an
interest-free loan from the IRS.

## The wash sale (IRC §1091) — the rule that un-does the harvest

The loss is **disallowed** if you acquire the same or a **substantially identical** security
within the **61-day window**: 30 days before the sale, the sale day, and 30 days after. Per IRS
Pub 550, "acquire" includes buying **a contract or option to acquire** the stock — the window
cuts **both directions**:

- **Stock → stock:** re-buy the same ticker inside the window → washed.
- **Stock → option:** sell shares at a loss, then **buy a call** (or sell an ITM-ish put likely
  to assign) on the same name inside the window → the **stock loss** is disallowed. The classic
  "hold my spot with a call" trap.
- **Option → option:** close an option at a loss and re-open a substantially identical one →
  washed. Closing a losing option then buying the underlying inside the window also washes.

A disallowed loss is normally **deferred, not destroyed** — it's added to the replacement's basis
and the holding period tacks on. **Exception:** if the repurchase happens in an **IRA** (yours,
including a Roth), Rev. Rul. 2008-5 makes the disallowance **permanent** — no basis add-back,
the loss is simply gone. The window spans **all accounts** (taxable, IRA, spouse).

### "Substantially identical" for options — the repo's two readings

The repo's two source docs read the strictness differently. Present both; apply the conservative
one when the user's money depends on it:

| Reading | Source | Rule |
|---|---|---|
| **Strict** (facts-and-circumstances) | `docs/tax-aware-options-strategies.md` §6 | No bright line. Same underlying with a *near* strike/expiry generally does **not** escape; only a different underlying clearly does. |
| **Consensus** (practitioner) | `docs/strategy-deep-dive-rolling-options-2026-06-04.md` §5 | Substantially identical ≈ same underlying AND same strike; **changing strike OR expiration generally breaks it**, so a normal roll-out is usually fine. |

**Conservative rule for harvesting:** when the point of the trade is the *loss*, do not re-touch
the same underlying — shares **or** options — for 31 days after the sale. The consensus reading
is reasonable for defending a tested short (rolling); it is the wrong risk posture when the loss
itself is the asset you're protecting. Flag, don't adjudicate.

**§1256 exemption:** SPX/XSP/NDX/VIX/RUT index options are marked-to-market and exempt from wash
sales entirely — losses there need no window management (see `knowledge/tax.md`).

## Lot selection — FIFO is what this CLI sells

Robinhood's default disposal method is **FIFO** (first-in, first-out). The app UI supports
picking **specific tax lots** on sells in taxable accounts; **this CLI's `sell` order body
carries no lot field**, so a partial sell through the CLI/MCP disposes FIFO. Consequences:

- Selling the **whole position** makes lot selection moot — the full loss realizes either way.
- A **partial** harvest of a position with mixed lots (early cheap shares + recent expensive
  ones) will FIFO out the *cheapest* lots first — possibly realizing a **gain** when the user
  wanted a loss. Compute per-lot before promising a number; if specific high-cost lots are the
  target, say plainly that the lot-picking step belongs in the app UI, or sell the entire position.

## The traps, ranked

1. **Roth/IRA repurchase = permanent loss destruction** (Rev. Rul. 2008-5). Never harvest a name
   the IRA is also buying — including via recurring schedules or DRIP in the IRA.
2. **Recurring buys are acquisitions.** A live weekly schedule on the harvested symbol re-buys
   inside the window automatically. Check `recurring list` and pause before selling.
3. **DRIP is an acquisition.** A dividend reinvested inside the window washes a slice of the loss
   (pro-rata to the reinvested shares). Check `settings show`; disable per-instrument DRIP first.
4. **The 30-days-BEFORE leg.** A buy 3 weeks ago already poisons today's loss sale — look back,
   not just forward.
5. **December timing.** Trade date controls the tax year — the sell must execute by the year's
   last trading day. And the window crosses the boundary: a late-December harvest re-bought in
   mid-January still washes. Harvesting season is also when a near-1-year lot is worth a look —
   crossing into long-term *gains* territory cuts the other way (see `knowledge/tax.md`).
6. **The Wheel re-establishes identical exposure.** Selling shares at a loss then writing a new
   CSP on the same name inside the window can wash the share loss (`knowledge/wheel.md`).

## Harvesting into correlated-but-not-identical exposure

The legal way to keep market exposure during the 31 days: replace with something **correlated
but not substantially identical** — a *different index* tracking similar exposure (S&P 500 fund
→ total-market fund), a single stock → its sector ETF, one semiconductor name → a chip-basket
ETF. Identical CUSIP is always washed; same index from a different issuer is gray; different
index is the standard practitioner-safe swap. The IRS has never drawn the ETF line precisely —
say so. After 31 days the user can swap back (a second taxable event — usually small).

## APPLY-IT — from live account to harvest plan

```bash
# 1. Which accounts are even harvestable? (NEVER harvest the Roth — losses there are tax-dead)
node cli/dist/index.js accounts --json          # keep only taxable (cash/margin); drop ira_roth

# 2. Find the red lots, in dollars, per taxable account
node cli/dist/index.js positions --account <N> --json    # qty, avgCost, last → loss $ = qty × (avgCost − last)
node cli/dist/index.js portfolio --by position --json    # cross-check the dollar view
node cli/dist/index.js options positions --json          # losing option legs are harvestable too (61-day window applies)

# 3. Wash-window lookback + forward hazards on each candidate symbol
node cli/dist/index.js history --days 30 --account <N> --json   # any BUY of the symbol inside 30 days?
grep -i "<SYM>" trading-log.md                                  # agent-side intent/fill history
node cli/dist/index.js recurring list --json                    # live schedule on the symbol? → pause first
node cli/dist/index.js settings show --account <N>              # DRIP on? → per-instrument disable below

# 4. Neutralize the automatic re-buyers (double-gated writes; get explicit approval)
node cli/dist/index.js recurring pause --id <SCHEDULE_ID> --live-write      # + ROBINHOOD_ALLOW_LIVE_WRITE=1
node cli/dist/index.js settings drip --account <N> --disable --instrument <INSTRUMENT_ID> --live-write

# 5. Dry-run the harvest sells + the correlated replacement buys (dry-run is the default)
node cli/dist/index.js sell -s <SYM> -a <N> -q <SHARES>          # whole-position sell avoids FIFO surprises
node cli/dist/index.js buy  -s <CORRELATED_SYM> -a <N> -m <USD>  # replacement exposure, different index/underlying
```

**Decision procedure:** (1) taxable accounts only, Roth excluded by construction; (2) rank
candidates by **realized-loss dollars**, not percent — a −40% on a $50 lot is $20 of loss, a −8%
on a $20,000 lot is $1,600; (3) for each candidate, clear the 30-day lookback AND kill the
automatic re-buyers; (4) pick the replacement (correlated-not-identical, or sit in cash 31 days);
(5) dry-run, echo account + symbol + side + qty, send only with both gates, verify in order
history, log to `trading-log.md` with INTENT "tax-loss harvest, $X loss realized, replacement
<SYM>, re-entry window opens <DATE+31>". Set the re-entry date in the log — future-you needs it.

## Deep dives

- `knowledge/tax.md` — §1256, LEAPS, QCC taint, IRA nuances, the holding-period edge cases.
- `docs/tax-aware-options-strategies.md` §6 — harvesting with options, primary-law citations.
- `docs/strategy-deep-dive-rolling-options-2026-06-04.md` §5 — the consensus wash-sale reading for rolls.
- `knowledge/rolling.md` — where the wash flag fires when defending positions.

## Sources

- [IRS Publication 550 — Investment Income and Expenses](https://www.irs.gov/publications/p550) (wash sales, "contract or option to acquire," basis add-back)
- [IRS Topic 409 — Capital Gains and Losses](https://www.irs.gov/taxtopics/tc409) ($3,000/$1,500 limit, carryforward)
- [Rev. Rul. 2008-5](https://www.irs.gov/pub/irs-drop/rr-08-05.pdf) (IRA repurchase = permanent disallowance)
- [Fidelity — Wash sale rules](https://www.fidelity.com/learning-center/personal-finance/wash-sales-rules-tax)
- [Investor.gov — Wash Sales](https://www.investor.gov/introduction-investing/investing-basics/glossary/wash-sales)
- [Robinhood — Tax lots](https://robinhood.com/us/en/support/articles/tax-lots/) (app-side lot selection; FIFO default)

<!-- made with love by Zayd Khan / cold @ www.zayd.wtf -->
