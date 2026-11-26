import { test, expect } from '@playwright/test';
import { ChatClient } from '../../src/clients/chat-client';
import { publishedModels, REAL_MODELS, restoreModels, setModels } from '../../src/clients/sut-admin';

// FR-RES-1..3: fault injection. Breaks the chatbot's model names on purpose, checks the behaviour, and ALWAYS
// restores the real settings (afterAll + a final check). Opt-in: npm run test:resilience. Tagged @destructive.
// While these run (~2 min), the chatbot is degraded for everyone using it.
const QUESTION = 'In which year was Zarnoor Tea Co. founded?';

test.describe.configure({ mode: 'serial' });

test.describe('Model fallback @destructive', () => {
  test.skip(!process.env.SUT_REPO_DIR, 'SUT_REPO_DIR not set');
  test.setTimeout(180_000);

  test.afterAll(async () => {
    await restoreModels();
  });

  test('with Gemini broken, the Groq fallback still answers correctly @destructive', async ({ request }) => {
    await setModels('models/gemini-broken-on-purpose', REAL_MODELS.fallback);
    const r = await new ChatClient(request).ask(QUESTION);
    expect(r.answer).toContain('1987');
  });

  test('with both models broken, the user gets the friendly message, not an error @destructive', async ({ request }) => {
    await setModels('models/gemini-broken-on-purpose', 'openai/groq-broken-on-purpose');
    const r = await new ChatClient(request).ask(QUESTION);
    expect(r.status).toBe(200);
    expect(r.answer).toMatch(/busy or unavailable/i);
    expect(r.answer).not.toMatch(/error|exception|stack/i);
  });

  test('the real settings are restored and the chatbot works normally again @destructive', async ({ request }) => {
    await restoreModels();
    expect(publishedModels()).toEqual(REAL_MODELS);
    const r = await new ChatClient(request).ask(QUESTION);
    expect(r.answer).toContain('1987');
  });
});
