import { readFileSync, writeFileSync } from "node:fs";
const PATH = new URL("../api-map/brokerage-routes.json", import.meta.url);
const r = JSON.parse(readFileSync(PATH, "utf8"));

const U = "https://bonfire.robinhood.com/recurring_schedules/{0}/";
const e = r.find((x) => (x.url || x.url_template) === U);
if (e) {
  // Strip GET off the destructive entry so reads aren't blocked by the write gate.
  e.methods = ["PATCH", "DELETE"];
  e.summary = "Resume/pause a recurring buy (PATCH {\"state\":\"active\"} to resume, {\"state\":\"paused\"} to pause) or DELETE it. Resume/pause reversible; DELETE is not.";
  e.note = "VERIFIED 2026-05-29: PATCH {\"state\":\"active\"} resumes (200, next_investment_date populates); state field round-trips. DELETE unverified.";
}
// Separate sensitive-read entry for the single-schedule GET.
if (!r.some((x) => (x.url || x.url_template) === U && (x.methods || [x.method]).includes("GET"))) {
  r.push({
    url: U,
    host: "bonfire.robinhood.com",
    categories: ["recurring"],
    risk: "sensitive-read",
    methods: ["GET"],
    summary: "Get one recurring schedule (state, next_investment_date, amount).",
    source: "fix-recurring-read-gate 2026-05-29",
  });
}
writeFileSync(PATH, JSON.stringify(r, null, 2) + "\n");
console.log("routes:", r.length);

// Zayd Khan // cold // www.zayd.wtf
