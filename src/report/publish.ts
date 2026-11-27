// Copies the latest report into site/ for GitHub Pages, after checking that every document quoted in it is
// one of the public fixtures. The report shows retrieved passages, which can come from ANY document in the
// chatbot's knowledge base, so a private note must never end up on a public page.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORTS_DIR, type EvalRun } from './history';

/** Documents allowed to appear in a published report: the fixtures plus the chatbot project's fictional test notes. */
export const PUBLISHABLE_DOCS = new Set([
  'zarnoor-tea.md', 'tea-tasting-log.txt', 'zarnoor-old-brochure.md', 'kohsar-falcons.md', 'saffron-kheer.md',
  'hunza-diary.md', 'pinewood-oval-maintenance.md', 'kohsar-annual-report.pdf', 'scanned-membership-card.pdf',
  'rag-basics.md', 'docker-tips.txt', 'kitchen-notes.pdf', 'garden-journal-scan.pdf', 'upload-test.md',
]);

/** Every document name quoted in the run (retrieved passages and citations) that isn't on the allow-list. */
export function unpublishableDocs(run: EvalRun): string[] {
  const seen = new Set<string>();
  for (const r of run.results) {
    for (const c of r.context ?? []) seen.add(c.file);
    for (const f of [...r.citations, ...r.retrievedFiles]) seen.add(f);
  }
  return [...seen].filter((f) => !PUBLISHABLE_DOCS.has(f)).sort();
}

export function publishReport(): string {
  const latest = join(REPORTS_DIR, 'eval-latest.json');
  const html = join(REPORTS_DIR, 'index.html');
  if (!existsSync(latest) || !existsSync(html)) throw new Error('run the evaluation first (npm run test:eval)');
  const run = JSON.parse(readFileSync(latest, 'utf8')) as EvalRun;
  const blocked = unpublishableDocs(run);
  if (blocked.length) throw new Error(`report quotes documents that are not public fixtures, refusing to publish: ${blocked.join(', ')}`);
  const site = join(__dirname, '..', '..', 'site');
  mkdirSync(site, { recursive: true });
  copyFileSync(html, join(site, 'index.html'));
  return join(site, 'index.html');
}
