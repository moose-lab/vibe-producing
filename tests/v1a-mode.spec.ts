import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

declare global {
  interface Window {
    V1A_MODE?: boolean;
    __ttsSpeak?: (arg: { text: string; index: number }) => unknown;
  }
}

test('default load sets V1A_MODE=true', async ({ page }) => {
  await page.goto(pageUrl);
  expect(await page.evaluate(() => window.V1A_MODE)).toBe(true);
});

test('default load greys the lyrics panel', async ({ page }) => {
  await page.goto(pageUrl);
  const panel = page.locator('.lyrics-panel');
  await expect(panel).toHaveClass(/v1a-disabled/);
  await expect(panel).toHaveAttribute('aria-disabled', 'true');
});

test("default load: tts speak() returns 'v1a-noop'", async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate(() =>
    window.__ttsSpeak?.({ text: 'hi', index: 0 })
  );
  expect(result).toBe('v1a-noop');
});

test('?v2=1 restores legacy mode', async ({ page }) => {
  await page.goto(pageUrl + '?v2=1');
  expect(await page.evaluate(() => window.V1A_MODE)).toBe(false);
  const panel = page.locator('.lyrics-panel');
  await expect(panel).not.toHaveClass(/v1a-disabled/);
  const result = await page.evaluate(() =>
    window.__ttsSpeak?.({ text: 'hi', index: 0 })
  );
  expect(result).not.toBe('v1a-noop');
});
