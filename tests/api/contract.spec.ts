import { test, expect } from '@playwright/test';
import { ChatClient, REQUEST_TIMEOUT_MS } from '../../src/clients/chat-client';

// FR-API-2 (reply schema) plus a "never hangs" ceiling. These checks don't depend on what's in the
// knowledge base: they hold whatever the documents say. Each test costs ~2 Gemini calls.
// The real latency budget (p95 < 20 s, median < 10 s) is measured over the golden set in the eval suite:
// broad summary questions like the one used here legitimately take 15–27 s (OBS-002 in docs/BUGS.md).
const NO_HANG_CEILING_MS = 60_000;

test.describe('Chat reply contract', () => {
  test('a question about the notes returns a valid reply with the search it ran', async ({ request }) => {
    const chat = new ChatClient(request);
    const result = await chat.ask('What do my notes say about RAG?'); // throws if the schema doesn't match

    expect(result.status).toBe(200);
    expect(result.answer.trim().length).toBeGreaterThan(0);
    expect(result.searches.length, 'the agent should search for a question about the notes').toBeGreaterThan(0);

    const search = result.searches[0]!;
    expect(search.query.trim().length, 'the agent writes a non-empty search query').toBeGreaterThan(0);
    expect(search.chunks.length).toBeGreaterThan(0);
    expect(search.chunks.length).toBeLessThanOrEqual(5);
    for (const chunk of search.chunks) {
      expect(chunk.pageContent.length).toBeGreaterThan(0);
      expect(chunk.metadata.filename).toMatch(/\.(md|txt|pdf)$/i);
    }
  });

  test('every cited file was actually retrieved (no fabricated citations)', async ({ request }) => {
    const chat = new ChatClient(request);
    const result = await chat.ask('What do my notes say about RAG?');
    for (const cited of result.citations) {
      expect(result.retrievedFiles, `cited "${cited}" but it was never retrieved`).toContain(cited);
    }
  });

  test('small talk is answered without searching and without sources', async ({ request }) => {
    const chat = new ChatClient(request);
    const result = await chat.ask('Hi there! Thanks for your help.');
    expect(result.status).toBe(200);
    expect(result.searches).toHaveLength(0);
    expect(result.citations).toHaveLength(0);
  });

  test(`a reply never takes longer than ${NO_HANG_CEILING_MS / 1000} s`, async ({ request }) => {
    // Long enough to measure a slow reply instead of timing out (BUG-004 saw 147.6 s under load).
    test.setTimeout(REQUEST_TIMEOUT_MS + 30_000);
    test.info().annotations.push({ type: 'issue', description: 'BUG-004: no timeout on the Gemini call, so slowness never triggers the Groq fallback' });
    const chat = new ChatClient(request);
    const result = await chat.ask('What do my notes say about RAG?');
    test.info().annotations.push({ type: 'latency', description: `${result.latencyMs} ms` });
    expect(result.latencyMs).toBeLessThan(NO_HANG_CEILING_MS);
  });
});
