import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

test.use({ viewport: { width: 1280, height: 800 } });

declare global {
  interface Window {
    __bus?: { emit: (e: string, p: unknown) => void; on: (e: string, fn: (p: unknown) => void) => unknown };
    __callClaudeImpl?: (sys: string, user: string) => Promise<unknown>;
    __strudelEvalImpl?: (code: string) => Promise<void> | void;
  }
}

const FIXTURE_FIVE_LAYER = [
  'stack(',
  '// layer: drums',
  's("bd sd").bank("RolandTR808"),',
  '// layer: bass',
  'note("c2").s("sawtooth"),',
  '// layer: chord',
  'note("<c e g>").s("rhodes"),',
  '// layer: vocal',
  's("hum"),',
  '// layer: ambience',
  's("vinyl").gain(0.14)',
  ').cpm(23).slow(8)',
].join('\n');

async function revealWorkspace(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.getElementById('workspace')?.classList.remove('hidden');
  });
}

test('edit bar is a 2-row flex-column with top above bottom', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);

  const flexDirection = await page.evaluate(() =>
    getComputedStyle(document.getElementById('editBar') as Element).flexDirection
  );
  expect(flexDirection).toBe('column');

  const top = page.locator('#editBar .edit-bar-top');
  const bottom = page.locator('#editBar .edit-bar-bottom');
  await expect(top).toHaveCount(1);
  await expect(bottom).toHaveCount(1);

  const topBox = await top.boundingBox();
  const bottomBox = await bottom.boundingBox();
  expect(topBox).not.toBeNull();
  expect(bottomBox).not.toBeNull();
  expect(topBox!.y).toBeLessThan(bottomBox!.y);
});

test('top row has 4 inert placeholders with correct data-key attributes', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);

  const mood = page.locator('#moodSlider');
  const energy = page.locator('#energySlider');
  const reverb = page.locator('#reverbKnob');
  const delay = page.locator('#delayKnob');

  await expect(mood).toHaveCount(1);
  await expect(energy).toHaveCount(1);
  await expect(reverb).toHaveCount(1);
  await expect(delay).toHaveCount(1);

  await expect(mood).toHaveAttribute('data-key', 'mood');
  await expect(energy).toHaveAttribute('data-key', 'energy');
  await expect(reverb).toHaveAttribute('data-key', 'reverb');
  await expect(delay).toHaveAttribute('data-key', 'delay');

  const moodDisabled = await mood.evaluate((el) => (el as HTMLInputElement).disabled);
  const energyDisabled = await energy.evaluate((el) => (el as HTMLInputElement).disabled);
  expect(moodDisabled).toBe(false);
  expect(energyDisabled).toBe(false);

  const reverbPE = await reverb.evaluate((el) => getComputedStyle(el as Element).pointerEvents);
  const delayPE = await delay.evaluate((el) => getComputedStyle(el as Element).pointerEvents);
  expect(reverbPE).toBe('auto');
  expect(delayPE).toBe('auto');
});

test('#editErrorStrip exists and is hidden at load', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);

  const state = await page.evaluate(() => {
    const el = document.getElementById('editErrorStrip');
    if (!el) return { exists: false, hidden: null, display: null };
    return {
      exists: true,
      hidden: (el as HTMLElement).hidden,
      display: getComputedStyle(el).display,
    };
  });
  expect(state.exists).toBe(true);
  expect(state.hidden).toBe(true);
  expect(state.display).toBe('none');
});

test('DevTools emit of editError surfaces strip below prompt', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);

  await page.evaluate(() => {
    window.__bus!.emit('editError', { reason: 'test' });
  });

  await page.waitForFunction(
    () => !(document.getElementById('editErrorStrip') as HTMLElement).hidden,
    null,
    { timeout: 2000 }
  );

  const strip = page.locator('#editErrorStrip');
  const prompt = page.locator('#promptInput');
  const stripBox = await strip.boundingBox();
  const promptBox = await prompt.boundingBox();
  expect(stripBox).not.toBeNull();
  expect(promptBox).not.toBeNull();
  expect(stripBox!.y).toBeGreaterThan(promptBox!.y);

  const text = await strip.evaluate((el) => (el as HTMLElement).textContent || '');
  expect(text.length).toBeGreaterThan(0);
});

test('strip auto-dismisses within ~4s window', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);

  await page.evaluate(() => {
    window.__bus!.emit('editError', { reason: 'test' });
  });

  await page.waitForFunction(
    () => !(document.getElementById('editErrorStrip') as HTMLElement).hidden,
    null,
    { timeout: 2000 }
  );

  await page.waitForFunction(
    () => (document.getElementById('editErrorStrip') as HTMLElement).hidden === true,
    null,
    { timeout: 6000 }
  );
});

test('real-path layer-stripped preset click surfaces strip', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  await page.evaluate((original) => {
    localStorage.setItem('vibe-origin-api-key', 'test');
    const ta = document.getElementById('codeTextarea') as HTMLTextAreaElement | null;
    if (ta) ta.value = original;
    const stripped = original.replace(/\/\/ layer: ambience[\s\S]*$/, '').replace(/,\s*$/, '');
    window.__callClaudeImpl = async () => JSON.stringify({ strudel_code: stripped });
    window.__strudelEvalImpl = async () => {};
  }, FIXTURE_FIVE_LAYER);

  await page.locator('button.preset-key[data-preset="dreamier"]').click();

  await page.waitForFunction(
    () => !(document.getElementById('editErrorStrip') as HTMLElement).hidden,
    null,
    { timeout: 4000 }
  );

  const text = await page
    .locator('#editErrorStrip')
    .evaluate((el) => (el as HTMLElement).textContent || '');
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toContain('[object Object]');
});
