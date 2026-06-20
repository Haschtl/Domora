import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = fileURLToPath(new URL(".", import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "*.tsbuildinfo",
      "android/app/build",
      "android/app/src/main/assets",
      "public",
      "public/supersplat-viewer",
      ".claude"
    ]
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        projectService: false,
        tsconfigRootDir
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/config": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["src/components/gaussian-splat-preview.tsx"],
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: [
      "src/features/AuthView.tsx",
      "src/features/HouseholdSetupWizard.tsx",
      "src/features/WelcomeProfileDialog.tsx"
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  }
);
