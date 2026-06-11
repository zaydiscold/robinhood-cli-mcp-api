# Trading Log

<!-- made with love by Zayd Khan / cold -->

```
PURPOSE:  An append-only, dated log of what the agent EXECUTES — with the INTENT and the strategy
          thread behind each trade — so the "why" and the "what we're rolling from" survive beyond
          raw brokerage order history.
PAIRS WITH: ball-knowledge.md (market context/beliefs). This file = execution + intent history.
RULES:    Full logging rules live in SKILL.md "Trading log". Append only; never rewrite history.
```

## What goes here & how to read it

- **One entry per execution** the agent performs via the CLI/MCP (orders, cancels, settings changes,
  recurring pause/resume). Append at the **bottom**, newest last; never edit or delete old entries.
- **Status is honest:** mark an order `executed` **only if brokerage order history confirms** it
  (filled/pending/cancelled record, or a position/cash/buying-power change) — per the order-evidence
  rule (SKILL failure mode #20). UI/screenshots/"the button was clicked" are **not** proof.
- **Intent + strategy thread are the point.** Order history already has price/qty/time; this log adds
  *why*, and links legs into a thread (e.g. a Wheel: CSP → assignment → CC → roll), so the agent can
  reconstruct **what it's rolling *from*** without re-deriving it.
- **This file is public + committed.** Keep entries **generic / non-sensitive** (account masked to
  last-4). Real, sensitive personal trade logs should stay generic here or in a gitignored private
  overlay — committed entries push to GitHub.

## Entry format

```
=== TRADE LOG ENTRY
WHEN:    YYYY-MM-DD HH:MM TZ
ACCOUNT: …<last4>
ACTION:  <buy/sell/cancel/setting> <symbol/contract>  (side/position_effect, type, TIF)
SIZE:    <qty> @ <price>           ORDER-ID: <id or n/a>
STATUS:  executed | queued | cancelled | rejected | dry-run   (confirmed via order history?)
INTENT:  <why — the thesis/plan in one or two lines>
THREAD:  <strategy thread if any — e.g. "Wheel on F: leg 2 CC after CSP assigned YYYY-MM-DD; rolling from $K">
=== END
```

### Example entries (format illustration — NOT live trades; delete/replace)

> The two blocks below are illustrative, modeled on the *shape* of real trades (account masked). They
> show the format only — an agent should not treat them as live positions or conviction.

```
=== TRADE LOG ENTRY  [EXAMPLE — illustrative only]
WHEN:    2026-06-02 09:41 PDT
ACCOUNT: …XXXX
ACTION:  sell-to-close 1 option contract  (sell/close, limit, gfd)
SIZE:    2 @ $0.61            ORDER-ID: <masked>
STATUS:  executed  (confirmed: appears filled in options/orders history)
INTENT:  Closing a near-worthless short for a small credit to free up the strike / end the cycle.
THREAD:  (standalone close — no active thread)
=== END
```

```
=== TRADE LOG ENTRY  [EXAMPLE — illustrative only]
WHEN:    2026-06-04 06:35 PDT
ACCOUNT: …XXXX
ACTION:  sell-to-open 1 covered call F $12C  (sell/open, limit, gtc)
SIZE:    1 @ $0.40            ORDER-ID: <masked>
STATUS:  queued  (confirmed via order history; nothing filled after hours)
INTENT:  Wheel income leg — sell a CC against shares assigned from last week's CSP.
THREAD:  Wheel on F → leg 1 CSP $12P assigned 2026-05-30 (100 sh @ $12) → leg 2 this CC; if called away, restart CSP.
=== END
```

---
<!-- Real trade-log entries go below this line, newest at the bottom. -->
