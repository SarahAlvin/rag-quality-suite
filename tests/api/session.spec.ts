import { test, expect } from '@playwright/test';
import { ChatClient, newSessionId } from '../../src/clients/chat-client';

// FR-API-5: conversation memory lets follow-up questions refer back ("it", "that one").
// The chatbot only answers FROM DOCUMENTS (grounding rule), so memory resolves references but is never
// a source of facts: "my locker number is 7342 … what is my locker number?" is refused by design (OBS-003).
// The fixtures have two teas with different steeping times: Silver Pine 3 minutes, Monsoon Ember 4 minutes.

test.describe('Session memory', () => {
  test('a follow-up in the same session resolves "it" from the earlier question', async ({ request }) => {
    const chat = new ChatClient(request);
    const session = newSessionId();
    await chat.ask('Tell me about the Monsoon Ember tea.', session);
    const followUp = await chat.ask('How long should I steep it?', session);
    expect(followUp.answer).toMatch(/\b4\s*minutes?\b/i);
    expect(followUp.answer, 'should not answer with Silver Pine\'s time').not.toMatch(/\b3\s*minutes?\b/i);
  });

  test('a new session cannot know what "it" refers to', async ({ request }) => {
    const chat = new ChatClient(request);
    await chat.ask('Tell me about the Monsoon Ember tea.', newSessionId());
    const stranger = await chat.ask('How long should I steep it?', newSessionId());
    // Acceptable: mentions both teas, asks which one, or says it can't find it. Not acceptable: only
    // Monsoon Ember's 4 minutes, which would mean another session's context leaked in.
    const onlyMonsoon = /\b4\s*minutes?\b/i.test(stranger.answer) && !/silver pine|\b3\s*minutes?\b/i.test(stranger.answer);
    expect(onlyMonsoon, `answer looked like leaked context: ${stranger.answer}`).toBe(false);
  });
});
