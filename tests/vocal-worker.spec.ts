import { test, expect } from '@playwright/test';

const pageUrl = 'http://localhost:8081/vibe-origin.html';
test.use({ viewport: { width: 1280, height: 800 } });

test('worker extractDNA: C-major synthetic notes → key/bpm/mood/groove', async ({ page }) => {
  await page.goto(pageUrl);
  const dna = await page.evaluate(async () => {
    const w = new Worker(new URL('./src/pipeline/vocal-process.worker.mjs', location.href), { type: 'module' });
    const notes = [
      { note: 'C4', freq: 261.63 }, { note: 'E4', freq: 329.63 },
      { note: 'G4', freq: 392.0 },  { note: 'C5', freq: 523.25 },
      { note: 'E4', freq: 329.63 }, { note: 'G4', freq: 392.0 },
      { note: 'C4', freq: 261.63 },
    ];
    const timestamps = [0, 500, 1000, 1500, 2000, 2500, 3000];
    return await new Promise<any>((resolve) => {
      w.onmessage = (e) => { resolve(e.data); w.terminate(); };
      w.postMessage({ type: 'extract', payload: { notes, timestamps } });
    });
  });
  expect(dna.key).toMatch(/C major/);
  expect(dna.bpm).toBeGreaterThanOrEqual(85);
  expect(dna.bpm).toBeLessThanOrEqual(135);
  expect(['energetic', 'calm', 'wistful', 'dreamy', 'neutral']).toContain(dna.mood);
  expect(['straight', 'swung', 'syncopated']).toContain(dna.groove);
  expect(Array.isArray(dna.snappedNotes)).toBe(true);
  expect(dna.snappedNotes.length).toBe(7);
});
