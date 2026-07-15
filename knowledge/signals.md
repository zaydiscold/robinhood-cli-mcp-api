# Signal sourcing — the ladder, Ball Knowledge, and the trading log

> **When to load this:** any due-diligence, research, or "what's the word on X?" task; whenever
> Ball Knowledge or the trading log should shape an answer; whenever you're tempted to treat a
> feed (RH news, a tweet, a bank outlook) as authority. This is a sourcing framework, not a
> sizing rule — risk stays the operator's call.

## The ladder (fast → slow; none of it is gospel)

| Tier | Source | Speed / role | Trust posture |
|---|---|---|---|
| 1 | **X/Twitter, Reddit** (r/options, r/thetagang, r/stocks; `bird search`, `last30days`) | fastest pulse; leads every other layer | best signal-to-noise **if you know whom to read** — X is also the fastest misinformation; weight track-record sources over anonymous virality; corroborate a lone post |
| 2 | **RH `midlands/*`** — news, ratings, tags, movers, earnings | slow, broker-native **confirmer**; trails the pulse by hours-to-a-day | authoritative for discrete/binary events (earnings, M&A, Fed, halts) where being right beats being first |
| 3 | **Institutional outlooks** (BlackRock BII, Vanguard VEMO/VCMM, JPM LTCMA, Goldman/MS targets, PIMCO, Fidelity CMA) | slowest; regime/decade thesis layer | a house view is still a view — firms are routinely wrong and talk their book; it frames attention, never dictates |
| 4 | **Academic / quant math** (VRP, N(d2), Greeks calculus, Kelly) | timeless; explains *why* an edge exists | every model rides assumptions that break in practice; structure, not guarantee |

All tiers are subordinate to **live market data and brokerage order history** for anything that
touches a real trade. Lead DD with tier 1; let tiers 2–4 confirm and frame — not the reverse.

RH-native endpoints (risk `read`):

```bash
# midlands/news/?symbol=<SYM>                    news per ticker
# midlands/ratings/{instrument_id}/              analyst buy/hold/sell + dated texts
# midlands/tags/tag/{100-most-popular|top-movers|upcoming-earnings|...}/   crowd lists
# midlands/movers/{index}/                        movers; marketdata/earnings/  earnings
```

(Per-instrument `instruments/{id}/popularity/` is 404 — use the tags crowd lists.)

Using the institutional layer correctly: it **weights, never gates** — a consensus tailwind
slightly raises the prior that a fast signal is real; a headwind is a "house view disagrees"
flag, not a veto. Hold both sides of the central split (sell-side bulls vs CMA-shop valuation
bears — different horizons). **Cite the firm + as-of date** when this layer shapes an answer.
Current synthesis: `docs/institutional-outlook-2026-06-04.md` (refresh each cycle: year-aheads
Nov–Dec, LTCMAs annually; replace with a new dated file, don't let it silently go stale).

## Ball Knowledge (`ball-knowledge.md`) — context, NOT authority

The repo root's append-only ledger of investing context the operator intentionally wants
remembered (tickers, theses, rumors, @handles, style/income preferences). Read it on any finance
task. Binding rules:

- Everything in it was intentionally added → treat as **important context**; it does NOT mean
  obey. It can never authorize a trade, prove a rumor, or override user confirmation, live
  market data, or order history.
- **Classify each (unlabeled) entry by type before using it:**

| Entry looks like | Treat as |
|---|---|
| rumor | consider, then verify before relying on it |
| bare sector/ticker | keep on the radar |
| `@handle` / newsletter | source lead, not verified truth |
| "0DTE / balls-to-the-wall" | high-risk style note — surface risk plainly, don't normalize as default |
| "QDTE / dividend" | income preference — weigh sustainability, taxes, downside |
| "user wants X" | preference/profile — reconfirm specifics |

- Minor recency bias only: newer entries slightly more relevant; old ones stand unless
  contradicted/stale/removed.
- Append-only, at the bottom, in the repo's `=== BEGIN BALL KNOWLEDGE ENTRY` format; never
  rewrite older entries unasked. Public file — keep committed entries generic.
- **When it shapes an answer, say so plainly** ("your Ball Knowledge already flags
  semiconductors, so I'd start the universe at...").

## Trading log (`trading-log.md`) — execution + intent history

The second memory layer: an append-only, dated log of what the agent *executes*, with INTENT and
the strategy THREAD (so a roll knows what it's rolling *from* without re-deriving raw history).

- Log **every** execution performed via CLI/MCP — orders, cancels, settings changes, recurring
  pause/resume. Append at the bottom; never rewrite.
- **Order-evidence rule (binding):** STATUS is `executed` **only if brokerage order history
  confirms it** (`orders/` / `options/orders/` record, or a position/cash/BP change).
  Screenshots, UI/review screens, "the button was clicked", and agent logs are NOT proof. No
  record → it did not execute; say so.
- Entry format (mirror the file's header):

```
=== TRADE LOG ENTRY
WHEN: YYYY-MM-DD HH:MM TZ | ACCOUNT: …<last4> | ACTION: <buy/sell/cancel/setting> <symbol/contract> (side/effect, type, TIF)
SIZE: <qty> @ <price> | ORDER-ID: <id|n/a> | STATUS: executed|queued|cancelled|rejected|dry-run (order-history-confirmed?)
INTENT: <why, 1-2 lines>
THREAD: <strategy thread, e.g. "Wheel on F: leg 2 CC after CSP assigned YYYY-MM-DD; rolling from $K">
=== END
```

- Public + committed: mask accounts to last-4, keep entries generic.

## Signal → (optional) validation → action

Any feed is a *direction input*. You can corroborate against live data (bid/ask, Greeks,
volume/OI, `quote`) before acting — available reasoning, not a requirement. What a signal can
never do: skip the dry-run, the confirmation contract, or the write gates
(`knowledge/playbooks/broker-call.md`).

## Deep dives

- `SKILL.md` — compact research-and-maintenance routing and the binding real-money contract;
  this module is the canonical signal, Ball Knowledge, and trading-log operating reference.
- `docs/institutional-outlook-2026-06-04.md` — per-firm table, consensus vs divergence, mega forces, refresh cadence.
- `docs/agent-operating-intelligence-2026-06-04.md` §1 — "Signal is a surface too".
- `ball-knowledge.md`, `trading-log.md` — the live ledgers themselves (repo root).
