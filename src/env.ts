// Loads and validates settings from .env once, so every test fails fast with a clear message
// instead of a confusing network error when something is missing.
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  SUT_BASE_URL: z.string().url(),
  // The chatbot's canonical public address (n8n's WEBHOOK_URL), e.g. its Tailscale HTTPS name. Optional.
  SUT_PUBLIC_URL: z.string().url().optional(),
  SUT_USER: z.string().min(1),
  SUT_PASSWORD: z.string().min(1),
  SUT_CHAT_PATH: z.string().startsWith('/'),
  SUT_DOCUMENTS_DIR: z.string().min(1), // the chatbot's documents folder on this machine (fixtures go in qa-fixtures/)
  // The chatbot repo on this machine (compose.yml + workflows/). Only the opt-in resilience tests use it.
  SUT_REPO_DIR: z.string().optional(),
  QDRANT_URL: z.string().url(),
  QDRANT_API_KEY: z.string().min(1),
  QDRANT_COLLECTION: z.string().min(1),
  GROQ_API_KEY: z.string().optional(),
  JUDGE_MODEL: z.string().default('qwen/qwen3.8-27b'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid or missing settings in .env:\n${missing}\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
