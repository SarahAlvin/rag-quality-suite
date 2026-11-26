// Page Object for the chatbot's own chat page (web/index.html in the chatbot repo).
import { expect, type Locator, type Page } from '@playwright/test';
import { env } from '../env';

export class ChatPage {
  readonly input: Locator;
  readonly send: Locator;
  readonly newChat: Locator;
  readonly uploadLink: Locator;
  readonly messages: Locator;
  readonly botMessages: Locator;
  readonly userMessages: Locator;
  readonly thinking: Locator;

  constructor(readonly page: Page) {
    this.input = page.getByRole('textbox', { name: 'Your question' });
    this.send = page.getByRole('button', { name: 'Send' });
    this.newChat = page.getByRole('button', { name: 'New chat' });
    this.uploadLink = page.getByRole('link', { name: 'Upload documents' });
    this.messages = page.locator('#messages');
    this.botMessages = page.locator('.msg.bot:not(.thinking)');
    this.userMessages = page.locator('.msg.user');
    this.thinking = page.locator('.msg.thinking');
  }

  /** URL pattern of the chat API, for page.route() mocks. */
  static readonly chatApi = `**${env.SUT_CHAT_PATH}`;

  async goto(): Promise<void> {
    await this.page.goto('/app/');
    await expect(this.input).toBeVisible();
  }

  /** Types a question and sends it with Enter. */
  async ask(question: string): Promise<void> {
    await this.input.fill(question);
    await this.input.press('Enter');
  }

  /** Waits until the "Searching your notes…" bubble is gone and returns the latest bot message. */
  async lastAnswer(timeout = 120_000): Promise<Locator> {
    await expect(this.thinking).toHaveCount(0, { timeout });
    return this.botMessages.last();
  }

  sourceChips(message: Locator): Locator {
    return message.locator('.sources .chip');
  }

  async sessionId(): Promise<string | null> {
    return this.page.evaluate(() => sessionStorage.getItem('kb-session'));
  }
}
