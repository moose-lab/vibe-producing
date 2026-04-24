// Barrel: ensures all pipeline modules load and register their window.__Pipeline seams.
import * as Voice from './voice-track.mjs';
import * as Capture from './mic-capture.mjs';
import * as AI from './ai-bridge.mjs';
import * as Animator from './seed-animator.mjs';
// Worker is spawned on demand (new Worker(url, {type:'module'})), not auto-imported.
export { Voice, Capture, AI, Animator };
