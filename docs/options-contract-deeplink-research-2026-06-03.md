# Options Contract Deeplink Research - 2026-06-03

This note records the current contract-level deeplink finding for Robinhood
options. It is an authorized, user-owned workflow research note. It is not a
claim that cross-user account routing is possible, and it is not permission to
send live orders.

## What Was Found

- The browser options-chain route can be used as an account-scoped shell:
  `https://robinhood.com/options/chains/<SYMBOL>?account_number=<ACCOUNT_NUMBER>`.
- The web URL does not currently provide a proven location-bar encoding for
  expiration, strike, buy/sell side, or call/put side. The CLI now emits those
  as probe candidates, not as proven state.
- The Android app has a source-backed external option-chain route:
  `robinhood://option_chain?chain_id=<CHAIN_ID>&source=<SOURCE>` and the
  equivalent `https://robinhood.com/option_chain?chain_id=<CHAIN_ID>&source=<SOURCE>`.
  The target reads `chain_id` and `source`; it does **not** parse
  `account_number`.
- The Android app also has `option_chains?chain_ids=<ID1,ID2>&source=<SOURCE>`
  for multiple chain IDs.
- The reliable exact-contract path is API resolution:
  `chains -> instruments filtered by expiration/type/strike -> marketdata/options -> strategy quote -> dry-run options/orders body`.
- The Android decompile confirms Robinhood's internal option chain navigation
  carries the fields we need to model:
  `equityInstrumentId`, `optionChainIdLaunchMode`, `launchMode`, `targetLegs`,
  `targetStrikePrice`, `initialFilter`, `initialAccountNumber`, and `source`.
- The Android decompile also confirms held option-position deeplinks:
  `option_position?id=<OPTION_POSITION_ID>` and
  `aggregate_option_position?id=<AGGREGATE_POSITION_ID>&account_number=<ACCOUNT_NUMBER>`.
- Order-form and pending-order deeplinks are ID based:
  `option_position_open?id=<AGGREGATE_POSITION_ID>&account_number=<ACCOUNT_NUMBER>`,
  `option_position_close?id=<AGGREGATE_POSITION_ID>&account_number=<ACCOUNT_NUMBER>`,
  `pending_option_order_replace?id=<ORDER_ID>&account_number=<ACCOUNT_NUMBER>`,
  and `pending_option_order_cancel?id=<ORDER_ID>&account_number=<ACCOUNT_NUMBER>`.

## Why It Matters

The user can ask for a precise contract like:

```bash
robinhood-cli api-map options-contract-deeplink \
  --account <ACCOUNT_NUMBER> \
  --symbol XBI \
  --expiration 2026-06-26 \
  --type call \
  --side buy \
  --strike 127 \
  --json
```

That command now returns:

- observed web account-context URL;
- candidate web query/fragment variants for expiration, strike, side, and type;
- source-backed `option_chain?chain_id=<CHAIN_ID>` app/web route shapes;
- candidate symbol/expiration/strike `robinhood://options/chains/<SYMBOL>`
  app-scheme URL;
- observed held-position mobile deeplink shapes when position ids are supplied;
- observed aggregate-position open/close and pending-order cancel/replace mobile
  deeplink shapes when those ids are supplied;
- deterministic API lookup steps;
- exact-match checklist before any order body is trusted;
- dry-run single-leg `options/orders/` handoff template.

This gives agents a method that can work across different stocks and contracts:
they do not scrape the visible chain row and guess. They resolve the exact
instrument id and then only use browser/app deeplinks as navigation aids.

## Evidence

Local clone:

```text
/private/tmp/robinhood-decompiled-research
commit 938bbc45e033f4a2c6667de7a9727b2851fd618f
```

DeepWiki/GitHub triage:

- `https://deepwiki.com/ScriptedAlchemy/robinhood-decompiled` loaded locally and
  pointed at the same Android package/deeplink/options areas.
- `https://codewiki.com/ScriptedAlchemy/robinhood-decompiled` returned 404/no
  usable repo page during this pass.
- GitHub README says to start from `app/sources/`, `audit/sources/`,
  `audit/protos/`, `audit/reports/`, and the manifest.

Manifest/app-scheme evidence:

```text
app/resources/deeplink.properties
scheme=robinhood
```

`audit/manifest/AndroidManifest.xml` accepts these resolver surfaces:

```text
https://robinhood.com
https://www.robinhood.com
https://applink.robinhood.com
robinhood://
join.robinhood.com
robinhood-restricted://
```

