#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const LOCAL_DENYLIST_PATH = ".private-portability-values";
const SCANNER_PATH = "scripts/check-public-portability.mjs";

function isPlaceholderUser(segment) {
  const raw = String(segment).trim();
  if (!raw) return true;
  if (/^(?:<[^>]+>|%[^%]+%|\$\{?[^}\/]+\}?|\[[^\]]+\])$/.test(raw)) return true;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [
    "user",
    "username",
    "youruser",
    "yourusername",
    "example",
    "exampleuser",
    "sample",
    "sampleuser",
  ].includes(normalized);
}

function containsPrivateUserPath(line) {
  const patterns = [
    /C:[\\/]Users[\\/]([^\\/\s"'`]+)/gi,
    /(?:^|[\s"'`=(])\/Users\/([^/\s"'`]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      if (!isPlaceholderUser(match[1])) return true;
    }
  }
  return false;
}

function containsPrivateNetworkAddress(line) {
  const ipv4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
  for (const match of line.matchAll(ipv4)) {
    const octets = match.slice(1, 5).map(Number);
    if (octets.some((octet) => octet > 255)) continue;
    const end = (match.index ?? 0) + match[0].length;
    if (line[end] === "/") continue; // CIDR documentation is not a host leak.
    if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
  }
  return false;
}

function loadExactPrivateValues() {
  const values = [];
  const addLines = (text) => {
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (value && !value.startsWith("#")) values.push(value);
    }
  };

  if (process.env.ROBINHOOD_PRIVATE_PORTABILITY_VALUES) {
    addLines(process.env.ROBINHOOD_PRIVATE_PORTABILITY_VALUES);
  }
  if (existsSync(LOCAL_DENYLIST_PATH)) addLines(readFileSync(LOCAL_DENYLIST_PATH, "utf8"));
  return [...new Set(values)];
}

function buildForbiddenRules(exactValues = []) {
  return [
    { label: "private absolute user path", test: containsPrivateUserPath },
    { label: "private CGNAT/Tailscale host address", test: containsPrivateNetworkAddress },
    ...exactValues.map((value, index) => ({
      label: `local private value ${index + 1}`,
      test: (line) => line.toLowerCase().includes(value.toLowerCase()),
    })),
  ];
}

function runRuleSelfChecks() {
  const genericRules = buildForbiddenRules();
  const flagged = (line, rules = genericRules) => rules.some((rule) => rule.test(line));
  const cases = [
    ["C:\\Users\\alice\\project", true],
    ["/Users/alice/project", true],
    ["C:\\Users\\<username>\\project", false],
    ["/Users/$USER/project", false],
    ["host 100.100.20.30", true],
    ["CGNAT range 100.64.0.0/10", false],
    ["public host 100.128.0.1", false],
  ];
  for (const [line, expected] of cases) {
    if (flagged(line) !== expected) {
      throw new Error(`Portability scanner self-check failed: ${line}`);
    }
  }
  if (!flagged("connect to private-workstation", buildForbiddenRules(["private-workstation"]))) {
    throw new Error("Portability scanner exact-value self-check failed");
  }
}

runRuleSelfChecks();

const forbidden = buildForbiddenRules(loadExactPrivateValues());
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  // local/ is git-crypt-backed private operator state, not public source.
  .filter((path) => !path.startsWith("local/"))
  // This file contains synthetic scanner self-check fixtures.
  .filter((path) => path !== SCANNER_PATH);

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
      if (rule.test(lines[index])) findings.push(`${path}:${index + 1}: ${rule.label}`);
    }
  }
}

if (findings.length) {
  console.error("Public portability check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Public portability check passed (${tracked.length} tracked files scanned; ${forbidden.length - 2} local exact-value rule(s)).`,
);
