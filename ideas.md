# ideas.md — the idea pool (not commitments)
<!-- Zayd Khan // cold // www.zayd.wtf -->
Consolidated 2026-06-11. Grind line by line; promote winners into tasks.md.

## Trading features (beginner -> veteran)
- `whatif` — Greeks-based scenario calc: spot +/-X%, IV +/-N pts, T-n days -> position P&L in dollars
- `calendar` — upcoming events for HELD names: option expirations, ex-div dates (covered-call assignment risk), earnings
- `risk` — one-shot portfolio risk scan: max loss across open positions, assignment exposure, undercovered shorts, margin-call distance
- `income` — combined income view: dividends + option premium collected, by month, in dollars
- `coach` mode — explain any held position/order in plain English with the math shown (the old `explain` idea, reborn for beginners)
- `exposure` — concentration by underlying/sector + portfolio-wide net Greeks
- Auto-journal nudge — after a live fill, prompt a `review note` so film study happens at the moment of the trade
- Order templates/presets — save a named order shape ("my usual CSP ladder") and re-fire with fresh quotes
- Scheduled digest — morning brief: portfolio delta, pending rolls, upcoming calendar events, hotlist movers
- Price alerts — once the bonfire alert endpoints are captured

## Showcase / social
- Trade cards + success graphics: HTML framework rendering a trade (entry/exit, P&L $, payoff diagram, thread context) as a shareable card, auto-generated per play
- Groupchat trade-share pipeline (the pvp.trade angle, brokerage-grade): friend's screenshot -> canonical spec -> dry-run in YOUR account with YOUR gating -> discuss -> gated send
- Ratatouille TUI (full spec preserved in local/tasks.md graveyard)

## Platform / reach
- Bidding/strategy bots on top of the hardened api-map (the "why API hardening matters" example)
- MLX finetunes for finance + this tool (per the README Soon(tm) note)
- Dividend-account designation flow once account-rename surface is mapped (empty account -> income machine)
- MCP resources (in addition to tools) for knowledge modules, so clients that render resources get the library natively

## ====== 2026-06-13 expansion pass ======
New idea batch. Same doctrine: dollars not percents, descriptive not prescriptive on risk.
Anything that needs a route we haven't captured is flagged "(needs surface mapping)".

### Beginner empowerment / education
- `coach explain <position|order>` — plain-English breakdown of any held position/order with the dollar math shown: what it is, what you paid, what you'd make/lose, the one risk to watch. The flagship "I'm new, what am I even holding" command.
- `define <greek|term>` — micro-glossary at the prompt: "what is theta on THIS position" answers in dollars/day for the actual contract, not a textbook abstraction. Pulls from knowledge/greeks.md + live marketdata.
- `learn` / guided first trade — a stepped, dry-run-only walkthrough that builds one real order with the user, narrating each field (side, effect, limit, TIF) and never lifting the gates. Graduation = they understand the confirmation contract.
- `sandbox` / paper mode — a persistent local dry-run ledger: place make-believe orders against live quotes, track fake P&L in dollars over time, no account ever touched. Learning reps without risk.
- `riskcheck` (beginner framing) — before a beginner's order, surface the three plain-English questions (max loss in dollars, can you be assigned, what happens at expiration) as friction, answered for the specific contract.
- `glossary` resource — ship knowledge/ definitions as an MCP resource + a `glossary` command so a cold user can browse terms without leaving the tool.
- "explain my fill" — after any fill, a one-paragraph plain-English recap of what just happened and what changed in the account (ties into the existing post-send evidence).

### Pro / aggressive workflows
- `ticket` — fast multi-leg ticket builder: compose a 2-4 leg spread by strikes in one line, auto-enumerate UUIDs, dry-run quote + payoff, ready to gate-send. The pro's speed path over hand-built bodies.
- `scan spreads <SYM>` — vertical/credit-spread scanner across a chain: rank candidate short/long strike pairs by credit-per-width, breakeven, and net Greeks in dollars. (needs no new surface; loops existing chain reads.)
- `ivrank <SYM>` — IV rank / IV percentile read for sizing premium-selling (high IV = richer credit). (needs surface mapping — historical IV series endpoint not yet captured; interim: compute from option chain IVs vs a stored rolling window.)
- `termstructure <SYM>` — front-vs-back-month IV term structure for calendars/diagonals: where's the kink. (needs surface mapping for historical IV; current-snapshot version works off live chains.)
- `pinradar` — near-expiry pin/assignment radar: for every short leg within N days, distance to strike in dollars, ITM/OTM flag, ex-div-before-expiry warning, "this will likely assign" call. Aggressive-trader's expiry-day cockpit.
- `0dte` guardrail mode — a 0DTE-aware wrapper: enforces a same-day-close reminder, flags gamma/theta cliff in dollars, and refuses to silently roll a 0DTE into overnight risk without an explicit ack.
- `ladder` — build/quote a strike or expiry ladder (e.g. a CSP ladder across 3 strikes) in one command, each rung dry-run-quoted; pairs with the order-presets idea.
- `delta target` — "get me ~30-delta" resolver: name a target delta, it finds the nearest strike on the chain and dry-runs it. The way pros actually pick strikes.

