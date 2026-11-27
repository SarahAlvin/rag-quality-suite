// Renders the evaluation report as one self-contained HTML page (no external files, light + dark mode).
// Every value that comes from the chatbot or the judge is HTML-escaped: answers are AI output.
import { THRESHOLDS } from '../eval/scorecard';
import type { EvalRun, HistoryEntry } from './history';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (x: number | null | undefined) => (x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(1)} %`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const day = (iso: string) => iso.slice(0, 16).replace('T', ' ');

function tile(label: string, value: string, sub: string, ok: boolean | null): string {
  const status = ok === null ? '' : ok ? '<span class="ok">✓ meets target</span>' : '<span class="bad">✗ below target</span>';
  return `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value">${esc(value)}</div><div class="tile-target">${esc(sub)} ${status}</div></div>`;
}

/** Pass rate per full run as a line, with the target as a dashed reference line. Hover a point for details. */
function trendChart(history: HistoryEntry[]): string {
  if (history.length < 2) return '<p class="muted">The trend appears after two full runs.</p>';
  const W = 1000, H = 230, L = 56, R = 24, T = 16, B = 40;
  // A line chart may start above zero (unlike bars): fit the data, floored to 10 % steps, never above 80 %.
  const lowest = Math.min(...history.map((h) => h.passRate), THRESHOLDS.passRate);
  const yMin = Math.min(0.8, Math.floor((lowest - 0.05) * 10) / 10), yMax = 1;
  const x = (i: number) => L + (i * (W - L - R)) / (history.length - 1);
  const y = (v: number) => T + ((yMax - Math.max(yMin, v)) * (H - T - B)) / (yMax - yMin);
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + 1e-9; t += 0.05) ticks.push(Math.round(t * 100) / 100);
  const grid = ticks
    .map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 10}" y="${y(t) + 4}" class="axis" text-anchor="end">${Math.round(t * 100)}%</text>`)
    .join('');
  const target = `<line x1="${L}" x2="${W - R}" y1="${y(THRESHOLDS.passRate)}" y2="${y(THRESHOLDS.passRate)}" class="target"/><text x="${W - R}" y="${y(THRESHOLDS.passRate) - 6}" class="axis" text-anchor="end">target ${THRESHOLDS.passRate * 100}%</text>`;
  const path = history.map((h, i) => `${i ? 'L' : 'M'}${x(i)},${y(h.passRate)}`).join(' ');
  const points = history
    .map((h, i) => {
      const tip = `${day(h.startedAt)} · ${h.passed}/${h.cases} passed (${pct(h.passRate)}) · faithfulness ${h.meanFaithfulness?.toFixed(2) ?? 'n/a'} · p95 ${secs(h.latencyP95Ms)}`;
      return `<g class="pt"><circle cx="${x(i)}" cy="${y(h.passRate)}" r="14" class="hit"><title>${esc(tip)}</title></circle><circle cx="${x(i)}" cy="${y(h.passRate)}" r="5" class="dot"/></g>`;
    })
    .join('');
  // Label every run when there are few; otherwise first, last and about six in between, so labels never collide.
  const every = Math.max(1, Math.ceil(history.length / 7));
  const labels = history
    .map((h, i) => (i % every === 0 || i === history.length - 1 ? `<text x="${x(i)}" y="${H - 14}" class="axis" text-anchor="${i === 0 ? 'start' : i === history.length - 1 ? 'end' : 'middle'}">${esc(h.startedAt.slice(5, 16).replace('T', ' '))}</text>` : ''))
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pass rate per full run">${grid}${target}<path d="${path}" class="line"/>${points}${labels}</svg>`;
}

