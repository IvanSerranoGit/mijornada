// @ts-check
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Configuración única para todo el monorepo; cada paquete ejecuta `eslint .`
// y ESLint resuelve este archivo subiendo por el árbol de carpetas.
export default defineConfig(
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/dist/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    "supabase/**",
    "**/database.types.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Los archivos de configuración en JS no pertenecen a ningún tsconfig.
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  prettier,
);
