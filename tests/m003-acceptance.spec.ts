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
    __c7FxSnapshot?: {
      reverbWet: number;
      delayWet: number;
      code: string;
      lastEdit: unknown;
    };
    __c8Result?: {
      editMs: number;
      budget: number;
      over: boolean;
      source?: string;
    };
    __c10Events?: Array<{ source?: string; key?: string; value?: number; code?: string }>;
    __c10LockEvents?: Array<{ source?: string; key?: string; value?: number; code?: string }>;
    __stubCalls?: number;
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

// C7 — knob mid-drag FXBus preview invariant.
// Locks the P002 single-source-of-truth contract: during knob drag the textarea
// must NOT mutate and no edit:applied must emit; only FXBus[wetKey] ticks up.
test('C7: knob mid-drag updates FXBus.reverbWet only — textarea unchanged, cross-channel isolated, no edit bus emit', async ({
  page,
}) => {
  await bootPage(page);

  // Pitfall 1: install __strudelEvalImpl via page.evaluate AFTER goto, not addInitScript.
  await page.evaluate(() => {
    window.__strudelEvalImpl = async () => {};
    window.__EditBridge!.onEditApplied((p) => {
      window.__lastEdit = p as typeof window.__lastEdit;
    });
  });

  const knob = page.locator('#reverbKnob');
  await knob.dispatchEvent('pointerdown', { clientY: 200, pointerId: 1 });

  // Loop 4x pointermove with Y descending 200→170 (dy=30 → curVal≈0.3).
  await page.evaluate(() => {
    for (const y of [190, 180, 175, 170]) {
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, pointerId: 1 }));
    }
  });

  // Assert BEFORE dispatching pointerup: preview-only invariants.
  const mid = await page.evaluate(() => {
    window.__c7FxSnapshot = {
      reverbWet: window.__FXBus!.reverbWet,
      delayWet: window.__FXBus!.delayWet,
      code: (document.getElementById('codeTextarea') as HTMLTextAreaElement).value,
      lastEdit: window.__lastEdit ?? null,
    };
    return window.__c7FxSnapshot;
  });

  expect(mid.reverbWet).toBeGreaterThan(0);
  expect(mid.delayWet).toBe(0); // cross-channel isolation
  expect(mid.code).toBe(FIXTURE_FIVE_LAYER); // textarea unchanged
  expect(mid.lastEdit).toBeNull(); // no mid-drag edit:applied emit
});

// C8 — knob pointerup code-patch commit contract, across reverb + delay iterations.
// Mirrors acceptance.spec.ts:260-275 C5 iteration pattern. editMs<100 is the locality
// proof — any regression routing knob commits through Claude blows this by ≥50×.
test('C8: knob pointerup commits .{room,delay}(X) patch with source=knob and editMs<100, for both reverb and delay', async ({
  page,
}) => {
  const iterations: Array<{ knob: string; key: 'reverb' | 'delay'; method: string }> = [
    { knob: 'reverbKnob', key: 'reverb', method: 'room' },
    { knob: 'delayKnob', key: 'delay', method: 'delay' },
  ];

  for (const { knob, key, method } of iterations) {
    await bootPage(page);

    await page.evaluate(() => {
      window.__lastEdit = undefined;
      window.__c8Result = undefined;
      window.__strudelEvalImpl = async () => {};
      window.__EditBridge!.onEditApplied((p) => {
        window.__lastEdit = p as typeof window.__lastEdit;
      });
      window.__bus!.on('latency:edit', (p) => {
        window.__c8Result = p as typeof window.__c8Result;
      });
    });

    const el = page.locator(`#${knob}`);
    await el.dispatchEvent('pointerdown', { clientY: 200, pointerId: 1 });

    await page.evaluate(() => {
      for (const y of [190, 180, 175, 170]) {
        document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, pointerId: 1 }));
      }
      document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    });

    await page.waitForFunction(() => window.__lastEdit !== undefined, null, {
      timeout: 5000,
    });

    const after = await page.evaluate((wetKeyName: 'reverbWet' | 'delayWet') => ({
      code: (document.getElementById('codeTextarea') as HTMLTextAreaElement).value,
      wet: window.__FXBus![wetKeyName],
      lastEdit: window.__lastEdit,
      c8: window.__c8Result,
    }), key === 'reverb' ? 'reverbWet' : 'delayWet');

    const trailingRe = new RegExp(`\\)\\.cpm\\(23\\)\\.slow\\(8\\)\\.${method}\\([^)]+\\)\\s*$`);
    expect(after.code).toMatch(trailingRe);
    expect(after.wet).toBe(0); // post-commit reset — code owns the effect now
    expect(after.lastEdit?.source).toBe('knob');
    expect(after.lastEdit?.key).toBe(key);
    expect(typeof after.lastEdit?.value).toBe('number');
    expect(after.lastEdit!.value! > 0).toBe(true);
    expect(after.lastEdit?.code).toBe(after.code);
    expect(after.c8?.source).toBe('knob');
    expect(after.c8?.over).toBe(false);
    expect(after.c8?.budget).toBe(10000);
    expect(typeof after.c8?.editMs).toBe('number');
    expect(after.c8!.editMs).toBeLessThan(100);
  }
});

