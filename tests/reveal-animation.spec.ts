import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'vibe-origin.html')).toString();

declare global {
  interface Window {
    __VocalProcess?: {
      denoise: (buf: AudioBuffer) => Promise<AudioBuffer>;
      pitchSnap: (notes: unknown[], key: string) => unknown[];
      extractDNA: (input: { notes: unknown[]; timestamps: number[]; captureMs: number }) => {
        key: string;
        bpm: number;
        mood: string;
        groove: string;
      };
      detectKey: (notes: unknown[]) => string;
      deriveMood: (notes: unknown[], timestamps: number[]) => string;
      deriveGroove: (timestamps: number[]) => string;
      simulateHum: (
        notes: string[],
        opts?: { bpm?: number; sampleRate?: number }
      ) => { notes: unknown[]; timestamps: number[]; buffer: Float32Array };
      simulateMicEnd: (notes: unknown[], timestamps: number[]) => void;
      onVocalDNA: (fn: (payload: unknown) => void) => unknown;
      _ks: { KS_MAJOR: number[]; KS_MINOR: number[]; KEY_NAMES: string[] };
    };
    __AIBridge?: {
      buildTaylorPrompt: (dna: unknown) => { system: string; user: string };
      buildColdplayPrompt: (dna: unknown, draftCode: string) => { system: string; user: string };
      assertFiveLayers: (code: string) => { ok: boolean; missing: string[] };
      generateStrudelV1a: (dna: unknown) => Promise<{
        code: string;
        taylorRaw: unknown;
        coldplayRaw: unknown;
        dna: unknown;
      }>;
      onGenerated: (fn: (payload: unknown) => void) => unknown;
      onGenerateError: (fn: (payload: unknown) => void) => unknown;
    };
    __callClaudeImpl?: (sys: string, user: string) => Promise<unknown>;
    __RevealAnimator?: {
      play: (
        code: string,
        opts?: { dna?: unknown; coldplayRaw?: unknown }
      ) => Promise<{ ok: true }>;
      onPhase: (fn: (e: { phase: string; elapsedMs: number }) => void) => unknown;
      onDone: (fn: (e: { totalMs: number }) => void) => unknown;
      onLatency: (
        fn: (e: { pipelineMs: number; budget: number; over: boolean }) => void
      ) => unknown;
    };
    __strudelEvalImpl?: (code: string) => Promise<void> | void;
    __latency?: { pipelineMs: number; revealMs: number | null; budget: number };
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

const FIXTURE_DNA = {
  key: 'C major',
  bpm: 92,
  mood: 'wistful',
  groove: 'straight',
  snappedNotes: ['c4', 'e4', 'g4', 'c5'],
};

test("bus.emit('ai:generated:v1a') → reveal:phase events fire in order and strudelEval runs once with the generated code", async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate(
    (fixture) =>
      new Promise<{ phases: string[]; textareaValue: string; strudelCalls: string[] }>(
        (resolve) => {
          localStorage.setItem('vibe-origin-api-key', 'test');
          const phases: string[] = [];
          const strudelCalls: string[] = [];
          window.__callClaudeImpl = async () => ({
            strudel_code: fixture,
            title: 't',
            bpm: 92,
          });
          window.__strudelEvalImpl = async (code: string) => {
            strudelCalls.push(code);
          };
          window.__RevealAnimator!.onPhase((e) => {
            phases.push(e.phase);
          });
          window.__RevealAnimator!.onDone(() => {
            const codeTextarea = document.getElementById('codeTextarea') as HTMLTextAreaElement;
            resolve({
              phases,
              textareaValue: codeTextarea ? codeTextarea.value : '',
              strudelCalls,
            });
          });
          const { notes, timestamps } = window.__VocalProcess!.simulateHum(
            ['C4', 'E4', 'G4', 'C5'],
            { bpm: 100 }
          );
          window.__VocalProcess!.simulateMicEnd(notes, timestamps);
          (document.getElementById('genBtn') as HTMLButtonElement).click();
        }
      ),
    FIXTURE_FIVE_LAYER
  );

  expect(result.phases).toEqual(['waveform', 'particles', 'code', 'playReady']);
  expect(result.textareaValue).toContain('// layer: drums');
  expect(result.textareaValue).toContain('// layer: bass');
  expect(result.textareaValue).toContain('// layer: chord');
  expect(result.textareaValue).toContain('// layer: vocal');
  expect(result.textareaValue).toContain('// layer: ambience');
  expect(result.strudelCalls.length).toBe(1);
  expect(result.strudelCalls[0]).toContain('// layer: drums');
});

test('reduced-motion short-circuits reveal in <400ms while preserving phase-event protocol', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(pageUrl);
  const result = await page.evaluate(
    ({ fixture, dna }) =>
      new Promise<{ phases: string[]; elapsed: number }>((resolve) => {
        localStorage.setItem('vibe-origin-api-key', 'test');
        const phases: string[] = [];
        const strudelCalls: string[] = [];
        window.__callClaudeImpl = async () => ({
          strudel_code: fixture,
          title: 't',
          bpm: 92,
        });
        window.__strudelEvalImpl = async (code: string) => {
          strudelCalls.push(code);
        };
        window.__RevealAnimator!.onPhase((e) => {
          phases.push(e.phase);
        });
        window.__RevealAnimator!.onDone(({ totalMs }) => {
          resolve({ phases, elapsed: totalMs });
        });
        const t0 = performance.now();
        window.__RevealAnimator!.play(fixture, { dna }).catch(() => {});
        // Fallback wall-clock in case onDone lacks totalMs
        void t0;
      }),
    { fixture: FIXTURE_FIVE_LAYER, dna: FIXTURE_DNA }
  );

  expect(result.elapsed).toBeLessThan(400);
  expect(result.phases).toEqual(['waveform', 'particles', 'code', 'playReady']);

  const textareaHasDrums = await page.evaluate(() => {
    const el = document.getElementById('codeTextarea') as HTMLTextAreaElement | null;
    return el ? el.value.includes('// layer: drums') : false;
  });
  expect(textareaHasDrums).toBe(true);
});

