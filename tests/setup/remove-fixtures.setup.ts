import { test as setup, expect } from '@playwright/test';
import { storedDocs } from '../../src/clients/qdrant';
import { removeFixturesFromChatbot, SOURCE_PREFIX } from '../../src/fixtures';

// Run on demand (npm run fixtures:remove): deletes the fixture folder from the chatbot, starts a scan,
// and waits until the chatbot has removed every fixture chunk from Qdrant.
setup('remove fixture documents from the chatbot', async ({ request }) => {
  setup.setTimeout(5 * 60_000);
  removeFixturesFromChatbot();
  expect((await request.post('/webhook/kb-scan-now')).status()).toBe(200);
  await expect
    .poll(async () => (await storedDocs(SOURCE_PREFIX)).size, { timeout: 4 * 60_000, intervals: [5_000] })
    .toBe(0);
});