// C9 — knob malformed editError path: no code mutation, strip visible, FXBus reset.
test('C9: knob drag on malformed textarea emits editError{patch-failed}, code unchanged, strip visible, FXBus reset', async ({
  page,
}) => {
  await bootPage(page);

  await page.evaluate(() => {
    const ta = document.getElementById('codeTextarea') as HTMLTextAreaElement;
    ta.value = 'garbage with no paren';
    window.__strudelEvalImpl = async () => {};
    window.__EditBridge!.onEditError((p) => {
      window.__lastEditError = p as typeof window.__lastEditError;
    });
  });

  const knob = page.locator('#reverbKnob');
  await knob.dispatchEvent('pointerdown', { clientY: 200, pointerId: 1 });

  await page.evaluate(() => {
    for (const y of [190, 180, 175, 170]) {
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, pointerId: 1 }));
    }
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
  });

  await page.waitForFunction(() => window.__lastEditError !== undefined, null, {
    timeout: 5000,
  });

  const state = await page.evaluate(() => {
    const strip = document.getElementById('editErrorStrip') as HTMLElement;
    return {
      err: window.__lastEditError,
      code: (document.getElementById('codeTextarea') as HTMLTextAreaElement).value,
      stripHidden: strip.hidden,
      stripText: strip.textContent || '',
      reverbWet: window.__FXBus!.reverbWet,
    };
  });

  expect(state.err?.reason).toBe('patch-failed');
  expect(state.err?.source).toBe('knob');
  expect(state.err?.key).toBe('reverb');
  expect(state.code).toBe('garbage with no paren');
  expect(state.stripHidden).toBe(false);
  expect(state.stripText).toContain('代码修改失败');
  expect(state.reverbWet).toBe(0);
});

