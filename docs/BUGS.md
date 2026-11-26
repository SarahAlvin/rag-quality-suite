# Bug log

Defects found in the system under test (the RAG chatbot). Each one has a test that states the correct behaviour
and is marked `test.fail()` with the bug ID until it's fixed. These will also be filed as GitHub Issues (Phase 8).

| ID | Title | Severity | Status | Found by |
|---|---|---|---|---|
| BUG-001 | Malformed chat requests return 500 instead of 4xx | Medium | Open | Exploratory API probe, 2026-11-26 |
| BUG-002 | Missing or non-text `chatInput` is answered "AI service is busy" | Low | Open | Exploratory API probe, 2026-11-26 |
| BUG-003 | Upload during a scheduled scan can leave a stale "failed" registry status | Low | Open | Chatbot Phase 7 investigation, 2026-11-18 |
| BUG-004 | No timeout on the Gemini call: under load an answer took 147.6 s and the Groq fallback never kicked in | Medium | Open | API "never hangs" test, 2026-11-26 |
| BUG-005 | Upload form can't be submitted in any browser ("Problem submitting response"): n8n's sandbox header makes the page's origin `null`, so its own POST is blocked by CORS | **High** | Fixed (Caddy header override for /form/*) | UI end-to-end test, 2026-11-27 |
| BUG-006 | On `localhost`, the upload form never shows "Upload finished" (spins forever): its status poll goes to the public Tailscale address, blocked as cross-origin. Regression from switching `WEBHOOK_URL` to Tailscale | Medium | Open: workaround is to use the public address everywhere | UI end-to-end test, 2026-11-27 |
| OBS-001 | Empty question and unknown `action` still call the AI (quota use, up to ~19 s) | Observation | Open | Exploratory API probe, 2026-11-26 |
| OBS-002 | Broad summary questions take 15–27 s (over the 20 s budget for factual questions) | Observation | Open | API latency test, 2026-11-26 |
| OBS-003 | The bot won't recall facts the user stated earlier in the chat (by design: answers only from documents) | Observation (design) | Accepted | Session memory test, 2026-11-26 |
| OBS-004 | Vague questions ("list every secret code word") trigger several searches and take 11–20 s vs a 7 s median | Observation | Open | Golden-set run, 2026-11-27 |

### Test defects (problems in the suite itself, found and fixed)

| ID | Title | Fix |
|---|---|---|
| TD-001 | privacy-03 expected a refusal, but non-private documents in the knowledge base legitimately mention "secret" codes | Case changed to `expect: either`; it still fails if a private code word appears or a private file is cited |
| TD-002 | "no password" check used a Playwright context that silently inherited the config's credentials (got 200) | Use Node `fetch` for no-password, explicit wrong credentials otherwise |
| TD-003 | Negative tests sent string bodies that Playwright JSON-encoded again (`'abc'` → `'"abc"'`) | Send raw bytes (`Buffer`) |
| TD-004 | Memory test planted a fact in the chat ("locker number"), which the grounded bot rightly refuses to repeat (OBS-003) | Test reference resolution ("it") instead |
| TD-005 | Scorecard reported "hit rate 0 %" for runs with no retrieval cases, and enforced latency percentiles on 4-case runs | Retrieval metrics are n/a when unmeasured; latency limits apply to full runs only |
| TD-006 | Mocked reply cited `notes/tea-tasting-log.txt`, a format the real bot never produces; the page showed it as given and the test expected the folder stripped | Mocks mirror the real reply format (bare filenames) |
| TD-007 | Playwright's headless browser download had been cut off (8 MB of 287 MB), so every UI test failed with `spawn EFTYPE` | Reinstalled; worth a setup check in CI |

**Known limitation:** the suite runs against the real knowledge base, which also holds non-fixture documents. Tests must
not assume they only see the fixtures. Expectations check what must (not) appear, not that nothing else exists.

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

## BUG-005: Upload form can't be submitted in any browser

**Severity:** High. A whole feature (upload documents from the browser) is unusable, while API-level tests pass.

**Steps:** open `http://localhost:8080/form/kb-upload` in a browser, log in, choose a `.md` file, click **Upload and index**.

**Expected:** the "Upload finished" page listing the file as indexed.

**Actual:** "Problem submitting response. The form could not be submitted." The file is not saved. Browser console:
`Access to fetch at 'http://localhost:8080/form/kb-upload' from origin 'null' has been blocked by CORS policy`.

**Root cause:** n8n 2.47.7 serves form pages with
`Content-Security-Policy: sandbox allow-forms allow-scripts …` **without** `allow-same-origin`. A sandboxed page gets an
opaque (`null`) origin, so the form's own `fetch` POST to its URL is cross-origin, and n8n sends no CORS headers.
Earlier upload checks used `curl`, which doesn't enforce CORS, so they passed.

**Fix (in the chatbot repo):** Caddy overrides the header for `/form/*` only, adding `allow-same-origin`. Trade-off: this
lifts the sandbox's origin isolation for n8n's own form pages (behind the password); every other route keeps n8n's header.

**Tests:** `tests/ui/upload.spec.ts` (now passing); diagnosis recorded with a network/console capture in a browser.

**Possibly related:** n8n's hosted chat page (`/webhook/…/chat` opened in a browser) gets the same header. The custom
chat page at `/app/` is unaffected (served by Caddy).

---

## BUG-006: On localhost the upload form never finishes (regression)

**Severity:** Medium. The file IS uploaded and indexed, but the user on `http://localhost:8080` never sees the result and
may upload again. On the public Tailscale address the form completes normally.

**Steps:** open `http://localhost:8080/form/kb-upload`, upload a file.

**Expected:** "Upload finished" page.

**Actual:** the button spins indefinitely. Console: `Access to fetch at 'https://desktop-….ts.net/form-waiting/786/n8n-execution-status?…'
from origin 'http://localhost:8080' has been blocked by CORS policy`.

**Root cause:** after submit, n8n's form script polls `<WEBHOOK_URL>/form-waiting/<execution>/…`. `WEBHOOK_URL` was changed to the
Tailscale address (chatbot Phase 9) so links work on the phone, so on localhost the poll is cross-origin. n8n supports one
public address only, so either localhost or the public address can complete the flow, not both.

**Workaround / recommendation:** use the public address on every device, including the PC (it's on the same tailnet).

**Tests:** `tests/ui/upload.spec.ts`: "on the public address…" passes; "on localhost…" is `test.fail()` with this ID.

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
