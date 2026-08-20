import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const runners = [
  { command: "corepack", prefix: ["pnpm"] },
  { command: "pnpm", prefix: [] },
];

for (const runner of runners) {
  const result = spawnSync(runner.command, [...runner.prefix, ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error?.code === "ENOENT") continue;
  process.exit(result.status ?? 1);
}

console.error("Neither corepack nor pnpm is available on PATH");
process.exit(127);
