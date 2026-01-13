import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const E2E_TEST_TIMEOUT = 30000 // 30 seconds for browser tests

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: E2E_TEST_TIMEOUT,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
})
