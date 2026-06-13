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
