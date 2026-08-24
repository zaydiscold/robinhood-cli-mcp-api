import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  isCliEntryMain,
  isTaxInvocation,
  runCliEntry,
  taxArgv,
  type CliEntryDependencies,
} from "../src/cli-entry.js";

describe("unified CLI entry", () => {
  it("recognizes only an exact tax subcommand", () => {
    expect(isTaxInvocation(["node", "cli", "tax"])).toBe(true);
    expect(isTaxInvocation(["node", "cli", "tax-lots"])).toBe(false);
    expect(isTaxInvocation(["node", "cli", "--help"])).toBe(false);
  });

  it("rewrites tax argv for the dedicated tax parser", () => {
    expect(
      taxArgv(["/usr/bin/node", "/repo/cli/dist/cli-entry.js", "tax", "wash-sales", "--json"]),
    ).toEqual(["/usr/bin/node", "robinhood-tax", "wash-sales", "--json"]);
  });

  it("calls only the tax surface for tax invocations", async () => {
    const runTax = vi.fn(async () => undefined);
    const loadMain = vi.fn(async () => undefined);
    const dependencies: CliEntryDependencies = { runTax, loadMain };

    await runCliEntry(["node", "cli", "tax", "section-1256", "--json"], dependencies);

    expect(runTax).toHaveBeenCalledWith(["node", "robinhood-tax", "section-1256", "--json"]);
    expect(loadMain).not.toHaveBeenCalled();
  });

  it("delegates every non-tax invocation to the existing CLI", async () => {
    const runTax = vi.fn(async () => undefined);
    const loadMain = vi.fn(async () => undefined);
    const dependencies: CliEntryDependencies = { runTax, loadMain };

    await runCliEntry(["node", "cli", "portfolio", "--json"], dependencies);

    expect(loadMain).toHaveBeenCalledOnce();
    expect(runTax).not.toHaveBeenCalled();
  });

  it("recognizes only its own executable path as main", () => {
    const path = fileURLToPath(import.meta.url);
    expect(isCliEntryMain(import.meta.url, path)).toBe(true);
    expect(isCliEntryMain(import.meta.url, `${path}.other`)).toBe(false);
    expect(isCliEntryMain(import.meta.url, undefined)).toBe(false);
  });
});
