import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "node_modules/**", "artifacts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.ts"], rules: { "no-undef": "off" } },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: { "no-undef": "off" },
  },
  {
    files: ["**/*.tsx"],
    languageOptions: { globals: globals.browser },
    rules: { "no-undef": "off" },
  },
);
