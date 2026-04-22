import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

test.use({ viewport: { width: 1280, height: 800 } });

declare global {
  interface Window {
    __bus?: {
      on: (event: string, fn: (payload: unknown) => void) => unknown;
      off: (event: string, fn: (payload: unknown) => void) => void;
      emit: (event: string, payload?: unknown) => void;
    };
    __callClaudeImpl?: (sys: string, user: string) => Promise<unknown>;
    __strudelEvalImpl?: (code: string) => Promise<void> | void;
    __VocalProcess?: {
      simulateHum: (
        notes: string[],
        opts?: { bpm?: number; sampleRate?: number }
      ) => { notes: unknown[]; timestamps: number[]; buffer: Float32Array };
      simulateMicEnd: (notes: unknown[], timestamps: number[]) => void;
    };
    __AIBridge?: {
      assertFiveLayers: (code: string) => { ok: boolean; missing: string[] };
      onGenerated: (fn: (payload: { code: string; dna: unknown }) => void) => unknown;
    };
    __RevealAnimator?: {
      onPhase: (fn: (e: { phase: string; elapsedMs: number }) => void) => unknown;
      onDone: (fn: (e: { totalMs: number }) => void) => unknown;
    };
    __EditBridge?: {
      onEditApplied: (
        fn: (p: { source: string; key?: string; instruction: string; code: string }) => void
      ) => unknown;
    };
    __latency?: {
      pipelineMs: number | null;
      revealMs: number | null;
      editMs?: number | null;
      budget: number;
    };
    __c1Result?: { pipelineMs: number; budget: number; over: boolean };
    __c2Done?: boolean;
    __c3Code?: string;
    __c4Result?: { editMs: number; budget: number; over: boolean };
    __c5Events?: Array<{ source: string; key?: string; instruction: string; code: string }>;
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

test('C1: pipeline completes within 15s budget (stubbed)', async ({ page }) => {
  // NOTE: Under stubbed transport pipelineMs is typically <50ms. This asserts
  // the instrumentation contract + regression bound, not the real production
  // SLO. Real SLO verification is C6 human UAT + a future real-API CI smoke.
  await page.goto(pageUrl);
  await page.evaluate((fixture) => {
    localStorage.setItem('vibe-origin-api-key', 'test');
    window.__callClaudeImpl = async () => ({
      strudel_code: fixture,
      title: 't',
      bpm: 92,
    });
    window.__strudelEvalImpl = async () => {};
    window.__bus!.on('latency:pipeline', (p) => {
      (window as unknown as { __c1Result: unknown }).__c1Result = p;
    });
    const { notes, timestamps } = window.__VocalProcess!.simulateHum(
      ['C4', 'E4', 'G4', 'C5'],
      { bpm: 100 }
    );
    window.__VocalProcess!.simulateMicEnd(notes, timestamps);
    (document.getElementById('genBtn') as HTMLButtonElement).click();
  }, FIXTURE_FIVE_LAYER);

  await page.waitForFunction(() => window.__c1Result !== undefined, null, {
    timeout: 20000,
  });

  const result = await page.evaluate(() => window.__c1Result!);
  expect(typeof result.pipelineMs).toBe('number');
  expect(result.pipelineMs).toBeLessThan(15000);
  expect(result.budget).toBe(15000);
  expect(result.over).toBe(false);
});

test('C2: code visible + non-empty in textarea after reveal', async ({ page }) => {
  await page.goto(pageUrl);
  await page.evaluate((fixture) => {
    localStorage.setItem('vibe-origin-api-key', 'test');
    window.__callClaudeImpl = async () => ({
      strudel_code: fixture,
      title: 't',
      bpm: 92,
    });
    window.__strudelEvalImpl = async () => {};
    // C2 gates on the 'reveal:done' bus event (via the RevealAnimator helper),
    // not 'ai:generated:v1a' — research §Pitfall 2 flagged that snapshotting at
    // ai:generated:v1a would race the textarea population.
    window.__RevealAnimator!.onDone(() => {
      window.__c2Done = true;
    });
    const { notes, timestamps } = window.__VocalProcess!.simulateHum(
      ['C4', 'E4', 'G4', 'C5'],
      { bpm: 100 }
    );
    window.__VocalProcess!.simulateMicEnd(notes, timestamps);
    (document.getElementById('genBtn') as HTMLButtonElement).click();
  }, FIXTURE_FIVE_LAYER);

  await page.waitForFunction(() => window.__c2Done === true, null, {
    timeout: 20000,
  });

  const state = await page.evaluate(() => {
    const ta = document.getElementById('codeTextarea') as HTMLTextAreaElement | null;
    const ws = document.getElementById('workspace');
    return {
      valueLength: ta ? ta.value.length : 0,
      textareaDisplay: ta ? getComputedStyle(ta).display : 'none',
      workspaceHidden: ws ? ws.classList.contains('hidden') : true,
    };
  });
  expect(state.valueLength).toBeGreaterThan(0);
  expect(state.textareaDisplay).not.toBe('none');
  expect(state.workspaceHidden).toBe(false);
});

test('C3: generated code passes assertFiveLayers', async ({ page }) => {
  await page.goto(pageUrl);
  await page.evaluate((fixture) => {
    localStorage.setItem('vibe-origin-api-key', 'test');
    window.__callClaudeImpl = async () => ({
      strudel_code: fixture,
      title: 't',
      bpm: 92,
    });
    window.__strudelEvalImpl = async () => {};
    window.__AIBridge!.onGenerated((evt) => {
      window.__c3Code = evt.code;
    });
    const { notes, timestamps } = window.__VocalProcess!.simulateHum(
      ['C4', 'E4', 'G4', 'C5'],
      { bpm: 100 }
    );
    window.__VocalProcess!.simulateMicEnd(notes, timestamps);
    (document.getElementById('genBtn') as HTMLButtonElement).click();
  }, FIXTURE_FIVE_LAYER);

  await page.waitForFunction(() => window.__c3Code !== undefined, null, {
    timeout: 20000,
  });

  const verdict = await page.evaluate(() => {
    const code = window.__c3Code!;
    const check = window.__AIBridge!.assertFiveLayers(code);
    return {
      ok: check.ok,
      missing: check.missing,
      hasDrums: code.includes('// layer: drums'),
      hasBass: code.includes('// layer: bass'),
      hasChord: code.includes('// layer: chord'),
      hasVocal: code.includes('// layer: vocal'),
      hasAmbience: code.includes('// layer: ambience'),
    };
  });
  expect(verdict.ok).toBe(true);
  expect(verdict.missing).toEqual([]);
  expect(verdict.hasDrums).toBe(true);
  expect(verdict.hasBass).toBe(true);
  expect(verdict.hasChord).toBe(true);
  expect(verdict.hasVocal).toBe(true);
  expect(verdict.hasAmbience).toBe(true);
});

test('C4: edit completes within 10s budget (stubbed, depends on T01 latency:edit)', async ({
  page,
}) => {
  // NOTE: Under stubbed transport editMs is typically <50ms. This asserts the
  // T01 instrumentation contract + regression bound, not the real production
  // SLO. Real SLO verification is C6 human UAT + a future real-API CI smoke.
  await page.goto(pageUrl);
  await revealWorkspace(page);
  await page.evaluate(
    ({ seed, variant }) => {
      localStorage.setItem('vibe-origin-api-key', 'test');
      window.__callClaudeImpl = async () =>
        JSON.stringify({ strudel_code: variant });
      window.__strudelEvalImpl = async () => {};
      const ta = document.getElementById('codeTextarea') as HTMLTextAreaElement;
      ta.value = seed;
      window.__bus!.on('latency:edit', (p) => {
        (window as unknown as { __c4Result: unknown }).__c4Result = p;
      });
    },
    { seed: FIXTURE_FIVE_LAYER, variant: FIXTURE_FIVE_LAYER_VARIANT }
  );

  await page.locator('button.preset-key[data-preset="dreamier"]').click();

  await page.waitForFunction(() => window.__c4Result !== undefined, null, {
    timeout: 15000,
  });

  const snapshot = await page.evaluate(() => ({
    c4: window.__c4Result!,
    latencyEditMs: window.__latency?.editMs ?? null,
  }));
  expect(typeof snapshot.c4.editMs).toBe('number');
  expect(snapshot.c4.editMs).toBeLessThan(10000);
  expect(snapshot.c4.over).toBe(false);
  expect(snapshot.c4.budget).toBe(10000);
  expect(typeof snapshot.latencyEditMs).toBe('number');
});

test('C5: ≥3 preset buttons, each wired to edit:applied', async ({ page }) => {
  await page.goto(pageUrl);
  await revealWorkspace(page);

  const buttonCount = await page.locator('button.preset-key').count();
  expect(buttonCount).toBeGreaterThanOrEqual(3);

  await page.evaluate((variant) => {
    localStorage.setItem('vibe-origin-api-key', 'test');
    window.__callClaudeImpl = async () =>
      JSON.stringify({ strudel_code: variant });
    window.__strudelEvalImpl = async () => {};
    window.__c5Events = [];
    window.__EditBridge!.onEditApplied((p) => {
      (window.__c5Events ??= []).push(p);
    });
  }, FIXTURE_FIVE_LAYER_VARIANT);

  const keys = ['dreamier', 'punchier', 'warmer'];
  for (const key of keys) {
    await page.evaluate(
      ({ seed }) => {
        const ta = document.getElementById('codeTextarea') as HTMLTextAreaElement;
        ta.value = seed;
      },
      { seed: FIXTURE_FIVE_LAYER }
    );
    await page.locator(`button.preset-key[data-preset="${key}"]`).click();
    await page.waitForFunction(
      (k) => !!window.__c5Events?.some((e) => e.key === k),
      key,
      { timeout: 10000 }
    );
  }

  const events = await page.evaluate(() => window.__c5Events ?? []);
  expect(events.length).toBe(3);
  const signature = events
    .map((e) => `${e.source}:${e.key}`)
    .sort();
  expect(signature).toEqual([
    'preset:dreamier',
    'preset:punchier',
    'preset:warmer',
  ]);
});
