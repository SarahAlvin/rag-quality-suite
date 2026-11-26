import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { storedDocs } from '../../src/clients/qdrant';
import { env } from '../../src/env';
import { UploadPage } from '../../src/pages/upload-page';

// FR-UI-7: the upload form indexes normal files and refuses private_ ones. Uses the live chatbot.
// Each run uploads uniquely named files and removes them afterwards (files + chunks).
//
// After submitting, n8n's form script polls a status URL built from n8n's WEBHOOK_URL (the public Tailscale name).
// Opened on that same address the form completes; opened on localhost the poll is cross-origin and blocked (BUG-006).
const uploadsDir = join(env.SUT_DOCUMENTS_DIR, 'uploads');
const id = randomUUID().slice(0, 8);
const created: string[] = [];

function files(tag: string) {
  const normal = `qa-upload-${tag}-${id}.md`;
  const priv = `private_qa-upload-${tag}-${id}.md`;
  created.push(normal, priv);
  return {
    normal,
    priv,
    list: [
      { name: normal, mimeType: 'text/markdown', buffer: Buffer.from(`# QA upload ${tag} ${id}\n\nThe QA upload code is lime-kettle-${id}.`) },
      { name: priv, mimeType: 'text/markdown', buffer: Buffer.from('PRIVATE: must be refused.') },
    ],
  };
}

test.describe('Upload form', () => {
  test.afterAll(async ({ request }) => {
    for (const name of created) rmSync(join(uploadsDir, name), { force: true });
    await request.post('/webhook/kb-scan-now'); // the scan notices the deleted files and removes their chunks
    await expect
      .poll(async () => [...(await storedDocs('documents/uploads/qa-upload-')).keys()].filter((s) => s.includes(id)).length, {
        timeout: 120_000,
        intervals: [5_000],
      })
      .toBe(0);
  });

  test('on the public address: a normal file is indexed, a private_ file is refused', async ({ page }) => {
    test.skip(!env.SUT_PUBLIC_URL, 'SUT_PUBLIC_URL not set');
    test.setTimeout(240_000);
    const f = files('public');
    const form = new UploadPage(page);
    await form.goto(env.SUT_PUBLIC_URL);
    const done = await form.upload(f.list);
    expect(done).toContain(`✅ ${f.normal}: indexed`);
    expect(done).toContain(`🔒 ${f.priv}: refused`);

    expect(existsSync(join(uploadsDir, f.normal)), 'normal file saved to documents/uploads').toBe(true);
    expect(existsSync(join(uploadsDir, f.priv)), 'private file must not be saved').toBe(false);
    expect((await storedDocs(`documents/uploads/${f.normal}`)).size, 'uploaded file has chunks in Qdrant').toBe(1);
  });

  test('on localhost: the done page appears after submitting', async ({ page }) => {
    test.fail(true, 'BUG-006: status poll goes to WEBHOOK_URL (public name), blocked as cross-origin from localhost');
    test.setTimeout(150_000);
    const form = new UploadPage(page);
    await form.goto();
    await form.upload(files('localhost').list, 90_000);
  });
});
