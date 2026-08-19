import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 'docs/design_handoff_dynasty_portfolio' holds a vendored, generated prototype runtime
  // (support.js — "GENERATED from dc-runtime/src/*.ts — do not edit") shipped with a design
  // handoff. It is not application code and is never imported by src/. Linting it made
  // CLAUDE.md's "npm run lint must report 0 problems" unachievable from bc159ad onward.
  globalIgnores(['dist', 'docs/design_handoff_dynasty_portfolio']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, process: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
])