// C10 — cross-path integration: preset + slider + knob coexist, AND isEditing lock is
// honored at knob pointerdown during AI rewrite. Two sub-assertions in one test.
test('C10: preset + slider + knob coexistence AND isEditing-lock honored at knob pointerdown during AI rewrite', async ({
  browser,
}) => {
  // ============ (a) Coexistence sequence ============
  // Pitfall 3: textarea ends in VARIANT state after preset step (1). Slider step (2)
  // re-writes it to VARIANT (same content since stub returns VARIANT). Knob step (3)
  // patches VARIANT's trailing chain. We do NOT re-seed the textarea between steps.
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageA = await ctxA.newPage();
  try {
    await bootPage(pageA);

    await pageA.evaluate((variant) => {
      window.__strudelEvalImpl = async () => {};
      window.__callClaudeImpl = async () => JSON.stringify({ strudel_code: variant });
      window.__c10Events = [];
      window.__EditBridge!.onEditApplied((p) => {
        (window.__c10Events ??= []).push(p as { source?: string });
      });
    }, FIXTURE_FIVE_LAYER_VARIANT);

    // (1) preset click
    await pageA.locator('button.preset-key[data-preset="dreamier"]').click();
    await pageA.waitForFunction(() => (window.__c10Events?.length ?? 0) >= 1, null, {
      timeout: 5000,
    });

    // (2) slider change
    await pageA.locator('#moodSlider').evaluate((el) => {
      (el as HTMLInputElement).value = '0.8';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pageA.waitForFunction(() => (window.__c10Events?.length ?? 0) >= 2, null, {
      timeout: 5000,
    });

    // (3) knob drag
    await pageA.locator('#reverbKnob').dispatchEvent('pointerdown', { clientY: 200, pointerId: 1 });
    await pageA.evaluate(() => {
      for (const y of [190, 180, 175, 170]) {
        document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, pointerId: 1 }));
      }
      document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    });
    await pageA.waitForFunction(() => (window.__c10Events?.length ?? 0) >= 3, null, {
      timeout: 5000,
    });

    const events = await pageA.evaluate(() => window.__c10Events ?? []);
    expect(events.length).toBe(3);
    expect(events.map((e) => e.source)).toEqual(['preset', 'slider', 'knob']);
  } finally {
    await ctxA.close();
  }

  // ============ (b) isEditing lock honored at knob pointerdown during AI rewrite ============
  // Mirrors slider-flow.spec.ts:241-303 deferred-resolve stub pattern: slider engages
  // isEditing=true and awaits the stub; during that window a knob pointerdown must
  // early-return, so the move handler is never attached and FXBus stays at 0.
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await ctxB.newPage();
  try {
    await bootPage(pageB);

    await pageB.evaluate((variant) => {
      window.__stubCalls = 0;
      window.__c10LockEvents = [];
      let resolveClaude: ((v: string) => void) | null = null;
      window.__callClaudeImpl = () =>
        new Promise<string>((r) => {
          window.__stubCalls = (window.__stubCalls ?? 0) + 1;
          resolveClaude = r;
        }).then((s) => s);
      // Expose resolver on window so the test can release it later.
      (window as unknown as { __resolveClaude: (v: string) => void }).__resolveClaude = (v) => {
        if (resolveClaude) resolveClaude(v);
      };
      (window as unknown as { __variant: string }).__variant = variant;
      window.__strudelEvalImpl = async () => {};
      window.__EditBridge!.onEditApplied((p) => {
        (window.__c10LockEvents ??= []).push(p as { source?: string });
      });
    }, FIXTURE_FIVE_LAYER_VARIANT);

    // Fire slider → applyEdit awaits the stub and holds isEditing=true.
    await pageB.locator('#moodSlider').evaluate((el) => {
      (el as HTMLInputElement).value = '0.8';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait until the stub has been invoked at least once — lock is engaged.
    await pageB.waitForFunction(() => (window.__stubCalls ?? 0) >= 1, null, {
      timeout: 3000,
    });

    // While locked, dispatch a full pointer sequence on #reverbKnob.
    // pointerdown must early-return (isEditing=true) — no move handler attached,
    // so FXBus.reverbWet should remain 0.
    await pageB.locator('#reverbKnob').dispatchEvent('pointerdown', { clientY: 200, pointerId: 1 });
    await pageB.evaluate(() => {
      for (const y of [190, 180, 175, 170]) {
        document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, pointerId: 1 }));
      }
    });

    const midLock = await pageB.evaluate(() => ({
      reverbWet: window.__FXBus!.reverbWet,
      lockEvents: window.__c10LockEvents?.length ?? 0,
    }));
    expect(midLock.reverbWet).toBe(0); // knob early-returned at pointerdown
    expect(midLock.lockEvents).toBe(0); // no commits while slider is still pending

    // Now release the deferred Claude stub so slider's applyEdit finishes.
    await pageB.evaluate((variant) => {
      const fn = (window as unknown as { __resolveClaude: (v: string) => void }).__resolveClaude;
      fn(JSON.stringify({ strudel_code: variant }));
    }, FIXTURE_FIVE_LAYER_VARIANT);

    await pageB.waitForFunction(() => (window.__c10LockEvents?.length ?? 0) >= 1, null, {
      timeout: 5000,
    });

    // Settle: give the loop one tick to reveal any late knob commit.
    await pageB.waitForTimeout(150);

    const finalLock = await pageB.evaluate(() => window.__c10LockEvents ?? []);
    expect(finalLock.length).toBe(1);
    expect(finalLock[0].source).toBe('slider'); // knob never contributed
  } finally {
    await ctxB.close();
  }
});
