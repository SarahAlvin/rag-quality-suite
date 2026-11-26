// Talks to the chatbot's chat endpoint and returns everything a test might check.
import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { env } from '../env';
import { ChatResponseSchema, parseCitations, parseSearches, type Search } from '../sut/chat';

export interface ChatResult {
  status: number;
  latencyMs: number;
  sessionId: string;
  answer: string;
  citations: string[];
  searches: Search[];
  /** Filenames of every retrieved chunk, in rank order (duplicates kept). */
  retrievedFiles: string[];
}

export const newSessionId = (): string => `qa-${randomUUID()}`;

/** Minimum gap between questions. Back-to-back questions make Gemini's free tier throttle hard (BUG-004),
 *  which measures the test's own load, not real use. Shared across all clients in the test run. */
const MIN_GAP_MS = 10_000;
let lastAskAt = 0;
async function pace(): Promise<void> {
  const wait = lastAskAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAskAt = Date.now();
}

/** Generous request timeout so slow replies are measured and reported, not cut off. */
export const REQUEST_TIMEOUT_MS = 180_000;

export class ChatClient {
  constructor(private readonly request: APIRequestContext) {}

  /** Ask a question. Throws if the reply doesn't match the documented schema. */
  async ask(chatInput: string, sessionId: string = newSessionId()): Promise<ChatResult> {
    await pace();
    const started = Date.now();
    const res = await this.request.post(env.SUT_CHAT_PATH, {
      data: { action: 'sendMessage', sessionId, chatInput },
      timeout: REQUEST_TIMEOUT_MS,
    });
    const latencyMs = Date.now() - started;
    const body = ChatResponseSchema.parse(await res.json());
    const searches = parseSearches(body);
    return {
      status: res.status(),
      latencyMs,
      sessionId,
      answer: body.output,
      citations: parseCitations(body.output),
      searches,
      retrievedFiles: searches.flatMap((s) => s.chunks.map((c) => c.metadata.filename)),
    };
  }

  /** Send any body byte-for-byte (for negative tests). Never throws on bad status. */
  async raw(body: string): Promise<{ status: number; text: string; latencyMs: number }> {
    const started = Date.now();
    const res = await this.request.post(env.SUT_CHAT_PATH, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
      // A Buffer, not a string: with a JSON content type Playwright JSON-encodes string data,
      // so 'abc' would arrive as '"abc"' (valid JSON) instead of the invalid body we meant to send.
      data: Buffer.from(body),
    });
    return { status: res.status(), text: await res.text(), latencyMs: Date.now() - started };
  }
}
