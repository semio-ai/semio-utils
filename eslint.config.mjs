import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import unicornPlugin from "eslint-plugin-unicorn";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

/**
 * Semio's shared React + TypeScript lint config.
 * Tailwind and jsx-a11y are omitted because this package has no JSX or class names;
 * the Semio plugin is omitted because its rules are disabled in the shared config.
 */
export default [
  // Ignores (must be first for flat config)
  {
    ignores: [
      "node_modules/",
      "dist/",
      "**/*.css",
      "**/tailwind.config.js",
      "**/postcss.config.js",
      "storybook-static/",
      // `build/` holds the tsbuildinfo and is excluded from the tsconfigs, so
      // anything appearing there is outside the program eslint would need.
      "build/",
      // tsup's transient bundled config can disappear during a parallel build.
      // Ignore it so lint does not race the build and fail with ENOENT.
      "**/tsup.config.bundled_*.mjs",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript (using flat config helpers)
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Language options for TypeScript
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.mjs", "*.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React (using flat config)
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],

  // React Hooks
  {
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Import plugin
  {
    plugins: { import: importPlugin },
    rules: {
      "import/first": "error",
      "import/newline-after-import": "warn",
      "import/no-absolute-path": "error",
      "import/no-default-export": "off",
      "import/no-mutable-exports": "error",
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        },
      ],
    },
  },

  // Unicorn
  {
    plugins: { unicorn: unicornPlugin },
    rules: {
      "unicorn/filename-case": "off",
      "unicorn/prefer-node-protocol": "warn",
    },
  },

  // React rule overrides
  {
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "react/prop-types": "off",
      "react/no-unknown-property": "off",
      "react/button-has-type": "warn",
      "react/self-closing-comp": "warn",
      "react/jsx-boolean-value": "warn",
      "react/jsx-curly-brace-presence": "warn",
      "react/jsx-fragments": "warn",
      "react/jsx-no-useless-fragment": ["warn", { allowExpressions: true }],
      "react/jsx-pascal-case": "warn",
      "react/no-unstable-nested-components": "error",
      "react/function-component-definition": "warn",
      "react/hook-use-state": "warn",
    },
  },

  // TypeScript rule overrides
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Extension rules
      "@typescript-eslint/default-param-last": "error",
      "@typescript-eslint/no-loop-func": "error",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-useless-constructor": "error",

      // Custom rules
      "@typescript-eslint/consistent-type-exports": "warn",
      "@typescript-eslint/switch-exhaustiveness-check": "off",
      "@typescript-eslint/require-array-sort-compare": ["error", { ignoreStringArrays: true }],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "allow",
        },
      ],

      // Disabled — too noisy for this codebase
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/prefer-find": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },

  // Best practices
  {
    rules: {
      "array-callback-return": ["error", { allowImplicit: true }],
      curly: ["warn", "multi-line"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-alert": "error",
      "no-caller": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-extra-bind": "error",
      "no-implied-eval": "error",
      "no-new": "error",
      "no-new-func": "error",
      "no-new-wrappers": "error",
      "no-param-reassign": "error",
      "no-return-assign": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-useless-call": "error",
      "no-useless-concat": "error",
      "no-useless-return": "warn",
      "no-var": "error",
      "no-console": "off",
      "no-useless-assignment": "off",
      "prefer-const": "warn",
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "prefer-template": "warn",
      "object-shorthand": "warn",
    },
  },

  // JavaScript is outside the TypeScript program (allowJs is off), and the
  // default-project globs cover only root files. Disable type-aware rules for
  // JS so nested scripts still receive syntactic and stylistic linting without
  // the per-file program cost and match limit of a wider default project.
  // Configs and scripts use Node globals; source JS also gets browser globals.
  // TypeScript uses its ambient libraries instead of ESLint's no-undef check.
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/src/**/*.js", "**/src/**/*.mjs", "**/src/**/*.cjs"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Prettier last — disables formatting rules that conflict
  prettierConfig,
];
