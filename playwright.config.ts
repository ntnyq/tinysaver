import { defineConfig } from '@playwright/test'

export default defineConfig({
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
  testDir: './tests/browser',
  testMatch: '**/*.e2e.ts',
  timeout: 15_000,
  use: {
    trace: 'retain-on-failure',
  },
})
