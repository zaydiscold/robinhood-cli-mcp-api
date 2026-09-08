import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

function safeEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ROBINHOOD_ALLOW_LIVE_WRITE: "0",
    ROBINHOOD_BROKERAGE_TOKEN: "",
    ROBINHOOD_COOKIE: "",
    ROBINHOOD_CSRF: "",
  };
}

describe("published package boundary", () => {
  it("keeps executable and importable entrypoints separate", () => {
    expect(manifest.bin["robinhood-cli"]).toBe("dist/cli-entry.js");
    expect(manifest.bin["robinhood-tax"]).toBe("dist/tax-cli.js");
    expect(manifest.types).toBe("./dist/lib.d.ts");
    expect(manifest.exports["."]).toEqual({
      types: "./dist/lib.d.ts",
      import: "./dist/lib.js",
    });
    expect(manifest.exports["./lib"]).toEqual(manifest.exports["."]);
    expect(manifest.exports["./tax-reference"]).toEqual({
      types: "./dist/tax-reference.d.ts",
      import: "./dist/tax-reference.js",
    });
    expect(manifest.exports["./tax-strategy"]).toEqual({
      types: "./dist/tax-strategy.d.ts",
      import: "./dist/tax-strategy.js",
    });
  });

  it("isolates an installed package from a consuming repository and uses its configured data directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "rh-installed-"));
    try {
      mkdirSync(join(dir, ".git"));
      writeFileSync(join(dir, ".env"), "ROBINHOOD_CONSUMER_SENTINEL=wrong-root\n");
      const installed = join(dir, "node_modules", "@zaydiscold", "robinhood-cli");
      mkdirSync(installed, { recursive: true });
      cpSync(join(packageRoot, "dist"), join(installed, "dist"), { recursive: true });
      cpSync(join(packageRoot, "package.json"), join(installed, "package.json"));
      const data = join(dir, "operator-data");
      const script = `const m=await import(${JSON.stringify(pathToFileURL(join(installed, "dist/lib.js")).href)}); m.addTradeNote({ref:"synthetic",note:"installation check"}); console.log(JSON.stringify({knowledge:m.listKnowledge().length>0,doctorOk:m.runDoctor(m.repositoryRoot(),process.env,process.platform,m.operatorDataRoot()).ok,root:m.repositoryRoot(),data:m.operatorDataRoot(),env:m.defaultBrokerageEnvPath(),consumer:process.env.ROBINHOOD_CONSUMER_SENTINEL??null}));`;
      const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
        cwd: dir,
        encoding: "utf8",
        env: { ...safeEnvironment(), ROBINHOOD_DATA_DIR: data, ROBINHOOD_ENV_PATH: "" },
        timeout: 10000,
      });
      expect(child.status, child.stderr).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual({
        knowledge: true,
        doctorOk: true,
        root: realpathSync(installed),
        data,
        env: join(data, ".env"),
        consumer: null,
      });
      expect(existsSync(join(installed, "dist/scripts/refresh-auth.sh"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
        env: safeEnvironment(),
        timeout: 10_000,
      },
    );

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
  });

  it("imports the tax strategy API without initializing brokerage state", () => {
    const runtimeTarget = manifest.exports["./tax-strategy"]?.import;
    if (!runtimeTarget) throw new Error("Tax strategy API is missing a runtime export");
    const runtimePath = join(packageRoot, runtimeTarget.replace(/^\.\//, ""));
    if (!existsSync(runtimePath)) return;

    const importScript = [
      `const mod = await import(${JSON.stringify(pathToFileURL(runtimePath).href)});`,
      `const guide = mod.getTaxStrategyGuide({ strategy: "wheel", accountContext: "taxable" });`,
      `if (guide.strategy.id !== "wheel" || guide.tradeAuthorized !== false) process.exit(2);`,
    ].join(" ");
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval", importScript], {
      cwd: packageRoot,
      encoding: "utf8",
      env: safeEnvironment(),
      timeout: 10_000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stderr).not.toMatch(/token|auth|brokerage request/i);
  });

  it("routes tax research through the main binary without loading brokerage auth", () => {
    const binary = join(packageRoot, manifest.bin["robinhood-cli"]);
    if (!existsSync(binary)) return;

    const child = spawnSync(process.execPath, [binary, "tax", "section-1256", "--json"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: safeEnvironment(),
      timeout: 10_000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const result = JSON.parse(child.stdout) as Record<string, unknown>;
    expect(result).toMatchObject({
      matchCount: 1,
      notPersonalizedAdvice: true,
      topics: [expect.objectContaining({ id: "section-1256" })],
    });
    expect(child.stderr).not.toMatch(/token|auth|brokerage request/i);
  });

  it("routes strategy research through the main binary without loading brokerage auth", () => {
    const binary = join(packageRoot, manifest.bin["robinhood-cli"]);
    if (!existsSync(binary)) return;

    const child = spawnSync(
      process.execPath,
      [binary, "tax", "strategy", "covered call", "--account-context", "taxable", "--json"],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: safeEnvironment(),
        timeout: 10_000,
      },
    );

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const result = JSON.parse(child.stdout) as Record<string, unknown>;
    expect(result).toMatchObject({
      accountContext: "taxable",
      strategy: expect.objectContaining({ id: "covered-call" }),
      notPersonalizedAdvice: true,
      tradeAuthorized: false,
      filingResultDetermined: false,
    });
    expect(child.stderr).not.toMatch(/token|auth|brokerage request/i);
  });

  it("delegates non-tax invocations to the existing CLI", () => {
    const binary = join(packageRoot, manifest.bin["robinhood-cli"]);
    if (!existsSync(binary)) return;

    const child = spawnSync(process.execPath, [binary, "--version"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: safeEnvironment(),
      timeout: 10_000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout.trim()).toBe("1.1.0");
  });
});
