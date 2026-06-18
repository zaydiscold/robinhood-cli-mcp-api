# knowledge/ — the per-topic operator library

Topic modules that make any agent — including a cold one — a competent operator of this
real-money Robinhood CLI/MCP. Each module is operational and command-first: runnable commands
with placeholders, dollar-denominated payoff math, and the safety gates baked in. Modules
condense the deep research in `docs/` to the operational core and link back for the rest.

## The progressive-disclosure model

| Layer | File(s) | Role |
|---|---|---|
| **0 — Boot KB** | `docs/agent-operating-intelligence-2026-06-04.md` | **READ FIRST.** Operating intelligence: the "verify the API surface not the UI" cardinal rule, boot checklist, account model + wrong-account trap, order lifecycle, failure-mode→fix decision tree, asset-class reality map, and roadmap. Turns a cold agent into a competent operator. |
| **1 — Router** | `SKILL.md` (repo root; `CLAUDE.md` symlinks to it) | Trigger + boot doc: quick scan, failure modes, 80/20 commands, intent routing. Read second (after the Boot KB). |
| **2 — Topic modules** | `knowledge/*.md` (this directory) | Load the ONE module that matches the task. 80–200 lines each; commands + decision rules, no essays. |
| **3 — Deep research** | `docs/*.md` | Dated, source-backed studies (strategy deep-dives, tax law, live verifications, quant appendices). Load only when a module's link sends you there. |
| **4 — Full API reference** | `AGENTS.md` (repo root) | The complete self-contained surface: auth, route map, every command, worked raw-API examples. |

Rule of thumb: Boot KB tells you *how to operate*; SKILL.md tells you *which* module; the module tells you *what to run*; docs/ tells you *why it's true*; AGENTS.md tells you *everything else*.

## Module index

