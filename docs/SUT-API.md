# System under test: interfaces the suite uses

Verified 2026-11-26 against the chatbot (`rag-knowledge-base`, n8n 2.47.7) after testability changes T1–T2.
All URLs sit behind Caddy basic auth (`401` without it).

## Chat: `POST {SUT_BASE_URL}{SUT_CHAT_PATH}`

Request:

```json
{ "action": "sendMessage", "sessionId": "any-string", "chatInput": "What is the cat called?" }
```

Response (T1: agent option *Return intermediate steps* on):

```json
{
  "output": "The cat is called Pistachio.\n\nSources:\n- garden-journal-scan.pdf",
  "intermediateSteps": [
    {
      "action": { "tool": "search_knowledge_base", "toolInput": { "input": "cat" }, "log": "…", "toolCallId": "…", "type": "…" },
      "observation": "<STRING containing JSON, see below>"
    }
  ]
}
```

- `output`: the answer; citations follow a `Sources:` line as `- <filename>` bullets.
- `intermediateSteps`: one entry per tool call. **Empty** when the agent answers without searching (e.g. small talk).
- `action.toolInput.input`: the search query **the agent wrote** (it rewrites the user's question).

`observation` is JSON encoded **twice**:

```text
observation (string) ──JSON.parse──► [ { "response": [ item, item, … ] } ]
item = { "type": "text", "text": (string) ──JSON.parse──► { "pageContent": "…", "metadata": { … } } }
```

- `response` holds the retrieved chunks **in rank order** (top-k = 5).
- `metadata` fields used by the suite: `filename`, `source`, `doc_id`, `file_type`, `extraction` (`text` | `ocr`), `content_hash`.

Example ranking for "What is the cat called?": 1 `garden-journal-scan.pdf` ✔ · 2 `upload-test.md` · 3 `rag-basics.md` · 4 `rag-basics.md` · 5 `kitchen-notes.pdf`.

## Scan hook: `POST {SUT_BASE_URL}/webhook/kb-scan-now` (T2)

Starts **KB · Scan folder** and returns at once: `200 {"message":"Workflow was started"}`.
It does not wait for indexing, so tests poll Qdrant (read-only) until expected fixtures have points.

## Qdrant (read-only): `{QDRANT_URL}`

Header `api-key: {QDRANT_API_KEY}`. Used for: `POST /collections/{collection}/points/scroll` with a filter on
`metadata.source` (e.g. prefix `documents/qa-fixtures/`) to check which fixtures are indexed, and point counts.

## Upload form: `{SUT_BASE_URL}/form/kb-upload`

`multipart/form-data`, field `field-0` (repeatable) with `.md`/`.txt`/`.pdf`. Returns `{"formWaitingUrl": …}`;
the done page at that URL lists ✅ / ⚠️ / ❌ / 🔒 per file.

## Fixtures folder (T3)

The suite copies its fictional corpus to `<chatbot>/documents/qa-fixtures/` and removes it on teardown.
