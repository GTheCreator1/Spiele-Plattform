import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const baseURL = 'http://127.0.0.1:4190/Spiele-Plattform/'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobil', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testIgnore: '**/*.desktop.spec.ts' },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4190 --strictPort',
    url: baseURL,
    timeout: 20_000,
  },
})
