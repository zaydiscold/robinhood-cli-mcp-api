import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const GIT_CRYPT_HEADER = Buffer.from("\0GITCRYPT\0", "binary");

function git(args: string[]): Buffer {
  return execFileSync("git", args, {
    cwd: new URL("../..", import.meta.url),
    encoding: "buffer",
    maxBuffer: 8 * 1024 * 1024
  });
}

describe("git-crypt local workspace boundary", () => {
  it("stores every tracked local/ file as git-crypt ciphertext in the index", () => {
    const paths = git(["ls-files", "local"])
      .toString("utf8")
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      const blob = git(["show", `:${path}`]);
      expect(blob.subarray(0, GIT_CRYPT_HEADER.length), path).toEqual(GIT_CRYPT_HEADER);
    }
  });
});
