import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../api-map/brokerage-routes.json", import.meta.url);
const r = JSON.parse(readFileSync(PATH, "utf8"));

const byUrl = (u) => r.find((x) => (x.url || x.url_template) === u);
const INFERRED = "inferred 2026-05-29: body shape unverified, confirm via live capture before trusting";

// --- 1. Normalize blank-method order cancels -> POST ---
for (const u of [
  "https://api.robinhood.com/orders/{0}/cancel/",
  "https://api.robinhood.com/options/orders/{0}/cancel/",
  "https://nummus.robinhood.com/orders/{0}/cancel/",
]) {
  const e = byUrl(u);
  if (e) { e.methods = ["POST"]; e.summary = "Cancel an order (no body)."; e.source = (e.source ? e.source + "; " : "") + "wire-writes 2026-05-29"; }
}

// --- 2. ACH money-movement writes ---
{
  const rel = byUrl("https://api.robinhood.com/ach/relationships/");
  if (rel) { rel.methods = ["GET", "POST"]; rel.summary = "List (GET) or create (POST) an ACH bank link."; rel.bodyKeys = ["bank_routing_number", "bank_account_number", "bank_account_type", "bank_account_holder_name"]; rel.note = INFERRED; }
  const relId = byUrl("https://api.robinhood.com/ach/relationships/{0}/");
  if (relId) { relId.methods = ["GET", "DELETE"]; relId.summary = "Get (GET) or delete (DELETE) an ACH relationship."; }
  const unlink = byUrl("https://api.robinhood.com/ach/relationships/{0}/unlink/");
  if (unlink) { unlink.methods = ["POST"]; unlink.summary = "Unlink an ACH relationship (no body)."; }
  const tx = byUrl("https://api.robinhood.com/ach/transfers/");
  if (tx) { tx.methods = ["GET", "POST"]; tx.summary = "List (GET) or create (POST) an ACH transfer. direction=deposit moves money IN, direction=withdraw moves money OUT."; tx.bodyKeys = ["ach_relationship", "amount", "direction"]; tx.note = INFERRED; }
}

// --- 3. DRIP enable/disable + fix miscategorization ---
{
  const drip = byUrl("https://api.robinhood.com/corp_actions/drip/enrollment/{num}/");
  if (drip) {
    drip.methods = ["GET", "PATCH"];
    drip.categories = ["dividends"];
    drip.summary = "Read (GET) or toggle (PATCH) DRIP dividend-reinvestment enrollment for an account. PATCH body: {\"drip_enrolled\": true|false}.";
    drip.bodyKeys = ["drip_enrolled"];
    drip.note = INFERRED;
  }
}

// --- 4. Crypto (nummus) order placement ---
{
  const ord = byUrl("https://nummus.robinhood.com/orders/");
  if (ord) { ord.methods = ["GET", "POST"]; ord.summary = "List (GET) or place (POST) a crypto order."; ord.bodyKeys = ["account_id", "currency_pair_id", "side", "type", "quantity", "price", "time_in_force"]; ord.note = INFERRED; }
  const ordId = byUrl("https://nummus.robinhood.com/orders/{0}/");
  if (ordId) { ordId.methods = ["GET"]; ordId.summary = "Get a single crypto order."; }
}

// --- 5. Recurring investment writes (new entries) ---
const has = (u, m) => r.some((x) => (x.url || x.url_template) === u && (x.methods || [x.method]).includes(m));

if (!has("https://bonfire.robinhood.com/recurring_schedules/{0}/", "PATCH")) {
  r.push({
    url: "https://bonfire.robinhood.com/recurring_schedules/{0}/",
    host: "bonfire.robinhood.com",
    categories: ["recurring"],
    risk: "destructive",
    methods: ["GET", "PATCH", "DELETE"],
    summary: "Manage one recurring buy: GET status, PATCH to resume/pause (body {\"state\":\"active\"} to resume, {\"state\":\"paused\"} to pause), DELETE to remove. Resume/pause is reversible; DELETE is not.",
    bodyKeys: ["state"],
    note: INFERRED + " — state field confirmed on the schedule object; PATCH verb confirmed via OPTIONS.",
    source: "wire-writes 2026-05-29",
  });
}
if (!has("https://bonfire.robinhood.com/recurring_schedules/", "POST")) {
  r.push({
    url: "https://bonfire.robinhood.com/recurring_schedules/",
    host: "bonfire.robinhood.com",
    categories: ["recurring"],
    risk: "destructive",
    methods: ["POST"],
    summary: "Create a recurring buy.",
    bodyKeys: ["amount", "frequency", "investment_target", "source_of_funds", "start_date", "account_number"],
    note: INFERRED,
    source: "wire-writes 2026-05-29",
  });
}

writeFileSync(PATH, JSON.stringify(r, null, 2) + "\n");
console.log("routes after transform:", r.length);
