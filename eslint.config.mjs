import plugin from "eslint-plugin-obsidianmd";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    plugins: { obsidianmd: plugin },
    rules: plugin.configs.recommended,
    files: ["src/**/*.ts"],
    ignores: ["src/__tests__/**", "src/__mocks__/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  },
];
