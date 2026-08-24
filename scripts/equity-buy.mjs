#!/usr/bin/env node
// Legacy batch-compatible front end for the canonical equity-order engine.
//
// This file intentionally performs no brokerage HTTP writes of its own. Every order goes through
// cli/dist/lib.js -> placeEquityOrder(), so account ownership, dry-run policy, duplicate checks,
// notional caps, ref_id handling, trading-log entries, and post-send order evidence stay identical
// to the CLI and MCP surfaces.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB_PATH = join(REPO, "cli", "dist", "lib.js");
const args = process.argv.slice(2);

const has = (name) => args.includes(`--${name}`);
const value = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const splitCsv = (raw) =>
  String(raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
  throw new Error(message);
};
const positiveNumber = (raw, label) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`${label} must be a positive number`);
  return parsed;
};
const parseTimeInForce = (raw) => {
  if (raw == null) return undefined;
  const value = String(raw).toLowerCase();
  if (value !== "gfd" && value !== "gtc") fail("--tif must be gfd or gtc");
  return value;
};
const parseMarketHours = (raw) => {
  if (raw == null) return undefined;
  const aliases = {
    regular: "regular_hours",
    regular_hours: "regular_hours",
    extended: "extended_hours",
    extended_hours: "extended_hours",
    overnight: "all_day_hours",
    "24-hour": "all_day_hours",
    all_day_hours: "all_day_hours",
  };
  const resolved = aliases[String(raw).toLowerCase()];
  if (!resolved) fail("--market-hours must be regular, extended, or overnight");
  return resolved;
};

if (!existsSync(LIB_PATH)) {
  fail("cli/dist/lib.js is missing. Run `pnpm build` before using scripts/equity-buy.mjs.");
}

const engine = await import(pathToFileURL(LIB_PATH).href);
const { brokerageGetJson, placeEquityOrder } = engine;

async function ownedAccounts() {
  const response = await brokerageGetJson("https://bonfire.robinhood.com/transfer/accounts/");
  const rows = Array.isArray(response) ? response : (response?.results ?? []);
  return rows
    .filter(
      (row) =>
        row?.account_number &&
        !row?.is_external &&
        String(row?.type ?? "").toLowerCase() !== "ach",
    )
    .map((row) => ({
      accountNumber: String(row.account_number),
      type: String(row.type ?? row.brokerage_account_type ?? "unknown"),
    }));
}

async function symbolsForAccount(accountNumber) {
  const response = await brokerageGetJson(
    "https://api.robinhood.com/positions/?account_number={account_number}&nonzero=true",
    { account_number: accountNumber },
  );
  const positions = Array.isArray(response?.results) ? response.results : [];
  const ids = positions
    .map((position) =>
      String(position?.instrument ?? "")
        .split("/")
        .filter(Boolean)
        .at(-1),
    )
    .filter(Boolean);
  const symbols = [];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const instruments = await brokerageGetJson(
      "https://api.robinhood.com/instruments/?ids={ids}",
      { ids: batch.join(",") },
    );
    for (const instrument of instruments?.results ?? []) {
      if (instrument?.symbol) symbols.push(String(instrument.symbol).toUpperCase());
    }
  }
  return [...new Set(symbols)];
}

if (has("preflight")) {
  const accounts = await ownedAccounts();
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        ownedAccounts: accounts.map((account) => ({
          account: `…${account.accountNumber.slice(-4)}`,
          type: account.type,
        })),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const dollarsRaw = value("dollars");
const sharesRaw = value("shares");
if ((dollarsRaw == null) === (sharesRaw == null)) {
  fail("Pass exactly one of --dollars <amount> or --shares <quantity>.");
}
const amount = dollarsRaw == null ? undefined : positiveNumber(dollarsRaw, "--dollars");
const shares = sharesRaw == null ? undefined : positiveNumber(sharesRaw, "--shares");
const explicitPriceRaw = value("price") ?? value("limit");
const limitPrice =
  explicitPriceRaw == null ? undefined : positiveNumber(explicitPriceRaw, "--price/--limit");
const timeInForce = parseTimeInForce(value("tif"));
const marketHours = parseMarketHours(value("market-hours"));
const delayMsRaw = value("delay") ?? "2500";
const delayMs = Number(delayMsRaw);
if (!Number.isFinite(delayMs) || delayMs < 0) fail("--delay must be a non-negative number");

const accountList = value("accounts")
  ? splitCsv(value("accounts"))
  : value("account")
    ? [String(value("account"))]
    : [];
if (!accountList.length) fail("Pass --account <number> or --accounts <number,number>.");

let jobs = [];
if (has("all-positions")) {
  if (accountList.length !== 1) fail("--all-positions requires exactly one --account.");
  const symbols = await symbolsForAccount(accountList[0]);
  jobs = symbols.map((symbol) => ({ account: accountList[0], symbol }));
} else {
  const symbols = value("symbols")
    ? splitCsv(value("symbols")).map((symbol) => symbol.toUpperCase())
    : value("symbol")
      ? [String(value("symbol")).toUpperCase()]
      : [];
  if (!symbols.length) fail("Pass --symbol <ticker>, --symbols <ticker,ticker>, or --all-positions.");
  jobs = accountList.flatMap((account) => symbols.map((symbol) => ({ account, symbol })));
}

const liveRequested = has("live");
const liveEnabled = liveRequested && process.env.ROBINHOOD_ALLOW_LIVE_WRITE === "1";
if (liveRequested && !liveEnabled) {
  process.stderr.write(
    "--live was requested, but ROBINHOOD_ALLOW_LIVE_WRITE=1 is not set. Running dry-run only.\n",
  );
}

const receipts = [];
for (let index = 0; index < jobs.length; index += 1) {
  const job = jobs[index];
  try {
    const result = await placeEquityOrder({
      symbol: job.symbol,
      accountNumber: job.account,
      side: "buy",
      amount,
      shares,
      limitPrice,
      timeInForce,
      marketHours,
      dryRun: !liveEnabled,
      liveWrite: liveRequested,
      force: has("force"),
      overrideCap: has("override-cap"),
    });
    receipts.push({
      account: `…${job.account.slice(-4)}`,
      symbol: result.symbol,
      mode: result.dryRun ? "dry_run" : "live",
      type: result.type,
      shares: result.shares,
      estimatedPrice: result.estimatedPrice,
      estimatedTotal: result.estimatedTotal,
      marketHours: result.marketHours,
      session: result.session ?? null,
      sessionWarning: result.sessionWarning ?? null,
      orderId: result.orderId,
      state: result.state,
      httpStatus: result.httpStatus,
      evidence: result.evidence ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    receipts.push({
      account: `…${job.account.slice(-4)}`,
      symbol: job.symbol,
      mode: liveEnabled ? "live" : "dry_run",
      error: message,
    });
    if (/not enough buying power|purchase 0 shares/i.test(message)) break;
  }
  if (delayMs > 0 && index < jobs.length - 1) await sleep(delayMs);
}

process.stdout.write(`${JSON.stringify({ liveRequested, liveEnabled, receipts }, null, 2)}\n`);
