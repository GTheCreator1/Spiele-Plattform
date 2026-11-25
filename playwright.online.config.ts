import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4192/Spiele-Plattform/'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
  testDir: './tests/online',
  outputDir: './test-results-online',
  workers: 1,
  timeout: 100_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/test-signaling.mjs',
      url: 'http://127.0.0.1:8790/',
      timeout: 15_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4192 --strictPort',
      url: baseURL,
      env: { VITE_STICHRUNDE_TEST_SIGNAL_PORT: '8790' },
      timeout: 20_000,
    },
  ],
})
