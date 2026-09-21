const eslint = require("@eslint/js");

module.exports = [
  {
    ignores: ["coverage/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        beforeEach: "readonly",
        afterEach: "readonly",
        test: "readonly",
        expect: "readonly",
      },
    },
  },
];
