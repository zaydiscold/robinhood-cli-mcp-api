#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatTaxReferenceText,
  getTaxReference,
  listTaxReferenceTopics,
  loadTaxReferenceCatalog,
  type TaxReferenceCatalog,
} from "./tax-reference.js";

export interface TaxCliIo {
  writeOut: (text: string) => void;
  writeErr: (text: string) => void;
  setExitCode: (code: number) => void;
}

const processIo: TaxCliIo = {
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

export function createTaxProgram(
  io: TaxCliIo = processIo,
  loadCatalog: () => TaxReferenceCatalog = loadTaxReferenceCatalog,
): Command {
  const program = new Command();

  program
    .name("robinhood-tax")
    .description(
      "Source-backed US federal tax mechanics for Robinhood, equities, options, index options, and tax lots. Educational reference only.",
    )
    .version("1.1.0")
    .argument("[topic]", "topic id; omit to list topics")
    .option("-q, --query <text>", "search claims, caveats, evidence lanes, and source ids")
    .option("--source <source_id>", "show one source record")
    .option("--json", "emit structured JSON")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  robinhood-tax",
        "  robinhood-tax wash-sales",
        '  robinhood-tax --query "covered call"',
        "  robinhood-tax --source irs-pub-550-2025 --json",
        "",
        "MCP parity: read the generated tax-reference knowledge module with robinhood_knowledge.",
        "API parity: import getTaxReference from @zaydiscold/robinhood-cli/tax-reference.",
      ].join("\n"),
    )
    .configureOutput({
      writeOut: io.writeOut,
      writeErr: io.writeErr,
    })
    .action(
      (topic: string | undefined, options: { query?: string; source?: string; json?: boolean }) => {
        const catalog = loadCatalog();
        if (!topic && !options.query && !options.source) {
          const topics = listTaxReferenceTopics(catalog);
          if (options.json) {
            io.writeOut(
              `${JSON.stringify(
                {
                  reviewedAt: catalog.reviewedAt,
                  jurisdiction: catalog.jurisdiction,
                  disclaimer: catalog.disclaimer,
                  topics,
                  notPersonalizedAdvice: true,
                },
                null,
                2,
              )}\n`,
            );
            return;
          }
          io.writeOut(
            [
              `Tax Reference — ${catalog.jurisdiction}`,
              `Reviewed: ${catalog.reviewedAt}`,
              catalog.disclaimer,
              "",
              "Topics:",
              ...topics.map((entry) => `  ${entry.id} — ${entry.title}`),
              "",
              'Search: robinhood-tax --query "wash sale"',
              "Show:   robinhood-tax section-1256",
              "",
            ].join("\n"),
          );
          return;
        }

        const result = getTaxReference(
          { topic, query: options.query, source: options.source },
          catalog,
        );
        if (options.json) {
          io.writeOut(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }
        io.writeOut(formatTaxReferenceText(result));
        if (result.matchCount === 0 && !options.source) io.setExitCode(2);
      },
    );

  return program;
}

export function isTaxCliMain(
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

export async function runTaxCli(
  argv: string[] = process.argv,
  io: TaxCliIo = processIo,
): Promise<void> {
  try {
    await createTaxProgram(io).parseAsync(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeErr(`robinhood-tax: ${message}\n`);
    io.setExitCode(1);
  }
}

if (isTaxCliMain(import.meta.url)) {
  void runTaxCli();
}
