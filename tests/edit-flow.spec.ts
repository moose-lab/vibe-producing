import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

test.use({ viewport: { width: 1280, height: 800 } });

declare global {
  interface Window {
    __EditBridge?: {
      presetToPrompt: (key: string) => string | null;
      buildRewritePrompt: (
        currentCode: string,
        instruction: string
      ) => { system: string; user: string };
      rewriteStrudelV1a: (
        currentCode: string,
        instruction: string
      ) => Promise<{ code: string }>;
      presets: Record<string, string>;
      onEditApplied: (
        fn: (p: { source: 'preset' | 'prompt'; key?: string; instruction: string; code: string }) => void
      ) => unknown;
      onEditError: (
        fn: (p: { reason: string; missing?: string[]; raw?: string; error?: string }) => void
      ) => unknown;
    };
    __callClaudeImpl?: (sys: string, user: string) => Promise<unknown>;
    __strudelEvalImpl?: (code: string) => Promise<void> | void;
    __editStubCalls?: Array<{ sys: string; user: string }>;
    __lastEdit?: {
      source: 'preset' | 'prompt';
      key?: string;
      instruction: string;
      code: string;
    };
    __lastEditError?: { reason: string; missing?: string[]; raw?: string; error?: string };
    __producerHits?: { Taylor: number; Coldplay: number; Editor: number };
    __strudelEvalCalls?: string[];
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

test('presetToPrompt contract', async ({ page }) => {
  await bootPage(page);
  const result = await page.evaluate(() => {
    const eb = window.__EditBridge;
    return {
      hasBridge: !!eb,
      dreamier: eb?.presetToPrompt('dreamier') ?? null,
      punchier: eb?.presetToPrompt('punchier') ?? null,
      warmer: eb?.presetToPrompt('warmer') ?? null,
      unknown: eb ? eb.presetToPrompt('unknown') : 'NOT_NULL_SENTINEL',
    };
  });
  expect(result.hasBridge).toBe(true);
  expect(typeof result.dreamier).toBe('string');
  expect((result.dreamier ?? '').length).toBeGreaterThan(0);
  expect(typeof result.punchier).toBe('string');
  expect((result.punchier ?? '').length).toBeGreaterThan(0);
  expect(typeof result.warmer).toBe('string');
  expect((result.warmer ?? '').length).toBeGreaterThan(0);
  expect(result.unknown).toBeNull();
});

test('click preset sends code + instruction to the stub', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((variant) => {
    window.__editStubCalls = [];
    window.__callClaudeImpl = async (sys: string, user: string) => {
      (window.__editStubCalls ??= []).push({ sys, user });
      return JSON.stringify({ strudel_code: variant });
    };
    window.__strudelEvalImpl = async () => {};
  }, FIXTURE_FIVE_LAYER_VARIANT);

  await page.locator('button.preset-key[data-preset="dreamier"]').click();

  await page
    .waitForFunction(() => (window.__editStubCalls?.length ?? 0) >= 1, null, { timeout: 3000 })
    .catch(() => {});

  const snapshot = await page.evaluate(() => ({
    calls: window.__editStubCalls ?? [],
  }));

  expect(snapshot.calls.length).toBe(1);
  expect(snapshot.calls[0].user).toContain('stack(');
  expect(snapshot.calls[0].user).toContain('// layer: drums');
  // Dreamier instruction should ship one of the stable wording substrings
  // planned for T02 — either the Chinese '再梦' or English 'dream' variant.
  const user = snapshot.calls[0].user;
  const hasDreamWording = user.includes('再梦') || /dream/i.test(user);
  expect(hasDreamWording).toBe(true);
});

test('preset click happy-path updates textarea + emits edit:applied', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((variant) => {
    window.__editStubCalls = [];
    window.__strudelEvalCalls = [];
    window.__callClaudeImpl = async (sys: string, user: string) => {
      (window.__editStubCalls ??= []).push({ sys, user });
      return JSON.stringify({ strudel_code: variant });
    };
    window.__strudelEvalImpl = async (code: string) => {
      (window.__strudelEvalCalls ??= []).push(code);
    };
    window.__EditBridge?.onEditApplied((payload) => {
      window.__lastEdit = payload;
    });
  }, FIXTURE_FIVE_LAYER_VARIANT);

  await page.locator('button.preset-key[data-preset="dreamier"]').click();

  await page
    .waitForFunction(() => !!window.__lastEdit, null, { timeout: 3000 })
    .catch(() => {});

  const state = await page.evaluate(() => ({
    textareaValue: (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null,
    lastEdit: window.__lastEdit ?? null,
    strudelEvalCalls: window.__strudelEvalCalls ?? [],
  }));

  expect(state.textareaValue).toBe(FIXTURE_FIVE_LAYER_VARIANT);
  expect(state.lastEdit).not.toBeNull();
  expect(state.lastEdit!.source).toBe('preset');
  expect(state.lastEdit!.key).toBe('dreamier');
  expect(state.lastEdit!.code).toBe(FIXTURE_FIVE_LAYER_VARIANT);
  expect(state.strudelEvalCalls.length).toBeGreaterThanOrEqual(1);
  expect(state.strudelEvalCalls.some((c) => c === FIXTURE_FIVE_LAYER_VARIANT)).toBe(true);
});

test('Enter-in-prompt success + empty no-op', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((variant) => {
    window.__editStubCalls = [];
    window.__strudelEvalCalls = [];
    window.__callClaudeImpl = async (sys: string, user: string) => {
      (window.__editStubCalls ??= []).push({ sys, user });
      return JSON.stringify({ strudel_code: variant });
    };
    window.__strudelEvalImpl = async (code: string) => {
      (window.__strudelEvalCalls ??= []).push(code);
    };
    window.__EditBridge?.onEditApplied((payload) => {
      window.__lastEdit = payload;
    });
  }, FIXTURE_FIVE_LAYER_VARIANT);

  // (a) Non-empty prompt + Enter → stub called, textarea updated, edit:applied, input cleared.
  await page.locator('#promptInput').fill('make the kick heavier');
  await page.locator('#promptInput').press('Enter');

  await page
    .waitForFunction(() => !!window.__lastEdit, null, { timeout: 3000 })
    .catch(() => {});

  const afterA = await page.evaluate(() => ({
    calls: window.__editStubCalls?.length ?? 0,
    textareaValue: (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null,
    promptValue: (document.getElementById('promptInput') as HTMLInputElement | null)?.value ?? null,
    lastEdit: window.__lastEdit ?? null,
    userPayload: window.__editStubCalls?.[0]?.user ?? '',
  }));

  expect(afterA.calls).toBe(1);
  expect(afterA.userPayload).toContain('make the kick heavier');
  expect(afterA.textareaValue).toBe(FIXTURE_FIVE_LAYER_VARIANT);
  expect(afterA.lastEdit).not.toBeNull();
  expect(afterA.lastEdit!.source).toBe('prompt');
  expect(afterA.lastEdit!.instruction).toBe('make the kick heavier');
  expect(afterA.promptValue).toBe('');

  // (b) Empty prompt + Enter → stub NOT called, textarea unchanged.
  await page.locator('#promptInput').click();
  await page.locator('#promptInput').press('Enter');
  await page.waitForTimeout(250);

  const afterB = await page.evaluate(() => ({
    calls: window.__editStubCalls?.length ?? 0,
    textareaValue: (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null,
  }));
  expect(afterB.calls).toBe(1);
  expect(afterB.textareaValue).toBe(FIXTURE_FIVE_LAYER_VARIANT);

  // (c) Whitespace-only prompt + Enter → stub still NOT called.
  await page.locator('#promptInput').fill('   ');
  await page.locator('#promptInput').press('Enter');
  await page.waitForTimeout(250);

  const afterC = await page.evaluate(() => ({
    calls: window.__editStubCalls?.length ?? 0,
  }));
  expect(afterC.calls).toBe(1);
});

test('missing-layer response emits editError and preserves textarea', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((original) => {
    // Strip the ambience layer from the returned code.
    const stripped = original.replace(/\/\/ layer: ambience[\s\S]*$/, '').replace(/,\s*$/, '');
    window.__editStubCalls = [];
    window.__strudelEvalCalls = [];
    window.__callClaudeImpl = async (sys: string, user: string) => {
      (window.__editStubCalls ??= []).push({ sys, user });
      return JSON.stringify({ strudel_code: stripped });
    };
    window.__strudelEvalImpl = async (code: string) => {
      (window.__strudelEvalCalls ??= []).push(code);
    };
    window.__EditBridge?.onEditError((p) => {
      window.__lastEditError = p;
    });
  }, FIXTURE_FIVE_LAYER);

  await page.locator('button.preset-key[data-preset="dreamier"]').click();

  await page
    .waitForFunction(() => !!window.__lastEditError, null, { timeout: 3000 })
    .catch(() => {});

  const state = await page.evaluate(() => ({
    lastEditError: window.__lastEditError ?? null,
    textareaValue: (document.getElementById('codeTextarea') as HTMLTextAreaElement | null)?.value ?? null,
    strudelEvalCalls: window.__strudelEvalCalls?.length ?? 0,
  }));

  expect(state.lastEditError).not.toBeNull();
  expect(state.lastEditError!.reason).toBe('missing-layers');
  expect(Array.isArray(state.lastEditError!.missing)).toBe(true);
  expect(state.lastEditError!.missing).toContain('ambience');
  expect(state.textareaValue).toBe(FIXTURE_FIVE_LAYER);
  expect(state.strudelEvalCalls).toBe(0);
});

test('D010 producer-name isolation regression', async ({ page }) => {
  await bootPage(page);
  await page.evaluate((variant) => {
    window.__producerHits = { Taylor: 0, Coldplay: 0, Editor: 0 };
    window.__editStubCalls = [];
    window.__callClaudeImpl = async (sys: string, user: string) => {
      (window.__editStubCalls ??= []).push({ sys, user });
      const hits = window.__producerHits!;
      if (sys.includes('Taylor')) hits.Taylor += 1;
      if (sys.includes('Coldplay')) hits.Coldplay += 1;
      if (sys.includes('Editor')) hits.Editor += 1;
      return JSON.stringify({ strudel_code: variant });
    };
    window.__strudelEvalImpl = async () => {};
  }, FIXTURE_FIVE_LAYER_VARIANT);

  await page.locator('button.preset-key[data-preset="punchier"]').click();

  await page
    .waitForFunction(() => (window.__editStubCalls?.length ?? 0) >= 1, null, { timeout: 3000 })
    .catch(() => {});

  const hits = await page.evaluate(() => window.__producerHits ?? { Taylor: -1, Coldplay: -1, Editor: -1 });
  expect(hits.Editor).toBeGreaterThanOrEqual(1);
  expect(hits.Taylor).toBe(0);
  expect(hits.Coldplay).toBe(0);
});
