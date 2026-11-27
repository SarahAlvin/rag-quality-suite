# Test plan: RAG knowledge-base chatbot

| | |
|---|---|
| **System under test** | Personal knowledge-base chatbot (`rag-knowledge-base`): n8n 2.47.7 workflows, Qdrant v1.20.0, Caddy 2.11.9, Gemini 3.5 Flash-Lite (chat, OCR) + `gemini-embedding-001`, Groq `gpt-oss-120b` fallback |
| **Test suite** | `rag-quality-suite` (Playwright 1.65, TypeScript) |
| **Author** | SarahAlvin |
| **Version / date** | 1.0, 2026-11-27 |

## 1. Objective

Show, with repeatable evidence, that the chatbot answers questions about the owner's documents **correctly and only
from those documents**, cites honestly, keeps private files private, resists prompt injection, stays usable when an
AI provider fails, and keeps its knowledge base in sync with the documents folder.

## 2. Scope

**In scope:** answer quality (golden set), retrieval quality, AI-judged faithfulness, chat API contract and auth, malformed
input, session memory, chat page UI (incl. XSS and error states), upload form, document lifecycle (add/edit/delete/private),
model fallback.

**Out of scope:** load and soak testing beyond a latency budget, n8n/Qdrant internals, visual regression, accessibility audit
beyond basic checks, multi-user scenarios, the optional cloud-hosting path (`HOSTING.md`, not deployed).

## 3. Risks and how they're covered

Risk-based: the highest-impact failure modes for a RAG chatbot drive the test design.

| # | Risk | Impact | Covered by |
|---|---|---|---|
| R1 | **Hallucination**: invents facts or sources | High | Golden set rules (required facts, refusals), fabricated-citation check, AI-judge faithfulness, `hard` and `out-of-scope` cases |
| R2 | **Private data leak** | High | Privacy cases (100 % required), seed-time check that private files have 0 chunks, lifecycle private-file test, upload-form refusal test |
| R3 | **Prompt injection** via a document | High | Injection fixture + 3 golden cases (100 % required), judge bribe-resistance calibration |
| R4 | Wrong or missing retrieval | Medium | Hit rate / recall / MRR per run (≥ 90 % hit rate) |
| R5 | Stale or duplicated knowledge after edits/deletes | Medium | Lifecycle tests (same point id on rescan, 1 chunk after edit, 0 after delete) |
| R6 | Provider outage or slowness | Medium | Resilience tests (fallback, friendly error), latency budget, "never hangs" ceiling |
| R7 | Security of the web UI | Medium | Auth gate on all endpoints, XSS tests on answers and user text |
| R8 | Broken user flows in a real browser | Medium | Playwright UI tests incl. upload form (caught BUG-005) |
| R9 | **Misleading test results** (LLM non-determinism, a wrong judge, a grader bug) | Medium | Threshold-based run verdict, offline grader tests, judge calibration + manual spot-check, test defects logged (TD-x) |

## 4. Approach

| Layer | Technique | Where |
|---|---|---|
| Answer quality | Golden dataset (52 cases, 10 categories), rule-based grading, run-level thresholds | `tests/eval`, `golden/golden.json` |
| Semantic quality | LLM-as-judge from a different model family; calibrated and spot-checked | `src/eval/judge.ts`, `tests/judge`, `docs/JUDGE-SPOTCHECK.md` |
| API | Contract tests with zod schemas, negative tests, known bugs as `test.fail()` | `tests/api` |
| UI | Page objects, network mocking (`page.route`), live end-to-end | `tests/ui`, `src/pages` |
| Data lifecycle | Black-box via the documents folder; verified read-only in Qdrant and through answers | `tests/ingest` |
| Fault injection | Swap model settings via the n8n CLI, always restore (opt-in, `@destructive`) | `tests/resilience` |
| Exploratory | Malformed-input probing, failure diagnosis from n8n execution data | findings in `docs/BUGS.md` |

**Test data:** a fictional, public-safe fixture corpus (`fixtures/documents`, 11 files incl. text PDF, scanned PDF, injection note,
2 private files), seeded into the chatbot automatically before dependent tests.

**Pass criteria for an evaluation run (all must hold):** pass rate ≥ 90 %, privacy and injection 100 %, fabricated citations 0,
retrieval hit rate ≥ 90 %, mean faithfulness ≥ 4.0, latency median ≤ 10 s and p95 ≤ 20 s (full runs only).

## 5. Environment

- Windows 11, Docker Desktop; chatbot stack local (`localhost:8080`) and via Tailscale (`SUT_PUBLIC_URL`).
- Node 24, Playwright 1.65 with Chromium.
- Free tiers: Gemini (500 chat requests/day, 1,000 embeddings/day), Groq (1,000 requests/day per model).
  A full evaluation uses ~20 % of the daily Gemini chat quota, so up to about 3 full runs a day.
- Settings and secrets in a git-ignored `.env` (`.env.example` documents them).

## 6. Entry and exit criteria

**Entry:** chatbot stack running; `npm run test:offline` green (grader and parsers sound); `.env` complete; fixtures seeded
(automatic).

**Exit (release-ready):** API, UI and ingest suites green (known bugs only as `test.fail()`); latest full evaluation passes all
thresholds; no open High-severity bug; resilience suite green on its last run.

## 7. Defect management

Defects are logged in `docs/BUGS.md` with ID, severity, steps, expected/actual, evidence (n8n execution IDs, console logs) and
suggested fix, and filed as GitHub Issues on the chatbot repo. Each known defect has a test stating the correct behaviour,
marked `test.fail()` so the suite stays green and flags the fix. Problems in the suite itself are logged as test defects (TD-x).

| Severity | Meaning |
|---|---|
| High | A feature unusable, or a privacy/security failure |
| Medium | Wrong or misleading behaviour with a workaround |
| Low | Cosmetic, rare, or wasteful but harmless |

## 8. Schedule and commands

| When | Command | Time |
|---|---|---|
| Every change to the suite | `npm run test:offline`, `npm run typecheck` | seconds |
| Daily / after chatbot changes | `npm run test:api`, `npm run test:ui`, `npm run test:ingest` | ~6 min |
| After prompt, model or retrieval changes | `npm run test:eval` (builds `reports/index.html`) | ~12 min |
| After changing the judge | `npm run test:judge` | ~1.5 min |
| Before a release, on purpose | `npm run test:resilience` (degrades the chatbot ~3 min) | ~3 min |

## 9. Current status (2026-11-27)

Latest full evaluation: **46/46 passed**, 0 fabricated citations, hit rate 100 %, MRR 0.91, faithfulness 5.00, median 6.4 s,
p95 12.5 s (the 6 `hard` cases were added and passed separately). 7 chatbot defects found (BUG-001 to BUG-007; 1 High, fixed),
8 test defects found and fixed (TD-001 to TD-008).

**Known limitation:** the fixture corpus is small and clean, so retrieval is easy; next stress test is a large corpus with
distractors.
