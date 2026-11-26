// Page Object for the upload form (an n8n Form Trigger page at /form/kb-upload).
import { expect, type Locator, type Page } from '@playwright/test';

export class UploadPage {
  readonly fileInput: Locator;
  readonly submit: Locator;

  constructor(readonly page: Page) {
    this.fileInput = page.locator('#field-0');
    this.submit = page.locator('#submit-btn');
  }

  /** @param baseUrl open the form on another address than the default (e.g. the public Tailscale name) */
  async goto(baseUrl?: string): Promise<void> {
    await this.page.goto(baseUrl ? new URL('/form/kb-upload', baseUrl).toString() : '/form/kb-upload');
    await expect(this.submit).toBeVisible();
  }

  /** Uploads files given as name + content, submits, and returns the done page's text. */
  async upload(files: { name: string; mimeType: string; buffer: Buffer }[], timeout = 180_000): Promise<string> {
    await this.fileInput.setInputFiles(files);
    await this.submit.click();
    // n8n shows "Upload finished" once the workflow (save + index each file) completes.
    await expect(this.page.getByText('Upload finished')).toBeVisible({ timeout });
    return (await this.page.locator('body').innerText()).trim();
  }
}
