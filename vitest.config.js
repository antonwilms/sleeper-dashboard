import { mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(viteConfig, defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'node',
    include:     ['src/**/*.test.js', 'src/**/*.test.jsx'],
    exclude:     ['node_modules', 'dist', '.claude'],
    globals:     false,
    testTimeout: 5000,
    // No global setupFiles — component tests import jest-dom matchers themselves
  },
}))
