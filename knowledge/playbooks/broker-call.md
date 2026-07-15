# The broker call — conversational pipeline from idea to verified order

> **When to load this:** the user shares a trade idea, a screenshot of an options strategy, a
> tweet, or says anything like "can you put this on?" — and you are about to act as the
> old-school broker on the other end of the phone: restate, research, quote, confirm, execute,
> verify, log. This is the flagship workflow; every step has an exact command. Risk is the
> operator's call — your job is canonical restatement, dollar-denominated numbers, and evidence.

## The pipeline at a glance

```
parse → account → research → enumerate → dry-run quote → CONFIRMATION CONTRACT
      → gated send → EVIDENCE VERIFY → trading log → aftercare
```

Reads (steps 1–5) proceed freely. Nothing past step 6 happens without an explicit yes for the
exact echoed order, and nothing is ever reported as "placed" without step 8's order-history
evidence.

---

## Step 1 — Parse and restate in canonical terms

Translate the idea/screenshot into the canonical trade object and **say it back**:

```
underlying | expiration (YYYY-MM-DD) | strike(s) | call/put | side per leg |
position_effect per leg | quantity | debit-or-credit | strategy name
```

If anything is ambiguous, ask BEFORE building. The classic traps:

| User says | Could mean | Must clarify |
|---|---|---|
| "Sell a call" | sell-to-close a held call · covered call · call credit spread · naked short call | closing? covered by 100 shares here? defined by a wing? or naked? |
| "Sell a put" | cash-secured put · put credit spread · margin/naked short put | is cash collateral in THIS account sufficient? |
| "Covered short put" | usually cash-secured put (retail wording) · true covered put (short stock + short put) | which structure — they are not the same |
| "Straddle" | long straddle (debit, capped loss) · short straddle (undefined risk) | long-vol debit or short-premium? |
| "Spread" | debit/credit vertical · ratio/diagonal/unbalanced | same expiration? 1:1 ratio? bounded max loss? |
| "Roll" | close old leg(s) + open replacement(s) | which legs close, which open, does net risk increase? |

**Never infer naked/undefined-risk exposure from loose wording.** Screenshot rule: a chain-builder
screenshot is UI state, not an order — reconstruct every leg (strike, expiration, side, effect,
ratio) from the API, not from the picture.

## Step 2 — Account check

```bash
node cli/dist/index.js accounts --json     # full graph via transfer/accounts/; capability-annotated
```

Pick the account the operator designates (never assume "primary"; nicknames imply nothing). Gate
on type: cash (no margin/naked, T+1), margin (overnight BP gates GTC opens), Roth IRA (long +
defined-risk + CC/CSP only). If the strategy is impossible for the account type, say so and stop.
Then read buying power in dollars:

```bash
node cli/dist/index.js buying-power --account <N>
```

## Step 3 — Research snapshot

```bash
node cli/dist/index.js quote <SYM> --json
node cli/dist/index.js options expirations <SYM> --json     # confirm the expiration exists
# optional context (slow confirmer tier — see knowledge/signals.md):
#   midlands/news/?symbol=<SYM> ; midlands/ratings/{instrument_id}/
```

Also read `ball-knowledge.md` if the name/theme appears there, and say so if it shapes framing.

## Step 4 — Bulk-enumerate option UUIDs

```bash
node cli/dist/index.js options enumerate <SYM> --expiration <YYYY-MM-DD> --type call   # and/or put
```

Option instrument ids are random UUID v4 — there is no deterministic mapping from
symbol/strike/expiration. Enumerate every time; call legs from `--type call`, put legs from
`--type put`; never reuse ids across type or expiration.

## Step 5 — Dry-run quote and present the numbers

```bash
node cli/dist/index.js options strategy-quote <strategy-id> \
  --account <N> --symbol <SYM> --expiration <YYYY-MM-DD> \
  --leg <leg_id>=<STRIKE> [--leg <leg_id>=<STRIKE> ...] \
  --pricing-mode mid --json        # credits: safe-sell-probe as a dry-run control
```