| Module | What it teaches | When to load it | Deep-dive docs it links |
|---|---|---|---|
| [`wheel.md`](wheel.md) | The Wheel loop (CSP → assignment → shares → CC → called away), the `wheel` command + `robinhood_wheel` stage classifier, undercovered-short-call hazard, per-leg dry-run commands, account gating | User mentions the Wheel, CSPs, "got assigned — now what?", covered-call income loops | `docs/strategy-deep-dive-the-wheel-2026-06-04.md`, `docs/options-strategies-knowledge-base-2026-06-03.md` |
| [`position-building.md`](position-building.md) | Building toward strategies with partial resources: gap math to 100 shares, accumulation paths (fractional/whole/recurring), CSP-as-acquisition, PMCC as the capital-light wheel (LEAPS delta rules, ≤75%-of-width check), laddering, account-class blocks | "I want to wheel X but only have 40 shares," "can't afford 100 shares," any build-me-into-this-position request | `knowledge/wheel.md`, `docs/options-strategies-knowledge-base-2026-06-03.md`, `docs/strategy-deep-dive-the-wheel-2026-06-04.md` |
| [`rolling.md`](rolling.md) | Roll variants (out/up/down and combos), net-credit math, the cash-account **kosher roll** (`options roll-plan --cash-account`, T+1, GFV), ex-div assignment check, wash-sale flag, when rolling is the wrong move | Any "roll/defend/my short is tested" request — mandatory reading on cash accounts | `docs/strategy-deep-dive-rolling-options-2026-06-04.md`, `docs/tax-aware-options-strategies.md` |
| [`multi-leg.md`](multi-leg.md) | Leg topology per strategy (side/effect/ratio), payoff formulas per family, exact `options strategy-quote` invocations with the correct leg names, the iron-condor worked build | Pricing/planning any vertical, straddle/strangle, butterfly, condor, calendar/diagonal | `docs/options-strategy-order-templates-2026-06-03.md`, `docs/options-strategies-knowledge-base-2026-06-03.md`, `docs/options-quantitative-playbook-2026-06-03.md` |
| [`greeks.md`](greeks.md) | Signed net-Greek aggregation (±side × ratio × contracts × 100), scenario P&L math, unit-labeling traps, Black-Scholes sanity baseline, delta ≠ assignment probability | Any options read/plan that should report exposure or scenario P&L | `docs/options-greeks-strategy-research-2026-06-02.md`, `docs/options-quantitative-playbook-2026-06-03.md` |
| [`tax.md`](tax.md) | §1256 60/40 index options on RH (SPX/SPXW/XSP/NDX/VIX/RUT — hidden from search, live via `options/chains/`), LEAPS, wash sales, QCC taint, IRA nuances, the two rare holding-period edge cases | SPX-vs-SPY choices, rolling losers in taxable accounts, LEAPS near the 1-year line, any tax question | `docs/tax-aware-options-strategies.md`, `docs/index-options-1256-conclusion-2026-06-04.md` |
| [`tax-loss-harvesting.md`](tax-loss-harvesting.md) | Harvest mechanics ($3,000 offset + carryforward), the 61-day wash window both directions, the two substantially-identical readings + the conservative rule, FIFO lot reality, the IRA poisoning trap, December timing, correlated-not-identical replacements — with the full live-account procedure | "Sell my losers for taxes," "offset my gains," any year-end harvest question | `knowledge/tax.md`, `docs/tax-aware-options-strategies.md`, `docs/strategy-deep-dive-rolling-options-2026-06-04.md` |
| [`dividend-investing.md`](dividend-investing.md) | Yield vs yield-on-cost, payout sustainability, ex/record/payable dates under T+1, qualified vs ordinary (61-of-121-day rule), dividend traps, DRIP mechanics, QDTE-style weekly payers (ROC, NAV erosion) — wired to the in-engine `dividends` command | Dividend income, yield, "when do I get paid," DRIP, weekly-payer ETF questions | `knowledge/tax.md`, `docs/options-strategies-knowledge-base-2026-06-03.md`, `ball-knowledge.md` |
| [`accounts.md`](accounts.md) | Cash/margin/Roth capability gating, `transfer/accounts/` as the only complete graph, the `?account_number=` selector, buying-power family (overnight BP gates GTC opens; negative cash = margin loan), PDT lifted | Before ANY account-scoped operation or write; capability and sizing questions | `docs/agent-operating-intelligence-2026-06-04.md`, `SKILL.md`, `TODO.md` |
| [`market-mechanics.md`](market-mechanics.md) | The Investopedia floor: order types + the repo's collar behavior, bid/ask/spread/mark in dollars, OI vs volume, market sessions (what trades when — options don't quote pre-market), T+1, limit-only OTC, halts/stale quotes, OCC split adjustments | "Why is the price weird," "why didn't my order fill," what-trades-when questions, grounding for market-new users | `knowledge/execution-safety.md`, `knowledge/accounts.md`, `docs/error-code-reference-2026-06-11.md` |
| [`signals.md`](signals.md) | The sourcing ladder (X/Reddit pulse → RH midlands confirmer → institutional outlooks → academic math), Ball Knowledge rules (context not authority, classify entries), trading-log rules (order-history evidence) | Due-diligence/research tasks; whenever the memory ledgers should shape an answer | `docs/institutional-outlook-2026-06-04.md`, `ball-knowledge.md`, `trading-log.md` |
| [`execution-safety.md`](execution-safety.md) | The 20 failure modes as a checklist, double write gates, `--method` on writes, the account-echo contract, UUID enumeration, min-tick, 429/ref_id idempotency, dedup window, the order-evidence rule | Before ANY write, and when a write path errors | `docs/error-code-reference-2026-06-11.md`, `docs/live-write-verification-2026-06-03.md`, `docs/account-settings-capability-map-2026-06-03.md` |
| [`playbooks/broker-call.md`](playbooks/broker-call.md) | **The flagship:** the 10-step conversational broker pipeline (parse → account → research → enumerate → dry-run → confirmation contract → gated send → evidence verify → log → aftercare), with a full worked GOOGL transcript and the what-NOT-to-do list | The user shares a trade idea/screenshot and wants it taken from conversation to verified order | All of the above + `SKILL.md` lifecycle sections, `AGENTS.md` §7 |

## Conventions (binding across modules)

- **Dollars, not percents.** Every payoff, loss, and attribution is position-size-weighted and
  dollar-denominated.
- **Descriptive, not prescriptive on risk.** Modules surface mechanics, numbers, and flags; the
  operator chooses risk and sizing.
- **Reads are free; writes are env-gated.** Nothing in this library overrides the dry-run
  default, the confirmation contract, or the order-evidence rule.
- **Link, don't duplicate.** When a module and a deep doc disagree, the dated doc + live API are
  the tiebreakers — and the discrepancy should be reported, not papered over.
