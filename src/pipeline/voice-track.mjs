// voice-track.mjs — user voice capture → denoise → WAV → Strudel sample register
// Pure ES module. Depends on AudioContext + OfflineAudioContext (main thread only).

export async function denoise(audioBuffer) {
  const ctx = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = audioBuffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.707;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.707;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -30; comp.ratio.value = 12;
  comp.attack.value = 0.003; comp.release.value = 0.25;
  const gain = ctx.createGain();
  gain.gain.value = 1.6; // normalize boost post-compression
  src.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(gain); gain.connect(ctx.destination);
  src.start(0);
  return await ctx.startRendering();
}

export function encodeWav(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, 'data');
  dv.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([ab], { type: 'audio/wav' });
}

export async function processVoiceTrack(blob) {
  const ctx = new AudioContext();
  const ab = await blob.arrayBuffer();
  const decoded = await ctx.decodeAudioData(ab);
  const cleaned = await denoise(decoded);
  const wav = encodeWav(cleaned);
  const prevUrl = window.__userHumUrl;
  const blobUrl = URL.createObjectURL(wav);
  if (prevUrl) try { URL.revokeObjectURL(prevUrl); } catch {}
  window.__userHumUrl = blobUrl;
  // Register with Strudel if available. Strudel exposes `samples` globally after loadStrudel().
  if (typeof window.samples === 'function') {
    try { window.samples({ userHum: [blobUrl] }); } catch (e) { console.warn('[voice-track] samples register failed', e); }
  }
  return { sampleName: 'userHum', blobUrl, durationMs: Math.round((cleaned.duration || 0) * 1000) };
}

// Test seam + barrel-friendly shape
if (typeof window !== 'undefined') {
  window.__Pipeline = window.__Pipeline || {};
  window.__Pipeline.voice = { processVoiceTrack, encodeWav, denoise };
}
