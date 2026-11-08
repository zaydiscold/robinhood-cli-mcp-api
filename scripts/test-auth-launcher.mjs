import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthBash, runAuthRefresh } from "./run-auth-refresh.mjs";

test("Unix bootstrap never resolves Bash through PATH", () => {
  assert.equal(resolveAuthBash("darwin", { PATH: "/untrusted" }), "/bin/bash");
  assert.equal(resolveAuthBash("linux", {}), "/bin/bash");
});
test("Windows selects Git Bash without invoking the WSL launcher", () => {
  const path = "C:/Program Files/Git/bin/bash.exe";
  assert.equal(
    resolveAuthBash("win32", {}, (candidate) => candidate === path),
    path,
  );
  assert.throws(() => resolveAuthBash("win32", {}, () => false), /Git for Windows/);
});
test("override must exist and be absolute on the target platform", () => {
  assert.throws(
    () => resolveAuthBash("win32", { ROBINHOOD_BASH_PATH: "bash.exe" }, () => true),
    /absolute/,
  );
  assert.throws(
    () => resolveAuthBash("linux", { ROBINHOOD_BASH_PATH: "/missing/bash" }, () => false),
    /existing/,
  );
  assert.equal(
    resolveAuthBash("win32", { ROBINHOOD_BASH_PATH: "D:\\Git\\bin\\bash.exe" }, () => true),
    "D:\\Git\\bin\\bash.exe",
  );
});
test("launcher preserves environment, repository cwd, and failure status without a shell", () => {
  const env = { ROBINHOOD_NO_CDP: "1" };
  const status = runAuthRefresh({
    platform: "linux",
    env,
    spawn(command, args, options) {
      assert.equal(command, "/bin/bash");
      assert.deepEqual(args, ["scripts/refresh-auth.sh"]);
      assert.equal(options.env, env);
      assert.equal(options.shell, false);
      assert.equal(options.cwd, fileURLToPath(new URL("../", import.meta.url)));
      return { status: 7 };
    },
  });
  assert.equal(status, 7);
});
test("signals and spawn failures cannot report success", () => {
  assert.equal(runAuthRefresh({ platform: "linux", env: {}, spawn: () => ({ status: null }) }), 1);
  assert.throws(
    () =>
      runAuthRefresh({ platform: "linux", env: {}, spawn: () => ({ error: new Error("failed") }) }),
    /Unable to start/,
  );
});
