import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { ChatClient } from '../../src/clients/chat-client';
import { chunksOf } from '../../src/clients/qdrant';
import { env } from '../../src/env';
import { isRefusal } from '../../src/sut/chat';

// FR-ING-2..5: the knowledge base follows a document through its life (add → edit → unchanged → delete),
// checked in storage (Qdrant, read-only) and through real chat answers. Runs in order (serial) on one
// uniquely named document in its own folder, so it never touches the fixtures or real notes.
const id = randomUUID().slice(0, 8);
const folder = join(env.SUT_DOCUMENTS_DIR, 'qa-ingest');
const fileName = `qa-ingest-${id}.md`;
const filePath = join(folder, fileName);
const privatePath = join(folder, `private_qa-ingest-${id}.md`);
const source = `documents/qa-ingest/${fileName}`;
const privateSource = `documents/qa-ingest/private_qa-ingest-${id}.md`;
const question = `What is the lifecycle test code for run ${id}?`;
const codeV1 = `amber-falcon-${id}`;
const codeV2 = `cobalt-heron-${id}`;
const privateCode = `secret-otter-${id}`;

const doc = (code: string) => `# Lifecycle test ${id}\n\nThe lifecycle test code for run ${id} is ${code}.\n`;
const scan = async (request: APIRequestContext) => expect((await request.post('/webhook/kb-scan-now')).status()).toBe(200);
const POLL = { timeout: 180_000, intervals: [5_000] };

test.describe.configure({ mode: 'serial' });

test.describe('Document lifecycle', () => {
  test.beforeAll(() => mkdirSync(folder, { recursive: true }));
  test.afterAll(async ({ request }) => {
    rmSync(folder, { recursive: true, force: true });
    await request.post('/webhook/kb-scan-now');
  });

  test('add: a new file is stored and answerable; a private file next to it is not', async ({ request }) => {
    writeFileSync(filePath, doc(codeV1));
    writeFileSync(privatePath, `PRIVATE. The code is ${privateCode}.`);
    await scan(request);
    await expect.poll(async () => (await chunksOf(source)).length, POLL).toBe(1);

    const r = await new ChatClient(request).ask(question);
    expect(r.answer).toContain(codeV1);
    expect(r.citations).toContain(fileName);

    expect(await chunksOf(privateSource), 'private file must never be stored').toHaveLength(0);
    const leak = await new ChatClient(request).ask(`What is the secret otter code for run ${id}?`);
    expect(leak.answer).not.toContain(privateCode);
  });

  test('edit: the new fact replaces the old one, with no duplicate chunks', async ({ request }) => {
    writeFileSync(filePath, doc(codeV2));
    await scan(request);
    await expect.poll(async () => (await chunksOf(source)).map((c) => c.content).join(' '), POLL).toContain(codeV2);
    const chunks = await chunksOf(source);
    expect(chunks, 'still exactly one chunk (old one replaced, not added to)').toHaveLength(1);
    expect(chunks[0]!.content).not.toContain(codeV1);

    const r = await new ChatClient(request).ask(question);
    expect(r.answer).toContain(codeV2);
    expect(r.answer).not.toContain(codeV1);
  });

  test('unchanged: a rescan keeps the same stored chunk (nothing re-embedded)', async ({ request }) => {
    const before = (await chunksOf(source)).map((c) => c.id);
    await scan(request);
    await new Promise((r) => setTimeout(r, 30_000)); // give the scan time to finish (it returns immediately)
    const after = (await chunksOf(source)).map((c) => c.id);
    expect(after, 'same point id = the chunk was not deleted and re-inserted').toEqual(before);
  });

  test('delete: removing the file removes its chunks, and the bot no longer knows it', async ({ request }) => {
    rmSync(filePath);
    await scan(request);
    await expect.poll(async () => (await chunksOf(source)).length, POLL).toBe(0);

    const r = await new ChatClient(request).ask(question);
    expect(r.answer).not.toContain(codeV2);
    expect(isRefusal(r.answer), `expected "couldn't find", got: ${r.answer}`).toBe(true);
  });
});
