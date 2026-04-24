// mic-capture.mjs — getUserMedia + MediaRecorder (raw audio blob) + YIN pitch detection (live notes)
// Concurrent capture: live note stream for DNA extraction, raw blob for voice-track processing.

const A4 = 440;
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Minimal YIN implementation ported from vibe-origin.html. Operates on a Float32 frame.
function yin(buf, sampleRate, threshold = 0.15) {
  const N = buf.length;
  const halfN = Math.floor(N / 2);
  const diff = new Float32Array(halfN);
  for (let tau = 1; tau < halfN; tau++) {
    let s = 0;
    for (let i = 0; i < halfN; i++) { const d = buf[i] - buf[i + tau]; s += d * d; }
    diff[tau] = s;
  }
  const cmnd = new Float32Array(halfN);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau < halfN; tau++) {
    running += diff[tau];
    cmnd[tau] = diff[tau] * tau / (running || 1);
  }
  let tauEst = -1;
  for (let tau = 2; tau < halfN; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < halfN && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau; break;
    }
  }
  if (tauEst === -1) return 0;
  return sampleRate / tauEst;
}

function freqToNote(freq) {
  if (!freq || freq < 50 || freq > 2000) return null;
  const midi = Math.round(12 * Math.log2(freq / A4) + 69);
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return { note: NOTE_NAMES[pc] + oct, freq, midi };
}

export async function startMic({ onNote } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.start();

  const notes = [];
  const timestamps = [];
  let lastNoteAt = 0;
  let stopped = false;
  const t0 = performance.now();
  const buf = new Float32Array(analyser.fftSize);

  function tick() {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);
    const freq = yin(buf, ctx.sampleRate);
    const n = freqToNote(freq);
    const now = performance.now();
    if (n && now - lastNoteAt > 120) {
      const prev = notes[notes.length - 1];
      if (!prev || prev.note !== n.note || now - lastNoteAt > 200) {
        notes.push(n);
        timestamps.push(now - t0);
        lastNoteAt = now;
        if (onNote) try { onNote(n); } catch {}
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    stop: () => new Promise((resolve) => {
      stopped = true;
      const finalize = () => {
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        try { ctx.close(); } catch {}
        const audioBlob = new Blob(chunks, { type: mimeType });
        resolve({ notes, timestamps, audioBlob });
      };
      if (recorder.state !== 'inactive') {
        recorder.onstop = finalize;
        recorder.stop();
      } else finalize();
    }),
    analyser,
  };
}

if (typeof window !== 'undefined') {
  window.__Pipeline = window.__Pipeline || {};
  window.__Pipeline.capture = { startMic };
}
