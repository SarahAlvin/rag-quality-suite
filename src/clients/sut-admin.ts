// Changes the chatbot's model settings (KB · Config) for fault-injection tests, and restores them.
// Uses the n8n CLI inside the chatbot's Docker stack. Only the opt-in @destructive tests use this.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../env';

const CONFIG_ID = 'kbConfig00000001';
const REAL = { chat: 'models/gemini-3.5-flash-lite', fallback: 'openai/gpt-oss-120b' };

function repo(): string {
  if (!env.SUT_REPO_DIR) throw new Error('SUT_REPO_DIR is not set in .env');
  return env.SUT_REPO_DIR;
}

const compose = (...args: string[]): string =>
  execFileSync('docker', ['compose', ...args], { cwd: repo(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Imports KB · Config with the given model names and publishes it (n8n applies it within a few seconds). */
export async function setModels(chat: string, fallback: string): Promise<void> {
  const original = readFileSync(join(repo(), 'workflows', 'WF0-config.json'), 'utf8');
  const changed = original.replace(REAL.chat, chat).replace(REAL.fallback, fallback);
  const dir = mkdtempSync(join(tmpdir(), 'qa-cfg-'));
  const file = join(dir, 'cfg.json');
  writeFileSync(file, changed, 'utf8');
  try {
    compose('cp', file, 'n8n:/tmp/qa-cfg.json');
    compose('exec', '-T', 'n8n', 'n8n', 'import:workflow', '--input=/tmp/qa-cfg.json');
    compose('exec', '-T', 'n8n', 'n8n', 'publish:workflow', `--id=${CONFIG_ID}`);
    compose('exec', '-T', '-u', 'root', 'n8n', 'rm', '-f', '/tmp/qa-cfg.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  await waitUntilConfigActive();
}

/** Importing un-publishes the workflow until the new publish is applied; a chat request in that gap fails at
 *  "Get config" with "Workflow is not active" (TD-008). Wait until n8n lists it as active, then a little longer
 *  for the running instance to load it. */
async function waitUntilConfigActive(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = compose('exec', '-T', 'n8n', 'n8n', 'list:workflow', '--active=true');
    if (active.includes(CONFIG_ID)) {
      await new Promise((r) => setTimeout(r, 15_000));
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`KB · Config did not become active within ${timeoutMs / 1000} s`);
}

export const restoreModels = () => setModels(REAL.chat, REAL.fallback);

/** Reads the model names from the PUBLISHED Config, to prove a restore worked. */
export function publishedModels(): { chat: string; fallback: string } {
  compose('exec', '-T', 'n8n', 'n8n', 'export:workflow', `--id=${CONFIG_ID}`, '--output=/tmp/qa-cfg-export.json');
  const json = compose('exec', '-T', 'n8n', 'cat', '/tmp/qa-cfg-export.json');
  compose('exec', '-T', '-u', 'root', 'n8n', 'rm', '-f', '/tmp/qa-cfg-export.json');
  const wf = JSON.parse(json) as { nodes: { name: string; parameters: { assignments: { assignments: { name: string; value: unknown }[] } } }[] }[] | { nodes: never[] };
  const flow = Array.isArray(wf) ? wf[0]! : wf;
  const settings = flow.nodes.find((n) => n.name === 'Settings')!.parameters.assignments.assignments;
  const get = (k: string) => String(settings.find((a) => a.name === k)?.value);
  return { chat: get('chat_model'), fallback: get('fallback_model') };
}

export const REAL_MODELS = REAL;