(Leg ids per strategy: `knowledge/multi-leg.md`.) Present, in DOLLARS:

- max profit / max loss / breakeven(s) — e.g. "max loss $637, not 'defined risk'",
- net Greeks, signed, ×100, unit-labeled (`knowledge/greeks.md`),
- liquidity flags (bid/ask width, OI, volume), expiration flags (DTE, 0DTE, ex-div),
- collateral/coverage check result,
- the exact dry-run `options/orders/` body and the chain's min-tick.

## Step 6 — THE CONFIRMATION CONTRACT

Echo the full resolved order and require an explicit yes **for this exact order** — not "sounds
good", not approval of an earlier variant. Any change (price, qty, strike, account) voids the
yes and re-runs this step.

```
CONFIRM: account …<last4> (<nickname>) | <SYM> <expiration> <legs with strikes/side/effect> |
qty <n> | limit $<x.xx> <debit|credit> | est. $<dollars> | TIF <gfd|gtc> | ref_id <uuid>
Reply "yes" to send exactly this.
```

## Step 7 — Gated send (the live-write switch on, inline env var)

```bash
REF=$(python3 -c "import uuid;print(uuid.uuid4())")
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js brokerage execute \
  "https://api.robinhood.com/options/orders/" --method POST --live-write \
  --body-json '<the exact dry-run body from step 5, with ref_id>' --json --full
```

Rules: `--method POST` explicitly (GET shares the URL); env var inline, never exported; the
response must be a **write result** (`201` + an order `id`), not a list. On 429: sleep the
server-directed seconds, retry the **same ref_id**.

## Step 8 — EVIDENCE VERIFY (no record = it did not happen)

```bash
node cli/dist/index.js brokerage execute "https://api.robinhood.com/options/orders/" --json --full
# or: node cli/dist/index.js history --days 1 --account <N>
```

Confirm the order id appears with state `queued`/`confirmed`/`filled`, and report the id and
state to the operator. A lone 201 without this re-read is not sufficient to claim execution;
screenshots and UI states never are. If there is no record, report **non-executed** and stop.

## Step 9 — Log to trading-log.md

Append (bottom of file, never rewrite):

```
=== TRADE LOG ENTRY
WHEN: YYYY-MM-DD HH:MM TZ | ACCOUNT: …<last4> | ACTION: <action> <contract> (side/effect, type, TIF)
SIZE: <qty> @ <price> | ORDER-ID: <id> | STATUS: queued|executed|... (order-history-confirmed)
INTENT: <why, 1-2 lines>
THREAD: <strategy thread this belongs to>
=== END
```

STATUS reflects what step 8 proved, nothing more.

## Step 10 — Aftercare

- **Watch:** re-read the order until `filled` or end-of-day; report fills in dollars.
- **Cancel path** (operator asks, or the order should die):

```bash
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js brokerage execute \
  "https://api.robinhood.com/options/orders/{0}/cancel/" --method POST --live-write \
  --param 0=<ORDER_ID> --json --full
# keep the {0} placeholder; pass the real id via --param. 200 → re-read shows "cancelled".
# A 403 "cannot cancel" on a second attempt means it was already cancelled.
```

- Cancels are writes: same confirmation + gates + evidence + log.
- Surface the management frame neutrally if asked (50%-profit / 21-DTE closes, roll paths —
  `knowledge/rolling.md`), without imposing it.

---

## Worked transcript — GOOGL call debit spread

> Illustrative numbers; always use the live quote. Account masked.

**User:** *[screenshot of a chain builder]* "GOOGL July 340/350 call spread — worth putting on?"

**Agent (step 1, restate):** "Reading that as: **buy 1 GOOGL 2026-07-17 $340 call, sell 1 GOOGL
2026-07-17 $350 call — a call debit spread, 1 contract, net debit.** Both legs opening, same
expiration. Correct?"

**User:** "Yes."

**Agent (steps 2–3):**

```bash
node cli/dist/index.js accounts --json          # operator designates …0497 (margin)
node cli/dist/index.js buying-power --account <N>   # spendable BP covers a ~$640 debit
node cli/dist/index.js quote GOOGL --json           # spot, day change in dollars
node cli/dist/index.js options expirations GOOGL --json   # 2026-07-17 exists
```

