import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTaxProgram, isTaxCliMain, type TaxCliIo } from "../src/tax-cli.js";
import {
  formatTaxReferenceText,
  getTaxReference,
  listTaxReferenceTopics,
  loadTaxReferenceCatalog,
  resetTaxReferenceCache,
} from "../src/tax-reference.js";

const catalog = loadTaxReferenceCatalog();

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

describe("tax reference catalog", () => {
  it("loads one versioned, source-backed catalog", () => {
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.reviewedAt).toBe("2026-08-24");
    expect(catalog.jurisdiction).toBe("United States federal income tax");
    expect(catalog.topics.length).toBeGreaterThanOrEqual(10);
    expect(catalog.sources.length).toBeGreaterThanOrEqual(14);
    expect(new Set(catalog.topics.map((topic) => topic.id)).size).toBe(catalog.topics.length);
    expect(new Set(catalog.sources.map((source) => source.id)).size).toBe(catalog.sources.length);
    expect(catalog.agentRules.join("\n")).toMatch(/never authorize a trade|never.*trade/i);
  });

  it("keeps every claim sourced and every source in a declared evidence lane", () => {
    const sourceIds = new Set(catalog.sources.map((source) => source.id));
    const laneIds = new Set(catalog.evidenceLanes.map((lane) => lane.id));
    for (const source of catalog.sources) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(laneIds.has(source.lane)).toBe(true);
    }
    for (const topic of catalog.topics) {
      expect(topic.claims.length).toBeGreaterThan(0);
      for (const claim of topic.claims) {
        expect(claim.sourceIds.length).toBeGreaterThan(0);
        expect(claim.sourceIds.every((sourceId) => sourceIds.has(sourceId))).toBe(true);
        expect(laneIds.has(claim.lane)).toBe(true);
      }
    }
  });

  it("states Section 1256 character accurately without hard-coded tax rates", () => {
    const result = getTaxReference({ topic: "section-1256" }, catalog);
    const text = JSON.stringify(result);
    expect(text).toMatch(/60% long-term and 40% short-term/i);
    expect(text).toMatch(/holding period is irrelevant/i);
    expect(text).toMatch(/Form 6781/);
    expect(text).not.toMatch(/26[–-]28%|up to 37%|0\/15\/20/);
  });

  it("treats box-spread tax characterization as fact-specific", () => {
    const result = getTaxReference({ topic: "box-spreads" }, catalog);
    expect(result.topics[0]?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lane: "planning-inference",
          certainty: "fact-specific",
          text: expect.stringMatching(/not describe.*automatically/i),
        }),
      ]),
    );
    expect(JSON.stringify(result)).toMatch(/conversion-transaction/i);
  });

  it("searches topics, supports focused sources, and rejects unknown identifiers", () => {
    expect(
      getTaxReference({ query: "covered call" }, catalog).topics.map((topic) => topic.id),
    ).toContain("qualified-covered-calls");
    const source = getTaxReference({ source: "irs-pub-550-2025" }, catalog);
    expect(source.topics).toEqual([]);
    expect(source.sources).toEqual([
      expect.objectContaining({ id: "irs-pub-550-2025", lane: "irs-guidance" }),
    ]);
    expect(() => getTaxReference({ topic: "not-real" }, catalog)).toThrow(
      /Unknown tax reference topic/,
    );
    expect(() => getTaxReference({ source: "not-real" }, catalog)).toThrow(
      /Unknown tax reference source/,
    );
  });

  it("renders evidence lanes, caveats, review date, and official sources", () => {
    const text = formatTaxReferenceText(getTaxReference({ topic: "wash-sales" }, catalog));
    expect(text).toMatch(/Reviewed: 2026-08-24/);
    expect(text).toMatch(/\[primary-law; certainty=high\]/);
    expect(text).toMatch(/Caveats:/);
    expect(text).toMatch(/https:\/\/www\.irs\.gov\/publications\/p550/);
    expect(text).toMatch(/General educational information only/);
  });

  it("lists stable topic summaries without exposing the full catalog", () => {
    const topics = listTaxReferenceTopics(catalog);
    expect(topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "wash-sales", title: expect.any(String) }),
        expect.objectContaining({
          id: "tax-lots-specific-identification",
          title: expect.any(String),
        }),
      ]),
    );
    expect(topics[0]).not.toHaveProperty("claims");
    expect(topics[0]).not.toHaveProperty("caveats");
  });

  it("fails closed on malformed catalogs", () => {
    const directory = mkdtempSync(join(tmpdir(), "rh-tax-reference-"));
    const path = join(directory, "invalid.json");
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        reviewedAt: "2026-08-24",
        jurisdiction: "US",
        scope: "test",
        disclaimer: "test",
        agentRules: [],
        evidenceLanes: [{ id: "irs-guidance", label: "IRS", meaning: "test" }],
        sources: [],
        topics: [
          {
            id: "broken",
            title: "Broken",
            summary: "Broken",
            caveats: [],
            claims: [
              {
                lane: "irs-guidance",
                certainty: "high",
                text: "Unsourced",
                sourceIds: ["missing"],
              },
            ],
          },
        ],
      }),
    );
    resetTaxReferenceCache();
    expect(() => loadTaxReferenceCatalog(path)).toThrow(/unknown source missing/);
  });
});

describe("robinhood-tax CLI", () => {
  it("lists topics by default", async () => {
    const capture = captureIo();
    await createTaxProgram(capture.io, () => catalog).parseAsync([], { from: "user" });
    expect(capture.stdout()).toMatch(/Tax Reference/);
    expect(capture.stdout()).toMatch(/wash-sales/);
    expect(capture.exitCodes).toEqual([]);
  });

  it("returns a structured topic without personalized conclusions", async () => {
    const capture = captureIo();
    await createTaxProgram(capture.io, () => catalog).parseAsync(
      ["section-1256", "--json"],
      { from: "user" },
    );
    const result = JSON.parse(capture.stdout());
    expect(result).toMatchObject({
      matchCount: 1,
      notPersonalizedAdvice: true,
      topics: [expect.objectContaining({ id: "section-1256" })],
    });
  });

  it("returns one source and reports empty searches with a nonzero status", async () => {
    const sourceCapture = captureIo();
    await createTaxProgram(sourceCapture.io, () => catalog).parseAsync(
      ["--source", "irs-form-6781", "--json"],
      { from: "user" },
    );
    expect(JSON.parse(sourceCapture.stdout())).toMatchObject({
      topics: [],
      sources: [expect.objectContaining({ id: "irs-form-6781" })],
    });

    const emptyCapture = captureIo();
    await createTaxProgram(emptyCapture.io, () => catalog).parseAsync(
      ["--query", "definitely-not-a-topic"],
      { from: "user" },
    );
    expect(emptyCapture.stdout()).toMatch(/No tax reference topic matched/);
    expect(emptyCapture.exitCodes).toEqual([2]);
  });

  it("recognizes only its own entrypoint as the executable main module", () => {
    const path = fileURLToPath(import.meta.url);
    expect(isTaxCliMain(import.meta.url, path)).toBe(true);
    expect(isTaxCliMain(import.meta.url, `${path}.other`)).toBe(false);
    expect(isTaxCliMain(import.meta.url, undefined)).toBe(false);
  });
});
