import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

test('page loads without page-origin console errors', async ({ page }) => {
  const pageOriginErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const sourceUrl = msg.location().url ?? '';
    if (sourceUrl.startsWith('file://')) pageOriginErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageOriginErrors.push(err.message));

  await page.goto(pageUrl);
  await expect(page).toHaveTitle(/Vibe Origin/i);
  expect(pageOriginErrors, pageOriginErrors.join('\n')).toEqual([]);
});

test('topnav renders with non-zero height', async ({ page }) => {
  await page.goto(pageUrl);
  const topnav = page.locator('nav.topnav');
  await expect(topnav).toBeVisible();
  const box = await topnav.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(0);
});
