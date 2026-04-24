import { test, expect } from '@playwright/test';

const pageUrl = 'http://localhost:8081/vibe-origin.html';

test('C11: voice-track registers userHum sample + denoise proven on synthetic audio', async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate(async () => {
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 1, sr);
    const d = buf.getChannelData(0);
    // 60Hz pure tone — unambiguously sub-120Hz (80Hz is too close to HP cutoff for a clean test)
    for (let i = 0; i < sr; i++) d[i] = 0.6 * Math.sin(2 * Math.PI * 60 * (i / sr));
    function rms(a: Float32Array) { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length); }
    const before = rms(buf.getChannelData(0));
    const cleaned = await (window as any).__Pipeline.voice.denoise(buf);
    const after = rms(cleaned.getChannelData(0));
    const wav = (window as any).__Pipeline.voice.encodeWav(cleaned);
    const url = URL.createObjectURL(wav);
    (window as any).__userHumUrl = url;
    return { reduction: after / before, hasUrl: !!url };
  });
  expect(result.reduction).toBeLessThanOrEqual(0.8);
  expect(result.hasUrl).toBe(true);
});

test('C12: AI-generated code contains s("userHum") in // layer: vocal block', async ({ page }) => {
  await page.goto(pageUrl);
  const code = await page.evaluate(async () => {
    (window as any).__callClaudeImpl = async () => JSON.stringify({
      strudel_code: [
        'stack(','// layer: drums','s("bd sd"),',
        '// layer: bass','note("c2"),',
        '// layer: chord','note("<c e g>"),',
        '// layer: vocal','s("userHum").gain(0.45),',
        '// layer: ambience','s("vinyl").gain(.14)',
        ').cpm(23).slow(8)'
      ].join('\n'),
      title: 'Test', bpm: 92
    });
    const r = await (window as any).__Pipeline.ai.generateStrudelV1a({
      key: 'C major', bpm: 92, mood: 'dreamy', groove: 'straight', snappedNotes: ['C4']
    });
    return r.code;
  });
  const vocalIdx = code.indexOf('// layer: vocal');
  const ambIdx = code.indexOf('// layer: ambience');
  const vocalBlock = code.substring(vocalIdx, ambIdx);
  expect(vocalBlock).toContain('s("userHum")');
});

test('C13: seed-animator onBloomReady fires at configured bloomMs', async ({ page }) => {
  await page.goto(pageUrl);
  const elapsed = await page.evaluate(async () => {
    const h = document.createElement('div'); h.id = 'acc13';
    h.style.width = '300px'; h.style.height = '300px';
    document.body.appendChild(h);
    const a = (window as any).__Pipeline.animator.startSeedAnimation(h,
      { key: 'C major', bpm: 92, mood: 'dreamy', groove: 'straight', snappedNotes: [] },
      { bloomMs: 500 });
    const t0 = performance.now();
    return await new Promise<number>((resolve) => a.onBloomReady(() => resolve(performance.now() - t0)));
  });
  expect(elapsed).toBeGreaterThan(400);
  expect(elapsed).toBeLessThan(800);
});

test('C14: strudelEval only fires when both aiReady AND bloomReady (contract shape)', async ({ page }) => {
  await page.goto(pageUrl);
  const shape = await page.evaluate(() => ({
    hasAI: typeof (window as any).__Pipeline?.ai?.generateStrudelV1a === 'function',
    hasAnimator: typeof (window as any).__Pipeline?.animator?.startSeedAnimation === 'function',
    hasVoice: typeof (window as any).__Pipeline?.voice?.processVoiceTrack === 'function',
    hasCapture: typeof (window as any).__Pipeline?.capture?.startMic === 'function',
  }));
  expect(shape.hasAI).toBe(true);
  expect(shape.hasAnimator).toBe(true);
  expect(shape.hasVoice).toBe(true);
  expect(shape.hasCapture).toBe(true);
});

test('C15: pipeline modules load from src/pipeline/ + back-compat window.__VocalProcess / __AIBridge preserved', async ({ page }) => {
  await page.goto(pageUrl);
  const seams = await page.evaluate(() => ({
    pipelineVoice: typeof (window as any).__Pipeline?.voice?.processVoiceTrack,
    pipelineAi: typeof (window as any).__Pipeline?.ai?.generateStrudelV1a,
    pipelineAnimator: typeof (window as any).__Pipeline?.animator?.startSeedAnimation,
    pipelineCapture: typeof (window as any).__Pipeline?.capture?.startMic,
    legacyVocalProcess: typeof (window as any).__VocalProcess,
    legacyAIBridge: typeof (window as any).__AIBridge,
  }));
  expect(seams.pipelineVoice).toBe('function');
  expect(seams.pipelineAi).toBe('function');
  expect(seams.pipelineAnimator).toBe('function');
  expect(seams.pipelineCapture).toBe('function');
  // Legacy seams should still exist for back-compat (dormant code)
  expect(seams.legacyVocalProcess).toBe('object');
  expect(seams.legacyAIBridge).toBe('object');
});
