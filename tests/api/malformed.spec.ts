import { test, expect } from '@playwright/test';
import { ChatClient } from '../../src/clients/chat-client';

// FR-API-3: malformed requests. Each test states the CORRECT behaviour.
// Known bugs are marked test.fail() with their ID from docs/BUGS.md: the suite stays green while the bug
// exists, and Playwright reports "expected to fail but passed" once it's fixed, so the marker can be removed.
// Findings from exploratory probing on 2026-11-26.

const isClientError = (status: number) => status >= 400 && status < 500;

test.describe('Malformed chat requests', () => {
  test('non-JSON body is rejected with a 4xx', async ({ request }) => {
    const res = await new ChatClient(request).raw('this is not json');
    expect(res.status).toBe(422);
  });

  test('missing sessionId is rejected with a 4xx, not a server error', async ({ request }) => {
    test.fail(true, 'BUG-001: returns 500 "Error in workflow"');
    const res = await new ChatClient(request).raw('{"action":"sendMessage","chatInput":"hi"}');
    expect(isClientError(res.status), `got HTTP ${res.status}: ${res.text}`).toBe(true);
  });

  test('valid JSON that is not an object is rejected with a 4xx, not a server error', async ({ request }) => {
    test.fail(true, 'BUG-001: a bare JSON string returns 500 "Error in workflow"');
    const res = await new ChatClient(request).raw('"this is a JSON string, not an object"');
    expect(isClientError(res.status), `got HTTP ${res.status}: ${res.text}`).toBe(true);
  });

  test('empty body is rejected with a 4xx, not a server error', async ({ request }) => {
    test.fail(true, 'BUG-001: returns 500 "Error in workflow"');
    const res = await new ChatClient(request).raw('');
    expect(isClientError(res.status), `got HTTP ${res.status}: ${res.text}`).toBe(true);
  });

  test('missing chatInput gets a clear message, not "AI service is busy"', async ({ request }) => {
    test.fail(true, 'BUG-002: blames the AI service for a client mistake');
    const res = await new ChatClient(request).raw('{"action":"sendMessage","sessionId":"qa-malformed-1"}');
    expect(res.text).not.toMatch(/busy or unavailable/i);
  });

  test('a non-text chatInput is handled quickly with a clear message', async ({ request }) => {
    test.fail(true, 'BUG-002: takes ~16 s, spends AI quota, then says "AI service is busy"');
    const res = await new ChatClient(request).raw('{"action":"sendMessage","sessionId":"qa-malformed-2","chatInput":12345}');
    expect(res.text).not.toMatch(/busy or unavailable/i);
    expect(res.latencyMs).toBeLessThan(2_000);
  });

  test('no malformed request leaks a stack trace or internal paths', async ({ request }) => {
    const chat = new ChatClient(request);
    for (const body of ['', 'this is not json', '{"action":"sendMessage","chatInput":"hi"}']) {
      const res = await chat.raw(body);
      expect(res.text).not.toMatch(/\bat\s+\S+\s+\(|node_modules|\/usr\/local\/lib/);
    }
  });
});
