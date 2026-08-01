#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const forbidden = [
  { label: "private machine name", pattern: /\b(?:mothership|frostbyte|tracer)\b/i },
  { label: "private Windows user path", pattern: /C:[\\/]Users[\\/]ZaydK/i },
  { label: "private macOS user path", pattern: /\/Users\/zaydk/i },
  {
    label: "private Tailscale address",
    pattern: /\b(?:100\.122\.197\.2|100\.84\.176\.61|100\.73\.83\.101|100\.86\.179\.58)\b/,
  },
];

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  // local/ is git-crypt-backed private operator state, not public source.
  .filter((path) => !path.startsWith("local/"))
  // The scanner necessarily contains its own denylist literals.
  .filter((path) => path !== "scripts/check-public-portability.mjs");

const findings = [];
for (const path of tracked) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2_000_000) continue;

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of forbidden) {
      if (rule.pattern.test(lines[index])) {
        findings.push(`${path}:${index + 1}: ${rule.label}`);
      }
    }
  }
}

if (findings.length) {
  console.error("Public portability check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Public portability check passed (${tracked.length} tracked files scanned).`);
