import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

// One Playwright config, several "projects" (test groups) run with npm scripts:
//   seed (runs first automatically), api, ui, eval, ingest, resilience (opt-in),
//   offline (no chatbot needed; runs in CI), fixtures-remove (on demand).
// The config reads .env without validating it, so the offline tests run where there is no .env (CI).
// Tests that talk to the chatbot import src/env.ts, which validates every setting and fails fast.
const env = process.env;
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // the chatbot shares free-tier quotas, so tests run one at a time
  workers: 1,
  retries: 0, // LLM non-determinism is measured with repeats, not hidden by retries
  timeout: 120_000,
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  forbidOnly: Boolean(process.env.CI), // a stray test.only must not silently skip the rest in CI
  use: {
    baseURL: env.SUT_BASE_URL,
    httpCredentials: env.SUT_USER && env.SUT_PASSWORD ? { username: env.SUT_USER, password: env.SUT_PASSWORD } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'seed', testDir: './tests/setup', testMatch: /seed\.setup\.ts/ },
    { name: 'fixtures-remove', testDir: './tests/setup', testMatch: /remove-fixtures\.setup\.ts/ },
    { name: 'api', testDir: './tests/api', dependencies: ['seed'] },
    { name: 'ui', testDir: './tests/ui', dependencies: ['seed'], use: { ...devices['Desktop Chrome'] } },
    { name: 'eval', testDir: './tests/eval', dependencies: ['seed'], timeout: 60 * 60_000 },
    { name: 'ingest', testDir: './tests/ingest', timeout: 15 * 60_000 },
    { name: 'resilience', testDir: './tests/resilience', grep: /@destructive/, dependencies: ['seed'] },
    { name: 'offline', testDir: './tests/offline' },
    { name: 'judge', testDir: './tests/judge' }, // calibrates the AI judge; needs GROQ_API_KEY, not the chatbot
    { name: 'report', testDir: './tests/report' }, // rebuilds reports/index.html from saved runs
  ],
});
