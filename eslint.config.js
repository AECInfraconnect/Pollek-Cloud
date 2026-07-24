import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "pgdata/**",
      // Generated artifacts (owned by the contract generators, not hand-edited).
      "packages/sdk/pollek-cloud-client.mjs",
      "packages/contracts/openapi.json"
    ]
  },
  js.configs.recommended,
  {
    // Node ESM: server, scripts, tests, config.
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }
      ]
    }
  },
  {
    // Browser ES module: the console front-end.
    files: ["apps/web/static/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser }
    }
  },
  prettier
];
