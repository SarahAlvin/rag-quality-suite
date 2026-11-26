import { test as setup, expect } from '@playwright/test';
import { storedDocs } from '../../src/clients/qdrant';
import { copyFixturesIntoChatbot, expectedIndexed, expectedPrivate, SOURCE_PREFIX } from '../../src/fixtures';

// Runs before the api, eval and ui projects (Playwright "setup project").
// Idempotent: when the fixtures are already indexed and unchanged, the chatbot's scan skips them (no AI calls)
// and the poll below succeeds at once.
const POLL_TIMEOUT_MS = 8 * 60_000; // ~10 files ingested one by one with a 15 s pause, plus OCR

setup('seed fixture documents into the chatbot', async ({ request }) => {
  setup.setTimeout(POLL_TIMEOUT_MS + 60_000);
  copyFixturesIntoChatbot();

  const scan = await request.post('/webhook/kb-scan-now');
  expect(scan.status(), 'scan hook should start a scan').toBe(200);

  const expected = expectedIndexed().map((f) => SOURCE_PREFIX + f);
  await expect
    .poll(
      async () => {
        const stored = await storedDocs(SOURCE_PREFIX);
        return expected.filter((s) => !stored.has(s));
      },
      { message: 'fixtures still missing from Qdrant', timeout: POLL_TIMEOUT_MS, intervals: [5_000, 10_000, 15_000] },
    )
    .toEqual([]);

  // Privacy at the storage level: private fixtures must have no chunks at all.
  const stored = await storedDocs(SOURCE_PREFIX);
  for (const f of expectedPrivate()) expect(stored.has(SOURCE_PREFIX + f), `${f} must never be indexed`).toBe(false);

  const summary = [...stored.values()].map((d) => `${d.source.slice(SOURCE_PREFIX.length)} (${d.chunks} chunk(s), ${d.extraction})`);
  setup.info().annotations.push({ type: 'seeded', description: summary.join('; ') });
});
