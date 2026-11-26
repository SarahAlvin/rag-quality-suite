import { test, expect } from '@playwright/test';
import recording from '../../recordings/chat-with-search.json';
import { ChatResponseSchema, isRefusal, parseCitations, parseSearches } from '../../src/sut/chat';

// Offline: no chatbot needed. Verifies the reply parsing on a synthetic reply in the documented format
// (docs/SUT-API.md), so parsing bugs are caught in CI before they distort live results.

test.describe('Reply parsing', () => {
  const reply = ChatResponseSchema.parse(recording);

  test('unwraps the double-encoded search results in rank order', () => {
    const searches = parseSearches(reply);
    expect(searches).toHaveLength(1);
    expect(searches[0]!.query).toBe('Zarnoor Tea Co. founding year');
    expect(searches[0]!.chunks.map((c) => c.metadata.filename)).toEqual(['zarnoor-tea.md', 'company-history.txt']);
  });

  test('reads citations after "Sources:" and strips folders and page numbers', () => {
    expect(parseCitations(reply.output)).toEqual(['zarnoor-tea.md', 'company-history.txt']);
  });

  test('handles bold "Sources:" headings and duplicate citations', () => {
    expect(parseCitations('Answer.\n\n**Sources:**\n- a.md\n- a.md\n- b.pdf')).toEqual(['a.md', 'b.pdf']);
  });

  test('finds no citations when there is no Sources section', () => {
    expect(parseCitations('I mention a.md in passing but cite nothing.')).toEqual([]);
  });

  test('recognises the refusal phrase in its variants', () => {
    expect(isRefusal("I couldn't find that in your documents.")).toBe(true);
    expect(isRefusal('I couldn’t find that in your documents.')).toBe(true); // typographic apostrophe
    expect(isRefusal('I could not find that.')).toBe(true);
    expect(isRefusal('Zarnoor Tea Co. was founded in 1987.')).toBe(false);
  });

  test('a reply without searches parses to an empty list', () => {
    expect(parseSearches({ output: 'Hello!', intermediateSteps: [] })).toEqual([]);
    expect(parseSearches({ output: 'Hello!' })).toEqual([]);
  });

  test('the schema rejects a reply without an output', () => {
    expect(ChatResponseSchema.safeParse({ intermediateSteps: [] }).success).toBe(false);
  });
});
