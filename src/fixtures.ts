// The fictional fixture corpus and where it lives inside the chatbot.
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { env } from './env';

export const FIXTURES_SRC = join(__dirname, '..', 'fixtures', 'documents');
export const FIXTURES_DEST = join(env.SUT_DOCUMENTS_DIR, 'qa-fixtures');
/** How the chatbot records a fixture's path in Qdrant metadata ("source"). */
export const SOURCE_PREFIX = 'documents/qa-fixtures/';

/** Same rule as the chatbot's scanner: private_* files and anything under _private/ are never indexed. */
export const isPrivate = (relPath: string): boolean =>
  /(^|\/)_private\//.test(relPath) || (relPath.split('/').pop() ?? '').startsWith('private_');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Fixture paths relative to the corpus root, with forward slashes (e.g. "notes/tea-tasting-log.txt"). */
export const fixtureFiles = (): string[] =>
  listFiles(FIXTURES_SRC).map((f) => relative(FIXTURES_SRC, f).split(sep).join('/'));

export const expectedIndexed = (): string[] => fixtureFiles().filter((f) => !isPrivate(f));
export const expectedPrivate = (): string[] => fixtureFiles().filter(isPrivate);

export function copyFixturesIntoChatbot(): void {
  if (!existsSync(env.SUT_DOCUMENTS_DIR)) throw new Error(`SUT_DOCUMENTS_DIR not found: ${env.SUT_DOCUMENTS_DIR}`);
  cpSync(FIXTURES_SRC, FIXTURES_DEST, { recursive: true });
}

export function removeFixturesFromChatbot(): void {
  rmSync(FIXTURES_DEST, { recursive: true, force: true });
}
