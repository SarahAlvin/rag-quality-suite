import { test, expect } from '@playwright/test';
import { env } from '../../src/env';

// FR-API-1: everything behind Caddy needs the password.
// Note: Playwright request contexts pick up httpCredentials from the config, even ones created
// with playwright.request.newContext(). So "no password" is checked with Node's own fetch,
// and "wrong password" with explicitly wrong credentials.
const protectedEndpoints = [
  { name: 'chat page', method: 'GET', path: '/app/' },
  { name: 'chat webhook', method: 'POST', path: env.SUT_CHAT_PATH },
  { name: 'upload form', method: 'GET', path: '/form/kb-upload' },
  { name: 'scan hook', method: 'POST', path: '/webhook/kb-scan-now' },
] as const;

test.describe('Auth gate', () => {
  for (const ep of protectedEndpoints) {
    test(`${ep.name} refuses requests with no password`, async () => {
      const res = await fetch(new URL(ep.path, env.SUT_BASE_URL), { method: ep.method });
      expect(res.status).toBe(401);
    });
  }

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

  test('upload form loads with the password', async ({ request }) => {
    const res = await request.get('/form/kb-upload');
    expect(res.status()).toBe(200);
  });
});
