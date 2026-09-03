import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.wrangler/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}", "**/*.mjs"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker }
    }
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { globals: globals.node }
  }
);
