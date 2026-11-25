import { defineConfig, devices } from '@playwright/test';
import { env } from './src/env';

// One Playwright config, several "projects" (test groups) run with npm scripts:
//   api, ui, eval, ingest, resilience (opt-in), offline (no chatbot needed; runs in CI).
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // the chatbot shares free-tier quotas, so tests run one at a time
  workers: 1,
  retries: 0, // LLM non-determinism is measured with repeats, not hidden by retries
  timeout: 120_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: env.SUT_BASE_URL,
    httpCredentials: { username: env.SUT_USER, password: env.SUT_PASSWORD },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'ui', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
    { name: 'eval', testDir: './tests/eval', timeout: 60 * 60_000 },
    { name: 'ingest', testDir: './tests/ingest', timeout: 15 * 60_000 },
    { name: 'resilience', testDir: './tests/resilience', grep: /@destructive/ },
    { name: 'offline', testDir: './tests/offline' },
  ],
});
