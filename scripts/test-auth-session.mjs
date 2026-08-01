import { spawnSync } from "node:child_process";

const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
for (const candidate of candidates) {
  const args = candidate === "py" ? ["-3", "scripts/test_auth_session.py"] : ["scripts/test_auth_session.py"];
  const result = spawnSync(candidate, args, { stdio: "inherit" });
  if (result.error && result.error.code === "ENOENT") continue;
  process.exit(result.status ?? 1);
}
console.error("No Python 3 interpreter found (tried: " + candidates.join(", ") + ")");
process.exit(1);
