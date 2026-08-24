import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface PackageManifest {
  bin: Record<string, string>;
  types: string;
  exports: Record<string, { types: string; import: string }>;
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
) as PackageManifest;

describe("published package boundary", () => {
  it("keeps the executable and library entrypoints separate", () => {
    expect(manifest.bin["robinhood-cli"]).toBe("dist/index.js");
    expect(manifest.types).toBe("./dist/lib.d.ts");
    expect(manifest.exports["."]).toEqual({
      types: "./dist/lib.d.ts",
      import: "./dist/lib.js",
    });
    expect(manifest.exports["./lib"]).toEqual(manifest.exports["."]);
  });

  it("imports the built package root without parsing the host process arguments", () => {
    const runtimeTarget = manifest.exports["."]?.import;
    if (!runtimeTarget) throw new Error("Package root is missing a runtime export");
    const runtimePath = join(packageRoot, runtimeTarget.replace(/^\.\//, ""));

    // The workspace CI builds before running Vitest. A direct source-only test still validates
    // the manifest contract above without creating build artifacts as a test side effect.
    if (!existsSync(runtimePath)) return;

    const importScript = `const mod = await import(${JSON.stringify(pathToFileURL(runtimePath).href)}); if (typeof mod.repositoryRoot !== "function") process.exit(2);`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", importScript, "--", "--definitely-not-a-cli-command"],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: { ...process.env, ROBINHOOD_ALLOW_LIVE_WRITE: "0" },
        timeout: 10_000,
      },
    );

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
  });
});
