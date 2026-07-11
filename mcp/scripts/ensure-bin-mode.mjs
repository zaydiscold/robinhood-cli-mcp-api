import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";

// npm/pnpm generate command shims, but this repo also exposes dist/server.js directly via a
// stable ~/.local/bin symlink. TypeScript can preserve a restrictive pre-existing mode, so make
// the shebang-bearing executable deterministic after every Unix build. Windows uses .cmd shims.
if (process.platform !== "win32") {
  chmodSync(fileURLToPath(new URL("../dist/server.js", import.meta.url)), 0o755);
}
