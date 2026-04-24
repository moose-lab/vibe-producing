import { test, expect } from '@playwright/test';

const pageUrl = 'http://localhost:8081/vibe-origin.html';

const FIVE_LAYER_USERHUM = [
  'stack(',
  '// layer: drums',
  's("bd ~ ~ sd").bank("RolandTR808").gain(0.55),',
  '// layer: bass',
  'note("c2 ~ ~ g1").s("sawtooth").lpf(400).gain(0.5),',
  '// layer: chord',
  'note("<[c4,e4,g4]>").s("rhodes").gain(0.4).room(0.35).slow(2),',
  '// layer: vocal',
  's("userHum").gain(0.45),',
  '// layer: ambience',
  's("vinyl").gain(0.14)',
  ').cpm(23).slow(8)',
].join('\n');

test('ai-bridge generateStrudelV1a returns code with userHum in vocal layer', async ({ page }) => {
  await page.goto(pageUrl);
  const result = await page.evaluate(async (fixture) => {
    (window as any).__callClaudeImpl = async (_sys: string, _user: string) => JSON.stringify({
      strudel_code: fixture, title: 'Test Loop', bpm: 92,
    });
    const ai = (window as any).__Pipeline!.ai;
    return await ai.generateStrudelV1a({ key: 'C major', bpm: 92, mood: 'dreamy', groove: 'straight', snappedNotes: ['C4','E4'] });
  }, FIVE_LAYER_USERHUM);
  expect(result.code).toContain('// layer: vocal');
  expect(result.code).toContain('s("userHum")');
  expect(result.code).toContain('// layer: drums');
  expect(result.code).toContain('// layer: ambience');
});

test('ai-bridge rejects response missing 5 layers', async ({ page }) => {
  await page.goto(pageUrl);
  const err = await page.evaluate(async () => {
    (window as any).__callClaudeImpl = async () => JSON.stringify({
      strudel_code: 'stack(// layer: drums\ns("x")).slow(8)', bpm: 92,
    });
    const ai = (window as any).__Pipeline!.ai;
    try { await ai.generateStrudelV1a({ key: 'C major', bpm: 92, mood: 'calm', groove: 'straight', snappedNotes: [] }); return null; }
    catch (e: any) { return e.message || 'error'; }
  });
  expect(err).toBeTruthy();
});

test('ai-bridge system prompt contains s("userHum") directive and no producer names', async ({ page }) => {
  await page.goto(pageUrl);
  const { system, user } = await page.evaluate(async () => {
    let captured: any = null;
    (window as any).__callClaudeImpl = async (sys: string, user: string) => {
      captured = { system: sys, user };
      return JSON.stringify({ strudel_code: [
        'stack(','// layer: drums','s("x"),','// layer: bass','note("c"),',
        '// layer: chord','note("e"),','// layer: vocal','s("userHum"),',
        '// layer: ambience','s("vinyl")',').slow(8)'
      ].join('\n'), bpm: 92 });
    };
    const ai = (window as any).__Pipeline!.ai;
    await ai.generateStrudelV1a({ key: 'C major', bpm: 92, mood: 'dreamy', groove: 'straight', snappedNotes: ['C4'] });
    return captured;
  });
  expect(system).toContain('userHum');
  expect(system.toLowerCase()).not.toContain('taylor');
  expect(system.toLowerCase()).not.toContain('coldplay');
});
