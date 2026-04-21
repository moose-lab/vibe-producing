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

test('assertFiveLayers detects missing markers and accepts complete 5-layer code', async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate((fixture) => {
    const goodCode = fixture;
    const badCode = fixture.replace('// layer: chord', '// not-a-layer: chord');
    return {
      good: window.__AIBridge!.assertFiveLayers(goodCode),
      bad: window.__AIBridge!.assertFiveLayers(badCode),
    };
  }, FIXTURE_FIVE_LAYER);

  expect(result.good.ok).toBe(true);
  expect(result.good.missing.length).toBe(0);
  expect(result.bad.ok).toBe(false);
  expect(result.bad.missing).toContain('chord');
});

test('generateStrudelV1a runs Taylor then Coldplay with stubbed transport', async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate(async (fixture) => {
    localStorage.setItem('vibe-origin-api-key', 'test');
    const calls: string[] = [];
    window.__callClaudeImpl = async (sys: string) => {
      if (sys.includes('Taylor')) {
        calls.push('taylor');
        return { strudel_code: fixture, title: 't', bpm: 92 };
      }
      if (sys.includes('Coldplay')) {
        calls.push('coldplay');
        return { strudel_code: fixture, title: 't2', bpm: 92 };
      }
      throw new Error('unexpected prompt');
    };
    const dna = {
      key: 'C major',
      bpm: 92,
      mood: 'wistful',
      groove: 'straight',
      snappedNotes: ['c4', 'e4', 'g4'],
    };
    const out = await window.__AIBridge!.generateStrudelV1a(dna);
    return {
      calls,
      code: out.code,
      hasMarkers:
        out.code.includes('// layer: drums') && out.code.includes('// layer: ambience'),
    };
  }, FIXTURE_FIVE_LAYER);

  expect(result.calls).toEqual(['taylor', 'coldplay']);
  expect(result.hasMarkers).toBe(true);
});

test('generateStrudelV1a emits generateError when Coldplay pass omits a layer', async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate(
    ({ fixture, dna }) =>
      new Promise((resolve) => {
        localStorage.setItem('vibe-origin-api-key', 'test');
        const badColdplay = fixture.replace('// layer: ambience', '// ambient');
        window.__callClaudeImpl = async (sys: string) => {
          if (sys.includes('Taylor')) {
            return { strudel_code: fixture, title: 't', bpm: 92 };
          }
          if (sys.includes('Coldplay')) {
            return { strudel_code: badColdplay, title: 't2', bpm: 92 };
          }
          throw new Error('unexpected prompt');
        };
        window.__AIBridge!.onGenerateError((e) => resolve(e));
        window.__AIBridge!.generateStrudelV1a(dna).catch(() => {});
      }),
    { fixture: FIXTURE_FIVE_LAYER, dna: FIXTURE_DNA }
  );

  const payload = result as { stage: string; reason: string; missing: string[] };
  expect(payload.stage).toBe('coldplay');
  expect(payload.missing).toContain('ambience');
  expect(payload.reason).toBe('missing-layers');
});

test('simulateMicEnd → #genBtn click fires ai:generated:v1a with 5-layer code', async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate(
    (fixture) =>
      new Promise((resolve) => {
        localStorage.setItem('vibe-origin-api-key', 'test');
        window.__callClaudeImpl = async () => ({
          strudel_code: fixture,
          title: 't',
          bpm: 92,
        });
        window.__AIBridge!.onGenerated((d) => resolve(d));
        const { notes, timestamps } = window.__VocalProcess!.simulateHum(
          ['C4', 'E4', 'G4', 'C5'],
          { bpm: 100 }
        );
        window.__VocalProcess!.simulateMicEnd(notes, timestamps);
        (document.getElementById('genBtn') as HTMLButtonElement).click();
      }),
    FIXTURE_FIVE_LAYER
  );

  const payload = result as { code: string; dna: { key: string } };
  expect(payload.code).toContain('// layer: drums');
  expect(payload.code).toContain('// layer: ambience');
  expect(payload.dna.key).toBe('C major');
  const verdict = await page.evaluate(
    (code) => window.__AIBridge!.assertFiveLayers(code).ok,
    payload.code
  );
  expect(verdict).toBe(true);
});
