import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTaxProgram, type TaxCliIo } from "../src/tax-cli.js";
import { loadTaxReferenceCatalog } from "../src/tax-reference.js";
import {
  getTaxResearchStatus,
  getTaxStrategyGuide,
  listTaxStrategies,
  loadTaxStrategyCatalog,
  resolveTaxStrategy,
  searchTaxStrategies,
  type TaxStrategyCatalog,
} from "../src/tax-strategy.js";

const referenceCatalog = loadTaxReferenceCatalog();
const strategyCatalog = loadTaxStrategyCatalog(undefined, referenceCatalog);

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function captureIo() {
  let stdout = "";
  let stderr = "";
  const exitCodes: number[] = [];
  const io: TaxCliIo = {
    writeOut: (text) => {
      stdout += text;
    },
    writeErr: (text) => {
      stderr += text;
    },
    setExitCode: (code) => {
      exitCodes.push(code);
    },
  };
  return {
    io,
    stdout: () => stdout,
    stderr: () => stderr,
    exitCodes,
  };
}

describe("tax strategy catalog", () => {
  it("loads a review-aligned strategy catalog with unique cross-strategy aliases", () => {
    expect(strategyCatalog.schemaVersion).toBe(1);
    expect(strategyCatalog.reviewedAt).toBe(referenceCatalog.reviewedAt);
    expect(strategyCatalog.jurisdiction).toBe(referenceCatalog.jurisdiction);
    expect(strategyCatalog.strategies.length).toBeGreaterThanOrEqual(11);
    expect(new Set(strategyCatalog.strategies.map((strategy) => strategy.id)).size).toBe(
      strategyCatalog.strategies.length,
    );

    const owners = new Map<string, string>();
    for (const strategy of strategyCatalog.strategies) {
      for (const name of [strategy.id, ...strategy.aliases]) {
        const normalized = normalizeName(name);
        const prior = owners.get(normalized);
        expect(prior === undefined || prior === strategy.id).toBe(true);
        owners.set(normalized, strategy.id);
      }
    }

    expect(strategyCatalog.agentOutputContract.join("\n")).toMatch(
      /missing fact|not evaluated|never authoriz|does not.*authoriz|Tax research never/i,
    );
  });

  it("resolves ids and human aliases without guessing nearby strategies", () => {
    expect(resolveTaxStrategy("wheel", strategyCatalog).id).toBe("wheel");
    expect(resolveTaxStrategy("covered call", strategyCatalog).id).toBe("covered-call");
    expect(resolveTaxStrategy("CSP", strategyCatalog).id).toBe("cash-secured-put");
    expect(resolveTaxStrategy("short against the box", strategyCatalog).id).toBe(
      "short-stock",
    );
    expect(() => resolveTaxStrategy("covered", strategyCatalog)).toThrow(/Unknown tax strategy/);
  });

  it("searches strategy mechanics, facts, aliases, tags, and red flags", () => {
    expect(searchTaxStrategies("dividend", strategyCatalog).map((strategy) => strategy.id)).toEqual(
      expect.arrayContaining(["covered-call", "dividend-capture", "collar-or-protective-put"]),
    );
    expect(searchTaxStrategies("Form 6781", strategyCatalog).map((strategy) => strategy.id)).toEqual(
      expect.arrayContaining(["section-1256-index-options", "box-spread"]),
    );
    expect(
      searchTaxStrategies("selected lot", strategyCatalog).map((strategy) => strategy.id),
    ).toContain("specific-lot-sale");
    expect(listTaxStrategies(strategyCatalog)[0]).not.toHaveProperty("requiredFacts");
  });

  it("returns a body-bound research guide with linked topics and sources", () => {
    const guide = getTaxStrategyGuide(
      { strategy: "covered call", accountContext: "taxable" },
      strategyCatalog,
      referenceCatalog,
    );
    expect(guide).toMatchObject({
      accountContext: "taxable",
      notPersonalizedAdvice: true,
      tradeAuthorized: false,
      filingResultDetermined: false,
      strategy: expect.objectContaining({ id: "covered-call" }),
    });
    expect(guide.ruleTopics.map((topic) => topic.id)).toEqual(
      expect.arrayContaining([
        "option-writer-lifecycle",
        "qualified-covered-calls",
        "constructive-sales",
      ]),
    );
    expect(guide.sources.map((source) => source.id)).toEqual(
      expect.arrayContaining(["irs-pub-550-2025", "ecfr-qcc", "usc-1092"]),
    );
    expect(guide.strategy.requiredFacts.map((fact) => fact.id)).toEqual(
      expect.arrayContaining(["stock-lots", "call-contract", "dividend-dates"]),
    );
    expect(guide.strategy.brokerReads.every((read) => read.cli && read.mcp)).toBe(true);
  });

  it("preserves qualified-dividend and short-sale mechanics as sourced claims", () => {
    const dividend = getTaxStrategyGuide(
      { strategy: "dividend-capture", accountContext: "taxable" },
      strategyCatalog,
      referenceCatalog,
    );
    const dividendText = JSON.stringify(dividend.strategy.supplementalClaims);
    expect(dividendText).toMatch(/more than 60 days.*121-day period/i);
    expect(dividendText).toMatch(/diminished risk|risk of loss is diminished/i);
    expect(dividendText).toMatch(/payments in lieu/i);
    expect(dividend.strategy.supplementalClaims.every((claim) => claim.sourceIds.length > 0)).toBe(
      true,
    );

    const shortSale = getTaxStrategyGuide(
      { strategy: "short-stock", accountContext: "taxable" },
      strategyCatalog,
      referenceCatalog,
    );
    expect(JSON.stringify(shortSale.strategy.supplementalClaims)).toMatch(/Section 1233/i);
    expect(shortSale.sources.map((source) => source.id)).toContain("usc-1233");
  });

  it("keeps machine-provided broker reads on current CLI grammar", () => {
    const commands = strategyCatalog.strategies.flatMap((strategy) =>
      strategy.brokerReads.map((read) => read.cli),
    );
    expect(commands.join("\n")).not.toMatch(/robinhood-cli tax-lots --account/);
    expect(commands.join("\n")).not.toMatch(/robinhood-cli tax-lot\s/);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/tax-lots list <SYMBOL>/),
        expect.stringMatching(/tax-lots plan-sell <SYMBOL>/),
        expect.stringMatching(/tax-lots order <ORDER_ID>/),
      ]),
    );
  });

  it("reports review age as an internal maintenance signal, not a validity period", () => {
    const status = getTaxResearchStatus(
      referenceCatalog,
      strategyCatalog,
      new Date("2026-08-25T00:00:00Z"),
    );
    expect(status).toMatchObject({
      reviewedAt: "2026-08-24",
      reviewAgeDays: 1,
      reviewYearMatchesCurrentYear: true,
      reviewRecommended: false,
      referenceTopicCount: referenceCatalog.topics.length,
      strategyCount: strategyCatalog.strategies.length,
      sourceCount: referenceCatalog.sources.length,
    });
    expect(status.maintenancePolicy).toMatch(/not a legal validity period/i);
  });

  it("fails closed when strategy data drifts from the reference catalog", () => {
    const parsed = JSON.parse(JSON.stringify(strategyCatalog)) as TaxStrategyCatalog;
    const directory = mkdtempSync(join(tmpdir(), "rh-tax-strategy-"));
    const path = join(directory, "invalid.json");
    const first = { ...parsed.strategies[0]!, topicIds: ["not-a-real-topic"] };
    writeFileSync(
      path,
      JSON.stringify({ ...parsed, strategies: [first, ...parsed.strategies.slice(1)] }),
    );
    expect(() => loadTaxStrategyCatalog(path, referenceCatalog)).toThrow(/unknown topic/);
  });
});

