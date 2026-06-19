import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addPendingRoll,
  appendRollCompletionLog,
  completePendingRoll,
  formatPendingRoll,
  listKnowledge,
  listPendingRolls,
  parsePendingRolls,
  readKnowledge
} from "../src/lib.js";

// Tests for the knowledge-library reader (CLI `knowledge` + MCP robinhood_knowledge) and the
// pending-roll ledger (rolls.md; CLI `roll-ledger` + MCP robinhood_roll_ledger) — shared engines
// per the alignment invariant. The ledger tests pin the parser contract (EXAMPLE entries ignored),
// the add→list→done round trip, and that completion removes ONLY the matched entry.
// Zayd Khan // cold // www.zayd.wtf

const ROLLS_HEADER = [
  "# rolls.md — pending kosher-roll ledger",
  "",
  "Entry format (parser contract — keep it exact):",
  "",
  "### PENDING | SYMBOL | opened YYYY-MM-DD",
  "- closed leg: <contract, qty, sold @ $X.XX, order-id>",
  "- intended open leg: <expiration/strike/type>",
  "- earliest open date: <YYYY-MM-DD>",
  "- account: …<last4>",
  "- notes: <anything>",
  "",
  "### PENDING | F | opened 2026-06-10 (EXAMPLE)",
  "- closed leg: 1x F $11 put 2026-06-12, bought-to-close @ $0.18, order-id n/a",
  "- intended open leg: F $11 put 2026-06-19 sell-to-open, fresh quote Monday",
  "- earliest open date: 2026-06-11",
  "- account: …0000",
  "- notes: example entry — parser ignores",
  ""
].join("\n");

function tempRollsFile(content = ROLLS_HEADER): string {
  const dir = mkdtempSync(join(tmpdir(), "rolls-test-"));
  const file = join(dir, "rolls.md");
  writeFileSync(file, content);
  return file;
}

describe("parsePendingRolls — parser contract", () => {
  it("ignores the EXAMPLE entry and the format template, parses real entries with all fields", () => {
    const content =
      ROLLS_HEADER +
      [
        "### PENDING | HPE | opened 2026-06-11",
        "- closed leg: 1x HPE $30 call 2026-06-13, sold-to-close @ $1.25, order-id abc-123",
        "- intended open leg: HPE $32 call 2026-07-18 buy-to-open, fresh quote Monday",
        "- earliest open date: 2026-06-12",
        "- account: …5555",
        "- notes: kosher roll leg 2 of 2",
        ""
      ].join("\n");
    const rolls = parsePendingRolls(content);
    expect(rolls).toHaveLength(1); // EXAMPLE + the YYYY-MM-DD template both ignored
    expect(rolls[0]).toMatchObject({
      symbol: "HPE",
      opened: "2026-06-11",
      closedLeg: "1x HPE $30 call 2026-06-13, sold-to-close @ $1.25, order-id abc-123",
      openIntent: "HPE $32 call 2026-07-18 buy-to-open, fresh quote Monday",
      earliestOpenDate: "2026-06-12",
      account: "…5555",
      notes: "kosher roll leg 2 of 2"
    });
  });

  it("placeholder dashes parse as null and a fieldless entry still parses", () => {
    const content = "### PENDING | F | opened 2026-06-10\n- closed leg: —\n- notes: —\n";
    const rolls = parsePendingRolls(content);
    expect(rolls).toHaveLength(1);
    expect(rolls[0].closedLeg).toBeNull();
    expect(rolls[0].notes).toBeNull();
  });
});

