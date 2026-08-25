# Margin-call intelligence

`margin` and `history` expose broker maintenance risk and forced-liquidation evidence instead of treating buying power as the whole margin story.

## Why

A positive buying-power number is not a maintenance buffer. Robinhood can still liquidate positions when account equity approaches the broker's maintenance requirement. The useful live fields are:

- `equityUsd`
- `marketValueUsd`
- `excessMaintenanceUsd`
- `maintenanceRequirementUsd` (`equity - excess maintenance`)
- `maintenanceBufferPctOfEquity`
- `excessMarginUsd`
- borrowed balance and buying power
- recent orders whose `placedBy` is `PLACED_BY_RISK`

The risk band is an operator heuristic, not a Robinhood label or a prediction of liquidation:

| Band       | Rule                               |
| ---------- | ---------------------------------- |
| `call`     | excess maintenance ≤ $0            |
| `critical` | positive buffer below 5% of equity |
| `thin`     | 5% to below 10%                    |
| `watch`    | 10% to below 20%                   |
| `healthy`  | 20% or more                        |
| `unknown`  | maintenance data unavailable       |

Asset-specific maintenance changes, concentration, volatility, leveraged products, option obligations, deposits, and broker policy can move the real threshold. Never interpret the percentage as guaranteed adverse-move capacity.

## Commands

```bash
node cli/dist/index.js margin --json
node cli/dist/index.js margin --account <ACCOUNT> --json
node cli/dist/index.js history --days 7 --account <ACCOUNT> --json
```

`history` merges the same Wormhole recent-order surface used by the web History UI with legacy equity/options history, crypto, and ACH. Wormhole adds:

- symbol and account context
- fill notional and realized P&L
- `placedBy`
- `forcedLiquidation: true` when `placedBy == PLACED_BY_RISK`

Legacy order endpoints remain as a longer-window supplement. Order IDs are deduplicated when both surfaces return the same record.

## Safe response to a risk liquidation

1. Read `margin --json` and confirm current excess maintenance—not only buying power.
2. Read `history` and total only confirmed `PLACED_BY_RISK` fills.
3. Separate prior market loss from realized P&L crystallized by the liquidation.
4. Do not automatically rebuy into the same margin account.
5. Fund any restoration with cash or a reviewed reallocation and preserve a deliberate maintenance buffer.
6. Verify order history after any later user-approved trade.
