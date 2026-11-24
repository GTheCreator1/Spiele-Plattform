import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4192/Spiele-Plattform/'
const api = 'http://localhost:8789'
const directory = mkdtempSync(join(tmpdir(), 'stichrunde-online-'))
const invite = process.env.STICHRUNDE_TEST_INVITE ?? randomBytes(18).toString('hex')
process.env.STICHRUNDE_TEST_INVITE = invite
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
      command: 'npm run dev -- --host 127.0.0.1 --port 4192 --strictPort',
      url: baseURL,
      env: { VITE_API_URL: api },
      timeout: 50_000,
    },
    {
      command: `npm run dev:api -- --port 8789 --var APP_URL:${baseURL} --persist-to ${directory}/data`,
      url: 'http://127.0.0.1:8789/health',
      env: { XDG_CONFIG_HOME: `${directory}/config`, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', INVITE_CODE: invite },
      timeout: 50_000,
    },
  ],
})
