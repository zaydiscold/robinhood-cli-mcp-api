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
import {
  formatTaxStrategyText,
  getTaxResearchStatus,
  getTaxStrategyGuide,
  listTaxStrategies,
  loadTaxStrategyCatalog,
  searchTaxStrategies,
  type TaxAccountContext,
  type TaxStrategyCatalog,
} from "./tax-strategy.js";

export interface TaxCliIo {
  writeOut: (text: string) => void;
  writeErr: (text: string) => void;
  setExitCode: (code: number) => void;
}

interface TaxCliOptions {
  query?: string;
  source?: string;
  accountContext?: string;
  json?: boolean;
}

const processIo: TaxCliIo = {
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

function parseAccountContext(value: string | undefined): TaxAccountContext {
  if (!value) return "unknown";
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, TaxAccountContext> = {
    taxable: "taxable",
    brokerage: "taxable",
    individual: "taxable",
    "traditional-ira": "traditional-ira",
    traditional_ira: "traditional-ira",
    ira: "traditional-ira",
    "roth-ira": "roth-ira",
    roth_ira: "roth-ira",
    roth: "roth-ira",
    unknown: "unknown",
  };
  const context = aliases[normalized];
  if (!context) {
    throw new Error(
      `Unknown account context "${value}". Use taxable, traditional-ira, roth-ira, or unknown.`,
    );
  }
  return context;
}

function writeStrategyList(
  io: TaxCliIo,
  catalog: TaxStrategyCatalog,
  options: TaxCliOptions,
): void {
  const matches = options.query ? searchTaxStrategies(options.query, catalog) : catalog.strategies;
  const rows = matches.map(({ id, title, summary, aliases, tags }) => ({
    id,
    title,
    summary,
    aliases,
    tags,
  }));

  if (options.json) {
    io.writeOut(
      `${JSON.stringify(
        {
          reviewedAt: catalog.reviewedAt,
          jurisdiction: catalog.jurisdiction,
          strategies: rows,
          matchCount: rows.length,
          notPersonalizedAdvice: true,
          tradeAuthorized: false,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (rows.length === 0) {
    io.writeOut("No tax strategy matched the query.\n");
    io.setExitCode(2);
    return;
  }

  io.writeOut(
    [
      `Tax Strategy Guides — ${catalog.jurisdiction}`,
      `Reviewed: ${catalog.reviewedAt}`,
      "",
      ...rows.map((entry) => `  ${entry.id} — ${entry.title}`),
      "",
      "Show one: robinhood-cli tax strategy <id-or-alias>",
      "",
    ].join("\n"),
  );
}

function writeTaxStatus(
  io: TaxCliIo,
  referenceCatalog: TaxReferenceCatalog,
  strategyCatalog: TaxStrategyCatalog,
  json: boolean | undefined,
): void {
  const status = getTaxResearchStatus(referenceCatalog, strategyCatalog);
  if (json) {
    io.writeOut(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }
  io.writeOut(
    [
      `Tax Research Status — ${status.jurisdiction}`,
      `Reviewed: ${status.reviewedAt}`,
      `Reference topics: ${status.referenceTopicCount}`,
      `Strategy guides: ${status.strategyCount}`,
      `Sources: ${status.sourceCount}`,
      `Review age: ${status.reviewAgeDays ?? "unknown"} day(s)`,
      `Review recommended: ${status.reviewRecommended ? "yes" : "no"}`,
      status.maintenancePolicy,
      "",
    ].join("\n"),
  );
}

export function createTaxProgram(
  io: TaxCliIo = processIo,
  loadCatalog: () => TaxReferenceCatalog = loadTaxReferenceCatalog,
  loadStrategies: () => TaxStrategyCatalog = loadTaxStrategyCatalog,
): Command {
  const program = new Command();

  program
    .name("robinhood-tax")
    .description(
      "Source-backed US federal tax mechanics and strategy-to-rule research routing for Robinhood, equities, options, index options, and tax lots. Educational reference only.",
    )
    .version("1.1.0")
    .argument("[topic]", "rule topic id, `strategy`, or `status`")
    .argument("[detail...]", "strategy id or alias after `strategy`")
    .option("-q, --query <text>", "search rule or strategy research")
    .option("--source <source_id>", "show one tax-reference source record")
    .option(
      "--account-context <type>",
      "strategy context: taxable, traditional-ira, roth-ira, or unknown",
    )
    .option("--json", "emit structured JSON")
    .addHelpText(
      "after",
      [
        "",
        "Reference examples:",
        "  robinhood-cli tax",
        "  robinhood-cli tax wash-sales",
        '  robinhood-cli tax --query "qualified covered call"',
        "  robinhood-cli tax --source irs-pub-550-2025 --json",
        "",
        "Strategy research examples:",
        "  robinhood-cli tax strategy wheel",
        "  robinhood-cli tax strategy covered-call --account-context taxable --json",
        '  robinhood-cli tax strategy --query "dividend"',
        "  robinhood-cli tax status --json",
        "",
        "The dedicated `robinhood-tax` binary accepts the same arguments after `tax`.",
        "MCP parity: read `tax-strategy-routing` and `tax-reference` with robinhood_knowledge, then collect live account facts with the named account tools.",
        "API parity: import from @zaydiscold/robinhood-cli/tax-reference and /tax-strategy.",
      ].join("\n"),
    )
    .configureOutput({
      writeOut: io.writeOut,
      writeErr: io.writeErr,
    })
    .action((topic: string | undefined, detail: string[], options: TaxCliOptions) => {
      const referenceCatalog = loadCatalog();
      const strategyCatalog = loadStrategies();

      if (topic === "strategy") {
        if (options.source) {
          throw new Error("--source applies to tax-reference topics, not strategy guides.");
        }
        const strategy = detail.join(" ").trim() || undefined;
        if (strategy && options.query) {
          throw new Error("Use either a strategy id or alias or --query, not both.");
        }
        if (!strategy) {
          writeStrategyList(io, strategyCatalog, options);
          return;
        }
        const guide = getTaxStrategyGuide(
          {
            strategy,
            accountContext: parseAccountContext(options.accountContext),
          },
          strategyCatalog,
          referenceCatalog,
        );
        if (options.json) {
          io.writeOut(`${JSON.stringify(guide, null, 2)}\n`);
          return;
        }
        io.writeOut(formatTaxStrategyText(guide));
        return;
      }

      if (topic === "status") {
        if (detail.length > 0 || options.query || options.source || options.accountContext) {
          throw new Error("`tax status` accepts only --json.");
        }
        writeTaxStatus(io, referenceCatalog, strategyCatalog, options.json);
        return;
      }

      if (detail.length > 0) {
        throw new Error(
          `Unexpected extra argument after tax topic "${topic ?? ""}": ${detail.join(" ")}`,
        );
      }
      if (options.accountContext) {
        throw new Error("--account-context is available only with `tax strategy`.");
      }

      if (!topic && !options.query && !options.source) {
        const topics = listTaxReferenceTopics(referenceCatalog);
        const strategies = listTaxStrategies(strategyCatalog);
        if (options.json) {
          io.writeOut(
            `${JSON.stringify(
              {
                reviewedAt: referenceCatalog.reviewedAt,
                jurisdiction: referenceCatalog.jurisdiction,
                disclaimer: referenceCatalog.disclaimer,
                topics,
                strategies,
                notPersonalizedAdvice: true,
                tradeAuthorized: false,
              },
              null,
              2,
            )}\n`,
          );
          return;
        }
        io.writeOut(
          [
            `Tax Reference — ${referenceCatalog.jurisdiction}`,
            `Reviewed: ${referenceCatalog.reviewedAt}`,
            referenceCatalog.disclaimer,
            "",
            "Reference topics:",
            ...topics.map((entry) => `  ${entry.id} — ${entry.title}`),
            "",
            "Strategy guides:",
            ...strategies.map((entry) => `  ${entry.id} — ${entry.title}`),
            "",
            'Search rules:      robinhood-cli tax --query "wash sale"',
            "Show rule topic:   robinhood-cli tax section-1256",
            "Show strategy:     robinhood-cli tax strategy wheel",
            "Check review age:  robinhood-cli tax status",
            "",
          ].join("\n"),
        );
        return;
      }

      const result = getTaxReference(
        { topic, query: options.query, source: options.source },
        referenceCatalog,
      );
      if (options.json) {
        io.writeOut(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      io.writeOut(formatTaxReferenceText(result));
      if (result.matchCount === 0 && !options.source) io.setExitCode(2);
    });

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