test('generateError bus event surfaces #errorBanner with retry; clicking #retryBtn re-triggers #genBtn', async ({ page }) => {
  await page.goto(pageUrl);

  await page.evaluate(
    (fixture) => {
      localStorage.setItem('vibe-origin-api-key', 'test');
      const badColdplay = fixture.replace('// layer: ambience', '// ambient');
      let coldplayCalls = 0;
      window.__callClaudeImpl = async (sys: string) => {
        if (sys.includes('Taylor')) {
          return { strudel_code: fixture, title: 't', bpm: 92 };
        }
        if (sys.includes('Coldplay')) {
          coldplayCalls++;
          if (coldplayCalls === 1) {
            return { strudel_code: badColdplay, title: 't2', bpm: 92 };
          }
          return { strudel_code: fixture, title: 't2', bpm: 92 };
        }
        throw new Error('unexpected prompt');
      };
      window.__strudelEvalImpl = async () => {};
      const { notes, timestamps } = window.__VocalProcess!.simulateHum(
        ['C4', 'E4', 'G4', 'C5'],
        { bpm: 100 }
      );
      window.__VocalProcess!.simulateMicEnd(notes, timestamps);
      (document.getElementById('genBtn') as HTMLButtonElement).click();
    },
    FIXTURE_FIVE_LAYER
  );

  await page.locator('#errorBanner').waitFor({ state: 'visible', timeout: 3000 });

  const ariaLiveOnBanner = await page.locator('#errorBanner').getAttribute('aria-live');
  const errorTextInAriaLive = await page
    .locator('#errorText')
    .evaluate((el) => el.closest('[aria-live="polite"]') !== null);
  expect(ariaLiveOnBanner === 'polite' || errorTextInAriaLive).toBe(true);

  const errorText = await page.locator('#errorText').textContent();
  expect(errorText ?? '').toMatch(/coldplay|missing-layers|ambience/i);

  const retrySignal = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        window.__AIBridge!.onGenerated(() => resolve('generated'));
        (document.getElementById('retryBtn') as HTMLButtonElement).click();
      })
  );

  await page.locator('#errorBanner').waitFor({ state: 'hidden', timeout: 3000 });
  const signal = await retrySignal;
  expect(signal).toBe('generated');
});
