// Flat config for ESLint v10 — the project's old .eslintrc.* form is ignored by ESLint >=9, which
// left `pnpm lint` dead (no config found) and forced CI to drop the lint step. This restores a
// working lint: typescript-eslint over the two source trees, with the existing `any`/unused-var debt
// kept as advisory WARNINGS (not hard errors) so the lint can run green today and be tightened later.
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.mjs", "**/*.cjs"] },
  {
    files: ["cli/src/**/*.ts", "mcp/src/**/*.ts"],
    languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module" },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }]
    }
  }
];
