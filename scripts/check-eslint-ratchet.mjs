import { readFile } from "node:fs/promises";
import { ESLint } from "eslint";

const baseline = JSON.parse(
  await readFile(new URL("../quality-baseline.json", import.meta.url), "utf8"),
);
const eslint = new ESLint({ cwd: process.cwd() });
const results = await eslint.lintFiles(["cli/src", "mcp/src"]);

const errors = results.reduce((total, result) => total + result.errorCount, 0);
const warnings = results.reduce((total, result) => total + result.warningCount, 0);
const byRule = new Map();

for (const result of results) {
  for (const message of result.messages) {
    if (message.severity !== 1) continue;
    const rule = message.ruleId ?? "(parser)";
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }
}

const regressions = [];
if (errors > 0) regressions.push(`${errors} lint error(s)`);
if (warnings > baseline.eslint.totalWarnings) {
  regressions.push(`${warnings} warnings exceeds the baseline of ${baseline.eslint.totalWarnings}`);
}

for (const [rule, count] of byRule) {
  const allowed = baseline.eslint.rules[rule] ?? 0;
  if (count > allowed) regressions.push(`${rule}: ${count} exceeds the baseline of ${allowed}`);
}

const ruleSummary = [...byRule.entries()]
  .sort((left, right) => right[1] - left[1])
  .map(([rule, count]) => `${rule}=${count}`)
  .join(", ");

console.log(
  `ESLint ratchet: ${errors} errors, ${warnings}/${baseline.eslint.totalWarnings} allowed warnings`,
);
console.log(`Warning debt: ${ruleSummary || "none"}`);

if (regressions.length > 0) {
  console.error(`Lint regression:\n- ${regressions.join("\n- ")}`);
  const formatter = await eslint.loadFormatter("stylish");
  console.error(await formatter.format(results));
  process.exitCode = 1;
}
