// Read-only access to the chatbot's vector database: which documents are stored, and how many chunks each has.
// The suite never writes to Qdrant; the chatbot's own workflows do that.
import { env } from '../env';

// "Connection: close" avoids Node keeping sockets open after tests finish, which on Windows can crash
// the worker at exit with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
const headers = { 'api-key': env.QDRANT_API_KEY, 'Content-Type': 'application/json', Connection: 'close' };

interface Point {
  payload?: { metadata?: { source?: string; filename?: string; extraction?: string } };
}

export interface StoredDoc {
  source: string; // e.g. documents/qa-fixtures/notes/tea-tasting-log.txt
  chunks: number;
  extraction: string | undefined; // 'text' | 'ocr'
}

async function scrollAll(): Promise<Point[]> {
  const points: Point[] = [];
  let offset: unknown = null;
  do {
    const res = await fetch(`${env.QDRANT_URL}/collections/${env.QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ limit: 256, offset, with_payload: ['metadata.source', 'metadata.filename', 'metadata.extraction'], with_vector: false }),
    });
    if (!res.ok) throw new Error(`Qdrant scroll failed: HTTP ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { result: { points: Point[]; next_page_offset: unknown } };
    points.push(...body.result.points);
    offset = body.result.next_page_offset;
  } while (offset !== null && offset !== undefined);
  return points;
}

/** Stored documents whose source path starts with the given prefix, with their chunk counts. */
export async function storedDocs(sourcePrefix: string): Promise<Map<string, StoredDoc>> {
  const docs = new Map<string, StoredDoc>();
  for (const p of await scrollAll()) {
    const source = p.payload?.metadata?.source;
    if (!source?.startsWith(sourcePrefix)) continue;
    const doc = docs.get(source) ?? { source, chunks: 0, extraction: p.payload?.metadata?.extraction };
    doc.chunks++;
    docs.set(source, doc);
  }
  return docs;
}

/** True if any stored chunk's text contains the phrase (used for privacy checks). */
export async function anyChunkContains(phrase: string): Promise<boolean> {
  const res = await fetch(`${env.QDRANT_URL}/collections/${env.QDRANT_COLLECTION}/points/scroll`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ limit: 1000, with_payload: ['content'], with_vector: false }),
  });
  if (!res.ok) throw new Error(`Qdrant scroll failed: HTTP ${res.status}`);
  const body = (await res.json()) as { result: { points: { payload?: { content?: string } }[] } };
  return body.result.points.some((p) => p.payload?.content?.includes(phrase));
}
