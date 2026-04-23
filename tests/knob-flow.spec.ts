import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

test.use({ viewport: { width: 1280, height: 800 } });

declare global {
  interface Window {
    __FXBus?: {
      reverbWet: number;
      delayWet: number;
      reset: () => void;
      patchTrailingChain: (
        code: string,
        key: 'reverb' | 'delay',
        value: number
      ) => { ok: true; code: string } | { ok: false; reason: 'patch-failed' };
    };
    __EditBridge?: {
      onEditApplied: (fn: (p: unknown) => void) => unknown;
      onEditError: (fn: (p: unknown) => void) => unknown;
    };
    __bus?: {
      emit: (e: string, p: unknown) => void;
      on: (e: string, fn: (p: unknown) => void) => unknown;
    };
    __strudelEvalImpl?: (code: string) => Promise<void> | void;
    __lastEdit?: {
      source?: string;
      key?: string;
      value?: number;
      code?: string;
    };
    __lastEditError?: {
      reason?: string;
      source?: string;
      key?: string;
    };
    __c4Knob?: {
      editMs: number;
      budget: number;
      over: boolean;
      source?: string;
    };
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

const FIXTURE_FIVE_LAYER_WITH_CHORD_ROOM = FIXTURE_FIVE_LAYER.replace(
  'note("<c e g>").s("rhodes")',
  'note("<c e g>").s("rhodes").room(0.7)'
);

const FIXTURE_UPDATE_INPUT = FIXTURE_FIVE_LAYER_WITH_CHORD_ROOM.replace(
  '.cpm(23).slow(8)',
  '.cpm(23).slow(8).room(0.2)'
);

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

test('T0 — FXBus sanity: reverbWet=0, reset + patchTrailingChain are functions', async ({
  page,
}) => {
  await bootPage(page);
  const shape = await page.evaluate(() => {
    const fx = window.__FXBus;
    return {
      hasFXBus: !!fx,
      reverbWet: fx?.reverbWet ?? null,
      delayWet: fx?.delayWet ?? null,
      resetType: typeof fx?.reset,
      patchType: typeof fx?.patchTrailingChain,
    };
  });
  expect(shape.hasFXBus).toBe(true);
  expect(shape.reverbWet).toBe(0);
  expect(shape.delayWet).toBe(0);
  expect(shape.resetType).toBe('function');
  expect(shape.patchType).toBe('function');
});

test('T1 — patchTrailingChain UPDATE replaces trailing .room(0.2) and preserves layer .room(0.7)', async ({
  page,
}) => {
  await bootPage(page);
  const result = await page.evaluate((code) => {
    return window.__FXBus!.patchTrailingChain(code, 'reverb', 0.4);
  }, FIXTURE_UPDATE_INPUT);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.code).toContain('note("<c e g>").s("rhodes").room(0.7)');
  expect(result.code).toMatch(/\)\.cpm\(23\)\.slow\(8\)\.room\(0\.4\)\s*$/);
  expect(result.code).not.toContain('.room(0.2)');
});

test('T2 — patchTrailingChain APPEND adds .room(0.4) after .slow(8) when absent', async ({
  page,
}) => {
  await bootPage(page);
  const result = await page.evaluate((code) => {
    return window.__FXBus!.patchTrailingChain(code, 'reverb', 0.4);
  }, FIXTURE_FIVE_LAYER);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.code).toMatch(/\)\.cpm\(23\)\.slow\(8\)\.room\(0\.4\)\s*$/);
});

test('T3 — patchTrailingChain STRIP removes trailing .room when value=0', async ({ page }) => {
  await bootPage(page);
  const result = await page.evaluate((code) => {
    return window.__FXBus!.patchTrailingChain(code, 'reverb', 0);
  }, FIXTURE_UPDATE_INPUT);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.code).toMatch(/\)\.cpm\(23\)\.slow\(8\)\s*$/);
  const lastCloseParen = result.code.lastIndexOf(').cpm(');
  expect(lastCloseParen).toBeGreaterThan(-1);
  const trailing = result.code.slice(lastCloseParen);
  expect(trailing).not.toContain('.room(');
  expect(result.code).toContain('note("<c e g>").s("rhodes").room(0.7)');
});

