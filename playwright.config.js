import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for browser smoke testing.
 * 
 * Environment variables:
 * - PLAYWRIGHT_BASE_URL: URL to test against (defaults to http://127.0.0.1:8080)
 *   If set, the local webServer is not started by this config.
 */
export default defineConfig({
  testDir: './tests/visual',
  testMatch: /.*\.spec\.js/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run serve',
        port: 8080,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
