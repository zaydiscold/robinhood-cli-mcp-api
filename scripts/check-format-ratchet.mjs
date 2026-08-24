import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import prettier from "prettier";

const root = process.cwd();
const baseline = JSON.parse(
  await readFile(new URL("../quality-baseline.json", import.meta.url), "utf8"),
);
const allowed = new Set(baseline.prettier.unformattedFiles);

async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listTypeScriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat();
}

const files = (
  await Promise.all([
    listTypeScriptFiles(resolve(root, "cli/src")),
    listTypeScriptFiles(resolve(root, "mcp/src")),
  ])
).flat();
const unformatted = [];
const formatting = new Map();

for (const file of files) {
  const source = await readFile(file, "utf8");
  const options = (await prettier.resolveConfig(file)) ?? {};
  if (!(await prettier.check(source, { ...options, filepath: file }))) {
    const name = relative(root, file).replaceAll("\\", "/");
    unformatted.push(name);
    formatting.set(name, await prettier.format(source, { ...options, filepath: file }));
  }
}

unformatted.sort();
const unexpected = unformatted.filter((file) => !allowed.has(file));
const remaining = unformatted.filter((file) => allowed.has(file));
const improved = baseline.prettier.unformattedFiles.filter((file) => !unformatted.includes(file));

console.log(
  `Prettier ratchet: ${remaining.length} known unformatted file(s), ${unexpected.length} new`,
);
if (improved.length > 0) console.log(`Formatting debt reduced: ${improved.join(", ")}`);

if (unexpected.length > 0) {
  console.error(`New formatting debt:\n- ${unexpected.join("\n- ")}`);
  for (const file of unexpected) {
    const destination = resolve(root, "formatted-output", file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, formatting.get(file), "utf8");
  }
  process.exitCode = 1;
}
