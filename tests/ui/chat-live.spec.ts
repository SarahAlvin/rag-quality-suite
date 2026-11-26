import { test, expect } from '@playwright/test';
import { ChatPage } from '../../src/pages/chat-page';

// End to end with the REAL chatbot: browser → Caddy → n8n → Gemini → Qdrant → back to the page. Costs ~2 Gemini calls.
test('a real question is answered with the right source chip', async ({ page }) => {
  const chat = new ChatPage(page);
  await chat.goto();
  await chat.ask('In which year was Zarnoor Tea Co. founded?');
  const answer = await chat.lastAnswer();
  await expect(answer.locator('.bubble')).toContainText('1987');
  await expect(chat.sourceChips(answer)).toContainText(['zarnoor-tea.md']);
});
