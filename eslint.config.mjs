import plugin from "eslint-plugin-obsidianmd";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    plugins: {
      obsidianmd: plugin,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...plugin.configs.recommended,
      ...tsPlugin.configs["recommended"].rules,
    },
    files: ["src/**/*.ts"],
    ignores: ["src/__tests__/**", "src/__mocks__/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  },
  // Prettier は最後に置いて ESLint のフォーマット系ルールを無効化
  prettier,
];
