import { spawnSync } from "node:child_process";

const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
const tests = ["scripts/test_auth_session.py", "scripts/test_auth_candidate_selection.py"];
for (const candidate of candidates) {
  const probeArgs = candidate === "py" ? ["-3", "--version"] : ["--version"];
  const probe = spawnSync(candidate, probeArgs, { stdio: "ignore" });
  if (probe.error && probe.error.code === "ENOENT") continue;
  if (probe.status !== 0) continue;
  for (const test of tests) {
    const args = candidate === "py" ? ["-3", test] : [test];
    const result = spawnSync(candidate, args, { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  process.exit(0);
}
console.error("No Python 3 interpreter found (tried: " + candidates.join(", ") + ")");
process.exit(1);
