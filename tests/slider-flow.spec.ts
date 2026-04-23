import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

test.use({ viewport: { width: 1280, height: 800 } });

declare global {
  interface Window {
    __EditBridge?: {
      presetToPrompt: (key: string) => string | null;
      sliderToPrompt?: (key: string, value: number) => string | null;
      buildRewritePrompt: (
        currentCode: string,
        instruction: string
      ) => { system: string; user: string };
      rewriteStrudelV1a: (
        currentCode: string,
        instruction: string,
        ctx?: { source?: string; key?: string }
      ) => Promise<{ code: string }>;
      presets: string[] | Record<string, string>;
      onEditApplied: (
        fn: (p: {
          source: 'preset' | 'prompt' | 'slider';
          key?: string;
          instruction: string;
          value?: number;
          code: string;
        }) => void
      ) => unknown;
      onEditError: (
        fn: (p: {
          reason: string;
          missing?: string[];
          raw?: string;
          error?: string;
          source?: string;
          key?: string;
        }) => void
      ) => unknown;
      assertFiveLayers?: (code: string) => { ok: boolean; missing: string[] };
    };
    __bus?: {
      emit: (e: string, p: unknown) => void;
      on: (e: string, fn: (p: unknown) => void) => unknown;
    };
    __callClaudeImpl?: (sys: string, user: string) => Promise<unknown>;
    __strudelEvalImpl?: (code: string) => Promise<void> | void;
    __latency?: {
      pipelineMs: number | null;
      revealMs: number | null;
      editMs?: number | null;
      budget: number;
    };
    __lastEdit?: {
      source: 'preset' | 'prompt' | 'slider';
      key?: string;
      instruction: string;
      value?: number;
      code: string;
    };
    __lastEditError?: {
      reason: string;
      missing?: string[];
      raw?: string;
      error?: string;
      source?: string;
      key?: string;
    };
    __lastUserPrompt?: string;
    __editEvents?: Array<{
      source: 'preset' | 'prompt' | 'slider';
      key?: string;
      instruction: string;
      value?: number;
      code: string;
    }>;
    __stubCalls?: number;
    __resolveStub?: (() => void) | null;
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

const FIXTURE_FIVE_LAYER_VARIANT = FIXTURE_FIVE_LAYER.replace(
  's("vinyl").gain(0.14)',
  's("gm_fx_atmosphere").gain(0.14)'
);

const FIXTURE_MISSING_AMBIENCE = FIXTURE_FIVE_LAYER
  .replace(/\/\/ layer: ambience[\s\S]*$/, '')
  .replace(/,\s*$/, '');

async function revealWorkspace(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.getElementById('workspace')?.classList.remove('hidden');
  });
}

async function bootPage(page: import('@playwright/test').Page) {
  await page.goto(pageUrl);
  await revealWorkspace(page);
  await page.evaluate((code) => {
    localStorage.setItem('vibe-origin-api-key', 'test');
    const ta = document.getElementById('codeTextarea') as HTMLTextAreaElement | null;
    if (ta) ta.value = code;
  }, FIXTURE_FIVE_LAYER);
}

test('T1 — sliderToPrompt contract', async ({ page }) => {
  await bootPage(page);
  const result = await page.evaluate(() => {
    const eb = window.__EditBridge;
    const fn = eb?.sliderToPrompt;
    return {
      hasBridge: !!eb,
      hasSliderToPrompt: typeof fn === 'function',
      moodHigh: fn ? fn('mood', 0.8) : null,
      moodLow: fn ? fn('mood', 0.1) : null,
      moodMid: fn ? fn('mood', 0.5) : null,
      energyLow: fn ? fn('energy', 0.2) : null,
      energyHigh: fn ? fn('energy', 0.9) : null,
      unknown: fn ? fn('unknown', 0.5) : 'NOT_NULL_SENTINEL',
    };
  });
  expect(result.hasBridge).toBe(true);
  expect(result.hasSliderToPrompt).toBe(true);
  expect(typeof result.moodHigh).toBe('string');
  expect((result.moodHigh ?? '').length).toBeGreaterThan(0);
  expect(result.moodHigh).toContain('轻盈');
  expect(typeof result.moodLow).toBe('string');
  expect((result.moodLow ?? '').length).toBeGreaterThan(0);
  expect(result.moodLow).toContain('忧郁');
  expect(typeof result.moodMid).toBe('string');
  expect(result.moodMid).toContain('保持');
  expect(typeof result.energyLow).toBe('string');
  expect(result.energyLow).toContain('慵懒');
  expect(typeof result.energyHigh).toBe('string');
  expect(result.energyHigh).toContain('律动');
  expect(result.unknown).toBeNull();
});

