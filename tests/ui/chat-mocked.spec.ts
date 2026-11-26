import { test, expect, type Route } from '@playwright/test';
import { ChatPage } from '../../src/pages/chat-page';

// Chat page behaviour with the chat API MOCKED (page.route): fast, deterministic, no AI quota, and able to simulate
// failures and hostile replies the real server would never produce. FR-UI-1..6.

const reply = (output: string) => (route: Route) => route.fulfill({ json: { output, intermediateSteps: [] } });

test.describe('Chat page (mocked API)', () => {
  let chat: ChatPage;
  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
  });

  test('loads behind the password with a welcome message', async () => {
    await expect(chat.botMessages.first()).toContainText('Ask me anything about your notes');
    await expect(chat.input).toBeFocused();
  });

  test('shows the answer and lists sources as chips, not in the text', async ({ page }) => {
    await page.route(ChatPage.chatApi, reply('Founded in **1987**.\n\nSources:\n- zarnoor-tea.md\n- tea-tasting-log.txt'));
    await chat.ask('When was it founded?');
    const answer = await chat.lastAnswer();
    await expect(answer.locator('.bubble')).toHaveText('Founded in 1987.');
    await expect(answer.locator('.bubble strong')).toHaveText('1987'); // Markdown rendered
    await expect(chat.sourceChips(answer)).toHaveText(['zarnoor-tea.md', 'tea-tasting-log.txt']);
  });

  test('shows a thinking indicator and disables Send while waiting', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(ChatPage.chatApi, async (route) => {
      await gate;
      await reply('Done.')(route);
    });
    await chat.ask('Slow question');
    await expect(chat.thinking).toBeVisible();
    await expect(chat.send).toBeDisabled();
    release();
    await chat.lastAnswer();
    await expect(chat.send).toBeEnabled();
  });

  test('Enter sends; Shift+Enter adds a new line instead', async ({ page }) => {
    let requests = 0;
    await page.route(ChatPage.chatApi, async (route) => {
      requests++;
      await reply('ok')(route);
    });
    await chat.input.fill('line one');
    await chat.input.press('Shift+Enter');
    await chat.input.pressSequentially('line two');
    expect(requests).toBe(0);
    await expect(chat.input).toHaveValue('line one\nline two');
    await chat.input.press('Enter');
    await chat.lastAnswer();
    expect(requests).toBe(1);
    await expect(chat.userMessages.last()).toHaveText('line one\nline two');
  });

  test('New chat clears the conversation and starts a new session', async ({ page }) => {
    const sessions: string[] = [];
    await page.route(ChatPage.chatApi, async (route) => {
      sessions.push(route.request().postDataJSON().sessionId);
      await reply('ok')(route);
    });
    await chat.ask('first');
    await chat.lastAnswer();
    const before = await chat.sessionId();
    await chat.newChat.click();
    await expect(chat.userMessages).toHaveCount(0);
    expect(await chat.sessionId()).not.toBe(before);
    await chat.ask('second');
    await chat.lastAnswer();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).not.toBe(sessions[1]);
  });

  test('a server error shows a clear message, and the next question works', async ({ page }) => {
    await page.route(ChatPage.chatApi, (route) => route.fulfill({ status: 500, json: { message: 'Error in workflow' } }));
    await chat.ask('anything');
    await expect(page.locator('.msg.error')).toContainText('HTTP 500');
    await page.unroute(ChatPage.chatApi);
    await page.route(ChatPage.chatApi, reply('Back to normal.'));
    await chat.ask('again');
    await expect((await chat.lastAnswer()).locator('.bubble')).toHaveText('Back to normal.');
  });

  test('a dropped connection shows a clear message', async ({ page }) => {
    await page.route(ChatPage.chatApi, (route) => route.abort('connectionreset'));
    await chat.ask('anything');
    await expect(page.locator('.msg.error')).toContainText("Couldn't reach the chatbot");
  });

  test('hostile HTML in an answer is sanitised and never runs (XSS)', async ({ page }) => {
    await page.route(
      ChatPage.chatApi,
      reply('Hi <img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> [click](javascript:window.__xss=3) **bold**'),
    );
    await chat.ask('anything');
    const bubble = (await chat.lastAnswer()).locator('.bubble');
    await expect(bubble.locator('strong')).toHaveText('bold');
    await expect(bubble.locator('script')).toHaveCount(0);
    await expect(bubble.locator('img[onerror]')).toHaveCount(0);
    await expect(bubble.locator('a[href^="javascript:"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('the user\'s own text is shown literally, never as HTML', async ({ page }) => {
    await page.route(ChatPage.chatApi, reply('ok'));
    await chat.ask('<b>not bold</b> <img src=x onerror="window.__xss=9">');
    await expect(chat.userMessages.last()).toHaveText('<b>not bold</b> <img src=x onerror="window.__xss=9">');
    await expect(chat.userMessages.last().locator('b, img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

test.describe('Chat page resilience', () => {
  test('still works (as plain text) when the Markdown libraries fail to load', async ({ page }) => {
    await page.route('**/cdn.jsdelivr.net/**', (route) => route.abort());
    await page.route(ChatPage.chatApi, reply('Plain **text** <img src=x onerror="window.__xss=1">'));
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.ask('anything');
    const bubble = (await chat.lastAnswer()).locator('.bubble');
    await expect(bubble).toHaveText('Plain **text** <img src=x onerror="window.__xss=1">'); // shown literally
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    const chat = new ChatPage(page);
    await chat.goto();
    await expect(chat.send).toBeInViewport();
    await expect(chat.newChat).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
