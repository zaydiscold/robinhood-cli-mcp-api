import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogPath = resolve(repoRoot, "knowledge", "tax-reference.json");
const markdownPath = resolve(repoRoot, "knowledge", "tax-reference.md");

function render(catalog) {
  const sourceById = new Map(catalog.sources.map((source) => [source.id, source]));
  const lines = [
    "<!-- GENERATED from knowledge/tax-reference.json by scripts/generate-tax-reference.mjs. -->",
    "",
    "# Tax reference — source-backed US federal mechanics",
    "",
    "> **When to load this:** any question about option taxation, wash sales, Section 1256,",
    "> qualified covered calls, exercise holding periods, tax lots, box spreads, constructive",
    "> sales, or whether a Robinhood estimate is suitable for filing. Start here before using",
    "> narrative tax documents. Educational research only, not a personalized filing conclusion.",
    "",
    `**Jurisdiction:** ${catalog.jurisdiction}  `,
    `**Reviewed:** ${catalog.reviewedAt}  `,
    `**Schema:** ${catalog.schemaVersion}`,
    "",
    catalog.disclaimer,
    "",
    "## Surface routing",
    "",
    "- **CLI:** `robinhood-tax`, `robinhood-tax <topic>`, or `robinhood-tax --query \"<text>\"`.",
    "- **API:** `import { getTaxReference } from \"@zaydiscold/robinhood-cli/tax-reference\"`.",
    "- **MCP:** use `robinhood_knowledge` to read `tax-reference`; this generated module is the same catalog rendered for agents.",
    "- **Live account facts:** use `tax-lots`, `documents`, `history`, `recurring`, and `settings` separately. A reference lookup never authorizes a trade.",
    "",
    "## Agent contract",
    "",
    ...catalog.agentRules.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "## Evidence lanes",
    "",
    "| Lane | Meaning |",
    "| --- | --- |",
    ...catalog.evidenceLanes.map(
      (lane) => `| \`${lane.id}\` | ${lane.label}. ${lane.meaning} |`,
    ),
    "",
    "## Topics",
    "",
  ];

  for (const topic of catalog.topics) {
    lines.push(`### ${topic.title}`, "", `**ID:** \`${topic.id}\``, "", topic.summary, "");
    lines.push("**Claims**", "");
    for (const claim of topic.claims) {
      lines.push(
        `- **${claim.lane}; certainty=${claim.certainty}.** ${claim.text}`,
        `  Sources: ${claim.sourceIds.map((id) => `[\`${id}\`](#source-${id})`).join(", ")}.`,
      );
    }
    lines.push("", "**Caveats**", "", ...topic.caveats.map((caveat) => `- ${caveat}`), "");
  }

  lines.push("## Sources", "");
  for (const source of catalog.sources) {
    lines.push(
      `<a id="source-${source.id}"></a>`,
      `### ${source.title}`,
      "",
      `- **ID:** \`${source.id}\``,
      `- **Lane:** \`${source.lane}\``,
      `- **Effective/review scope:** ${source.effectiveFor}`,
      `- **Use:** ${source.notes}`,
      `- **URL:** ${source.url}`,
      "",
    );
  }

  lines.push(
    "## Maintenance rule",
    "",
    "Edit `knowledge/tax-reference.json`, run `pnpm generate:tax-reference`, and commit both files.",
    "The quality gate fails when this rendered module is stale, a claim has no source, a source uses",
    "an unknown evidence lane, or an identifier is duplicated.",
    "",
  );

  for (const topic of catalog.topics) {
    for (const claim of topic.claims) {
      for (const sourceId of claim.sourceIds) {
        if (!sourceById.has(sourceId)) {
          throw new Error(`Topic ${topic.id} references unknown source ${sourceId}`);
        }
      }
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const rendered = render(catalog);

if (process.argv.includes("--check")) {
  const current = readFileSync(markdownPath, "utf8");
  if (current !== rendered) {
    process.stderr.write(
      "knowledge/tax-reference.md is stale. Run `pnpm generate:tax-reference` and commit the result.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Tax reference generated surface is current: ${catalog.topics.length} topics / ${catalog.sources.length} sources.\n`,
    );
  }
} else {
  writeFileSync(markdownPath, rendered);
  process.stdout.write(
    `Generated knowledge/tax-reference.md: ${catalog.topics.length} topics / ${catalog.sources.length} sources.\n`,
  );
}