test('T2 — mood slider drag + commit → edit:applied with value', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((variant) => {
    window.__lastUserPrompt = undefined;
    window.__callClaudeImpl = async (_sys: string, user: string) => {
      window.__lastUserPrompt = user;
      return JSON.stringify({ strudel_code: variant });
    };
    window.__strudelEvalImpl = async () => {};
    window.__EditBridge?.onEditApplied((payload) => {
      window.__lastEdit = payload;
    });
  }, FIXTURE_FIVE_LAYER_VARIANT);

  await page.locator('#moodSlider').evaluate((el) => {
    (el as HTMLInputElement).value = '0.8';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page
    .waitForFunction(() => !!window.__lastEdit, null, { timeout: 3000 })
    .catch(() => {});

  const state = await page.evaluate(() => ({
    lastEdit: window.__lastEdit ?? null,
    textareaValue:
      (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null,
    userPrompt: window.__lastUserPrompt ?? null,
    editMs: window.__latency?.editMs ?? null,
  }));

  expect(state.lastEdit).not.toBeNull();
  expect(state.lastEdit!.source).toBe('slider');
  expect(state.lastEdit!.key).toBe('mood');
  expect(state.lastEdit!.value).toBe(0.8);
  expect(state.lastEdit!.code).toBe(FIXTURE_FIVE_LAYER_VARIANT);
  expect(state.textareaValue).toBe(FIXTURE_FIVE_LAYER_VARIANT);
  expect(typeof state.userPrompt).toBe('string');
  expect(state.userPrompt ?? '').toContain('轻盈');
  expect(typeof state.editMs).toBe('number');
  expect(state.editMs ?? 0).toBeGreaterThan(0);
});

test('T3 — energy slider drag + commit → edit:applied with value', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((variant) => {
    window.__lastUserPrompt = undefined;
    window.__callClaudeImpl = async (_sys: string, user: string) => {
      window.__lastUserPrompt = user;
      return JSON.stringify({ strudel_code: variant });
    };
    window.__strudelEvalImpl = async () => {};
    window.__EditBridge?.onEditApplied((payload) => {
      window.__lastEdit = payload;
    });
  }, FIXTURE_FIVE_LAYER_VARIANT);

  await page.locator('#energySlider').evaluate((el) => {
    (el as HTMLInputElement).value = '0.2';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page
    .waitForFunction(() => !!window.__lastEdit, null, { timeout: 3000 })
    .catch(() => {});

  const state = await page.evaluate(() => ({
    lastEdit: window.__lastEdit ?? null,
    textareaValue:
      (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null,
    userPrompt: window.__lastUserPrompt ?? null,
  }));

  expect(state.lastEdit).not.toBeNull();
  expect(state.lastEdit!.source).toBe('slider');
  expect(state.lastEdit!.key).toBe('energy');
  expect(state.lastEdit!.value).toBe(0.2);
  expect(state.lastEdit!.code).toBe(FIXTURE_FIVE_LAYER_VARIANT);
  expect(state.textareaValue).toBe(FIXTURE_FIVE_LAYER_VARIANT);
  expect(typeof state.userPrompt).toBe('string');
  expect(state.userPrompt ?? '').toContain('慵懒');
});

test('T4 — concurrent drag dropped by isEditing lock', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((variant) => {
    window.__resolveStub = null;
    window.__stubCalls = 0;
    window.__editEvents = [];
    window.__callClaudeImpl = async () => {
      window.__stubCalls = (window.__stubCalls ?? 0) + 1;
      await new Promise<void>((resolve) => {
        window.__resolveStub = resolve;
      });
      return JSON.stringify({ strudel_code: variant });
    };
    window.__strudelEvalImpl = async () => {};
    window.__EditBridge?.onEditApplied((payload) => {
      (window.__editEvents ??= []).push(payload);
    });
  }, FIXTURE_FIVE_LAYER_VARIANT);

  // Fire the first drag-commit; applyEdit will await the stub and hold isEditing=true.
  await page.locator('#moodSlider').evaluate((el) => {
    (el as HTMLInputElement).value = '0.8';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Wait until the stub has been invoked at least once (lock is engaged).
  await page
    .waitForFunction(() => (window.__stubCalls ?? 0) >= 1, null, { timeout: 3000 })
    .catch(() => {});

  // Immediately fire a second concurrent drag-commit on #energySlider — should be dropped.
  await page.locator('#energySlider').evaluate((el) => {
    (el as HTMLInputElement).value = '0.7';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Give the event loop a tick so any mistakenly-queued second call would register.
  await page.waitForTimeout(150);

  // Now release the first stub so the first applyEdit can finish.
  await page.evaluate(() => {
    const r = window.__resolveStub;
    if (typeof r === 'function') r();
  });

  await page
    .waitForFunction(() => (window.__editEvents?.length ?? 0) >= 1, null, { timeout: 3000 })
    .catch(() => {});

  // Settle: small delay to ensure no late second emit sneaks through.
  await page.waitForTimeout(150);

  const state = await page.evaluate(() => ({
    events: window.__editEvents ?? [],
    stubCalls: window.__stubCalls ?? 0,
  }));

  expect(state.events.length).toBe(1);
  expect(state.events[0].source).toBe('slider');
  expect(state.events[0].key).toBe('mood');
  expect(state.events[0].value).toBe(0.8);
  expect(state.stubCalls).toBe(1);
});

test('T5 — missing-layer response from slider → editError{source, key}', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((stripped) => {
    window.__callClaudeImpl = async () => JSON.stringify({ strudel_code: stripped });
    window.__strudelEvalImpl = async () => {};
    window.__EditBridge?.onEditError((payload) => {
      window.__lastEditError = payload;
    });
  }, FIXTURE_MISSING_AMBIENCE);

  const initialTextarea = await page.evaluate(
    () => (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null
  );

  await page.locator('#moodSlider').evaluate((el) => {
    (el as HTMLInputElement).value = '0.8';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page
    .waitForFunction(() => !!window.__lastEditError, null, { timeout: 3000 })
    .catch(() => {});

  const state = await page.evaluate(() => ({
    lastEditError: window.__lastEditError ?? null,
    textareaValue:
      (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null,
    stripHidden: (document.getElementById('editErrorStrip') as HTMLElement | null)?.hidden ?? null,
    stripText:
      (document.getElementById('editErrorStrip') as HTMLElement | null)?.textContent ?? null,
  }));

  expect(state.lastEditError).not.toBeNull();
  expect(state.lastEditError!.reason).toBe('missing-layers');
  expect(state.lastEditError!.source).toBe('slider');
  expect(state.lastEditError!.key).toBe('mood');
  expect(Array.isArray(state.lastEditError!.missing)).toBe(true);
  expect(state.lastEditError!.missing ?? []).toContain('ambience');
  expect(state.textareaValue).toBe(initialTextarea);
  expect(state.stripHidden).toBe(false);
  expect(state.stripText ?? '').toContain('缺失音轨');
});
