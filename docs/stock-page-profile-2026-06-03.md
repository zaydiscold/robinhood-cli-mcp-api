# Stock Page Profile Mapping

## What Was Found

The Robinhood stock detail page can be represented as one read-only profile join
instead of a pile of browser-only UI text. The CLI and MCP now expose that join
as:

```bash
robinhood-cli stock profile <SYMBOL> --account <ACCOUNT_NUMBER> --json
```

MCP parity:

```text
robinhood_stock_profile
```

## Endpoint Map

Observed from the logged-in stock page and confirmed through authenticated CLI
reads:

```text
GET https://api.robinhood.com/instruments/?symbol={symbol}
GET https://api.robinhood.com/marketdata/quotes/?ids={instrument_id}&bounds=24_5&include_bbo_source=true&include_inactive=true
GET https://api.robinhood.com/marketdata/fundamentals/{instrument_id}/?bounds=trading&include_inactive=true
GET https://api.robinhood.com/instruments/{instrument_id}/shorting/
GET https://bonfire.robinhood.com/accounts/{account_number}/instrument_buying_power/{instrument_id}/
GET https://bonfire.robinhood.com/instruments/{instrument_id}/margin-requirements/?account_number={account_number}
```

The profile output includes:

- instrument id, URL, tradability, fractional tradability, short-selling state,
  and option chain id;
- last price, previous close, day percent, bid/ask, sizes, and after-hours last;
- description, market cap/AUM, PE, PB, dividend fields, 52-week range, open,
  high, low, volume, and average volume;
- shorting borrow fee, daily fee, inventory range, and timestamps when present;
- optional account-scoped buying-power and margin-requirement context.

## Browser Evidence

The logged-in browser pass on `https://robinhood.com/stocks/DRAM?...` displayed
the same data families: ETF description, holdings/category metadata, AUM,
P/E, average volume, 52-week high/low, short inventory/borrow rate, the
buy/sell ticket, and the options-entry action.

The captured network requests matched the endpoint families above. Account
numbers are intentionally represented as placeholders in this doc.

## Why It Matters

Agents can now answer stock-page questions without scraping DOM text and without
opening another browser tab. It also gives option workflows a clean source for
underlying instrument id, chain id, borrow/shortability, margin context, and the
account-pinned stock page URL.

## Repro

```bash
node cli/dist/index.js stock profile DRAM --json
node cli/dist/index.js stock profile DRAM --account <ACCOUNT_NUMBER> --json
```

The first command is a pure symbol profile. The second adds account-scoped
buying-power and margin reads.

<!-- made with love by Zayd Khan / cold -->
