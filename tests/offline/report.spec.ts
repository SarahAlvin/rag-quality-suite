import { test, expect } from '@playwright/test';
import type { EvalRun } from '../../src/report/history';
import { summarise } from '../../src/report/history';
import { renderReport } from '../../src/report/render';
import { buildScorecard } from '../../src/eval/scorecard';

// Offline: the report shows AI-written text, so it must escape it (our own XSS check, like the chatbot's UI tests).
const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function fakeRun(): EvalRun {
  const results = [{
    case: { id: 'x-1', category: 'factual' as const, question: hostile, expect: 'answer' as const, mustContain: [], mustNotContain: [], expectedSources: [] },
    verdict: { id: 'x-1', pass: false, checks: [{ name: hostile, pass: false }], fabricatedCitations: [], retrieval: null },
    answer: hostile, citations: [hostile], retrievedFiles: [], searchQueries: [hostile], latencyMs: 1234,
    context: [{ file: hostile, text: hostile }],
    judge: { faithfulness: 2, relevance: 5, unsupported_claims: [hostile], reason: hostile },
  }];
  return { startedAt: '2026-11-27T10:00:00.000Z', filter: [], scorecard: buildScorecard(results), thresholdFailures: [hostile], results };
}

test.describe('HTML report', () => {
  test('escapes every piece of AI-written or case text', () => {
    const html = renderReport(fakeRun(), []);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  });

  test('draws a trend once there are two full runs, with the target line', () => {
    const run = fakeRun();
    const h1 = summarise(run);
    const h2 = { ...h1, startedAt: '2026-11-28T10:00:00.000Z', passRate: 0.95 };
    const html = renderReport(run, [h1, h2]);
    expect(html).toContain('aria-label="Pass rate per full run"');
    expect(html).toContain('target 90%');
    expect(html).toContain('11-27 10:00'); // date and time, so same-day runs are distinguishable
    expect(renderReport(run, [h1])).toContain('The trend appears after two full runs');
  });
});
