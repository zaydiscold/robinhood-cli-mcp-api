import { existsSync } from "node:fs";
import { isAbsolute, win32, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Keep bootstrap authentication independent of a completed TypeScript build.
export function resolveAuthBash(
  platform = process.platform,
  env = process.env,
  exists = existsSync,
) {
  const override = env.ROBINHOOD_BASH_PATH;
  if (override) {
    const absolute = platform === "win32" ? win32.isAbsolute(override) : isAbsolute(override);
    if (!absolute || !exists(override))
      throw new Error("ROBINHOOD_BASH_PATH must name an existing absolute Bash path.");
    return override;
  }
  if (platform !== "win32") return "/bin/bash";
  for (const path of [
    "C:/Program Files/Git/usr/bin/bash.exe",
    "C:/Program Files/Git/bin/bash.exe",
    "/bin/bash",
    "/usr/bin/bash",
  ]) {
    if (exists(path)) return path;
  }
  throw new Error(
    "Install Git for Windows or set ROBINHOOD_BASH_PATH to its absolute bash.exe path.",
  );
}

export function runAuthRefresh({
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  spawn = spawnSync,
} = {}) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = spawn(resolveAuthBash(platform, env, exists), ["scripts/refresh-auth.sh"], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw new Error("Unable to start the configured Bash executable.");
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runAuthRefresh();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
