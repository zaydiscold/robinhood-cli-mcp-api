#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTaxCli } from "./tax-cli.js";

export interface CliEntryDependencies {
  runTax: (argv: string[]) => Promise<void>;
  loadMain: () => Promise<unknown>;
}

const defaultDependencies: CliEntryDependencies = {
  runTax: runTaxCli,
  loadMain: () => import("./index.js"),
};

export function isTaxInvocation(argv: readonly string[]): boolean {
  return argv[2] === "tax";
}

export function taxArgv(argv: readonly string[]): string[] {
  if (!isTaxInvocation(argv)) return [...argv];
  return [argv[0] ?? process.execPath, "robinhood-tax", ...argv.slice(3)];
}

export function isCliEntryMain(
  metaUrl: string,
  argvPath: string | undefined = process.argv[1],
): boolean {
  if (!argvPath) return false;
  try {
    return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
  } catch {
    return false;
  }
}

export async function runCliEntry(
  argv: string[] = process.argv,
  dependencies: CliEntryDependencies = defaultDependencies,
): Promise<void> {
  if (isTaxInvocation(argv)) {
    await dependencies.runTax(taxArgv(argv));
    return;
  }
  await dependencies.loadMain();
}

if (isCliEntryMain(import.meta.url)) {
  void runCliEntry().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`robinhood-cli: ${message}\n`);
    process.exitCode = 1;
  });
}
