// vocal-process.worker.mjs — pure-JS Web Worker: extractDNA + pitchSnap from note events
// Receives { type: 'extract', payload: { notes, timestamps } } and posts vocalDNA back.

const KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const KEY_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

function detectKey(notes) {
  if (!notes || notes.length === 0) return 'C major';
  const hist = new Array(12).fill(0);
  for (const n of notes) {
    const midi = Math.round(12 * Math.log2(n.freq / 440) + 69);
    hist[((midi % 12) + 12) % 12] += 1;
  }
  let bestScore = -Infinity, bestRoot = 0, bestMode = 'major';
  for (let root = 0; root < 12; root++) {
    for (const [profile, mode] of [[KS_MAJOR, 'major'], [KS_MINOR, 'minor']]) {
      let score = 0;
      for (let i = 0; i < 12; i++) score += hist[(i + root) % 12] * profile[i];
      if (score > bestScore) { bestScore = score; bestRoot = root; bestMode = mode; }
    }
  }
  return `${KEY_NAMES[bestRoot]} ${bestMode}`;
}

function estimateBPM(timestamps) {
  if (!timestamps || timestamps.length < 3) return 100;
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) gaps.push(timestamps[i] - timestamps[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (!mean) return 100;
  const bpm = Math.round(60000 / mean);
  return Math.max(60, Math.min(200, bpm));
}

function deriveMood(notes, timestamps) {
  if (!notes || notes.length === 0) return 'neutral';
  const midiVals = notes.map(n => Math.round(12 * Math.log2(n.freq / 440) + 69));
  const range = Math.max(...midiVals) - Math.min(...midiVals);
  const avgGapMs = timestamps.length > 1
    ? (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1)
    : 500;
  if (range >= 12 && avgGapMs < 350) return 'energetic';
  if (range <= 5 && avgGapMs > 500) return 'calm';
  return 'wistful';
}

function deriveGroove(timestamps) {
  if (!timestamps || timestamps.length < 3) return 'straight';
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) gaps.push(timestamps[i] - timestamps[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean === 0) return 'straight';
  const variance = gaps.reduce((a, g) => a + (g - mean) * (g - mean), 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv < 0.15) return 'straight';
  if (cv > 0.40) return 'syncopated';
  return 'swung';
}

function pitchSnap(notes, key) {
  const [rootName, mode] = key.split(' ');
  const root = KEY_NAMES.indexOf(rootName);
  const steps = mode === 'minor' ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
  return notes.map(n => {
    const midi = Math.round(12 * Math.log2(n.freq / 440) + 69);
    let best = midi, bestDist = Infinity;
    const octBase = Math.floor(midi / 12) - 1;
    for (let k = octBase - 1; k <= octBase + 2; k++) {
      for (const step of steps) {
        const cand = root + step + 12 * k;
        const d = Math.abs(cand - midi);
        if (d < bestDist) { bestDist = d; best = cand; }
      }
    }
    const pc = ((best % 12) + 12) % 12;
    const oct = Math.floor(best / 12) - 1;
    return KEY_NAMES[pc] + oct;
  });
}

self.onmessage = (e) => {
  const { type, payload } = e.data || {};
  if (type !== 'extract') return;
  const notes = payload?.notes || [];
  const timestamps = payload?.timestamps || [];
  const key = detectKey(notes);
  const bpm = estimateBPM(timestamps);
  const mood = deriveMood(notes, timestamps);
  const groove = deriveGroove(timestamps);
  const snappedNotes = pitchSnap(notes, key);
  self.postMessage({ key, bpm, mood, groove, notes: notes.map(n => n.note), snappedNotes });
};