### Risk & safety
- `risk` — one-shot portfolio risk scan (already in pool; promote): portfolio max loss in dollars, total assignment exposure, undercovered short calls, margin-call distance, expiry cluster.
- `exposure` — concentration by underlying/sector + portfolio-wide net Greeks in dollars (already in pool; promote).
- `margin distance` — for margin accounts, dollars-to-maintenance-call and the price move that triggers it, per account.
- Notional guardrails — per-order and per-session dollar caps with an explicit `--override`; also a per-underlying concentration cap warning. (Already a task; idea-side note: scale the cap suggestion to buying power.)
- Scaled "are you sure" friction — confirmation friction proportional to trade dollar size: a $20 order one-taps, a $5,000 order forces a re-typed confirmation of the resolved account+symbol+side+qty+price.
- `circuit breaker` — a session kill-switch: if realized day loss crosses a user-set dollar threshold, refuse further opens (reads/closes still allowed) until explicitly reset.
- Naked-exposure double-gate — any order classified naked/undefined-risk gets an extra, separate ack beyond the two write gates, echoing "this is undefined risk."

### Income & tax
- `income` — combined income view: dividends + option premium collected, by day/wk/mo/qtr/yr, in dollars (already in pool; promote, now spanning both engines).
- `harvest` — tax-loss-harvest candidate finder mapped to LIVE lots: rank unrealized losers by harvestable dollars, flag the 61-day wash window both directions, suggest correlated-not-identical replacements. Wires knowledge/tax-loss-harvesting.md to real positions.
- `washradar` — standalone wash-sale radar: scan recent fills + open lots for any buy within 30 days of a realized loss (or pending sell that would trip it), in dollars disallowed.
- `holding-period` flags — §1256 and LEAPS holding-period surfacing: which lots are near the 1-year short→long-term line or a tax-year boundary, and the deferral that changes the bracket. (Edge-case-only, per doctrine.)
- `taxplan` — year-end tax planning mode: realized gains/losses YTD in dollars, harvestable losses available, §1256 60/40 positions, suggested December actions (gated, dry-run).
- Premium-income sustainability note — on weekly-payer / covered-call income, annotate ROC vs real yield and NAV-erosion risk in dollars (extends dividend-investing.md framing).

### Research & memory
- `brief signals <SYM|portfolio>` — signal digest for held/hotlist names: RH midlands news + ratings + crowd tags, summarized, tagged by the sourcing ladder (pulse vs confirmer). Confirmer-layer, clearly labeled.
- `calendar` — upcoming events for HELD names: expirations, ex-div dates (CC assignment risk), earnings (already in pool; promote, now driving the morning brief).
- `thesis track` — ball-knowledge-driven thesis tracker: for each thesis entry tied to a ticker, show the live position/P&L in dollars and whether the thesis is playing out, append-only notes.
- `hotlist alert` — when a hotlist name moves past a user-set dollar/level trigger or has an event today, surface it in the brief/recap. (Alert delivery local; price triggers via existing quotes.)
- Auto-journal nudge — after a live fill, prompt a `review note` at the moment of the trade (already in pool; promote, tie to evidence step).
- `review tape <SYM>` — "study the tape" enhancement: join round-trips + film-study notes + the original ball-knowledge thesis into one retro per name, P&L in dollars, what-I-said-vs-what-happened.
- `digest` of institutional outlook — periodic pull of the regime/CMA layer (docs/institutional-outlook), framed as info-not-mandate, mapped onto held sectors.

### Automation & scheduled modes
- `brief` / morning brief — portfolio day-delta, pending rolls, today's calendar events (ex-div/earnings/expiry), hotlist movers, all in dollars (already in pool; promote as the anchor scheduled mode).
- `recap` / end-of-day — what filled, realized + unrealized day P&L in dollars by underlying, what expires tomorrow, journaling nudge for any new fills.
- Pending-roll Monday reminder — for kosher rolls staged Friday (close now / open next business day), a Monday-morning "open the second leg, recheck settled cash + fresh bid/ask" prompt. Closes the T+1 loop in roll-ledger.
- Recurring-buy intelligence — analyze recurring schedules vs buying power and dollar pace; flag schedules that will drain the account, suggest sizing. Extends the existing recurring engine read.
- `watch <SYM> <trigger>` — watch-and-alert: poll a quote/level and notify on a dollar/percent move or an option mark crossing. (needs surface mapping for native RH alerts; interim: local polling loop.)
- `order watch` — place → poll → report fill/reject (already a task; idea-side: extend to multi-leg fills).
- Scheduled health scan — daily `risk`/`exposure` snapshot appended to a local log so drift is visible over time (margin distance, concentration, expiry clusters).

