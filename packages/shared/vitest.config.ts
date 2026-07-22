import { defineConfig } from 'vitest/config'

// Tiny node-only project for @tonus/shared. No DOM, no plugins: this package is
// pure TS logic and generated types shared between the web and mobile clients.
export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
