import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ChatClient, newSessionId, type ChatResult } from '../../src/clients/chat-client';
import { loadGolden, turnsOf } from '../../src/eval/golden';
import { judge } from '../../src/eval/judge';
import { gradeCase } from '../../src/eval/rules';
import { isRefusal } from '../../src/sut/chat';
import { buildScorecard, thresholdFailures, type CaseResult } from '../../src/eval/scorecard';

// The golden-set evaluation (FR-EVAL-1..5, 7). One test runs every case so the run can be judged as a whole:
// individual LLM answers vary, so the run passes on thresholds, not on every single answer.
// Filter with EVAL_ONLY=fact-01,privacy  (case ids or categories).
const GAP_MS = 12_000; // ≤ 5 questions/min ≈ 10 Gemini calls/min, under the 15 RPM free-tier limit
const only = (process.env.EVAL_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
// The AI judge runs when a Groq key is set; EVAL_JUDGE=0 turns it off (faster, rules only).
const useJudge = Boolean(process.env.GROQ_API_KEY) && process.env.EVAL_JUDGE !== '0';

test('golden set evaluation', async ({ request }) => {
  const cases = loadGolden().filter((c) => !only.length || only.includes(c.id) || only.includes(c.category));
  test.setTimeout(cases.length * 3 * 60_000);
  const chat = new ChatClient(request, GAP_MS);
  const results: CaseResult[] = [];

  for (const c of cases) {
    await test.step(`${c.id} [${c.category}] ${turnsOf(c).at(-1)}`, async () => {
      const session = newSessionId();
      let last: ChatResult | undefined;
      let error: string | undefined;
      try {
        for (const turn of turnsOf(c)) last = await chat.ask(turn, session);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const observed = {
        answer: last?.answer ?? '',
        citations: last?.citations ?? [],
        retrievedFiles: last?.retrievedFiles ?? [],
        latencyMs: last?.latencyMs ?? 0,
      };
      const verdict = gradeCase(c, observed);
      if (error) verdict.pass = false;
      const chunks = last?.searches.flatMap((s) => s.chunks) ?? [];

      // AI judge: only answered cases (a refusal has no claims to check). For follow-ups the judge sees
      // the conversation, otherwise "When is it sold?" would look irrelevant.
      let judgeScore, judgeError: string | undefined;
      if (useJudge && last && !error && !isRefusal(last.answer)) {
        const turns = turnsOf(c);
        const question = turns.length > 1 ? `${turns.slice(0, -1).map((t) => `(earlier) ${t}`).join('\n')}\n(now) ${turns.at(-1)}` : turns[0]!;
        try {
          judgeScore = await judge(question, chunks, last.answer);
        } catch (e) {
          judgeError = e instanceof Error ? e.message : String(e);
        }
      }

      results.push({
        case: c,
        verdict,
        ...observed,
        searchQueries: last?.searches.map((s) => s.query) ?? [],
        context: chunks.map((ch) => ({ file: ch.metadata.filename, text: ch.pageContent.slice(0, 400) })),
        judge: judgeScore,
        judgeError,
        error,
      });
      const failed = verdict.checks.filter((ch) => !ch.pass).map((ch) => ch.name + (ch.detail ? ` (${ch.detail})` : ''));
      const j = judgeScore ? `F${judgeScore.faithfulness} R${judgeScore.relevance}` : judgeError ? 'judge error' : '  -  ';
      console.log(`${verdict.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(12)} ${(observed.latencyMs / 1000).toFixed(1).padStart(5)} s  ${j.padEnd(6)} ${failed.join('; ') || ''}${error ? ` ERROR: ${error}` : ''}${judgeScore && judgeScore.faithfulness <= 3 ? ` JUDGE: ${judgeScore.reason}` : ''}`);
    });
  }

  const scorecard = buildScorecard(results);
  const failures = thresholdFailures(scorecard, { partial: only.length > 0 });

  // Save everything for the HTML report (Phase 8) and the trend over runs.
  const dir = join(__dirname, '..', '..', 'reports');
  mkdirSync(dir, { recursive: true });
  const run = { startedAt: new Date().toISOString(), filter: only, scorecard, thresholdFailures: failures, results };
  const stamp = run.startedAt.replace(/[:.]/g, '-');
  writeFileSync(join(dir, `eval-${stamp}.json`), JSON.stringify(run, null, 2));
  writeFileSync(join(dir, 'eval-latest.json'), JSON.stringify(run, null, 2));

  const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
  console.log('\n=== Scorecard ===');
  console.log(`cases ${scorecard.cases} · passed ${scorecard.passed} (${pct(scorecard.passRate)}) · errors ${scorecard.errors}`);
  for (const [cat, b] of Object.entries(scorecard.byCategory)) console.log(`  ${cat.padEnd(13)} ${b.passed}/${b.cases}`);
  const opt = (x: number | null, f: (v: number) => string) => (x === null ? 'n/a' : f(x));
  console.log(`fabricated citations ${scorecard.fabricatedCitations} · hit rate ${opt(scorecard.hitRate, pct)} · recall ${opt(scorecard.meanRecall, pct)} · MRR ${opt(scorecard.mrr, (v) => v.toFixed(2))} (over ${scorecard.retrievalCases} cases)`);
  console.log(`latency median ${(scorecard.latencyMedianMs / 1000).toFixed(1)} s · p95 ${(scorecard.latencyP95Ms / 1000).toFixed(1)} s`);
  if (useJudge) {
    console.log(`AI judge (${scorecard.judged} answers, ${scorecard.judgeErrors} errors): faithfulness ${opt(scorecard.meanFaithfulness, (v) => v.toFixed(2))} · relevance ${opt(scorecard.meanRelevance, (v) => v.toFixed(2))} · low faithfulness: ${scorecard.lowFaithfulness.join(', ') || 'none'}`);
  }
  console.log(failures.length ? `RUN FAILS: ${failures.join('; ')}` : 'RUN PASSES all thresholds');

  test.info().annotations.push({ type: 'scorecard', description: JSON.stringify(scorecard) });
  expect(failures, 'run-level thresholds (see the scorecard above)').toEqual([]);
});
