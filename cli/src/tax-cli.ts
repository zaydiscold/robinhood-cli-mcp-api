#!/usr/bin/env node
import { Command } from "commander";
import {
  formatTaxReferenceText,
  getTaxReference,
  listTaxReferenceTopics,
  loadTaxReferenceCatalog,
} from "./tax-reference.js";

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
  .action(
    (
      topic: string | undefined,
      options: { query?: string; source?: string; json?: boolean },
    ) => {
      const catalog = loadTaxReferenceCatalog();
      if (!topic && !options.query && !options.source) {
        const topics = listTaxReferenceTopics(catalog);
        if (options.json) {
          process.stdout.write(
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
        process.stdout.write(
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
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      process.stdout.write(formatTaxReferenceText(result));
      if (result.matchCount === 0 && !options.source) process.exitCode = 2;
    },
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`robinhood-tax: ${message}\n`);
  process.exitCode = 1;
});
