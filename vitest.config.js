import { defineConfig } from 'vitest/config'

// Separate from vite.config.js on purpose: tests are pure-JS generator logic
// and don't need the React plugin or the dev-server options.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    testTimeout: 60000,
  },
})
