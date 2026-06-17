# Futures / FX / Commodities Surface — Read & Order Capability Map

Date: 2026-06-04. Method: read-only exploration with `scripts/rh-get.mjs` (auth'd
GET, web headers + brokerage bearer), `cli/dist/index.js brokerage search`, and the
shared logged-in Chrome debug session via `browser-harness-js`. **No live orders
placed; no write gates set.** Account numbers masked to last-4.

## TL;DR

| Asset class | Quote / enumerate? | Place order via this CLI? | Reality |
|-------------|--------------------|---------------------------|---------|
| **Futures** (CME: /ES, /MES, /NQ, /GC, /CL, /6E, /BTC, …) | **YES** — read-only, via `midlands/lists/items/` (embeds live bid/ask/last) | **NO** | Real CME contracts exist and quote. The trading host `ceres.robinhood.com` is **TLS-walled** — refuses the handshake from every non-app client (curl, Node, OpenSSL 3.6, and even a logged-in robinhood.com Chrome tab). No futures account/order endpoint is reachable. |
| **FX (spot)** | n/a | **NO** | Robinhood has **no spot-FX product.** `currency_pairs` is always `[]`. "FX" = either currency *futures* (read-only, above) or crypto currency pairs (separate Crypto API). |
| **Commodities** | **YES** (read-only) — real commodity *futures* (/CL crude, /NG nat gas, /GC gold, /SI silver, /HG copper) | **NO** (futures path) / yes via ETF proxies on the equity engine | Real commodity futures quote via the lists endpoint but are not placeable here. ETF proxies (USO, etc.) are normal equities and trade through the existing `brokerage buy` path. |

Bottom line: **this CLI can read/quote/enumerate futures (incl. commodity &
currency futures) but cannot place futures/FX/commodity-futures orders.** The order
surface lives on `ceres.robinhood.com`, which is unreachable without Robinhood's own
app TLS profile. Equity/ETP proxies remain fully placeable on the existing engine.

Additionally, **this login does not appear to have futures enabled** — the web
`/futures` route redirects to the marketing page and the futures app routes fire
zero ceres calls (onboarding-gate state).

---

## 1. Does the account have a futures account?

**No futures account is exposed, and futures appears un-onboarded for this login.**

`GET bonfire.robinhood.com/transfer/accounts/` → **200**. Full account graph (masked):

```
...9919  type=rhs        (individual brokerage)
...6346  type=ira_roth
...0497  type=rhs
...9911  type=rhs
...7523  type=rhs
  8697   type=ach        (funding)
  3514   type=ach        (funding)
  4627   type=dcf        (funding)
```

Searching the entire account graph JSON for `futures`, `ceres`, `commodit`, `forex`,
`/fx`, `contract` → **0 hits.** No futures-type account, no ceres account id.

Web confirmation (logged-in Chrome): navigating to `https://robinhood.com/futures`
**redirects to `https://robinhood.com/us/en/about/futures/`** (the marketing/about
page). Hosts hit: `cdn.`, `bonfire.`, `robinhood.com` only — **no ceres.** Routes
`/futures/dashboard`, `/account/futures`, `/futures/onboarding` load without redirect
but fire **zero** `ceres`/`futures`-host requests (SPA renders the gate, not a live
dashboard). Net: this account has not completed futures onboarding.

Futures eligibility probes on the reachable host all 404:
- `GET api.robinhood.com/futures/eligibility/` → 404
- `GET api.robinhood.com/midlands/futures/eligibility/` → 404
- `GET bonfire.robinhood.com/futures/accounts/` → 404
- `GET api.robinhood.com/futures/accounts/` → 404

### ceres host — exact reachability evidence (the wall)

`ceres.robinhood.com` resolves (DNS → 3.169.231.0/24, AWS) but **refuses TLS** to
every standard client:

| Client | Result |
|--------|--------|
| `node scripts/rh-get.mjs` (Node 26 fetch) | `ERR_SSL... ssl/tls alert handshake failure` (SSL alert 40) |
| `curl` (LibreSSL 3.3.6) | `(35) sslv3 alert handshake failure` |
| `curl --tlsv1.2` | `tlsv1 alert protocol version` |
| `openssl s_client` (OpenSSL 3.6.2) | alert 40 right after Client Hello; **"no peer certificate available"** |
| Python `ssl` (OpenSSL 3.6.2, TLS 1.3) | `SSLV3_ALERT_HANDSHAKE_FAILURE` |
| **Logged-in robinhood.com Chrome tab** (`fetch(..., {credentials:'include'})`) | `Error: Unable to connect. Is the computer able to access the url?` |

