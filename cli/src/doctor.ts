import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type DoctorStatus = "pass" | "warn" | "fail";
export interface DoctorCheck { id: string; status: DoctorStatus; message: string; }

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Offline health report: never calls Robinhood and never prints credential values. */
export function runDoctor(root: string, env: NodeJS.ProcessEnv = process.env) {
  const checks: DoctorCheck[] = [];
  const add = (id: string, status: DoctorStatus, message: string) => checks.push({ id, status, message });
  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= 20 ? "pass" : "fail", `Node ${process.versions.node}; requires >=20`);

  const envPath = join(root, ".env");
  if (!existsSync(envPath)) add("auth", "warn", ".env is absent; reads will require injected auth or browser-token recovery");
  else {
    const mode = statSync(envPath).mode & 0o777;
    add("auth", "pass", "credential file exists (values not inspected)");
    add("env-permissions", (mode & 0o077) === 0 ? "pass" : "fail", `.env mode is ${mode.toString(8)}; expected 600 or stricter`);
  }

  const sourceMap = join(root, "api-map", "brokerage-routes.json");
  const distMap = join(root, "cli", "dist", "api-map", "brokerage-routes.json");
  if (!existsSync(sourceMap)) add("route-map", "fail", "source route map is missing");
  else if (!existsSync(distMap)) add("source-dist-parity", "warn", "built route map is missing; run the CLI build");
  else add("source-dist-parity", sha(sourceMap) === sha(distMap) ? "pass" : "fail", sha(sourceMap) === sha(distMap) ? "source and dist route maps match" : "source and dist route maps differ; rebuild before use");

  if (existsSync(sourceMap)) {
    const routes = JSON.parse(readFileSync(sourceMap, "utf8"));
    const rows: any[] = Array.isArray(routes) ? routes : routes.routes ?? [];
    const mutations = rows.filter((route) => (route.methods ?? []).some((method: string) => !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())));
    const inferred = mutations.filter((route) => route.verificationStatus === "inferred" || Object.values(route.verificationStatusByMethod ?? {}).includes("inferred"));
    add("route-provenance", inferred.length ? "warn" : "pass", `${inferred.length} mutation routes/methods are inferred and therefore forced to dry-run`);
  }

  const required = ["AGENTS.md", "SKILL.md", "docs/cli-mcp-architecture.md", "docs/write-operations.md"];
  const missing = required.filter((path) => !existsSync(join(root, path)));
  add("knowledge", missing.length ? "fail" : "pass", missing.length ? `missing: ${missing.join(", ")}` : "required operator knowledge files exist");
  add("live-write-gate", env.ROBINHOOD_ALLOW_LIVE_WRITE === "1" ? "warn" : "pass", env.ROBINHOOD_ALLOW_LIVE_WRITE === "1" ? "LIVE WRITES ARE ARMED in this process" : "live writes are safely disarmed");
  add("share-safe", env.ROBINHOOD_SHARE_SAFE === "1" ? "pass" : "warn", env.ROBINHOOD_SHARE_SAFE === "1" ? "share-safe output is enabled" : "share-safe output is off");
  add("mcp-profile", "pass", `MCP profile: ${env.ROBINHOOD_MCP_PROFILE ?? "full"}`);
  const fail = checks.filter((check) => check.status === "fail").length;
  const warn = checks.filter((check) => check.status === "warn").length;
  return { ok: fail === 0, summary: { pass: checks.length - fail - warn, warn, fail }, checks };
}
