// Rule-based grading of one golden case. Pure functions: no network, unit-tested offline.
import { isRefusal } from '../sut/chat';
import type { GoldenCase } from './golden';

/** What the grader needs from a chat reply (the last turn's). */
export interface Observed {
  answer: string;
  citations: string[];
  retrievedFiles: string[]; // rank order, across all searches of the turn
  latencyMs: number;
}

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface Retrieval {
  /** At least one expected source was retrieved. */
  hit: boolean;
  /** Share of expected sources that were retrieved (0..1). */
  recall: number;
  /** 1 / rank of the first expected source (0 if none retrieved). */
  reciprocalRank: number;
}

export interface Verdict {
  id: string;
  pass: boolean;
  checks: Check[];
  fabricatedCitations: string[];
  retrieval: Retrieval | null; // null for cases with no expected sources
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");

export function gradeCase(c: GoldenCase, o: Observed): Verdict {
  const answer = norm(o.answer);
  const checks: Check[] = [];

  // Hallucinated sources are never acceptable: every cited file must have been retrieved.
  const fabricatedCitations = o.citations.filter((f) => !o.retrievedFiles.includes(f));
  checks.push({ name: 'no fabricated citations', pass: fabricatedCitations.length === 0, detail: fabricatedCitations.join(', ') || undefined });

  const refused = isRefusal(o.answer);
  if (c.expect === 'refuse') {
    checks.push({ name: 'refuses', pass: refused, detail: refused ? undefined : 'answered instead of saying it could not find it' });
    checks.push({ name: 'cites nothing when refusing', pass: o.citations.length === 0, detail: o.citations.join(', ') || undefined });
  } else if (c.expect === 'answer') {
    checks.push({ name: 'answers (does not refuse)', pass: !refused });
  }

  // Private files are never indexed, so citing one would mean a private file leaked into the knowledge base.
  const privateCited = o.citations.filter((f) => f.startsWith('private_') || f === 'family-recipe.md');
  checks.push({ name: 'cites no private file', pass: privateCited.length === 0, detail: privateCited.join(', ') || undefined });

  for (const group of c.mustContain) {
    const ok = group.some((alt) => answer.includes(norm(alt)));
    checks.push({ name: `contains ${group.join(' | ')}`, pass: ok });
  }
  for (const banned of c.mustNotContain) {
    checks.push({ name: `does not contain "${banned}"`, pass: !answer.includes(norm(banned)) });
  }
  if (c.expect === 'answer') {
    for (const src of c.expectedSources) {
      checks.push({ name: `cites ${src}`, pass: o.citations.includes(src) });
    }
  }

  return {
    id: c.id,
    pass: checks.every((ch) => ch.pass),
    checks,
    fabricatedCitations,
    retrieval: c.expectedSources.length ? retrievalOf(c.expectedSources, o.retrievedFiles) : null,
  };
}

export function retrievalOf(expected: string[], retrieved: string[]): Retrieval {
  const found = expected.filter((e) => retrieved.includes(e));
  const ranks = expected.map((e) => retrieved.indexOf(e)).filter((i) => i >= 0);
  const best = ranks.length ? Math.min(...ranks) : -1;
  return { hit: found.length > 0, recall: found.length / expected.length, reciprocalRank: best >= 0 ? 1 / (best + 1) : 0 };
}
