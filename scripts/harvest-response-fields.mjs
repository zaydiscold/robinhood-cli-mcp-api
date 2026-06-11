#!/usr/bin/env node
// Harvest RESPONSE FIELD NAMES from captured API bodies and attach them to brokerage-routes.json as a
// `fields` slot (the response keys an agent actually reads off each endpoint). Automation-first, re-runnable:
// drop more __cap-format captures into capture-extension/captures/ and re-run to raise coverage.
//
// PRIVACY: extracts KEY NAMES ONLY (e.g. "equity", "account_number") — never values. Captures hold real
// balances/account numbers; field names do not. Nothing sensitive can reach the committed route map.
//
// Usage:
//   node scripts/harvest-response-fields.mjs                 # report coverage only (dry, no write)
//   node scripts/harvest-response-fields.mjs --write         # attach fields + write brokerage-routes.json
//   node scripts/harvest-response-fields.mjs --write a.json  # add extra capture file(s) as sources
//
// A capture source is a JSON array of rows shaped like the api-capture-kit interceptor emits:
//   { url, method, status, respBody (string|object), via }
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = join(repoRoot, "api-map", "brokerage-routes.json");
const CAPTURE_DIR = join(repoRoot, "capture-extension", "captures");

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const extraFiles = args.filter((a) => !a.startsWith("--"));

// Collapse every placeholder ({uuid}/{id}/{num}/{account}/…) AND every raw uuid/long-id/date to a single
// wildcard, so a capture's `/portfolios/{uuid}/` matches the route map's `/portfolios/{num}/` regardless of
// token name. Path structure is preserved, so `/orders/{*}/` stays distinct from `/orders/{*}/cancel/`.
function collapse(pathname) {
  return decodeURIComponent(pathname)
    .replace(/\{[^}]+\}/g, "{*}")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{*}")
    .replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, "/{*}")
    .replace(/\/\d{5,}(?=\/|$)/g, "/{*}")
    .replace(/\/[A-Za-z0-9_-]{32,}(?=\/|$)/g, "/{*}");
}

// A paginated list looks like { results:[...], next, previous }. For those the useful fields are the ITEM
// keys, not ["results","next","previous"]. Returns { keys, shape }.
function extractKeys(body) {
  let obj = body;
  if (typeof body === "string") {
    try { obj = JSON.parse(body); } catch { return null; }
  }
  if (obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    const item = obj.find((x) => x && typeof x === "object" && !Array.isArray(x));
    return item ? { keys: Object.keys(item), shape: "list" } : null;
  }
  const top = Object.keys(obj);
  const isPage = Array.isArray(obj.results) && top.every((k) => ["results", "next", "previous"].includes(k));
  if (isPage) {
    const item = obj.results.find((x) => x && typeof x === "object" && !Array.isArray(x));
    return item ? { keys: Object.keys(item), shape: "list" } : { keys: top, shape: "list" };
  }
  return { keys: top, shape: "object" };
}

function loadCaptureRows(file) {
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { return []; }
  const rows = Array.isArray(data) ? data : (data.__cap || data.results || data.__rhcap || []);
  return Array.isArray(rows) ? rows : [];
}

// 1. Gather capture sources.
const sources = [];
if (existsSync(CAPTURE_DIR)) {
  for (const f of readdirSync(CAPTURE_DIR)) if (f.endsWith(".json")) sources.push(join(CAPTURE_DIR, f));
}
for (const f of extraFiles) sources.push(join(repoRoot, f));

