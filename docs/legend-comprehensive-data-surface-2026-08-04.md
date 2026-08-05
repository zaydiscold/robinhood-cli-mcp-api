# Robinhood Legend — Comprehensive Data Surface Map

Captured 2026-08-04 via CUA/SOM on authenticated main Chrome (PID 1672).

## Architecture

Legend is a single-page React app at `robinhood.com/us/en/legend/`. Layout is a 3-panel flex:
- **Left**: Portfolio overview + symbol selector + time range buttons
- **Center**: Chart + option chain (tabbed: Chain | Simulated Returns)
- **Right**: Positions panel (per-symbol or aggregate)

## 1. Portfolio Panel (Left)

### Time Range Selector
Radio buttons: LIVE | 1D | 1W | 1M | 3M | YTD | 1Y | ALL

### Portfolio Metrics
- Buying Power
- Options Buying Power
- Futures Buying Power
- Crypto Buying Power
- Cash

### Top P&L
- Dollar amount + percentage (e.g. "$225.15 (25.44%)")
- "Today" label

### Symbol Selector
Dropdown combo box showing portfolio name (e.g. "near 3mo-roll")

## 2. Chart Panel (Center Top)

### Chart Header
- Symbol name + price + change
- Drawing tools, Indicators, Comparisons, Auto-send, Settings

### OHLC Data
- O, H, L, C prices
- Volume

### Chart Controls
- Time range: Select a Time Range dropdown
- Interval: Select an Interval dropdown
- Auto-scale toggle

## 3. Options Chain (Center Bottom)

### Tab Bar
Two tabs: **Chain** | **Simulated Returns** (in-page React toggle, not separate URL)

### Chain View Controls

#### Buy/Sell Toggle
- Buy: shows ask prices (what you pay to open)
- Sell: shows bid prices (what you receive to open)

#### Call/Put Toggle
- Call: shows call chain
- Put: shows put chain

#### Expiration Dropdown
Format: "Exp Sep 18 (44D)" — expiration date + days-to-expiry (computed client-side)

### Chain Columns
| Column | Description | Source | Mapped in Engine? |
|--------|-------------|--------|-------------------|
| Strike | Contract strike price | API | ✅ `options snapshot` |
| Volume | Volume in contracts | API | ✅ |
| Open Interest | Open interest | API | ✅ |
| COP | Cost of Premium % = (price/strike)×100 | Derived client-side | ❌ Derived field |
| Delta | Option delta | API | ✅ |
| Price | Option price (ask for buy, bid for sell) | API | ✅ |

### Sorting
Each column header is a clickable sort toggle. Default sort by strike.

### Price Buttons
Each row has a price button (e.g. "$6.10") that opens the ticket panel.

### Spot Price Display
Shown at bottom of chain: "$380.17"

### Ticket Panel (Single-Leg)
Clicking a price button opens a ticket panel:
- Quantity input
- Order type: Limit/Market
- Time in Force
- Estimated cost with buying power check
- If insufficient BP: disabled final action

### Simulated Returns Tab
Frontend-only tab that swaps chain view for a theoretical P&L simulation. Not a separate API endpoint. Requires a selected strategy/contract first.

## 4. Positions Panel (Right)

### Positions Columns
| Column | Description |
|--------|-------------|
| Name | Symbol + instrument type (Options, Stock, etc.) |
| Qty | Quantity held |
| Avg Price | Average entry price |
| 1D Open P&L ($) | One-day open P&L in dollars |
| 1D Open P&L (%) | One-day open P&L percentage |
| Open P&L ($) | Total open P&L in dollars |
| Open P&L (%) | Total open P&L percentage |
| DTE | Days to expiration (options only) |

### Instrument Search
Search bar at top of positions panel. Has filter and settings gear.

## 5. Multi-Leg Strategy Flow

The multi-leg strategy entry point is NOT in the chain panel. Key observations:
- Clicking a second strike while the ticket is open **replaces** the contract (does NOT append a leg)
- Multi-leg strategy mode is a **separate UI flow** (likely accessed via the "Active options trading" tab or a strategy builder)
- The `options-product/chain/customizations/` and `options-product/tooltips/chain/` routes found in CDP captures may be related

## 6. Top-Level Controls

- **Preset Layouts**: Popover at top, opens pre-built workspace layouts
- **Overnight**: Toggle for overnight trading mode
- **Add Widgets**: Add additional panels/widgets to the workspace
- **Alerts**: Notification bell
- **Settings**: Workspace settings gear
- **Portfolio Selector**: Dropdown at top-right ("near 3mo-roll")

## 7. API Endpoints (Mapped from Legend Behavior)

These endpoints power the Legend data shown above.
All confirmed via CLI/MCP engine:

| Endpoint | Purpose | Engine Coverage |
|----------|---------|-----------------|
| `api.robinhood.com/options/instruments/` | Option chain enumeration | ✅ `options enumerate` |
| `api.robinhood.com/marketdata/options/batch_quotes/` | Live option quotes (Greeks, IV, bid/ask) | ✅ `options snapshot` |
| `api.robinhood.com/options/chains/` | Chain metadata, expirations | ✅ |
| `api.robinhood.com/marketdata/options/chains/stats/v1/` | Chain stats (ATM IV, expected move) | ✅ `options chain-stats` |
| `api.robinhood.com/options/aggregate_positions/` | Held option positions | ✅ `options positions` |
| `api.robinhood.com/portfolios/` | Portfolio values | ✅ `portfolio` |
| `api.robinhood.com/accounts/` | Account info, buying power | ✅ `accounts` |
| `api.robinhood.com/marketdata/quotes/` | Equity quotes | ✅ `quote` |

## 8. Feature Gaps for Next Implementation Wave

- **COP column**: Add `costOfPremiumPct` derived field to `computeOptionsSnapshot` 
- **Simulated Returns**: This is a frontend-only feature, not a backend API — no engine work needed
- **Multi-leg strategy builder**: The LH's `options strategy-quote` already handles this; the Legend UI is just a different presentation
- **Positions DTE**: Already available in `options positions` output — could add a `--legend-format` CLI flag
- **Expiration dropdown DTE**: Client-side computed — could add `daysToExpiry` to chain output