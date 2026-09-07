import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { refreshBrokerageTokenAsync } from "../src/lib.js";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFile: vi.fn(),
}));
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.resetAllMocks();
});

it("coalesces concurrent recovery without blocking and keeps custom auth paths isolated", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rh-refresh-test-"));
  dirs.push(dir);
  const envPath = join(dir, "session.env");
  let finish: (() => void) | undefined;
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1) as (error: null) => void;
    finish = () => {
      writeFileSync(envPath, "ROBINHOOD_BROKERAGE_TOKEN=synthetic-fresh\n");
      callback(null);
    };
    return {} as never;
  });
  const first = refreshBrokerageTokenAsync("synthetic-old", { envPath });
  const second = refreshBrokerageTokenAsync("synthetic-old", { envPath });
  expect(execFile).toHaveBeenCalledTimes(1);
  expect(vi.mocked(execFile).mock.calls[0]?.[2]).toMatchObject({
    env: expect.objectContaining({ ROBINHOOD_ENV_PATH: envPath }),
  });
  await Promise.resolve();
  finish!();
  expect(await Promise.all([first, second])).toEqual(["synthetic-fresh", "synthetic-fresh"]);
});
