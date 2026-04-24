import { test, expect } from '@playwright/test';

const pageUrl = 'http://localhost:8081/vibe-origin.html';

test('seed-animator mounts SVG with all parts', async ({ page }) => {
  await page.goto(pageUrl);
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'testStage';
    host.style.width = '400px'; host.style.height = '400px';
    document.body.appendChild(host);
    (window as any).__Pipeline.animator.startSeedAnimation(host, {
      key: 'C major', bpm: 92, mood: 'dreamy', groove: 'straight',
      snappedNotes: ['C4','E4','G4']
    });
  });
  const parts = await page.evaluate(() => ({
    svg: !!document.querySelector('#testStage svg'),
    seed: !!document.querySelector('#testStage [data-part="seed"]'),
    stalk: !!document.querySelector('#testStage [data-part="stalk"]'),
    petals: document.querySelectorAll('#testStage [data-part="petal"]').length,
  }));
  expect(parts.svg).toBe(true);
  expect(parts.seed).toBe(true);
  expect(parts.stalk).toBe(true);
  expect(parts.petals).toBeGreaterThanOrEqual(5);
});

test('onBloomReady fires at approx T=26s (fast-forward test uses 300ms override)', async ({ page }) => {
  await page.goto(pageUrl);
  const fired = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'testStage2'; host.style.width = '400px'; host.style.height = '400px';
    document.body.appendChild(host);
    const a = (window as any).__Pipeline.animator.startSeedAnimation(host, {
      key: 'C major', bpm: 92, mood: 'dreamy', groove: 'straight', snappedNotes: ['C4']
    }, { bloomMs: 300 }); // fast timer for tests
    return await new Promise<boolean>((resolve) => {
      a.onBloomReady(() => resolve(true));
      setTimeout(() => resolve(false), 1500);
    });
  });
  expect(fired).toBe(true);
});

test('same vocalDNA → identical petal color palette (determinism)', async ({ page }) => {
  await page.goto(pageUrl);
  const [a, b] = await page.evaluate(() => {
    const mk = (id: string) => {
      const h = document.createElement('div'); h.id = id;
      h.style.width = '400px'; h.style.height = '400px';
      document.body.appendChild(h);
      (window as any).__Pipeline.animator.startSeedAnimation(h, {
        key: 'C major', bpm: 92, mood: 'dreamy', groove: 'straight', snappedNotes: ['C4','E4']
      });
      const colors = Array.from(h.querySelectorAll('[data-part="petal"]'))
        .map((el: any) => el.getAttribute('data-hue'));
      return colors.join(',');
    };
    return [mk('s1'), mk('s2')];
  });
  expect(a).toBe(b);
  expect(a.length).toBeGreaterThan(0);
});