// 2. Harvest: matchKey (METHOD origin collapsedPath) -> { keys:Set, shape, captures:Set }.
const harvested = new Map();
let rowsSeen = 0, rowsUsed = 0;
for (const src of sources) {
  for (const r of loadCaptureRows(src)) {
    rowsSeen++;
    if (!r || !r.url || r.respBody == null) continue;
    let u; try { u = new URL(r.url); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const extracted = extractKeys(r.respBody);
    if (!extracted || extracted.keys.length === 0) continue;
    const method = (r.method || "GET").toUpperCase();
    const key = `${method} ${u.origin}${collapse(u.pathname)}`;
    const g = harvested.get(key) || { keys: new Set(), shape: extracted.shape, captures: new Set() };
    for (const k of extracted.keys) g.keys.add(k);
    g.captures.add(src.split("/").pop());
    harvested.set(key, g);
    rowsUsed++;
  }
}

// 3. Attach to routes. A route matches a harvest key if origin+collapsedPath agree and the route declares
//    (or omits) that method.
const routes = JSON.parse(readFileSync(ROUTES, "utf8"));
let attached = 0;
const matchedKeys = new Set();
for (const route of routes) {
  let ru; try { ru = new URL(route.url); } catch { continue; }
  const cp = collapse(ru.pathname);
  const methods = (route.methods && route.methods.length ? route.methods : ["GET"]).map((m) => m.toUpperCase());
  const union = new Set();
  let shape, hitKey;
  for (const m of methods) {
    const key = `${m} ${ru.origin}${cp}`;
    const g = harvested.get(key);
    if (g) { for (const k of g.keys) union.add(k); shape = g.shape; hitKey = key; matchedKeys.add(key); }
  }
  if (union.size > 0) {
    route.fields = [...union].sort();
    route.fieldsSource = "verified";
    route.fieldsShape = shape;
    attached++;
  }
}

// 3b. Inferred overlay — apply documented-but-uncaptured field shapes ONLY where no verified fields exist.
const OVERLAY = join(repoRoot, "api-map", "inferred-response-fields.json");
let inferred = 0;
if (existsSync(OVERLAY)) {
  const overlay = JSON.parse(readFileSync(OVERLAY, "utf8")).overlay || [];
  for (const route of routes) {
    if (route.fieldsSource === "verified") continue;
    const methods = (route.methods && route.methods.length ? route.methods : ["GET"]).map((m) => m.toUpperCase());
    const hit = overlay.find((o) => route.url.includes(o.match) && (!o.method || methods.includes(o.method.toUpperCase())));
    if (hit) { route.fields = [...hit.fields].sort(); route.fieldsSource = "inferred"; route.fieldsShape = "object"; inferred++; }
  }
}

// 3c. Uniform stub — every remaining route gets the slot so the schema is consistent and re-running the
//     harvester against a fresh capture upgrades it in place. Honest provenance: not yet documented.
let stubbed = 0;
for (const route of routes) {
  if (route.fields === undefined) { route.fields = []; route.fieldsSource = "undocumented"; stubbed++; }
}

// 4. Report. Provenance is recomputed from the final route set so the numbers are correct on every run
// (not just first), incl. re-runs where every route already carries a slot.
const harvestedCount = harvested.size;
const unmatched = [...harvested.keys()].filter((k) => !matchedKeys.has(k));
const finalCov = { verified: 0, inferred: 0, undocumented: 0 };
for (const r of routes) finalCov[r.fieldsSource ?? "undocumented"]++;
console.error(`capture sources: ${sources.length} | rows seen: ${rowsSeen} | rows with usable body: ${rowsUsed}`);
console.error(`distinct harvested endpoints: ${harvestedCount} | this run attached: ${attached} verified, ${inferred} inferred, ${stubbed} newly stubbed`);
console.error(`fields provenance (final) -> verified: ${finalCov.verified} | inferred: ${finalCov.inferred} | undocumented: ${finalCov.undocumented} | total: ${routes.length}`);
console.error(`harvested endpoints with NO matching route (candidates to add): ${unmatched.length}`);
for (const k of unmatched.slice(0, 20)) console.error(`   - ${k}`);

if (WRITE) {
  writeFileSync(ROUTES, JSON.stringify(routes, null, 2) + "\n");
  console.error(`\nWROTE ${ROUTES} (${attached} routes now carry verified response fields)`);
} else {
  console.error(`\n(dry run — pass --write to persist fields onto brokerage-routes.json)`);
}

// made with love by Zayd Khan / cold