**Agent (step 4):**

```bash
node cli/dist/index.js options enumerate GOOGL --expiration 2026-07-17 --type call
# → 340 → <uuid-340C>, 350 → <uuid-350C>
```

**Agent (step 5):**

```bash
node cli/dist/index.js options strategy-quote call-debit-spread \
  --account <N> --symbol GOOGL --expiration 2026-07-17 \
  --leg long_call=340 --leg short_call=350 --pricing-mode mid --json
```

"Quoted at mid: **net debit $6.37/share → $637 for 1 spread.**
- **Max loss $637** (the debit — spread expires worthless below $340).
- **Max profit $363** ((10 width − 6.37) × 100 — both legs ITM at/above $350).
- **Breakeven $346.37** at expiration (340 + 6.37).
- Net Greeks (per spread, ×100): modest +delta, near-flat vega (long/short legs offset), small
  −theta; unit-labeled per the quote output.
- Liquidity: both strikes tight-spread, healthy OI. 36 DTE. No ex-div flag on the short leg.
- Dry-run body is built (`direction: "debit"`, 2 legs, limit $6.37, on-tick). Nothing sent."

**Agent (step 6):**

"CONFIRM: account **…0497 (<nickname>)** | GOOGL 2026-07-17 | **buy/open 340C, sell/open 350C** |
qty **1** | limit **$6.37 debit** | est. **$637** | TIF gfd | ref_id `<uuid>`.
Reply yes to send exactly this."

**User:** "Yes."

**Agent (step 7):** sends with `--method POST --live-write` + inline
`ROBINHOOD_ALLOW_LIVE_WRITE=1` → `201`, order id `<order-id>`, state `queued`.

**Agent (step 8):** re-reads `options/orders/` → `<order-id>` present, state `queued`.
"Order **<order-id>** is live in order history, state `queued` at $6.37 limit. That re-read is
the proof; I'll watch it."

**Agent (step 9):** appends the trading-log entry (ACTION: buy GOOGL 340/350 call debit spread,
SIZE: 1 @ $6.37, STATUS: queued (order-history-confirmed), INTENT: bullish into July per
operator's idea, THREAD: new — GOOGL Jul vertical).

**Agent (step 10):** "If it doesn't fill near mid I'll tell you the live natural and you decide
whether to chase. Say the word to cancel — `options/orders/{0}/cancel/` is one gated call."

---

## What NOT to do

- **No naked inference.** "Sell a call" never silently becomes a naked short call; "covered short
  put" never silently becomes either structure. Ask.
- **No percent-only answers.** "Down 2.3%" is not an answer; "$637 max loss / down $148 today on
  this position" is. Weight by position size, always.
- **No unverified "order placed" claims.** No order-history record → it did not happen — even if
  a button was clicked, a 201 flashed by, or a screenshot looks right.
- **No skipped enumeration.** Never guess, compute, or cache an option UUID.
- **No silent account defaults.** Bare endpoints default to the individual account; the echoed
  `account_number` is part of the confirmation contract.
- **No exported write gate.** `ROBINHOOD_ALLOW_LIVE_WRITE=1` lives inline on the one command.
- **No market orders on multi-leg strategies; no off-tick limits** (read `min_ticks`).
- **No reusing a stale yes.** Any change to price/qty/legs/account re-runs step 6.
- **No risk lecturing.** Surface max loss, breakevens, flags, and account constraints in dollars;
  the decision is the operator's.

## Deep dives

- `knowledge/execution-safety.md` — the 20-point checklist behind steps 6–8.
- `knowledge/multi-leg.md` — leg ids and payoff math; `knowledge/greeks.md` — the exposure block.
- `knowledge/accounts.md` — account gating; `knowledge/signals.md` — research tiers and logging.
- `SKILL.md` — the binding live-write lifecycle and confirmation contract;
  `knowledge/execution-safety.md` — the complete review checklist; `AGENTS.md` §7 — the raw worked order example.
