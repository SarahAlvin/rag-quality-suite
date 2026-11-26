// Shapes of the chatbot's chat reply (see docs/SUT-API.md) and helpers to read it.
// Kept free of Playwright so the offline tests can use it on recorded replies.
import { z } from 'zod';

export const ChunkSchema = z.object({
  pageContent: z.string(),
  metadata: z
    .object({
      filename: z.string(),
      source: z.string(),
      doc_id: z.string().optional(),
      extraction: z.string().optional(),
    })
    .passthrough(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const StepSchema = z.object({
  action: z
    .object({
      tool: z.string(),
      toolInput: z.object({ input: z.string() }).passthrough(),
    })
    .passthrough(),
  observation: z.string(),
});

export const ChatResponseSchema = z.object({
  output: z.string(),
  intermediateSteps: z.array(StepSchema).optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export interface Search {
  query: string; // the query the agent wrote, not the user's question
  chunks: Chunk[]; // in rank order, best first
}

// The observation is JSON encoded twice: a string holding [{ response: [{ type, text }] }],
// where each text is itself a JSON string holding { pageContent, metadata }.
export function parseSearches(response: ChatResponse): Search[] {
  return (response.intermediateSteps ?? [])
    .filter((step) => step.action.tool === 'search_knowledge_base')
    .map((step) => {
      const outer = z
        .array(z.object({ response: z.array(z.object({ type: z.string(), text: z.string() })) }))
        .parse(JSON.parse(step.observation));
      const chunks = outer.flatMap((o) => o.response).map((item) => ChunkSchema.parse(JSON.parse(item.text)));
      return { query: step.action.toolInput.input, chunks };
    });
}

// Files listed after the "Sources:" line, e.g. "- notes/a.md (p. 2)" -> "a.md".
export function parseCitations(output: string): string[] {
  const match = output.match(/\n\s*\**sources:?\**\s*\n([\s\S]*)$/i);
  if (!match?.[1]) return [];
  const files = match[1].match(/[\w.-]+\.(?:md|txt|pdf)/gi) ?? [];
  return [...new Set(files.map((f) => f.split('/').pop() ?? f))];
}

export const REFUSAL = /couldn['’]t find|could not find/i;
export const isRefusal = (output: string): boolean => REFUSAL.test(output);
