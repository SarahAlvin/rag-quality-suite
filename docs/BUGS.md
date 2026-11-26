# Bug log

Defects found in the system under test (the RAG chatbot). Each one has a test that states the correct behaviour
and is marked `test.fail()` with the bug ID until it's fixed. These will also be filed as GitHub Issues (Phase 8).

| ID | Title | Severity | Status | Found by |
|---|---|---|---|---|
| BUG-001 | Malformed chat requests return 500 instead of 4xx | Medium | Open | Exploratory API probe, 2026-11-26 |
| BUG-002 | Missing or non-text `chatInput` is answered "AI service is busy" | Low | Open | Exploratory API probe, 2026-11-26 |
| BUG-003 | Upload during a scheduled scan can leave a stale "failed" registry status | Low | Open | Chatbot Phase 7 investigation, 2026-11-18 |
| BUG-004 | No timeout on the Gemini call: under load an answer took 147.6 s and the Groq fallback never kicked in | Medium | Open | API "never hangs" test, 2026-11-26 |
| OBS-001 | Empty question and unknown `action` still call the AI (quota use, up to ~19 s) | Observation | Open | Exploratory API probe, 2026-11-26 |
| OBS-002 | Broad summary questions take 15–27 s (over the 20 s budget for factual questions) | Observation | Open | API latency test, 2026-11-26 |
| OBS-003 | The bot won't recall facts the user stated earlier in the chat (by design: answers only from documents) | Observation (design) | Accepted | Session memory test, 2026-11-26 |

---

## BUG-001: Malformed chat requests return 500 instead of 4xx

**Severity:** Medium. A client mistake is reported as a server failure, which hides real outages in monitoring and gives callers nothing to fix.

**Steps (authenticated):**
1. `POST /webhook/<chat-id>/chat` with body `{"action":"sendMessage","chatInput":"hi"}` (no `sessionId`).
2. Repeat with an empty body.
3. Repeat with valid JSON that isn't an object, e.g. `"just a string"`.

**Expected:** `400`-range status with a message naming the missing field.

**Actual:** `500 {"message":"Error in workflow"}` for all three (≈0.2 s). (Invalid JSON is handled correctly: `422 Failed to parse request body`.)

**Likely cause:** the memory node uses `sessionId` as its key; an empty key throws before the agent's error branch.

**Tests:** `tests/api/malformed.spec.ts` → "missing sessionId…", "empty body…"

---

## BUG-002: Missing or non-text `chatInput` is answered "AI service is busy"

**Severity:** Low. The message is wrong: the AI service is fine and the request is bad. A number input also takes about 16 s and spends AI quota first.

**Steps (authenticated):**
1. `POST` `{"action":"sendMessage","sessionId":"x"}` (no `chatInput`).
2. `POST` `{"action":"sendMessage","sessionId":"y","chatInput":12345}`.

**Expected:** a quick reply saying a question is required.

**Actual:** `200 {"output":"Sorry, the AI service is busy or unavailable right now. Please try again in a minute."}`. Case 1 takes 0.3 s; case 2 takes 16.5 s.

**Likely cause:** the agent fails on the invalid prompt and its error branch shows the generic "busy" message used for model outages.

**Tests:** `tests/api/malformed.spec.ts` → "missing chatInput…", "a non-text chatInput…"

---

## BUG-003: Upload during a scheduled scan can leave a stale "failed" status

**Severity:** Low. Self-heals on the next scan.

**Steps:**
1. Have a file whose registry status is `failed`.
2. Upload a corrected version through the form at the moment a scheduled scan is ingesting the old version.

**Expected:** the registry ends as `indexed` for the corrected file.

**Actual:** the upload's run marks it `indexed` (07:08:24), then the scan's run (old file contents) overwrites it as `failed` (07:08:31), even though Qdrant holds the correct chunks.

**Likely cause:** two ingest runs of the same file can overlap; there is no per-file lock or "last writer wins by content hash" check.

**Tests:** planned in Phase 7 (ingestion).

---

## BUG-004: No timeout on the Gemini call, so slowness never triggers the fallback

**Severity:** Medium. Users can wait minutes for an answer, and the Groq fallback (built for exactly this) never helps.

**Steps:** send 4 broad questions back to back (e.g. "What do my notes say about RAG?"), about 20 s apart.

**Expected:** every answer within the 60 s "never hangs" ceiling; when Gemini is slow, Groq answers instead.

**Actual (2026-11-26, n8n executions 276–282):** reply times grew **19.8 s → 31 s → 51.4 s → 147.6 s**.
Per-node timings show the search and embedding always took ~1 s, and the agent's first Gemini call stayed fast (0.9–1.7 s).
The second Gemini call (writing the answer) took **17.3 s** in #276 and **146.0 s** in #282.
No node reported an error, so the fallback model, which triggers on errors, was never used. Pattern consistent with
free-tier throttling plus silent client-side retry/backoff.

**Suggested fix:** a request timeout (~30 s) on the Gemini chat model, so slowness becomes an error and Groq takes over.

**Tests:** `tests/api/contract.spec.ts` → "a reply never takes longer than 60 s" (fails only when the bug occurs;
the suite now paces questions ≥ 10 s apart, so it reflects real use rather than self-inflicted load).

---

## OBS-001: Empty question and unknown `action` still call the AI

Not a defect in behaviour, but wasteful: an empty `chatInput` gets an AI greeting (≈2 s), and `"action":"deleteEverything"` is processed as a normal message (≈19 s). Both spend free-tier quota. Suggestion: reject empty input and unknown actions before the agent.

---

## OBS-003: The bot won't recall facts the user stated in the conversation

"For this conversation only: my locker number is 7342" → "What is my locker number?" (same session) →
"I couldn't find that in your documents." Memory is used to rewrite follow-up questions (it resolved "it" correctly
in other tests), but the system prompt only allows answers from retrieved documents. This is consistent with the
chatbot's grounding requirement (FR-CHAT-4), so it's accepted as designed. It's worth knowing as a product limitation,
since users may expect a chatbot to remember what they just said.

---

## OBS-002: Broad summary questions are slow

"What do my notes say about RAG?" took 26.9 s, 21.3 s and under 15 s in three runs (2026-11-26). n8n executions 270 and 272
show **only Gemini ran** (no Groq fallback), so this is generation time for a long answer, not rate limiting.
Short factual questions averaged ~3 s in the chatbot's acceptance test. The SUT's 20 s budget was defined for factual
questions, so it's measured over the golden set (eval suite). Suggestion if it matters: cap `maxOutputTokens` lower,
or stream the answer so the first words appear sooner.
