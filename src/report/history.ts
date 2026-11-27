// Run history for the trend: one summary line per FULL golden run (filtered runs are left out).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseResult, Scorecard } from '../eval/scorecard';

export interface EvalRun {
  startedAt: string;
  filter: string[];
  scorecard: Scorecard;
  thresholdFailures: string[];
  results: CaseResult[];
}

export interface HistoryEntry {
  startedAt: string;
  cases: number;
  passed: number;
  passRate: number;
  fabricatedCitations: number;
  hitRate: number | null;
  mrr: number | null;
  latencyMedianMs: number;
  latencyP95Ms: number;
  meanFaithfulness: number | null;
  runPassed: boolean;
}

export const REPORTS_DIR = join(__dirname, '..', '..', 'reports');
const HISTORY_FILE = join(REPORTS_DIR, 'history.json');

export const summarise = (run: EvalRun): HistoryEntry => ({
  startedAt: run.startedAt,
  cases: run.scorecard.cases,
  passed: run.scorecard.passed,
  passRate: run.scorecard.passRate,
  fabricatedCitations: run.scorecard.fabricatedCitations,
  hitRate: run.scorecard.hitRate ?? null,
  mrr: run.scorecard.mrr ?? null,
  latencyMedianMs: run.scorecard.latencyMedianMs,
  latencyP95Ms: run.scorecard.latencyP95Ms,
  meanFaithfulness: run.scorecard.meanFaithfulness ?? null,
  runPassed: run.thresholdFailures.length === 0,
});

/** All saved full runs (newest last). */
export function loadRuns(): EvalRun[] {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter((f) => /^eval-\d{4}-.*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf8')) as EvalRun)
    .filter((r) => !r.filter?.length)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Merges the committed history.json with any saved runs, de-duplicated by start time, and saves it. */
export function updateHistory(runs: EvalRun[]): HistoryEntry[] {
  const existing: HistoryEntry[] = existsSync(HISTORY_FILE) ? JSON.parse(readFileSync(HISTORY_FILE, 'utf8')) : [];
  const byTime = new Map(existing.map((h) => [h.startedAt, h]));
  for (const r of runs) byTime.set(r.startedAt, summarise(r));
  const history = [...byTime.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  return history;
}