Option chain navigation key:

```text
audit/sources/com/robinhood/android/options/contracts/OptionChainIntentKey.java
```

Relevant fields:

```text
equityInstrumentId
optionChainIdLaunchMode
launchMode
targetLegs
targetStrikePrice
initialFilter
selectedSentiment
forceOptionWatchlistEducation
initialAccountNumber
source
```

Option order navigation key:

```text
audit/sources/com/robinhood/android/options/contracts/OptionOrderIntentKey.java
```

Relevant fields:

```text
initialAccountNumber
optionOrderBundle
orderToReplace
orderIdToPlaceAgain
prefilledOrderType
prefilledTimeInForce
chainDisplayModeForLogging
source
strategyCode
transitionReason
```

Held-position mobile deeplinks:

```text
audit/sources/com/robinhood/android/options/p208ui/targets/OptionPositionDeeplinkTarget.java
audit/sources/com/robinhood/android/options/p208ui/targets/AggregateOptionPositionDeeplinkTarget.java
```

`OptionPositionDeeplinkTarget` reads:

```text
id
show_in_tab
```

`AggregateOptionPositionDeeplinkTarget` reads:

```text
id
account_number
show_in_tab
```

Option-chain target:

```text
app/sources/com/robinhood/android/optionschain/targets/OptionChainDeeplinkTarget.java
```

`OptionChainDeeplinkTarget` reads:

```text
chain_id
source
```

It constructs `OptionChainIntentKey(..., initialAccountNumber=null, source=source)`.
This is the key account-context boundary: `OptionChainIntentKey` can carry
`initialAccountNumber` internally, but this external target does not parse
`account_number`.

Option open/close order-form targets:

```text
audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets2.java
audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets3.java
```

They read:

```text
id
account_number
source
```

Pending option-order management targets:

```text
audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets.java
audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets4.java
```

They read:

```text
id
account_number
```

## Reproducibility

Research commands used:

```bash
git clone --depth 1 https://github.com/ScriptedAlchemy/robinhood-decompiled /private/tmp/robinhood-decompiled-research
cd /private/tmp/robinhood-decompiled-research
rg -n "OptionChainIntentKey|OptionOrderIntentKey|option_position|aggregate_option_position|account_number" audit/sources app/sources
sed -n '1,230p' audit/sources/com/robinhood/android/options/contracts/OptionChainIntentKey.java
sed -n '1,180p' audit/sources/com/robinhood/android/options/contracts/OptionOrderIntentKey.java
sed -n '1,120p' app/sources/com/robinhood/android/optionschain/targets/OptionChainDeeplinkTarget.java
sed -n '1,120p' audit/sources/com/robinhood/android/options/p208ui/targets/AggregateOptionPositionDeeplinkTarget.java
sed -n '1,115p' audit/sources/com/robinhood/android/options/p208ui/targets/OptionPositionDeeplinkTarget.java
sed -n '1,120p' audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets2.java
sed -n '1,120p' audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets3.java
sed -n '1,120p' audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets.java
sed -n '1,120p' audit/sources/com/robinhood/android/trade/options/targets/OptionOrderTargets4.java
```

CLI verification command:

```bash
robinhood-cli api-map options-contract-deeplink \
  --account ACCOUNT_TEST \
  --symbol XBI \
  --expiration 2026-06-26 \
  --type call \
  --side buy \
  --strike 127 \
  --chain-id CHAIN_TEST \
  --option-id OPTION_TEST \
  --json
```

## Current Boundaries

- `account_number` on the web chain shell is observed from browser research.
- External Android `option_chain` does not parse `account_number` in the current
  decompiled target. A phone test may still verify app UX, but the route source
  says account specificity is not encoded there.
- Contract-specific web query keys are candidates until validated on a logged-in
  browser across multiple symbols/contracts.
- `robinhood://option_position` and `robinhood://aggregate_option_position`
  are observed Android deeplink targets for held positions, not unopened
  contracts.
- `robinhood://option_position_open`, `robinhood://option_position_close`,
  `robinhood://pending_option_order_replace`, and
  `robinhood://pending_option_order_cancel` are observed Android targets for
  existing aggregate positions or pending orders, not symbol-only fresh contract
  selection.
- For unopened contracts, the exact route remains API-first.
- Live order sending remains blocked by exact approval, `--live-write`, and
  `ROBINHOOD_ALLOW_LIVE_WRITE=1`.
