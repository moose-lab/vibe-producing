// seed-animator.mjs — V2 glowing seed → rainbow flower SVG bloom
// Seeded by vocalDNA hash (deterministic per-hum).

function xorshift32(seed) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

function hashDNA(dna) {
  const s = `${dna.key}|${dna.bpm}|${dna.mood}|${dna.groove}|${(dna.snappedNotes || []).join(',')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

const CSS = `
.seed-anim { position:absolute; inset:0; overflow:hidden; border-radius:14px;
  background: radial-gradient(ellipse 60% 50% at 50% 55%, rgba(255,180,120,0.08), transparent 60%),
              radial-gradient(ellipse at center, #0d0710 0%, #050206 80%); }
.seed-anim::after { content:''; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%); }
.seed-anim svg { position:absolute; inset:0; width:100%; height:100%; }
.seed-anim .halo { transform-origin:250px 300px; animation: sBreath 3s ease-in-out infinite; }
@keyframes sBreath { 0%,100% { opacity:.45; transform:scale(1); } 50% { opacity:.95; transform:scale(1.2); } }
.seed-anim .grow { stroke-dasharray:400; stroke-dashoffset:400;
  animation: sGrow var(--dur,4s) cubic-bezier(.16,1,.3,1) var(--delay,0s) forwards; }
@keyframes sGrow { to { stroke-dashoffset:0; } }
.seed-anim .leaf { opacity:0; transform-origin:var(--ox,250px) var(--oy,240px);
  animation: sLeaf 2.4s cubic-bezier(.22,1,.36,1) var(--delay,0s) forwards; }
@keyframes sLeaf { 0% { opacity:0; transform:scale(.05) rotate(-40deg); } 100% { opacity:1; transform:scale(1) rotate(0); } }
.seed-anim .petal { opacity:0; transform-origin:250px 130px;
  animation: sPetal 2.2s cubic-bezier(.34,1.4,.64,1) var(--delay,0s) forwards; }
@keyframes sPetal { 0% { opacity:0; transform:scale(.2) rotate(var(--r,0deg)); }
                    60% { opacity:1; transform:scale(1.15) rotate(var(--r,0deg)); }
                    100% { opacity:.92; transform:scale(1) rotate(var(--r,0deg)); } }
.seed-anim .core { transform-origin:250px 130px; opacity:0;
  animation: sCoreIn 1.4s ease-out var(--bloom,24s) forwards,
             sCorePulse 2.8s ease-in-out calc(var(--bloom,24s) + 1.4s) infinite; }
@keyframes sCoreIn { 0% { opacity:0; transform:scale(.2); } 100% { opacity:1; transform:scale(1); } }
@keyframes sCorePulse { 0%,100% { transform:scale(1); filter:brightness(1); }
                        50% { transform:scale(1.12); filter:brightness(1.3); } }
.seed-anim .sway { transform-origin:250px 300px;
  animation: sSway 6s ease-in-out var(--bloom,24s) infinite; }
@keyframes sSway { 0%,100% { transform:rotate(-.6deg); } 50% { transform:rotate(.6deg); } }
.seed-anim .tremble .core { animation: sTremble 1.2s ease-in-out infinite !important; }
@keyframes sTremble { 0%,100% { transform:scale(.98); } 50% { transform:scale(1.02); } }
`;

let cssInjected = false;
function ensureCss() {
  if (cssInjected) return;
  const s = document.createElement('style'); s.textContent = CSS;
  document.head.appendChild(s); cssInjected = true;
}

const PETAL_HUES_BASE = [30, 340, 280, 220, 140, 45]; // amber, pink, violet, blue, green, gold

export function startSeedAnimation(host, vocalDNA, { bloomMs = 26000 } = {}) {
  ensureCss();
  host.classList.add('seed-anim');
  const rnd = xorshift32(hashDNA(vocalDNA));
  const hueOffset = Math.floor((rnd() - 0.5) * 30); // ±15°
  const hues = PETAL_HUES_BASE.map(h => ((h + hueOffset) + 360) % 360);
  const bloomSec = (bloomMs / 1000).toFixed(2);
  const sway = bloomSec;
  // Compute scale of timing: default 26s, tests may pass 300ms.
  const scale = bloomMs / 26000;
  const t = (sec) => `${(sec * scale).toFixed(2)}s`;

  host.innerHTML = `
    <svg viewBox="0 0 500 500" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="sa-seedCore" cx=".5" cy=".5" r=".5">
          <stop offset="0%" stop-color="#fff6e0" stop-opacity="1"/>
          <stop offset="35%" stop-color="#ffd89b" stop-opacity=".8"/>
          <stop offset="100%" stop-color="#ffd89b" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="sa-stalk" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#ff9e3d" stop-opacity=".9"/>
          <stop offset="50%" stop-color="#ffd89b" stop-opacity=".95"/>
          <stop offset="100%" stop-color="#c8ff8a" stop-opacity=".9"/>
        </linearGradient>
        <radialGradient id="sa-leaf" cx=".3" cy=".3" r=".9">
          <stop offset="0%" stop-color="#ffc97a" stop-opacity=".95"/>
          <stop offset="70%" stop-color="#ff7a9a" stop-opacity=".6"/>
          <stop offset="100%" stop-color="#ff7a9a" stop-opacity=".1"/>
        </radialGradient>
        ${hues.map((h, i) => `
          <radialGradient id="sa-p${i}" cx=".5" cy="1" r="1">
            <stop offset="0%" stop-color="hsl(${h}, 85%, 92%)" stop-opacity="1"/>
            <stop offset="60%" stop-color="hsl(${h}, 85%, 70%)" stop-opacity=".85"/>
            <stop offset="100%" stop-color="hsl(${h}, 85%, 55%)" stop-opacity=".2"/>
          </radialGradient>`).join('')}
        <radialGradient id="sa-coreGlow" cx=".5" cy=".5" r=".5">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
          <stop offset="40%" stop-color="#ffd89b" stop-opacity=".9"/>
          <stop offset="100%" stop-color="#ff9e3d" stop-opacity=".3"/>
        </radialGradient>
        <filter id="sa-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3"/>
        </filter>
      </defs>
      <g class="sway" style="--bloom:${sway}s">
        <circle data-part="seed" class="halo" cx="250" cy="300" r="40" fill="url(#sa-seedCore)" filter="url(#sa-glow)"/>
        <circle cx="250" cy="300" r="5" fill="#fff6e0" filter="url(#sa-glow)"/>
        <path data-part="stalk" class="grow" style="--dur:${t(4)}; --delay:${t(1)};"
              d="M250 298 C 244 260, 258 220, 246 180 C 238 150, 254 135, 250 130"
              stroke="url(#sa-stalk)" stroke-width="3" fill="none" stroke-linecap="round" filter="url(#sa-glow)"/>
        <g data-part="leaf" class="leaf" style="--delay:${t(4)}; --ox:252px; --oy:245px;">
          <path d="M252 245 C 215 235, 195 255, 200 278 C 215 268, 240 262, 252 250 Z" fill="url(#sa-leaf)" filter="url(#sa-glow)"/>
        </g>
        <g data-part="leaf" class="leaf" style="--delay:${t(5)}; --ox:249px; --oy:210px;">
          <path d="M249 210 C 285 200, 305 218, 298 242 C 280 232, 260 222, 249 215 Z" fill="url(#sa-leaf)" filter="url(#sa-glow)"/>
        </g>
        <g data-part="leaf" class="leaf" style="--delay:${t(6)}; --ox:247px; --oy:175px;">
          <path d="M247 175 C 220 168, 208 185, 214 204 C 228 196, 240 188, 247 180 Z" fill="url(#sa-leaf)" filter="url(#sa-glow)" opacity=".85"/>
        </g>
        ${hues.map((h, i) => `
          <g data-part="petal" data-hue="${h}" class="petal" style="--delay:${t(7.5 + i * 0.4)}; --r:${i * 60}deg;">
            <path d="M250 130 C 240 95, 245 75, 250 65 C 255 75, 260 95, 250 130 Z" fill="url(#sa-p${i})" filter="url(#sa-glow)"/>
          </g>`).join('')}
        <g data-part="core" class="core" style="--bloom:${sway}s">
          <circle cx="250" cy="130" r="18" fill="url(#sa-coreGlow)" filter="url(#sa-glow)"/>
          <circle cx="250" cy="130" r="8" fill="#fff6e0" filter="url(#sa-glow)"/>
        </g>
      </g>
    </svg>
  `;

  const listeners = [];
  const onBloomReady = (fn) => { listeners.push(fn); };
  const bloomTimer = setTimeout(() => listeners.forEach(fn => { try { fn(); } catch {} }), bloomMs);
  function startTremblingWait() { host.classList.add('tremble'); }
  function stop() {
    clearTimeout(bloomTimer);
    host.classList.remove('seed-anim', 'tremble');
    host.innerHTML = '';
  }
  return { onBloomReady, startTremblingWait, stop, onAIToken: (_t) => {} };
}

if (typeof window !== 'undefined') {
  window.__Pipeline = window.__Pipeline || {};
  window.__Pipeline.animator = { startSeedAnimation };
}
