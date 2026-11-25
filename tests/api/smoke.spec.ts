import { test, expect } from '@playwright/test';
import { env } from '../../src/env';

// Phase 0 smoke test: proves the suite can reach the chatbot and that the password gate works.
test.describe('Smoke', () => {
  test('chat page requires the password', async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: env.SUT_BASE_URL });
    const res = await anonymous.get('/app/');
    expect(res.status()).toBe(401);
    await anonymous.dispose();
  });

  test('chat page loads with the password', async ({ request }) => {
    const res = await request.get('/app/');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('My Knowledge Base');
  });
});