describe("tax strategy CLI", () => {
  it("lists rule topics and strategy guides from the default tax surface", async () => {
    const capture = captureIo();
    await createTaxProgram(capture.io, () => referenceCatalog, () => strategyCatalog).parseAsync(
      [],
      { from: "user" },
    );
    expect(capture.stdout()).toMatch(/Tax Reference/);
    expect(capture.stdout()).toMatch(/Reference topics:/);
    expect(capture.stdout()).toMatch(/Strategy guides:/);
    expect(capture.stdout()).toMatch(/covered-call/);
  });

  it("returns a structured strategy guide through the main tax parser", async () => {
    const capture = captureIo();
    await createTaxProgram(capture.io, () => referenceCatalog, () => strategyCatalog).parseAsync(
      ["strategy", "covered call", "--account-context", "taxable", "--json"],
      { from: "user" },
    );
    expect(capture.stderr()).toBe("");
    expect(JSON.parse(capture.stdout())).toMatchObject({
      accountContext: "taxable",
      strategy: expect.objectContaining({ id: "covered-call" }),
      notPersonalizedAdvice: true,
      tradeAuthorized: false,
      filingResultDetermined: false,
    });
  });

  it("searches strategies and makes an empty result machine-visible", async () => {
    const found = captureIo();
    await createTaxProgram(found.io, () => referenceCatalog, () => strategyCatalog).parseAsync(
      ["strategy", "--query", "dividend", "--json"],
      { from: "user" },
    );
    expect(JSON.parse(found.stdout())).toMatchObject({
      matchCount: expect.any(Number),
      strategies: expect.arrayContaining([expect.objectContaining({ id: "dividend-capture" })]),
      tradeAuthorized: false,
    });

    const empty = captureIo();
    await createTaxProgram(empty.io, () => referenceCatalog, () => strategyCatalog).parseAsync(
      ["strategy", "--query", "definitely-no-match"],
      { from: "user" },
    );
    expect(empty.stdout()).toMatch(/No tax strategy matched/);
    expect(empty.exitCodes).toEqual([2]);
  });

  it("exposes source and strategy review status without brokerage state", async () => {
    const capture = captureIo();
    await createTaxProgram(capture.io, () => referenceCatalog, () => strategyCatalog).parseAsync(
      ["status", "--json"],
      { from: "user" },
    );
    expect(JSON.parse(capture.stdout())).toMatchObject({
      reviewedAt: referenceCatalog.reviewedAt,
      referenceTopicCount: referenceCatalog.topics.length,
      strategyCount: strategyCatalog.strategies.length,
      sourceCount: referenceCatalog.sources.length,
    });
  });

  it("rejects an invalid account context before constructing a guide", async () => {
    const capture = captureIo();
    await expect(
      createTaxProgram(capture.io, () => referenceCatalog, () => strategyCatalog).parseAsync(
        ["strategy", "wheel", "--account-context", "margin"],
        { from: "user" },
      ),
    ).rejects.toThrow(/Unknown account context/);
  });
});
