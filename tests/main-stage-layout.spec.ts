import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

test.use({ viewport: { width: 1280, height: 800 } });

async function revealWorkspace(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.getElementById('workspace')?.classList.remove('hidden');
  });
}

test('workspace uses CSS Grid with lyrics/code/edit template areas', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  const layout = await page.evaluate(() => {
    const ws = document.querySelector('.workspace');
    if (!ws) return null;
    const style = getComputedStyle(ws as Element);
    return { display: style.display, areas: style.gridTemplateAreas };
  });
  expect(layout).not.toBeNull();
  expect(layout!.display).toBe('grid');
  expect(layout!.areas).toContain('lyrics');
  expect(layout!.areas).toContain('code');
  expect(layout!.areas).toContain('edit');
});

test('lyrics panel sits to the left of the code panel', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  const lyricsBox = await page.locator('.lyrics-panel').boundingBox();
  const rightBox = await page.locator('.right-panel').boundingBox();
  expect(lyricsBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(lyricsBox!.x).toBeLessThan(rightBox!.x);
  const lyricsGridArea = await page
    .locator('.lyrics-panel')
    .evaluate((el) => getComputedStyle(el as Element).gridArea);
  expect(lyricsGridArea).toContain('lyrics');
});

test('edit bar sits below the code region', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  const editBar = page.locator('#editBar');
  await expect(editBar).toHaveCount(1);
  const editBox = await editBar.boundingBox();
  const rightBox = await page.locator('.right-panel').boundingBox();
  expect(editBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(editBox!.y).toBeGreaterThan(rightBox!.y + rightBox!.height / 2);
});

test('edit bar contains three preset buttons with expected data-preset values', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  const buttons = page.locator('button.preset-key');
  await expect(buttons).toHaveCount(3);
  const presets = await buttons.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-preset') ?? '').sort()
  );
  expect(presets).toEqual(['dreamier', 'punchier', 'warmer']);
});

test('prompt input is a visible text field with a non-empty placeholder', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  const input = page.locator('#promptInput');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('type', 'text');
  const placeholder = await input.getAttribute('placeholder');
  expect(placeholder ?? '').not.toBe('');
});

test('V1α default: lyrics panel greyed but still rendered', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  const panel = page.locator('.lyrics-panel');
  await expect(panel).toHaveClass(/v1a-disabled/);
  await expect(panel).toHaveAttribute('aria-disabled', 'true');
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  const wsDisplay = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.workspace') as Element).display
  );
  expect(wsDisplay).toBe('grid');
});

test('?v2=1: grid layout persists and lyrics panel is not greyed', async ({ page }) => {
  await page.goto(pageUrl + '?v2=1');
  await revealWorkspace(page);
  const panel = page.locator('.lyrics-panel');
  await expect(panel).not.toHaveClass(/v1a-disabled/);
  const display = await page.evaluate(() => {
    const ws = document.querySelector('.workspace');
    return ws ? getComputedStyle(ws as Element).display : null;
  });
  expect(display).toBe('grid');
});
