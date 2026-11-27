// Writes reports/index.html from the latest saved run plus the run history.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRuns, REPORTS_DIR, updateHistory, type EvalRun } from './history';
import { renderReport } from './render';

/** @param latest the run to show in detail; defaults to the newest saved full run */
export function buildReport(latest?: EvalRun): string {
  const runs = loadRuns();
  const history = updateHistory(runs);
  const run = latest ?? runs.at(-1);
  if (!run) throw new Error('no saved evaluation runs in reports/');
  const file = join(REPORTS_DIR, 'index.html');
  writeFileSync(file, renderReport(run, history));
  return file;
}
