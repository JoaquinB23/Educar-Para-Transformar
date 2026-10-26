import { createRequire } from "node:module";

const backendRequire = createRequire(
  new URL("./Backend/package.json", import.meta.url),
);
const js = backendRequire("@eslint/js");
const prettier = backendRequire("eslint-config-prettier");
const globals = backendRequire("globals");

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/coverage/**",
      "**/cypress/videos/**",
      "**/cypress/screenshots/**",
    ],
  },
  {
    files: ["**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "warn",
    },
  },
  {
    files: ["Backend/**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["Backend/tests/**/*.js"],
    languageOptions: {
      globals: globals.jest,
    },
  },
  {
    files: ["Backend/cypress/**/*.js"],
    languageOptions: {
      globals: {
        Cypress: "readonly",
        cy: "readonly",
        it: "readonly",
      },
    },
  },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        bootstrap: "readonly",
      },
    },
  },
  prettier,
];