function caseRows(run: EvalRun): string {
  return run.results
    .map((r) => {
      const failed = r.verdict.checks.filter((c) => !c.pass);
      const q = r.case.turns ? r.case.turns.join(' → ') : r.case.question;
      const judge = r.judge ? `F${r.judge.faithfulness} R${r.judge.relevance}` : r.judgeError ? 'error' : '–';
      const checks = r.verdict.checks.map((c) => `<li class="${c.pass ? 'ok' : 'bad'}">${c.pass ? '✓' : '✗'} ${esc(c.name)}${c.detail ? ` <span class="muted">(${esc(c.detail)})</span>` : ''}</li>`).join('');
      const context = (r.context ?? []).map((c, i) => `<li><b>[${i + 1}] ${esc(c.file)}</b> ${esc(c.text)}</li>`).join('');
      return `<tr class="${r.verdict.pass ? '' : 'row-bad'}">
  <td>${r.verdict.pass ? '<span class="ok">PASS</span>' : '<span class="bad">FAIL</span>'}</td>
  <td><code>${esc(r.case.id)}</code></td><td>${esc(r.case.category)}</td>
  <td><details><summary>${esc(q)}</summary>
    <p><b>Answer</b></p><pre>${esc(r.answer)}</pre>
    <p><b>Search queries:</b> ${esc(r.searchQueries.join(' | ') || 'none')}</p>
    <p><b>Checks</b></p><ul class="checks">${checks}</ul>
    ${r.judge ? `<p><b>AI judge:</b> ${esc(r.judge.reason)}${r.judge.unsupported_claims.length ? ` · unsupported: ${esc(r.judge.unsupported_claims.join('; '))}` : ''}</p>` : ''}
    ${r.error ? `<p class="bad"><b>Error:</b> ${esc(r.error)}</p>` : ''}
    ${context ? `<p><b>Retrieved passages</b></p><ol class="ctx">${context}</ol>` : ''}
  </details></td>
  <td>${esc(r.citations.join(', ') || '–')}</td><td class="num">${esc(judge)}</td><td class="num">${esc(secs(r.latencyMs))}</td>
  <td class="muted">${esc(failed.map((c) => c.name).join('; '))}</td>
</tr>`;
    })
    .join('\n');
}

