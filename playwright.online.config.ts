import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4192/Spiele-Plattform/'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const direct = process.env.STICHRUNDE_TEST_DIRECT === '1'
const publicSignal = process.env.STICHRUNDE_TEST_PUBLIC === '1'
const publicURL = process.env.STICHRUNDE_TEST_URL
const relayKey = direct || publicSignal ? '' : randomBytes(24).toString('hex')

export default defineConfig({
  testDir: './tests/online',
  testMatch: publicSignal ? 'public.spec.ts' : 'flows.spec.ts',
  outputDir: './test-results-online',
  workers: 1,
  timeout: 100_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: publicSignal && publicURL ? publicURL : baseURL,
    launchOptions: {
      executablePath,
      args: direct ? ['--allow-loopback-in-peer-connection'] : undefined,
    },
    trace: 'retain-on-failure',
  },
  webServer: publicSignal ? publicURL ? [] : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4192 --strictPort', url: baseURL, timeout: 20_000,
  } : [
    {
      command: 'node scripts/test-signaling.mjs',
      url: 'http://127.0.0.1:8790/',
      env: { STICHRUNDE_TEST_RELAY_KEY: relayKey },
      timeout: 15_000,
    },
    {
      command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4192 --strictPort',
      url: baseURL,
      env: { VITE_STICHRUNDE_TEST_RELAY_KEY: relayKey },
      timeout: 20_000,
    },
  ],
})