test('T4 — patchTrailingChain MALFORMED returns patch-failed', async ({ page }) => {
  await bootPage(page);
  const result = await page.evaluate(() => {
    return window.__FXBus!.patchTrailingChain(
      'not strudel code without any close paren',
      'reverb',
      0.4
    );
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toBe('patch-failed');
});

test('T5 — knob drag: live FXBus preview, pointerup commits .room(X) + FXBus reset + bus emits', async ({
  page,
}) => {
  await bootPage(page);

  await page.evaluate(() => {
    window.__strudelEvalImpl = async () => {};
    window.__EditBridge!.onEditApplied((p) => {
      window.__lastEdit = p as typeof window.__lastEdit;
    });
    window.__bus!.on('latency:edit', (p) => {
      window.__c4Knob = p as typeof window.__c4Knob;
    });
  });

  const knob = page.locator('#reverbKnob');
  await knob.dispatchEvent('pointerdown', { clientY: 200, pointerId: 1 });

  await page.evaluate(() => {
    for (const y of [190, 180, 170, 160]) {
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, pointerId: 1 }));
    }
  });

  const mid = await page.evaluate(() => ({
    wet: window.__FXBus!.reverbWet,
    code: (document.getElementById('codeTextarea') as HTMLTextAreaElement).value,
    lastEdit: window.__lastEdit,
  }));
  expect(mid.wet).toBeGreaterThan(0);
  expect(mid.code).toBe(FIXTURE_FIVE_LAYER);
  expect(mid.lastEdit).toBeUndefined();

  await page.evaluate(() => {
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
  });

  await page.waitForFunction(() => !!window.__lastEdit);

  const after = await page.evaluate(() => ({
    code: (document.getElementById('codeTextarea') as HTMLTextAreaElement).value,
    wet: window.__FXBus!.reverbWet,
    lastEdit: window.__lastEdit,
    c4: window.__c4Knob,
  }));
  expect(after.code).toMatch(/\)\.cpm\(23\)\.slow\(8\)\.room\([^)]+\)\s*$/);
  expect(after.wet).toBe(0);
  expect(after.lastEdit?.source).toBe('knob');
  expect(after.lastEdit?.key).toBe('reverb');
  expect(typeof after.lastEdit?.value).toBe('number');
  expect(after.lastEdit?.value! > 0).toBe(true);
  expect(after.lastEdit?.code).toBe(after.code);
  expect(after.c4?.source).toBe('knob');
  expect(after.c4?.editMs).toBeLessThan(100);
  expect(after.c4?.over).toBe(false);
});

test('T6 — knob drag on malformed textarea: editError{patch-failed}, no code mutation, strip visible, FXBus reset', async ({
  page,
}) => {
  await bootPage(page);

  await page.evaluate(() => {
    const ta = document.getElementById('codeTextarea') as HTMLTextAreaElement;
    ta.value = 'garbage with no paren';
    window.__EditBridge!.onEditError((p) => {
      window.__lastEditError = p as typeof window.__lastEditError;
    });
  });

  const knob = page.locator('#reverbKnob');
  await knob.dispatchEvent('pointerdown', { clientY: 200, pointerId: 1 });

  await page.evaluate(() => {
    for (const y of [190, 180, 170, 160]) {
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, pointerId: 1 }));
    }
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
  });

  await page.waitForFunction(() => !!window.__lastEditError);

  const state = await page.evaluate(() => {
    const strip = document.getElementById('editErrorStrip') as HTMLElement;
    return {
      err: window.__lastEditError,
      code: (document.getElementById('codeTextarea') as HTMLTextAreaElement).value,
      stripHidden: strip.hidden,
      stripText: strip.textContent || '',
      wet: window.__FXBus!.reverbWet,
    };
  });

  expect(state.err?.reason).toBe('patch-failed');
  expect(state.err?.source).toBe('knob');
  expect(state.err?.key).toBe('reverb');
  expect(state.code).toBe('garbage with no paren');
  expect(state.stripHidden).toBe(false);
  expect(state.stripText).toContain('代码修改失败');
  expect(state.wet).toBe(0);
});
