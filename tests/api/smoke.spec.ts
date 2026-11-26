import { test, expect } from '@playwright/test';
import { env } from '../../src/env';

// Phase 0 smoke tests: the suite can reach the chatbot and the password gate works.
// Note: Playwright request contexts pick up httpCredentials from the config, even ones created
// with playwright.request.newContext(). So "no password" is checked with Node's own fetch,
// and "wrong password" with explicitly wrong credentials.
test.describe('Smoke', () => {
  test('chat page refuses requests with no password', async () => {
    const res = await fetch(new URL('/app/', env.SUT_BASE_URL));
    expect(res.status).toBe(401);
  });

  test('chat page refuses a wrong password', async ({ playwright }) => {
    const wrong = await playwright.request.newContext({
      baseURL: env.SUT_BASE_URL,
      httpCredentials: { username: env.SUT_USER, password: 'definitely-wrong' },
    });
    const res = await wrong.get('/app/');
    expect(res.status()).toBe(401);
    await wrong.dispose();
  });

  test('chat page loads with the password', async ({ request }) => {
    const res = await request.get('/app/');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('My Knowledge Base');
  });
});
