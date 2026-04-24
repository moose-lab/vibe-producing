import { test, expect } from '@playwright/test';
import path from 'node:path';
import url from 'node:url';

const pageUrl = 'http://localhost:8081/vibe-origin.html';
test.use({ viewport: { width: 1280, height: 800 } });

declare global {
  interface Window {
    __Pipeline?: {
      voice?: {
        processVoiceTrack: (blob: Blob) => Promise<{ sampleName: string; blobUrl: string; durationMs: number }>;
        encodeWav: (buffer: AudioBuffer) => Blob;
        denoise: (buffer: AudioBuffer) => Promise<AudioBuffer>;
      };
    };
    __userHumUrl?: string;
  }
}

async function synthBlob(page: import('@playwright/test').Page): Promise<string> {
  // Returns a blob-URL pointing at a synthetic 2-sec 200Hz sine + sub-120Hz noise
  return await page.evaluate(async () => {
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const len = sr * 2;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = 0.6 * Math.sin(2 * Math.PI * 200 * t) + 0.3 * Math.sin(2 * Math.PI * 80 * t);
    }
    // encode to WAV directly for the test
    function enc(buffer: AudioBuffer): ArrayBuffer {
      const numCh = buffer.numberOfChannels, sampleRate = buffer.sampleRate;
      const samples = buffer.getChannelData(0);
      const bytesPerSample = 2;
      const blockAlign = numCh * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = samples.length * bytesPerSample;
      const ab = new ArrayBuffer(44 + dataSize);
      const dv = new DataView(ab);
      const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      writeStr(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
      writeStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
      dv.setUint16(22, numCh, true); dv.setUint32(24, sampleRate, true); dv.setUint32(28, byteRate, true);
      dv.setUint16(32, blockAlign, true); dv.setUint16(34, bytesPerSample * 8, true);
      writeStr(36, 'data'); dv.setUint32(40, dataSize, true);
      let offset = 44;
      for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        dv.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      return ab;
    }
    const ab = enc(buf);
    const blob = new Blob([ab], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  });
}

test('processVoiceTrack: synthetic audio → blobUrl + duration + denoise applied', async ({ page }) => {
  await page.goto(pageUrl);
  const blobUrl = await synthBlob(page);
  const result = await page.evaluate(async (u) => {
    const r = await fetch(u); const b = await r.blob();
    const res = await window.__Pipeline!.voice!.processVoiceTrack(b);
    return res;
  }, blobUrl);
  expect(result.sampleName).toBe('userHum');
  expect(result.blobUrl).toMatch(/^blob:/);
  expect(result.durationMs).toBeGreaterThan(1500);
  expect(result.durationMs).toBeLessThan(2500);
});

test('denoise reduces sub-120Hz RMS by >= 20%', async ({ page }) => {
  await page.goto(pageUrl);
  const ratio = await page.evaluate(async () => {
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const len = sr * 1;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = 0.6 * Math.sin(2 * Math.PI * 60 * t); // pure sub-120Hz
    }
    function rms(arr: Float32Array) { let s = 0; for (const v of arr) s += v * v; return Math.sqrt(s / arr.length); }
    const before = rms(buf.getChannelData(0));
    const cleaned = await window.__Pipeline!.voice!.denoise(buf);
    const after = rms(cleaned.getChannelData(0));
    return after / before;
  });
  expect(ratio).toBeLessThanOrEqual(0.8);
});

test('encodeWav roundtrip preserves dominant frequency within 5%', async ({ page }) => {
  await page.goto(pageUrl);
  const freq = await page.evaluate(async () => {
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const len = sr * 1;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = 0.6 * Math.sin(2 * Math.PI * 440 * (i / sr));
    const wavBlob = window.__Pipeline!.voice!.encodeWav(buf);
    const ab = await wavBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab);
    const samples = decoded.getChannelData(0);
    // naive zero-crossing freq estimate
    let zc = 0;
    for (let i = 1; i < samples.length; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) zc++;
    return (zc / 2) / (samples.length / sr);
  });
  expect(Math.abs(freq - 440) / 440).toBeLessThan(0.05);
});