describe("roll ledger — add → list → done round trip", () => {
  it("addPendingRoll appends a block that listPendingRolls reads back verbatim", () => {
    const file = tempRollsFile();
    const r = addPendingRoll(
      {
        symbol: "hpe",
        account: "123455555",
        closedLeg: "1x HPE $30c STC @ $1.25, order-id abc-123",
        openIntent: "HPE $32c 2026-07-18 BTO",
        earliestOpenDate: "2026-06-12",
        notes: "leg 2 pending"
      },
      { file, now: new Date(2026, 5, 11, 15, 30) }
    );
    expect(r.file).toBe(file);
    const rolls = listPendingRolls({ file });
    expect(rolls).toHaveLength(1); // the seeded EXAMPLE stays ignored
    expect(rolls[0]).toMatchObject({
      symbol: "HPE",
      opened: "2026-06-11",
      account: "…5555", // masked to last-4 on write
      earliestOpenDate: "2026-06-12"
    });
  });

  it("completePendingRoll removes ONLY the matched entry and returns it; file keeps header + example + others", () => {
    const file = tempRollsFile();
    addPendingRoll({ symbol: "HPE", closedLeg: "hpe close", openIntent: "hpe open" }, { file, now: new Date(2026, 5, 10) });
    addPendingRoll({ symbol: "NVDA", closedLeg: "nvda close", openIntent: "nvda open" }, { file, now: new Date(2026, 5, 11) });
    const r = completePendingRoll("hpe", { file });
    expect(r.removed.symbol).toBe("HPE");
    expect(r.removed.openIntent).toBe("hpe open");
    expect(r.remaining).toBe(1);
    const after = listPendingRolls({ file });
    expect(after).toHaveLength(1);
    expect(after[0].symbol).toBe("NVDA");
    const text = readFileSync(file, "utf8");
    expect(text).toContain("EXAMPLE"); // seeded example untouched
    expect(text).toContain("parser contract"); // header untouched
    expect(text).not.toContain("hpe close"); // completed entry fully excised — file stays clean
  });

  it("done by 'SYMBOL YYYY-MM-DD' disambiguates duplicates; bare symbol on duplicates fails loud", () => {
    const file = tempRollsFile();
    addPendingRoll({ symbol: "F", openIntent: "first" }, { file, now: new Date(2026, 5, 8) });
    addPendingRoll({ symbol: "F", openIntent: "second" }, { file, now: new Date(2026, 5, 9) });
    expect(() => completePendingRoll("F", { file })).toThrow(/disambiguate/);
    const r = completePendingRoll("F 2026-06-08", { file });
    expect(r.removed.openIntent).toBe("first");
    expect(listPendingRolls({ file })[0].openIntent).toBe("second");
  });

  it("a miss fails loud and lists what IS pending", () => {
    const file = tempRollsFile();
    addPendingRoll({ symbol: "HPE" }, { file, now: new Date(2026, 5, 10) });
    expect(() => completePendingRoll("TSLA", { file })).toThrow(/No pending roll matches "TSLA".*HPE \(opened 2026-06-10\)/);
  });

  it("formatPendingRoll defaults keep the open-leg discipline visible", () => {
    const entry = formatPendingRoll({ symbol: "F", now: new Date(2026, 5, 10) });
    expect(entry).toContain("### PENDING | F | opened 2026-06-10");
    expect(entry).toContain("fresh quote on the open day");
    expect(entry).toContain("next business day after the close");
  });

  it("appendRollCompletionLog writes an honest bookkeeping entry (order history stays the proof)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-test-"));
    const file = join(dir, "trading-log.md");
    writeFileSync(file, "# Trading Log\n");
    const removed = parsePendingRolls("### PENDING | HPE | opened 2026-06-10\n- closed leg: x\n- intended open leg: y\n")[0];
    const r = appendRollCompletionLog(removed, { file, now: new Date(2026, 5, 12, 9, 0) });
    const text = readFileSync(file, "utf8");
    expect(text).toContain("=== TRADE LOG ENTRY");
    expect(text).toContain("roll-ledger done HPE");
    expect(text).toContain("order history remains the only proof");
    expect(r.entry).toContain("THREAD:  was: close=x; open intent=y (staged 2026-06-10)");
  });
});

describe("knowledge library — index + read (real repo files)", () => {
  it("indexes knowledge modules with when-to-load hints, playbooks, and the docs/ titles", () => {
    const entries = listKnowledge();
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // ids stay unique (docs/README → docs-readme)
    const wheel = entries.find((e) => e.id === "wheel")!;
    expect(wheel.kind).toBe("module");
    expect(wheel.path).toBe("knowledge/wheel.md");
    expect(wheel.whenToLoad).toMatch(/Wheel/i);
    const brokerCall = entries.find((e) => e.id === "broker-call")!;
    expect(brokerCall.kind).toBe("playbook");
    const docs = entries.filter((e) => e.kind === "doc");
    expect(docs.length).toBeGreaterThan(10);
    expect(docs.every((d) => d.whenToLoad === null)).toBe(true); // docs are index-only: filename + title
    expect(docs.every((d) => d.title.length > 0)).toBe(true);
  });

  it("readKnowledge returns the full module text by id", () => {
    const mod = readKnowledge("wheel");
    expect(mod.path).toBe("knowledge/wheel.md");
    expect(mod.content).toContain("# The Wheel");
    expect(mod.content.length).toBeGreaterThan(500);
  });

  it("readKnowledge misses fail loud with did-you-mean", () => {
    expect(() => readKnowledge("weel")).toThrow(/Did you mean: .*wheel/);
    expect(() => readKnowledge("definitely-not-a-module-xyz")).toThrow(/No knowledge module/);
  });
});

// Zayd Khan // cold // www.zayd.wtf