### Platform / reach
- Strategy bots on the hardened api-map — supervised, gated automation primitives (already in pool; idea-side: ship the `circuit breaker` + notional caps as the safety substrate bots build on).
- Multi-account orchestration — `--all-accounts` aware variants of risk/exposure/income/brief that roll up across every owned account in dollars, with per-account breakdown. (Wheel/positions already cross-account; generalize.)
- Export / reporting — `export` to CSV/JSON for positions, fills, income, realized P&L (tax-ready); a printable monthly statement. (Already a carried task; broaden to income + tax outputs.)
- Dividend-account designation flow — once account-rename surface is mapped, designate an empty account as the income machine (already in pool; depends on the CDP account-management capture task).
- MCP resources for the knowledge library — expose knowledge/*.md as MCP resources so resource-rendering clients get the library natively, plus the glossary (already in pool; pair with `glossary`).
- Trade-card / success-graphic generator — HTML render of a completed play (entry/exit, dollar P&L, payoff diagram, thread context) as a shareable card (already in pool; idea-side: drive it from the review/round-trip join so it's evidence-backed).

## ====== 2026-06-19 — MCP modernization (researched; sequence hardening → modernization) ======

Researched the official MCP spec/SDK + last-30-days community pulse against the live server
(`mcp/src/server.ts`, 73 tools, SDK `@modelcontextprotocol/sdk` ^1.x). Verdict: worth doing — but per
the owner's directive, **hardening + docs + small wins FIRST; modernization (Resources/structuredContent/
elicitation) AFTER**, and only where shipping clients (esp. Claude) actually support it.

Spec baseline: **stay on the 2025-11-25 revision / SDK 1.x** (the officially recommended production line).
A 2026-07-28 revision exists but rides SDK **2.0-alpha** — do NOT chase it yet (revisit ~Q3 2026).
Already correct in our code (do not redo): `destructiveHint: isWrite` on all writes; errors `throw` → SDK wraps `isError`.

TIER 1 — hardening + docs + small wins (do first):
- Brand the ~26 bare `z.string()` inputs (accountNumber/symbol/uuid) with regex/`.uuid()` schemas — fail bad args at the boundary before they hit Robinhood. Highest-leverage hardening for a real-money tool.
- Return INPUT-validation failures as `isError` Tool Execution Errors (SEP-1303), not thrown protocol errors, so the model self-corrects and retries.
- Consistent error shape across the ~29 `throw` sites (tool-name prefix + stable code; keep the loud write `executionStatus`).
- Generate `mcp/README.md` from `tools/list` (currently a 17-line stub) + a CI drift check — matches the "live truth: tools/list, never a hardcoded count" doctrine.
- First MCP-package tests: in-memory boot asserting tools/list count + every write tool has `destructiveHint:true`/`readOnlyHint:false` + a dry-run write returns `executed:false` (locks the safety invariants).
- `structuredContent` + `outputSchema` on the top ~5 read tools (portfolio/positions/buying_power/quote/accounts). FOOTGUN: once `outputSchema` is declared the SDK REQUIRES a matching `structuredContent` and Cursor rejects declare-but-omit — always return BOTH `content` + `structuredContent`; roll out tool-by-tool.
- (Optional) tool-count hygiene — 73 tools is past the ~30-50 "selection accuracy" zone; consider multiplexing the rarely-used `api_map_*`/`*_routes`/`*_workflows` planners. Not urgent (Claude Code's tool-search defers defs).

TIER 2 — modernization (after Tier 1), with honest client-support reality:
- Resources (expose `ball-knowledge.md`/`trading-log.md`/`hotlist.md`/api-map as read-only context) — worth it, modest; KEEP the existing knowledge/hotlist tools as fallback for clients that ignore resources. (Subsumes the older "MCP resources for the knowledge library" idea above.)
- Elicitation — SKIP for now: Claude Code closed it "not planned" (#7108); the env-gated dry-run switch already covers confirm-before-write better, and the 2026-07-28 revision restructures it anyway.
- Prompts + completion — low payoff for a single-user tool (the SKILL already encodes the workflows). Defer.
- Cursor-based pagination on the big list tools (history/review/routes) — borderline Tier-1.5; add an opaque `cursor` instead of only slicing server-side.

Sources — official: modelcontextprotocol.io 2025-11-25 changelog · TS SDK `docs/server.md` · TS SDK releases (2.0-alpha + 1.x-stable policy) · Claude Code elicitation issue #7108 ("not planned"). Community (recent): The New Stack "15 best practices for MCP servers in production"; digitalapplied 2026 MCP security guide; Scott Spence on Claude Code MCP context usage. Builds on `docs/mcp-best-practices-audit-2026-06-18.md` (do not duplicate). Tier-1 actionables tracked in `tasks.md`.