The server aborts immediately after the Client Hello and never presents a
certificate. TLS version is not the cause (1.3-capable clients fail identically).
This is consistent with a **client-certificate / app-attestation / JA3-fingerprint
allowlist** — i.e. ceres only talks to Robinhood's own mobile/desktop app TLS
profile, not browsers or scripts. `futures.robinhood.com` also fails ("Unable to
connect"). This matches the `ceres futures` note in the repo's research methodology
(host noted, intentionally not pursued).

**Consequence:** the brokerage bearer token cannot authenticate to the futures
order/account API regardless of correctness, because the transport handshake itself
is rejected before any HTTP request.

---

## 2. Can futures contracts be enumerated and quoted?

**YES — read-only, via the curated-list endpoint on the reachable `api` host.**

`GET api.robinhood.com/midlands/search/?query=futures` → **200**. Returns curated
`lists[]` (Futures, Energy Futures, Currency Futures, Crypto Futures, Metals Futures,
Crypto Commodity ETPs). The top-level `instruments[]` array contains only **ETPs/ETNs
and stocks** (UVXY, VXX, USO, CME, MS) — *not* the futures themselves.

The futures contracts live inside each list. Dereference a list:

`GET api.robinhood.com/midlands/lists/items/?list_id=<LIST_ID>` → **200**, returns
`results[]` where each futures row is `object_type: "futures"` with an embedded live
quote. Example (Micro S&P, full shape):

```json
{
  "object_id": "7c800a30-4cd8-45e2-ac4a-710d0c0463e1",
  "object_type": "futures",
  "symbol": "/MESM26",
  "name": "Micro S&P 500 Index Futures",
  "futures_margin_requirement": 2646.6,
  "price": 7553,
  "bid_price": 7552.75,
  "ask_price": 7553,
  "previous_close": 7571.75,
  "one_day_percent_change": -0.00250...,
  "futures_ranking": 0
}
```

### Contract / instrument model
- **`object_id`** — a UUID v4 (the futures instrument id; same ephemeral-UUID pattern
  as options).
- **`symbol`** — leading-slash CME root + month/year code: `/ESM26`, `/MESM26`,
  `/MNQM26`, `/MGCQ26`, `/MCLN26`, `/M6EM26`, `/MBTM26`. (`M` prefix = micro; trailing
  `M26`/`N26`/`Q26` = Jun/Jul/Aug 2026 expiry.)
- Quote fields embedded in the list row: `bid_price` / `ask_price` / `price` (last) /
  `previous_close` / `one_day_percent_change` / `futures_margin_requirement`.

### Enumerable universe confirmed (read-only, with live bid/ask)

| List (list_id) | Sample real contracts |
|----------------|-----------------------|
| Futures `12442aa7-…` (48 items) | `/MESM26` /MES, `/ESM26` E-mini S&P, `/MNQM26`, `/NQM26`, `/MGCQ26` gold, `/ESM26`, `/MCLN26` crude, `/M6EM26` euro, `/MBTM26` BTC, `/M2KM26` Russell, `/MYMM26` Dow |
| Energy `034df5f9-…` (5) | `/CLN26` crude, `/MCLN26`, `/NGN26` nat gas, `/MNGN26`, `/RBN26` gasoline |
| Metals `fe1b7cd0-…` (8) | `/GCQ26` gold, `/MGCQ26`, `/SIN26` silver, `/SILN26`, `/HGN26` copper, `/MHGN26` |
| Currency / FX `ad6c4c00-…` (12) | `/6EM26` euro, `/M6EM26`, `/6JM26` yen, `/6BM26` pound, `/6CM26` CAD, `/6AM26` AUD, `/6NM26` |
| Crypto `8d7b5508-…` (15) | `/BTCM26`, `/MBTM26`, `/ETHM26`, `/METM26`, `/SOLM26`, `/XRPM26`, `/BFFM2605` |

**404 (NOT reachable on the api host)** — the dedicated futures instrument/marketdata
endpoints do not exist on `api.robinhood.com` (they're presumably on ceres):
- `GET api.robinhood.com/futures/instruments/{object_id}/` → 404
- `GET api.robinhood.com/marketdata/futures/?ids={object_id}` → 404
- `GET api.robinhood.com/midlands/futures/instruments/{object_id}/` → 404

So quoting works **only** through the curated `lists/items/` path, which is fine for
read/watch but is not a clean per-contract marketdata API.

### CLI search caveat
`node cli/dist/index.js brokerage search "S&P futures"` returns only equity/ETP
`instruments[]` (VXX, SPYI, …) — the wrapper **drops the `lists`/futures objects**, so
it will never surface `/ESM26`. To enumerate real futures you must hit
`midlands/lists/items/?list_id=…` directly (as above). This is a gap if futures
read-enumeration is ever wanted as a first-class command.

---

## 3. Futures order endpoint (shape) — RESEARCH ONLY, UNVERIFIED

**Not reachable, not verified, nothing posted.** Because ceres refuses the TLS
handshake, the order endpoint cannot be observed from this environment. The
following is **inference labeled as research** — do NOT treat as a working body.

```
RESEARCH / UNVERIFIED — do not send
Method:  POST  (assumed)
Host:    ceres.robinhood.com   (TLS-walled; requires RH app TLS profile / likely mTLS)
Path:    likely  /api/v1/.../orders/  or  /orders/   (UNCONFIRMED — all api-host
         /futures/* paths 404; the real path was never observed)
Auth:    UNKNOWN — brokerage bearer may not even apply; the handshake fails first,
         so we have zero evidence the bearer is accepted on this host.
Body:    UNKNOWN. By analogy to RH options orders it would carry something like
         account, a futures instrument id (object_id UUID), side (buy/sell),
         quantity (contracts), order type (market/limit), limit price,
         time_in_force, ref_id — but NONE of these field names are confirmed for
         futures. Treat as a guess.
```

To ever verify this you would need to capture it from the Robinhood **mobile/desktop
app** (not a browser) with the network proxy that the app's TLS allows — out of scope
for read-only work and gated behind futures onboarding this account hasn't done.

---

## 4. FX — real FX trading or currency-as-crypto only?

**Robinhood offers no spot-FX product.** Evidence:
- `currency_pairs` in every `midlands/search/?query=…` response is **`[]`** (checked
  for `futures`, `EUR`, `DXY`).
- `GET api.robinhood.com/forex/` → 404; `GET api.robinhood.com/fx/quotes/` → 404.
- `query=EUR` returns only ETPs/stocks (VGK, FEZ, IEUR, EZU) — equity proxies.

Currency exposure on Robinhood is available only as:
1. **Currency futures** (read-only here): `/6EM26` euro, `/6JM26` yen, `/6BM26` pound,
   `/6CM26` CAD, `/6AM26` AUD, `/6NM26` — real CME FX futures, quote-only via the
   Currency Futures list, **not placeable** (ceres-walled).
2. **Crypto currency pairs** — a separate product on the official Crypto Trading API
   (Ed25519-signed, `trading.robinhood.com`), unrelated to brokerage FX.

**DXY (dollar index):** not directly tradable. `query=DXY` → only `DXYZ` (an unrelated
closed-end fund). "dollar index" surfaces ETF/options/"Stock Index Futures" lists, not
a DXY instrument. Dollar-index-like exposure on RH = the inverse currency futures
above (read-only).

---

## 5. Commodities — real futures vs ETF proxies?

**Both exist, but only the ETF proxies are placeable here.**
- **Real commodity futures (read-only):** Energy (`/CLN26` crude, `/NGN26` nat gas,
  `/RBN26` gasoline, micros) and Metals (`/GCQ26` gold, `/SIN26` silver, `/HGN26`
  copper, `/1OZQ26`, micros) quote live via their lists — but route through ceres for
  trading, so **not placeable** via this CLI.
- **ETF/ETN proxies (placeable):** USO (oil), plus the VIX-futures ETPs (UVXY, VXX,
  UVIX, VIXY, SVIX, SVXY) and BITO returned as normal `type=etp` equity instruments —
  these trade through the **existing equity engine** (`brokerage buy`, `orders/`),
  fully supported and gated as usual. They are proxies, not the underlying futures.

---

## What's confirmed placeable vs read-only vs unsupported

- **Placeable now (existing engine):** equity/ETP commodity & volatility proxies
  (USO, UVXY, VXX, BITO, …) via `brokerage buy` / `orders/`. Env-gated as usual.
- **Read-only (reachable api host):** real futures contracts incl. commodity & FX
  futures — symbols, names, margin requirement, bid/ask/last/prev-close — via
  `GET api.robinhood.com/midlands/lists/items/?list_id=<id>`.
- **Unsupported / unreachable:** all futures *trading* (account, marketdata-per-
  contract, orders) — host `ceres.robinhood.com` refuses TLS to every non-app client
  including a logged-in browser; futures also appears un-onboarded on this login.
  Spot FX does not exist on Robinhood at all.

## Suggested follow-ups (not done — read-only task)
1. Add a read-only `futures list` / `futures quote` CLI helper that hits
   `midlands/lists/items/` and exposes the futures `object_id` + bid/ask (closes the
   `brokerage search` blind spot for futures).
2. Record `ceres.robinhood.com` in the route map as **transport-blocked
   (app-only TLS), trading not reachable** so future agents don't re-probe it.
3. Any futures order-body verification requires an app-level (mobile/desktop) capture
   plus completing futures onboarding — explicitly out of scope for the bearer-token
   web/API surface this repo uses.

<!-- Zayd Khan // cold // www.zayd.wtf -->