export function renderReport(run: EvalRun, history: HistoryEntry[]): string {
  const s = run.scorecard;
  const passed = run.thresholdFailures.length === 0;
  const cats = Object.entries(s.byCategory)
    .map(([cat, b]) => `<tr><td>${esc(cat)}</td><td class="num">${b.passed}/${b.cases}</td><td class="num">${pct(b.passRate)}</td></tr>`)
    .join('');
  const histRows = [...history].reverse()
    .map((h) => `<tr><td>${esc(day(h.startedAt))}</td><td class="num">${h.passed}/${h.cases}</td><td class="num">${pct(h.passRate)}</td><td class="num">${h.meanFaithfulness?.toFixed(2) ?? 'n/a'}</td><td class="num">${pct(h.hitRate)}</td><td class="num">${secs(h.latencyMedianMs)} / ${secs(h.latencyP95Ms)}</td><td>${h.runPassed ? '<span class="ok">pass</span>' : '<span class="bad">fail</span>'}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RAG Quality Report</title>
<style>
:root { --bg:#fcfcfb; --surface:#ffffff; --text:#0b0b0b; --text2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --series:#2a78d6; --ok:#006300; --bad:#c42b2b; --border:#e6e4dc; --bad-bg:#fdf1f1; }
@media (prefers-color-scheme: dark) { :root { --bg:#1a1a19; --surface:#222220; --text:#f0efec; --text2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835; --series:#3987e5; --ok:#0ca30c; --bad:#e66767; --border:#33322f; --bad-bg:#2a1d1d; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
main { max-width:1100px; margin:0 auto; padding:24px 16px 48px; }
h1 { margin:0 0 4px; font-size:24px; } h2 { margin:32px 0 12px; font-size:18px; }
.muted { color:var(--muted); } .ok { color:var(--ok); font-weight:600; } .bad { color:var(--bad); font-weight:600; }
.verdict { display:inline-block; margin:12px 0; padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface); }
.tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
@media (max-width: 760px) { .tiles { grid-template-columns:repeat(2,1fr); } }
@media (max-width: 460px) { .tiles { grid-template-columns:1fr; } }
.tile { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
.tile-label { color:var(--text2); font-size:13px; } .tile-value { font-size:26px; font-weight:650; font-variant-numeric:tabular-nums; } .tile-target { color:var(--muted); font-size:12px; }
table { width:100%; border-collapse:collapse; background:var(--surface); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
th { color:var(--text2); font-weight:600; font-size:13px; } .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.row-bad { background:var(--bad-bg); }
details summary { cursor:pointer; } pre { white-space:pre-wrap; background:var(--bg); padding:8px; border-radius:6px; margin:4px 0; }
.checks, .ctx { margin:4px 0; padding-left:20px; } .ctx li { margin-bottom:6px; color:var(--text2); }
.chart { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px; overflow-x:auto; }
svg { width:100%; min-width:640px; height:auto; display:block; }
svg .grid { stroke:var(--grid); stroke-width:1; } svg .axis { fill:var(--muted); font-size:12px; }
svg .target { stroke:var(--axis); stroke-width:1.5; stroke-dasharray:5 4; }
svg .line { fill:none; stroke:var(--series); stroke-width:2; } svg .dot { fill:var(--series); stroke:var(--surface); stroke-width:2; pointer-events:none; }
svg .hit { fill:transparent; } svg .pt:hover .dot { r:7; }
.wrap { overflow-x:auto; }
</style></head>
<body><main>
<h1>RAG Quality Report</h1>
<div class="muted">Golden-set evaluation of the personal knowledge-base chatbot · run ${esc(day(run.startedAt))} UTC${run.filter?.length ? ` · filtered: ${esc(run.filter.join(', '))}` : ''}</div>
<div class="verdict">${passed ? '<span class="ok">✓ RUN PASSES all thresholds</span>' : `<span class="bad">✗ RUN FAILS:</span> ${esc(run.thresholdFailures.join('; '))}`}</div>

<div class="tiles">
${tile('Cases passed', `${s.passed} / ${s.cases}`, `${pct(s.passRate)} · target ≥ ${THRESHOLDS.passRate * 100} %`, s.passRate >= THRESHOLDS.passRate)}
${tile('Fabricated citations', String(s.fabricatedCitations), 'target 0', s.fabricatedCitations === 0)}
${tile('AI judge: faithfulness', s.meanFaithfulness === null ? 'n/a' : `${s.meanFaithfulness.toFixed(2)} / 5`, `target ≥ ${THRESHOLDS.meanFaithfulness}`, s.meanFaithfulness === null ? null : s.meanFaithfulness >= THRESHOLDS.meanFaithfulness)}
${tile('Retrieval hit rate', pct(s.hitRate), `target ≥ ${THRESHOLDS.hitRate * 100} %`, s.hitRate === null ? null : s.hitRate >= THRESHOLDS.hitRate)}
${tile('MRR (rank of right doc)', s.mrr === null ? 'n/a' : s.mrr.toFixed(2), '1.00 = always ranked first', null)}
${tile('Latency median / p95', `${secs(s.latencyMedianMs)} / ${secs(s.latencyP95Ms)}`, `target ≤ ${THRESHOLDS.latencyMedianMs / 1000} s / ${THRESHOLDS.latencyP95Ms / 1000} s`, s.latencyMedianMs <= THRESHOLDS.latencyMedianMs && s.latencyP95Ms <= THRESHOLDS.latencyP95Ms)}
</div>

<h2>Pass rate over full runs</h2>
<div class="chart">${trendChart(history)}</div>
<div class="wrap"><table aria-label="Run history"><thead><tr><th>Run (UTC)</th><th class="num">Passed</th><th class="num">Pass rate</th><th class="num">Faithfulness</th><th class="num">Hit rate</th><th class="num">Latency median / p95</th><th>Run</th></tr></thead><tbody>${histRows}</tbody></table></div>

<h2>By category</h2>
<table><thead><tr><th>Category</th><th class="num">Passed</th><th class="num">Pass rate</th></tr></thead><tbody>${cats}</tbody></table>

<h2>Every case</h2>
<p class="muted">Click a question to see the answer, the checks, the AI judge's reasoning and the passages the chatbot retrieved.</p>
<div class="wrap"><table><thead><tr><th>Result</th><th>ID</th><th>Category</th><th>Question</th><th>Cited</th><th class="num">Judge</th><th class="num">Time</th><th>Failed checks</th></tr></thead>
<tbody>${caseRows(run)}</tbody></table></div>

<p class="muted" style="margin-top:24px">Generated by <b>rag-quality-suite</b>. Rules decide pass/fail; the AI judge (a different model family) scores faithfulness and relevance 1–5.</p>
</main></body></html>`;
}
