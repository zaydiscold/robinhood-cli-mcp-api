# Robinhood Legend Data Model — Authenticated Pass 2026-08-04

Captured via authenticated browser accessibility instrumentation during an authorized local session.

## Layout (3-panel)

```
[Left Portfolio]  [Center Chart + Chain]  [Right Positions]
```

## Left Panel — Portfolio Overview
- Time range: LIVE | 1D | 1W | 1M | 3M | YTD | 1Y | ALL
- Buying Power | Options BP | Futures BP | Crypto BP | Cash
- P&L in $ and %
- Symbol selector (near 3mo-roll portfolio view)

## Center — Chart
- NVDA chart showing OHLC: O=211.30 H=213.06 L=209.05 C=211.94
- Volume: 135.31M
- Indicators, drawing tools, comparisons, settings
- Time range & interval selectors
- Auto-scale toggle

## Center — Option Chain (when instrument selected)
Tab toggles: Chain | Simulated Returns (in-page React swap)

### Chain view — Columns (buy-side, calls)
| Column | Description | Maps to engine |
|--------|-------------|----------------|
| Strike | Contract strike price | `strike` |
| Volume | Volume in contracts | `volume` |
| Open Interest | Open interest | `openInterest` |
| COP | Cost of Premium % = (price/strike)*100 | Derived, not in engine |
| Delta | Option delta | `delta` |
| Price | Option price (ask for buy, bid for sell) | `mark`/`ask`/`bid` |

### Controls:
- Buy/Sell toggle (changes price side)
- Call/Put toggle (swaps chain side)  
- Expiration dropdown (format: "Sep 18 (45D)")
- Sortable columns: Strike (default), Volume, OI, COP, Delta

### Ticket (clicking a price button opens ticket panel)
- Single-leg: quantity, limit/market, TIF, estimated cost
- Selecting second strike REPLACES the contract (does NOT append leg)
- Multi-leg: separate strategy mode entry point

## Right Panel — Positions
Columns: Name | Qty | Avg Price | 1D Open P&L ($) | 1D Open P&L (%) | Open P&L ($) | Open P&L (%) | DTE

## Key Findings for API Mapping
1. COP column = (option price / strike) × 100 — derived field, not from API
2. Chain data columns all map to `options/enumerate` responses except COP
3. "Exp Sep 18 (45D)" — Robinhood computes DTE client-side
4. Simulated Returns is a frontend-only tab, not a separate API route
5. Single-leg ticket → clicking a second strike replaces, doesn't create multi-leg
6. Multi-leg strategy mode is a separate UI flow (not in the chain panel)
