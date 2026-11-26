// The golden dataset: questions with known expectations about the fixture corpus.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const CATEGORIES = [
  'factual', 'multi-doc', 'pdf-ocr', 'conflict', 'follow-up', 'out-of-scope', 'privacy', 'injection', 'robustness',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const GoldenCaseSchema = z
  .object({
    id: z.string(),
    category: z.enum(CATEGORIES),
    question: z.string().optional(),
    turns: z.array(z.string()).min(2).optional(), // follow-up conversations; only the last turn is graded
    mustContain: z.array(z.array(z.string()).min(1)).default([]), // every group must match; any alternative in a group
    mustNotContain: z.array(z.string()).default([]),
    expectedSources: z.array(z.string()).default([]),
    expect: z.enum(['answer', 'refuse']),
    notes: z.string().optional(),
  })
  .refine((c) => Boolean(c.question) !== Boolean(c.turns), { message: 'a case needs exactly one of question or turns' });
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

const GoldenFileSchema = z.object({ version: z.number(), notes: z.string().optional(), cases: z.array(GoldenCaseSchema) });

export function loadGolden(path = join(__dirname, '..', '..', 'golden', 'golden.json')): GoldenCase[] {
  const file = GoldenFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const ids = new Set<string>();
  for (const c of file.cases) {
    if (ids.has(c.id)) throw new Error(`duplicate golden case id: ${c.id}`);
    ids.add(c.id);
  }
  return file.cases;
}

/** The messages to send, in order. */
export const turnsOf = (c: GoldenCase): string[] => c.turns ?? [c.question!];
