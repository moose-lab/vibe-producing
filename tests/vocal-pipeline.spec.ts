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
  }
}

test('extractDNA returns correct key/bpm/mood/groove for synthetic C-major hum', async ({ page }) => {
  await page.goto(pageUrl);
  const dna = await page.evaluate(() => {
    const FREQS: Record<string, number> = {
      C4: 261.63,
      E4: 329.63,
      G4: 392.0,
      C5: 523.25,
    };
    const seq = ['C4', 'E4', 'G4', 'C5', 'E4', 'G4', 'C4'];
    const notes = seq.map((n) => ({ note: n, freq: FREQS[n], sn: n.toLowerCase() }));
    const timestamps = seq.map((_, i) => 1000 + i * 600);
    return window.__VocalProcess!.extractDNA({ notes, timestamps, captureMs: 4200 });
  });

  expect(dna.key).toBe('C major');
  expect(dna.bpm).toBeGreaterThanOrEqual(85);
  expect(dna.bpm).toBeLessThanOrEqual(115);
  expect(['calm', 'wistful', 'energetic']).toContain(dna.mood);
  expect(['straight', 'swung', 'syncopated']).toContain(dna.groove);
});

test('denoise reduces sub-120Hz RMS by >= 20%', async ({ page }) => {
  await page.goto(pageUrl);
  const ratio = await page.evaluate(async () => {
    const sr = 44100;
    const len = sr;
    const ctx = new OfflineAudioContext(1, len, sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      data[i] = 0.5 * Math.sin(2 * Math.PI * 60 * t) + 0.3 * Math.sin(2 * Math.PI * 440 * t);
    }

    const bandRms = (arr: Float32Array, fLo: number, fHi: number, sampleRate: number) => {
      const N = arr.length;
      let sum = 0;
      for (let f = fLo; f <= fHi; f += 5) {
        const k = Math.round((N * f) / sampleRate);
        const w = (2 * Math.PI * k) / N;
        const coeff = 2 * Math.cos(w);
        let s1 = 0;
        let s2 = 0;
        for (let n = 0; n < N; n++) {
          const s = arr[n] + coeff * s1 - s2;
          s2 = s1;
          s1 = s;
        }
        const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        sum += power;
      }
      return Math.sqrt(sum / N);
    };

    const before = bandRms(data, 20, 120, sr);
    const out = await window.__VocalProcess!.denoise(buf);
    const after = bandRms(out.getChannelData(0), 20, 120, sr);
    return after / before;
  });

  expect(ratio).toBeLessThanOrEqual(0.8);
});

test('vocalDNA event fires on EventBus when mic finalize runs', async ({ page }) => {
  await page.goto(pageUrl);
  const captured = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.__VocalProcess!.onVocalDNA((d) => resolve(d));
        const { notes, timestamps } = window.__VocalProcess!.simulateHum(['C4', 'E4', 'G4', 'C5'], {
          bpm: 100,
        });
        window.__VocalProcess!.simulateMicEnd(notes, timestamps);
      })
  );

  expect(captured).toHaveProperty('key');
  expect(captured).toHaveProperty('bpm');
  expect(captured).toHaveProperty('mood');
  expect(captured).toHaveProperty('groove');
  expect((captured as { snappedNotes: unknown[] }).snappedNotes.length).toBeGreaterThan(0);
});
