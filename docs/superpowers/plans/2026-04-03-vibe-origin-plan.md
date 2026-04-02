# Vibe Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file browser app where you hum a melody, Strudel generates a live loop, AI writes lyrics synced to the beat, and TTS sings them over the music.

**Architecture:** Single HTML file with 5 JS modules (PitchDetect, AIBridge, StrudelEngine, LyricsSync, TTSEngine) communicating through an EventBus. Strudel loaded via CDN. Claude API called directly from frontend.

**Tech Stack:** Strudel (esm.sh CDN), Web Audio API (YIN pitch detection), Claude API (fetch), Web Speech API / ElevenLabs TTS, vanilla HTML/CSS/JS.

**Design spec:** `docs/superpowers/specs/2026-04-03-vibe-origin-design.md`

---

## File Structure

```
Single file: /Users/moose/Downloads/vibe-origin.html

Internal structure:
├── <style>               — Full CSS (~250 lines)
├── <body>                — HTML layout (~120 lines)
└── <script type="module"> — JS modules (~550 lines)
    ├── EventBus          — pub/sub (~20 lines)
    ├── PitchDetect       — mic + YIN algorithm (~100 lines)
    ├── StrudelEngine     — CDN load, eval, play/stop, beat tracking (~80 lines)
    ├── AIBridge          — Claude API, prompt, parse (~100 lines)
    ├── LyricsSync        — beat-based display (~60 lines)
    ├── TTSEngine         — Web Speech + ElevenLabs (~70 lines)
    ├── UIController      — controls ↔ code sync, state (~80 lines)
    └── init()            — wire everything (~40 lines)
```

---

### Task 1: HTML/CSS Scaffold + EventBus

**Files:**
- Create: `/Users/moose/Downloads/vibe-origin.html`

This task creates the complete visual shell with all UI elements and the EventBus foundation. Nothing is functional yet — just layout and pub/sub.

- [ ] **Step 1: Create the HTML file with full CSS and layout**

Create `/Users/moose/Downloads/vibe-origin.html` with the complete content below. This is the full CSS and HTML shell — all subsequent tasks only add JS inside the `<script type="module">` tag.

```html
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vibe Origin — 你脑子里有音乐</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Noto+Serif+SC:wght@300;400;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-deep: #060608;
    --bg: #0c0c10;
    --bg-elevated: #141418;
    --bg-hover: #1a1a20;
    --surface: #1e1e24;
    --border: rgba(255,255,255,0.06);
    --border-hover: rgba(255,255,255,0.12);
    --text: #eceae5;
    --text-secondary: rgba(236,234,229,0.55);
    --text-dim: rgba(236,234,229,0.3);
    --green: #1ed760;
    --green-dim: rgba(30,215,96,0.15);
    --green-glow: rgba(30,215,96,0.4);
    --orange: #ff6b2b;
    --red: #e84040;
    --purple: #a855f7;
    --radius: 12px;
    --radius-sm: 8px;
    --radius-xs: 6px;
  }

  body {
    background: var(--bg-deep);
    color: var(--text);
    font-family: 'Outfit', -apple-system, sans-serif;
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* === TOP NAV === */
  .topnav {
    height: 48px;
    background: rgba(6,6,8,0.85);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    flex-shrink: 0;
    z-index: 10;
  }
  .logo-mark {
    width: 26px; height: 26px; border-radius: 7px;
    background: linear-gradient(135deg, var(--green), #0ea85a);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; color: #000;
    box-shadow: 0 0 14px var(--green-dim);
  }
  .logo-text { font-size: 14px; font-weight: 700; }
  .logo-sub { font-size: 10px; color: var(--text-dim); margin-left: 6px; }
  .topnav-spacer { flex: 1; }
  .api-pill {
    display: flex; align-items: center; gap: 5px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 20px; padding: 4px 10px;
    font-size: 10px; color: var(--text-secondary); cursor: pointer;
    transition: all 0.2s;
  }
  .api-pill:hover { border-color: var(--border-hover); }
  .api-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--red);
  }
  .api-dot.connected { background: var(--green); box-shadow: 0 0 6px var(--green-glow); }
  .api-modal {
    display: none; position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    align-items: center; justify-content: center;
  }
  .api-modal.visible { display: flex; }
  .api-modal-box {
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 24px; width: 380px;
  }
  .api-modal-box h3 { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
  .api-modal-box input {
    width: 100%; padding: 10px 12px; background: var(--bg);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 12px;
    margin-bottom: 12px;
  }
  .api-modal-box input:focus { outline: none; border-color: rgba(30,215,96,0.3); }
  .api-modal-box .modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .api-modal-box button {
    padding: 8px 16px; border-radius: var(--radius-sm); border: none;
    font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .btn-save { background: var(--green); color: #000; }
  .btn-cancel { background: var(--surface); color: var(--text-secondary); }

  /* === INPUT STRIP === */
  .input-strip {
    flex-shrink: 0; background: var(--bg);
    border-bottom: 1px solid var(--border); padding: 10px 16px;
  }
  .input-row { display: flex; gap: 10px; align-items: center; }

  .mic-btn {
    width: 48px; height: 48px; border-radius: 50%;
    border: 2px solid var(--text-dim); background: transparent;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.3s; font-size: 20px;
  }
  .mic-btn:hover { border-color: var(--red); background: rgba(232,64,64,0.08); }
  .mic-btn.recording {
    border-color: var(--red); background: rgba(232,64,64,0.15);
    animation: pulse-ring 1.5s ease-in-out infinite;
  }
  @keyframes pulse-ring {
    0%,100% { box-shadow: 0 0 0 0 rgba(232,64,64,0.3); }
    50% { box-shadow: 0 0 0 10px rgba(232,64,64,0); }
  }

  .pitch-display {
    flex: 1; background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 8px 12px;
    display: flex; align-items: center; gap: 10px; min-width: 0;
    min-height: 48px;
  }
  .pitch-placeholder { font-size: 12px; color: var(--text-dim); }
  .pitch-notes { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .note-tag {
    background: var(--green-dim); border: 1px solid rgba(30,215,96,0.25);
    border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 600;
    color: var(--green); font-family: 'JetBrains Mono', monospace;
  }
  .bpm-tag {
    font-size: 10px; color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace; margin-left: 4px;
  }

  .text-supplement textarea {
    width: 180px; height: 48px; background: var(--bg-elevated);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text); font-family: 'Noto Serif SC', serif;
    font-size: 12px; font-weight: 300; padding: 6px 10px;
    resize: none; line-height: 1.5;
  }
  .text-supplement textarea:focus { outline: none; border-color: rgba(30,215,96,0.3); }
  .text-supplement textarea::placeholder { color: var(--text-dim); }

  .input-bottom { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
  .chip {
    padding: 4px 12px; border: 1px solid var(--border); border-radius: 20px;
    font-size: 11px; font-weight: 500; color: var(--text-secondary);
    background: transparent; cursor: pointer; transition: all 0.2s;
    font-family: 'Outfit', sans-serif;
  }
  .chip:hover { border-color: var(--border-hover); color: var(--text); }
  .chip.active { border-color: var(--green); color: var(--green); background: var(--green-dim); }
  .input-spacer { flex: 1; }
  .gen-btn {
    padding: 8px 22px; background: var(--green); border: none; border-radius: 24px;
    font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;
    color: #000; cursor: pointer; display: flex; align-items: center; gap: 6px;
    box-shadow: 0 0 16px var(--green-dim); transition: all 0.2s;
  }
  .gen-btn:hover { transform: scale(1.03); box-shadow: 0 0 24px var(--green-glow); }
  .gen-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .gen-btn .spinner {
    display: none; width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.2);
    border-top-color: #000; border-radius: 50%; animation: spin 0.6s linear infinite;
  }
  .gen-btn.loading .spinner { display: block; }
  .gen-btn.loading .btn-label { display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* === WORKSPACE === */
  .workspace { flex: 1; display: flex; overflow: hidden; }
  .workspace.hidden { display: none; }

  /* -- LEFT: Lyrics -- */
  .lyrics-panel {
    width: 260px; flex-shrink: 0; display: flex; flex-direction: column;
    border-right: 1px solid var(--border); background: var(--bg);
  }
  .lyrics-header {
    padding: 10px 14px; display: flex; align-items: center; gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .song-title { font-size: 14px; font-weight: 700; }
  .song-section-tag {
    font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
    padding: 2px 8px; border-radius: 4px;
    background: var(--green-dim); color: var(--green);
  }
  .lyrics-body {
    flex: 1; padding: 16px; overflow-y: auto;
    display: flex; flex-direction: column; justify-content: center;
  }
  .lyrics-empty {
    text-align: center; color: var(--text-dim); font-size: 12px; line-height: 1.8;
  }
  .lyric-line {
    font-family: 'Noto Serif SC', serif; line-height: 2.2;
    transition: all 0.4s ease; padding: 1px 0; position: relative;
  }
  .lyric-line.past { font-size: 12px; color: var(--text-dim); opacity: 0.4; }
  .lyric-line.prev { font-size: 13px; color: var(--text-secondary); opacity: 0.6; }
  .lyric-line.current {
    font-size: 15px; font-weight: 400; color: var(--text); padding-left: 12px;
  }
  .lyric-line.current::before {
    content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    width: 3px; height: 55%; background: var(--green); border-radius: 2px;
    box-shadow: 0 0 8px var(--green-glow);
  }
  .lyric-line.next { font-size: 13px; color: var(--text-secondary); opacity: 0.5; }
  .lyric-line.far { font-size: 11px; color: var(--text-dim); opacity: 0.3; }
  .lyrics-footer {
    padding: 8px 14px; border-top: 1px solid var(--border); display: flex; gap: 6px;
  }
  .lyrics-action {
    padding: 5px 10px; background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: var(--radius-xs); font-size: 10px; font-weight: 500;
    color: var(--text-secondary); cursor: pointer; font-family: 'Outfit', sans-serif;
    transition: all 0.15s;
  }
  .lyrics-action:hover { border-color: var(--border-hover); color: var(--text); }

  /* -- RIGHT: Controls + Code -- */
  .right-panel {
    flex: 1; display: flex; flex-direction: column;
    background: var(--bg-deep); min-width: 0;
  }

  /* Transport */
  .transport {
    padding: 8px 16px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px; background: var(--bg);
  }
  .transport-btn {
    width: 32px; height: 32px; border-radius: 50%; border: none;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s; font-size: 12px;
  }
  .transport-btn.play {
    background: var(--green); color: #000;
    box-shadow: 0 0 10px var(--green-dim);
  }
  .transport-btn.play:hover { transform: scale(1.08); box-shadow: 0 0 18px var(--green-glow); }
  .transport-btn.stop {
    background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary);
  }
  .transport-btn.stop:hover { background: var(--bg-hover); }
  .bpm-display {
    font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 500;
    color: var(--text); margin-left: 8px;
  }
  .bpm-unit { font-size: 9px; color: var(--text-dim); margin-left: 3px; }

  /* Controls strip */
  .controls-strip {
    display: flex; border-bottom: 1px solid var(--border); background: var(--bg);
    flex-wrap: wrap;
  }
  .ctrl-group {
    padding: 10px 14px; border-right: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 6px;
  }
  .ctrl-group:last-child { border-right: none; }
  .ctrl-label {
    font-size: 9px; font-weight: 600; color: var(--text-dim);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .sound-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .sound-chip {
    padding: 5px 10px; background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: var(--radius-xs); font-size: 11px; cursor: pointer;
    transition: all 0.15s; display: flex; align-items: center; gap: 4px;
    color: var(--text-secondary); font-family: 'Outfit', sans-serif;
  }
  .sound-chip:hover { border-color: var(--border-hover); }
  .sound-chip.active { border-color: var(--green); color: var(--green); background: var(--green-dim); }

  .fx-row { display: flex; gap: 12px; align-items: center; }
  .fx-item { display: flex; align-items: center; gap: 6px; }
  .fx-name { font-size: 10px; color: var(--text-secondary); width: 28px; }
  .fx-track {
    width: 60px; height: 4px; background: var(--surface);
    border-radius: 2px; cursor: pointer; position: relative;
  }
  .fx-fill { height: 100%; border-radius: 2px; background: var(--green); pointer-events: none; }
  .fx-val {
    font-size: 9px; color: var(--text-dim); width: 22px; text-align: right;
    font-family: 'JetBrains Mono', monospace;
  }

  .voice-row { display: flex; align-items: center; gap: 4px; }
  .voice-chip {
    padding: 4px 10px; border-radius: 16px; font-size: 10px; font-weight: 500;
    border: 1px solid var(--border); background: transparent;
    color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
    font-family: 'Outfit', sans-serif;
  }
  .voice-chip.active { border-color: var(--purple); color: var(--purple); background: rgba(168,85,247,0.1); }
  .voice-speak {
    margin-left: 4px; padding: 4px 10px; border-radius: 16px;
    border: 1px solid var(--border); background: var(--bg-elevated);
    font-size: 10px; color: var(--text-secondary); cursor: pointer;
    font-family: 'Outfit', sans-serif;
  }
  .voice-speak:hover { border-color: var(--purple); color: var(--purple); }

  /* Code editor */
  .code-area { flex: 1; display: flex; flex-direction: column; min-height: 0; position: relative; }
  .code-header {
    padding: 8px 16px; display: flex; align-items: center; justify-content: space-between;
    background: var(--bg); border-bottom: 1px solid rgba(30,215,96,0.1);
  }
  .code-title {
    font-size: 11px; font-weight: 600; color: var(--green);
    letter-spacing: 0.08em; display: flex; align-items: center; gap: 6px;
  }
  .code-badge {
    font-size: 9px; padding: 2px 8px; border-radius: 10px;
    background: var(--green-dim); color: var(--green); font-weight: 600;
    display: none;
  }
  .code-badge.visible { display: inline; }
  .code-shortcut {
    font-size: 10px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace;
  }
  .code-editor-wrap {
    flex: 1; display: flex; overflow: hidden; background: #07080c; position: relative;
  }
  .line-numbers {
    width: 40px; flex-shrink: 0; padding: 14px 0; text-align: right;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.95;
    color: rgba(255,255,255,0.1); user-select: none; padding-right: 10px;
    border-right: 1px solid rgba(30,215,96,0.06);
  }
  .code-editor-container { flex: 1; position: relative; overflow: hidden; }
  .code-highlight, .code-textarea {
    position: absolute; inset: 0; padding: 14px 16px;
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    line-height: 1.95; white-space: pre-wrap; word-wrap: break-word;
    overflow-y: auto;
  }
  .code-highlight {
    color: rgba(30,215,96,0.6); pointer-events: none; z-index: 1;
  }
  .code-highlight .kw { color: var(--green); font-weight: 500; }
  .code-highlight .str { color: var(--orange); }
  .code-highlight .num { color: var(--purple); }
  .code-highlight .cmt { color: rgba(255,255,255,0.18); font-style: italic; }
  .code-textarea {
    background: transparent; border: none; color: transparent;
    caret-color: var(--green); resize: none; z-index: 2; outline: none;
  }

  /* Loop step viz */
  .loop-viz {
    height: 32px; background: var(--bg); border-top: 1px solid var(--border);
    display: flex; align-items: flex-end; padding: 0 16px 4px; gap: 2px;
  }
  .loop-step {
    flex: 1; border-radius: 2px 2px 0 0; transition: all 0.1s;
    min-height: 3px;
  }
  .loop-step.off { background: rgba(255,255,255,0.04); }
  .loop-step.beat { background: rgba(30,215,96,0.4); }
  .loop-step.current { background: var(--green); box-shadow: 0 0 6px var(--green-glow); }

  /* Welcome overlay */
  .welcome-overlay {
    display: flex; align-items: center; justify-content: center;
    position: absolute; inset: 0; z-index: 5;
  }
  .welcome-overlay.hidden { display: none; }
  .welcome-msg {
    text-align: center; color: var(--text-dim); font-size: 13px; line-height: 1.8;
  }
  .welcome-msg .big { font-size: 32px; margin-bottom: 8px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
</style>
</head>
<body>

  <!-- TOP NAV -->
  <nav class="topnav">
    <div class="logo-mark">V</div>
    <span class="logo-text">Vibe Origin</span>
    <span class="logo-sub">你脑子里有音乐</span>
    <div class="topnav-spacer"></div>
    <div class="api-pill" id="apiPill">
      <div class="api-dot" id="apiDot"></div>
      <span id="apiLabel">设置 API Key</span>
    </div>
  </nav>

  <!-- API Key Modal -->
  <div class="api-modal" id="apiModal">
    <div class="api-modal-box">
      <h3>Claude API Key</h3>
      <input type="password" id="apiKeyInput" placeholder="sk-ant-..." autocomplete="off">
      <div style="font-size:10px;color:var(--text-dim);margin:-8px 0 12px;">Key 仅存储在浏览器本地，不会发送到任何第三方</div>
      <div class="modal-btns">
        <button class="btn-cancel" id="apiCancel">取消</button>
        <button class="btn-save" id="apiSave">保存</button>
      </div>
    </div>
  </div>

  <!-- INPUT STRIP -->
  <div class="input-strip">
    <div class="input-row">
      <button class="mic-btn" id="micBtn">🎤</button>
      <div class="pitch-display" id="pitchDisplay">
        <span class="pitch-placeholder" id="pitchPlaceholder">按住麦克风，哼一段旋律</span>
        <div class="pitch-notes" id="pitchNotes" style="display:none"></div>
        <span class="bpm-tag" id="bpmTag" style="display:none"></span>
      </div>
      <div class="text-supplement">
        <textarea id="textInput" placeholder="补充描述（可选）&#10;如：深夜，有点孤独"></textarea>
      </div>
    </div>
    <div class="input-bottom">
      <button class="chip active" data-style="电子氛围">电子氛围</button>
      <button class="chip" data-style="治愈民谣">治愈民谣</button>
      <button class="chip" data-style="华语流行">华语流行</button>
      <button class="chip" data-style="说唱">说唱</button>
      <button class="chip" data-style="后摇">后摇</button>
      <button class="chip" data-style="爵士">爵士</button>
      <div class="input-spacer"></div>
      <button class="gen-btn" id="genBtn" disabled>
        <span class="spinner"></span>
        <span class="btn-label">✦ 生成</span>
      </button>
    </div>
  </div>

  <!-- WORKSPACE -->
  <div class="workspace hidden" id="workspace">
    <!-- LEFT: Lyrics -->
    <div class="lyrics-panel">
      <div class="lyrics-header">
        <span class="song-title" id="songTitle">—</span>
        <span class="song-section-tag" id="sectionTag" style="display:none"></span>
      </div>
      <div class="lyrics-body" id="lyricsBody">
        <div class="lyrics-empty">歌词会在生成后出现</div>
      </div>
      <div class="lyrics-footer">
        <button class="lyrics-action" id="reAdaptBtn">↻ 重新适配</button>
        <button class="lyrics-action" id="copyLyricsBtn">⎘ 复制歌词</button>
      </div>
    </div>

    <!-- RIGHT: Controls + Code -->
    <div class="right-panel">
      <!-- Transport -->
      <div class="transport">
        <button class="transport-btn play" id="playBtn">▶</button>
        <button class="transport-btn stop" id="stopBtn">⏹</button>
        <div class="bpm-display"><span id="bpmDisplay">120</span><span class="bpm-unit">BPM</span></div>
        <div style="flex:1"></div>
      </div>

      <!-- Controls strip -->
      <div class="controls-strip">
        <div class="ctrl-group" style="flex:1">
          <div class="ctrl-label">音色</div>
          <div class="sound-row" id="soundRow">
            <button class="sound-chip active" data-sound="piano">🎹 Piano</button>
            <button class="sound-chip" data-sound="sawtooth">🎸 Synth</button>
            <button class="sound-chip" data-sound="RolandTR808">🥁 808</button>
            <button class="sound-chip" data-sound="triangle">✧ Pad</button>
          </div>
        </div>
        <div class="ctrl-group">
          <div class="ctrl-label">效果</div>
          <div class="fx-row" id="fxRow">
            <div class="fx-item">
              <span class="fx-name">Rev</span>
              <div class="fx-track" data-fx="room"><div class="fx-fill" style="width:50%"></div></div>
              <span class="fx-val">.50</span>
            </div>
            <div class="fx-item">
              <span class="fx-name">Dly</span>
              <div class="fx-track" data-fx="delay"><div class="fx-fill" style="width:30%"></div></div>
              <span class="fx-val">.30</span>
            </div>
            <div class="fx-item">
              <span class="fx-name">Gain</span>
              <div class="fx-track" data-fx="gain"><div class="fx-fill" style="width:70%"></div></div>
              <span class="fx-val">.70</span>
            </div>
          </div>
        </div>
        <div class="ctrl-group">
          <div class="ctrl-label">人声</div>
          <div class="voice-row">
            <button class="voice-chip active" data-tts="web">Web TTS</button>
            <button class="voice-chip" data-tts="elevenlabs">ElevenLabs</button>
            <button class="voice-speak" id="speakBtn">🔊 唱</button>
          </div>
        </div>
      </div>

      <!-- Code editor -->
      <div class="code-area">
        <div class="code-header">
          <div class="code-title">
            STRUDEL CODE
            <span class="code-badge" id="liveBadge">LIVE</span>
          </div>
          <span class="code-shortcut">⌘Enter 执行</span>
        </div>
        <div class="code-editor-wrap">
          <div class="line-numbers" id="lineNumbers">1</div>
          <div class="code-editor-container">
            <pre class="code-highlight" id="codeHighlight"></pre>
            <textarea class="code-textarea" id="codeTextarea" spellcheck="false" placeholder="// Strudel 代码会在这里出现"></textarea>
          </div>
          <div class="welcome-overlay" id="codeWelcome">
            <div class="welcome-msg">
              <div class="big">🎵</div>
              哼一段旋律，点击生成<br>代码会出现在这里
            </div>
          </div>
        </div>
        <div class="loop-viz" id="loopViz"></div>
      </div>
    </div>
  </div>

<script type="module">
// ============================================================
// EventBus — pub/sub message bus
// ============================================================
class EventBus {
  constructor() { this._listeners = {}; }
  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(f => f !== fn);
  }
  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}

const bus = new EventBus();

// ============================================================
// UI wiring — chips, API key modal, basic interactions
// ============================================================
let selectedStyle = '电子氛围';

// Style chips
document.querySelectorAll('.chip[data-style]').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-style]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedStyle = chip.dataset.style;
  });
});

// API key modal
const apiKey = { value: localStorage.getItem('vibe-origin-api-key') || '' };
function updateApiStatus() {
  const dot = document.getElementById('apiDot');
  const label = document.getElementById('apiLabel');
  if (apiKey.value) {
    dot.classList.add('connected');
    label.textContent = 'API 已连接';
  } else {
    dot.classList.remove('connected');
    label.textContent = '设置 API Key';
  }
}
updateApiStatus();

document.getElementById('apiPill').addEventListener('click', () => {
  document.getElementById('apiKeyInput').value = apiKey.value;
  document.getElementById('apiModal').classList.add('visible');
});
document.getElementById('apiCancel').addEventListener('click', () => {
  document.getElementById('apiModal').classList.remove('visible');
});
document.getElementById('apiSave').addEventListener('click', () => {
  apiKey.value = document.getElementById('apiKeyInput').value.trim();
  localStorage.setItem('vibe-origin-api-key', apiKey.value);
  updateApiStatus();
  document.getElementById('apiModal').classList.remove('visible');
});

// Voice chips
document.querySelectorAll('.voice-chip[data-tts]').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.voice-chip[data-tts]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    bus.emit('tts:engine-changed', chip.dataset.tts);
  });
});

// Placeholder: modules will be added in subsequent tasks
console.log('[Vibe Origin] Scaffold loaded. EventBus ready.');

</script>
</body>
</html>
```

- [ ] **Step 2: Open in browser and verify**

Open `/Users/moose/Downloads/vibe-origin.html` in Chrome/Safari.

Expected:
- Dark UI with green accents, Spotify-inspired layout
- Top nav with "Vibe Origin" logo and API key pill
- Input strip with mic button, pitch display placeholder, text area, style chips, disabled generate button
- Workspace area is hidden (shows after first generation)
- Clicking API key pill opens modal, saving stores to localStorage
- Style chips toggle on click

- [ ] **Step 3: Commit**

```bash
cd /Users/moose/Moose/music-producer
git add -A
git commit -m "feat: scaffold HTML/CSS shell with EventBus"
```

---

### Task 2: Strudel Engine — CDN Load, Eval, Play/Stop

**Files:**
- Modify: `/Users/moose/Downloads/vibe-origin.html` (add JS inside `<script type="module">`)

Load Strudel packages from CDN, create the engine module, wire play/stop buttons with a hardcoded test pattern.

- [ ] **Step 1: Add Strudel imports and engine module**

Add this code after the EventBus section and before the "UI wiring" section in the `<script type="module">`:

```javascript
// ============================================================
// StrudelEngine — load CDN, eval, play/stop, beat tracking
// ============================================================
let strudelRepl = null;
let strudelLoaded = false;
let isPlaying = false;
let currentCode = '';
let totalBeats = 48; // default ~30s at 120bpm

async function loadStrudel() {
  if (strudelLoaded) return;
  try {
    const { controls, repl, noteToMidi } = await import('https://esm.sh/@strudel/core@1.1.0');
    await import('https://esm.sh/@strudel/mini@1.1.0');
    await import('https://esm.sh/@strudel/tonal@1.1.0');
    const { webaudioOutput, getAudioContext, initAudioOnFirstClick }
      = await import('https://esm.sh/@strudel/webaudio@1.1.0');
    await import('https://esm.sh/@strudel/soundfonts@1.1.0');
    await import('https://esm.sh/@strudel/superdough@1.1.0');

    initAudioOnFirstClick();

    strudelRepl = repl({
      defaultOutput: webaudioOutput,
      getTime: () => getAudioContext().currentTime,
    });

    strudelLoaded = true;
    console.log('[StrudelEngine] Loaded successfully');
  } catch (err) {
    console.error('[StrudelEngine] Failed to load:', err);
    // Fallback: try without version pinning
    try {
      const { controls, repl } = await import('https://esm.sh/@strudel/core');
      await import('https://esm.sh/@strudel/mini');
      await import('https://esm.sh/@strudel/tonal');
      const { webaudioOutput, getAudioContext, initAudioOnFirstClick }
        = await import('https://esm.sh/@strudel/webaudio');
      await import('https://esm.sh/@strudel/soundfonts');
      await import('https://esm.sh/@strudel/superdough');

      initAudioOnFirstClick();
      strudelRepl = repl({
        defaultOutput: webaudioOutput,
        getTime: () => getAudioContext().currentTime,
      });
      strudelLoaded = true;
      console.log('[StrudelEngine] Loaded (fallback)');
    } catch (err2) {
      console.error('[StrudelEngine] Fallback also failed:', err2);
      throw err2;
    }
  }
}

async function strudelEval(code) {
  if (!strudelLoaded) await loadStrudel();
  currentCode = code;
  try {
    await strudelRepl.evaluate(code);
    isPlaying = true;
    document.getElementById('liveBadge').classList.add('visible');
    bus.emit('strudel:playing');
    startBeatTracking();
    console.log('[StrudelEngine] Eval OK');
  } catch (err) {
    console.error('[StrudelEngine] Eval error:', err);
    bus.emit('strudel:error', err.message);
  }
}

function strudelStop() {
  if (strudelRepl) {
    strudelRepl.stop();
    isPlaying = false;
    document.getElementById('liveBadge').classList.remove('visible');
    bus.emit('strudel:stopped');
  }
}

// Beat tracking via requestAnimationFrame
let beatRAF = null;
let lastBeat = -1;

function startBeatTracking() {
  if (beatRAF) cancelAnimationFrame(beatRAF);
  function tick() {
    if (!isPlaying || !strudelRepl?.scheduler) { beatRAF = null; return; }
    const cycle = strudelRepl.scheduler.now?.() || 0;
    const beat = cycle * 4; // 4 beats per cycle
    const loopBeat = beat % totalBeats;
    if (Math.floor(loopBeat) !== lastBeat) {
      lastBeat = Math.floor(loopBeat);
      bus.emit('strudel:tick', { beat: loopBeat, totalBeats });
    }
    beatRAF = requestAnimationFrame(tick);
  }
  tick();
}

// Loop viz
function initLoopViz() {
  const viz = document.getElementById('loopViz');
  viz.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const step = document.createElement('div');
    step.className = 'loop-step off';
    step.style.height = '3px';
    viz.appendChild(step);
  }
}
initLoopViz();

bus.on('strudel:tick', ({ beat, totalBeats }) => {
  const steps = document.getElementById('loopViz').children;
  const stepIndex = Math.floor((beat / totalBeats) * steps.length);
  for (let i = 0; i < steps.length; i++) {
    steps[i].className = 'loop-step ' + (i === stepIndex ? 'current' : (i < stepIndex ? 'beat' : 'off'));
    steps[i].style.height = (i === stepIndex ? '20px' : (i < stepIndex ? '10px' : '3px'));
  }
});

bus.on('strudel:stopped', () => {
  const steps = document.getElementById('loopViz').children;
  for (let i = 0; i < steps.length; i++) {
    steps[i].className = 'loop-step off';
    steps[i].style.height = '3px';
  }
});
```

- [ ] **Step 2: Wire play/stop buttons**

Add this code in the "UI wiring" section, after the voice chips block:

```javascript
// Play/Stop buttons
document.getElementById('playBtn').addEventListener('click', async () => {
  if (!currentCode) {
    // Test pattern for verification
    await strudelEval(`note("c3 eb3 g3 f3").s("piano").slow(2)`);
  } else {
    await strudelEval(currentCode);
  }
});

document.getElementById('stopBtn').addEventListener('click', () => {
  strudelStop();
});
```

- [ ] **Step 3: Verify Strudel plays audio**

Open the page in Chrome. Open DevTools console.
1. Click the API key pill → save any key (just to test modal works)
2. Click the ▶ play button
3. Expected: Console logs `[StrudelEngine] Loaded successfully` then `[StrudelEngine] Eval OK`
4. Expected: You hear a piano pattern playing C Eb G F
5. Expected: "LIVE" badge appears next to "STRUDEL CODE"
6. Expected: Loop viz animates at the bottom
7. Click ⏹ stop → music stops, LIVE badge hides

**Troubleshooting:** If esm.sh imports fail, check console errors. Common fixes:
- Try removing version pins (the fallback code handles this)
- Check if browser blocks mixed content or CORS
- Try `https://cdn.jsdelivr.net/npm/@strudel/` as alternative CDN

- [ ] **Step 4: Commit**

```bash
git add /Users/moose/Downloads/vibe-origin.html
git commit -m "feat: add Strudel engine with CDN load, eval, play/stop, beat tracking"
```

---

### Task 3: Pitch Detection — Mic Input + YIN Algorithm

**Files:**
- Modify: `/Users/moose/Downloads/vibe-origin.html` (add JS)

Implement microphone capture and YIN pitch detection. Display detected notes in real-time.

- [ ] **Step 1: Add PitchDetect module**

Add after the StrudelEngine section:

```javascript
// ============================================================
// PitchDetect — mic input + YIN algorithm
// ============================================================
let micStream = null;
let micAnalyser = null;
let micAudioCtx = null;
let isRecording = false;
let detectedNotes = [];
let noteTimestamps = [];

// YIN pitch detection algorithm
function detectPitchYIN(buffer, sampleRate) {
  const bufSize = Math.floor(buffer.length / 2);
  const diff = new Float32Array(bufSize);
  const cmndf = new Float32Array(bufSize);

  // Difference function
  for (let tau = 0; tau < bufSize; tau++) {
    let sum = 0;
    for (let i = 0; i < bufSize; i++) {
      const d = buffer[i] - buffer[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < bufSize; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] * tau / runningSum;
  }

  // Absolute threshold
  const threshold = 0.15;
  let tau = 2;
  while (tau < bufSize && cmndf[tau] > threshold) tau++;
  if (tau === bufSize) return -1;

  // Parabolic interpolation for better accuracy
  while (tau + 1 < bufSize && cmndf[tau + 1] < cmndf[tau]) tau++;

  const freq = sampleRate / tau;
  return (freq > 60 && freq < 1200) ? freq : -1; // vocal range filter
}

function frequencyToNote(freq) {
  const noteNames = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const octave = Math.floor(midi / 12) - 1;
  return noteNames[midi % 12] + octave;
}

function frequencyToStrudelNote(freq) {
  const noteNames = ['c','cs','d','eb','e','f','fs','g','ab','a','bb','b'];
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const octave = Math.floor(midi / 12) - 1;
  return noteNames[midi % 12] + octave;
}

function estimateBPM(timestamps) {
  if (timestamps.length < 3) return 95; // default
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60000 / avgInterval); // ms to BPM
  return Math.max(60, Math.min(180, bpm)); // clamp to reasonable range
}

async function startMic() {
  if (isRecording) { stopMic(); return; }

  try {
    micAudioCtx = new AudioContext();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = micAudioCtx.createMediaStreamSource(micStream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 4096;
    source.connect(micAnalyser);

    isRecording = true;
    detectedNotes = [];
    noteTimestamps = [];
    document.getElementById('micBtn').classList.add('recording');
    document.getElementById('pitchPlaceholder').style.display = 'none';
    document.getElementById('pitchNotes').style.display = 'flex';
    document.getElementById('pitchNotes').innerHTML = '';
    document.getElementById('bpmTag').style.display = 'inline';

    const buffer = new Float32Array(micAnalyser.fftSize);
    let lastNote = '';
    let frameCount = 0;

    function analyze() {
      if (!isRecording) return;
      micAnalyser.getFloatTimeDomainData(buffer);

      // Only analyze every 3rd frame (~20Hz) to reduce noise
      if (++frameCount % 3 === 0) {
        const freq = detectPitchYIN(buffer, micAudioCtx.sampleRate);
        if (freq > 0) {
          const note = frequencyToNote(freq);
          if (note !== lastNote) {
            lastNote = note;
            detectedNotes.push({ note, freq, strudelNote: frequencyToStrudelNote(freq) });
            noteTimestamps.push(Date.now());
            updatePitchDisplay();
          }
        }
      }
      requestAnimationFrame(analyze);
    }
    analyze();

  } catch (err) {
    console.error('[PitchDetect] Mic error:', err);
    alert('无法访问麦克风，请检查浏览器权限');
  }
}

function stopMic() {
  isRecording = false;
  document.getElementById('micBtn').classList.remove('recording');

  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (micAudioCtx) {
    micAudioCtx.close();
    micAudioCtx = null;
  }

  if (detectedNotes.length > 0) {
    const bpm = estimateBPM(noteTimestamps);
    document.getElementById('bpmTag').textContent = `≈ ${bpm} BPM`;
    bus.emit('hum:detected', {
      notes: detectedNotes.map(n => n.note),
      strudelNotes: detectedNotes.map(n => n.strudelNote),
      bpm,
    });
    // Enable generate button
    document.getElementById('genBtn').disabled = false;
  }
}

function updatePitchDisplay() {
  const container = document.getElementById('pitchNotes');
  // Show last 8 notes
  const recent = detectedNotes.slice(-8);
  container.innerHTML = recent.map((n, i) => {
    const opacity = i < recent.length - 1 ? 'opacity:0.5;' : '';
    return `<span class="note-tag" style="${opacity}">${n.note}</span>`;
  }).join('');

  const bpm = estimateBPM(noteTimestamps);
  document.getElementById('bpmTag').textContent = `≈ ${bpm} BPM`;
}
```

- [ ] **Step 2: Wire mic button**

Add in the UI wiring section:

```javascript
// Mic button
document.getElementById('micBtn').addEventListener('click', () => {
  if (isRecording) stopMic();
  else startMic();
});
```

- [ ] **Step 3: Verify pitch detection**

Open page in Chrome (needs HTTPS or localhost for mic access — use `file://` which Chrome allows for getUserMedia).

1. Click 🎤 mic button
2. Expected: Browser asks for mic permission, button starts pulsing red
3. Hum a steady note (e.g., hum "mmm" at a comfortable pitch)
4. Expected: Note tags appear in pitch display (e.g., "G3", "A3")
5. Hum a melody with different notes
6. Expected: Multiple different notes appear, BPM estimate updates
7. Click mic button again to stop
8. Expected: Generate button becomes enabled, pulsing stops
9. Console shows `hum:detected` event data if you add `bus.on('hum:detected', d => console.log(d))`

- [ ] **Step 4: Commit**

```bash
git add /Users/moose/Downloads/vibe-origin.html
git commit -m "feat: add pitch detection with YIN algorithm and mic input"
```

---

### Task 4: AI Bridge — Claude API Integration

**Files:**
- Modify: `/Users/moose/Downloads/vibe-origin.html` (add JS)

Connect to Claude API. Send detected notes + style + text → receive Strudel code + lyrics with beat anchors.

- [ ] **Step 1: Add AIBridge module**

Add after the PitchDetect section:

```javascript
// ============================================================
// AIBridge — Claude API call, prompt, parse
// ============================================================
function buildGeneratePrompt(notes, bpm, style, textDesc) {
  const notesList = notes.join(' ');
  const cyclesNeeded = Math.round(30 / (60 / bpm * 4));
  const totalBeatsCalc = cyclesNeeded * 4;

  return {
    system: `你是一个浏览器音乐创作引擎。用户哼了一段旋律（以音符序列给出），你需要同时生成 Strudel live-coding 代码和配套歌词。

Strudel 代码要求：
- 使用 Strudel mini-notation 语法
- 基于用户哼唱的音符构建旋律轨
- 添加鼓组轨（使用 .bank("RolandTR808")）
- 添加低音轨
- 用 .slow(${cyclesNeeded}) 使总时长约 30 秒
- BPM 约 ${bpm}（通过 .cpm(${Math.round(bpm / 4)}) 设置）
- 风格匹配：${style}
- 代码必须是可以直接在 Strudel REPL 中运行的合法代码
- 多轨用 $: 前缀分开写，每轨一个 $: 开头的语句

歌词要求：
- 6~8 行，铺满 30 秒的 demo 歌词
- 每行带 beat 入点（从 1 开始，总共约 ${totalBeatsCalc} 拍）
- 意象具体有画面感，匹配 loop 的情绪
- 中文歌词

严格返回 JSON，无其他文字：
{
  "strudel_code": "完整的 Strudel 代码字符串",
  "lyrics": [
    {"beat": 1, "text": "第一行歌词"},
    {"beat": N, "text": "第二行歌词"}
  ],
  "bpm": ${bpm},
  "title": "歌名（2-6字）",
  "total_beats": ${totalBeatsCalc}
}`,
    user: `用户哼唱的音符：${notesList}
BPM 估算：${bpm}
风格：${style}
${textDesc ? '补充描述：' + textDesc : ''}`,
  };
}

function buildReAdaptPrompt(strudelCode, bpm, style, totalBeatsVal) {
  return {
    system: `你是一个歌词适配引擎。用户修改了 Strudel loop 代码，你需要根据新的 loop 重新生成配套歌词。

分析代码中的音符走向、节奏密度、情绪，生成匹配的歌词。

要求：
- 6~8 行，每行带 beat 入点
- 总共约 ${totalBeatsVal} 拍
- 中文，意象具体
- 风格：${style}

严格返回 JSON：
{
  "lyrics": [{"beat": 1, "text": "..."}, ...],
  "title": "歌名（2-6字）"
}`,
    user: `当前 Strudel 代码：
${strudelCode}
BPM: ${bpm}`,
  };
}

async function callClaudeAPI(systemPrompt, userMessage) {
  if (!apiKey.value) {
    throw new Error('请先设置 Claude API Key');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.value,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text || '';
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function generateFromHum(humData) {
  const { notes, bpm } = humData;
  const style = selectedStyle;
  const textDesc = document.getElementById('textInput').value.trim();

  const prompt = buildGeneratePrompt(notes, bpm, style, textDesc);
  const result = await callClaudeAPI(prompt.system, prompt.user);

  totalBeats = result.total_beats || 48;
  return result;
}

async function reAdaptLyrics(code, bpm) {
  const style = selectedStyle;
  const prompt = buildReAdaptPrompt(code, bpm, style, totalBeats);
  return await callClaudeAPI(prompt.system, prompt.user);
}
```

- [ ] **Step 2: Wire generate button to full pipeline**

Add in the UI wiring section:

```javascript
// Store latest hum data
let lastHumData = null;
bus.on('hum:detected', data => { lastHumData = data; });

// Generate button — the core flow
document.getElementById('genBtn').addEventListener('click', async () => {
  if (!lastHumData) return;
  if (!apiKey.value) {
    document.getElementById('apiModal').classList.add('visible');
    return;
  }

  const btn = document.getElementById('genBtn');
  btn.disabled = true;
  btn.classList.add('loading');

  try {
    // Load Strudel in parallel with API call
    const [_, result] = await Promise.all([
      loadStrudel(),
      generateFromHum(lastHumData),
    ]);

    console.log('[AIBridge] Result:', result);

    // Show workspace
    document.getElementById('workspace').classList.remove('hidden');
    document.getElementById('codeWelcome').classList.add('hidden');

    // Update BPM display
    document.getElementById('bpmDisplay').textContent = result.bpm || 120;

    // Set code in editor
    const code = result.strudel_code;
    document.getElementById('codeTextarea').value = code;
    updateCodeHighlight();
    updateLineNumbers();

    // Set song title
    document.getElementById('songTitle').textContent = result.title || '—';

    // Display lyrics
    displayLyrics(result.lyrics);

    // Eval and play
    await strudelEval(code);

    // Emit for other modules
    bus.emit('ai:generated', result);

  } catch (err) {
    console.error('[Generate] Error:', err);
    alert('生成失败: ' + err.message);
  }

  btn.disabled = false;
  btn.classList.remove('loading');
});

// Display lyrics in the panel
function displayLyrics(lyrics) {
  const body = document.getElementById('lyricsBody');
  if (!lyrics || lyrics.length === 0) {
    body.innerHTML = '<div class="lyrics-empty">暂无歌词</div>';
    return;
  }
  body.innerHTML = lyrics.map((line, i) =>
    `<div class="lyric-line far" data-beat="${line.beat}" data-index="${i}">${line.text}</div>`
  ).join('');
  // Store lyrics data for sync
  window._currentLyrics = lyrics;
}

// Code editor: syntax highlight + line numbers
function updateCodeHighlight() {
  const code = document.getElementById('codeTextarea').value;
  const highlighted = code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(\/\/.*)/g, '<span class="cmt">$1</span>')
    .replace(/\b(note|s|stack|slow|fast|room|delay|gain|bank|lpf|hpf|cpm|rev|n)\b/g, '<span class="kw">$1</span>')
    .replace(/"([^"]*)"/g, '"<span class="str">$1</span>"')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
  document.getElementById('codeHighlight').innerHTML = highlighted + '\n';
}

function updateLineNumbers() {
  const lines = document.getElementById('codeTextarea').value.split('\n').length;
  document.getElementById('lineNumbers').innerHTML =
    Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
}

// Sync code textarea scroll with highlight
const ta = document.getElementById('codeTextarea');
const hl = document.getElementById('codeHighlight');
ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
ta.addEventListener('input', () => { updateCodeHighlight(); updateLineNumbers(); });
```

- [ ] **Step 3: Verify full generate flow**

1. Open page, set a valid Claude API key via the pill
2. Click 🎤, hum a melody for 3-5 seconds, click 🎤 again to stop
3. Click ✦ 生成 button
4. Expected: Button shows spinner, after 2-5 seconds:
   - Workspace appears (lyrics panel + code + controls)
   - Song title appears in lyrics header
   - Lyrics lines appear in left panel (all styled as "far" for now)
   - Strudel code appears in code editor with syntax highlighting
   - Music starts playing
   - LIVE badge and loop viz animate
5. Console shows the parsed JSON response

- [ ] **Step 4: Commit**

```bash
git add /Users/moose/Downloads/vibe-origin.html
git commit -m "feat: add AI bridge with Claude API, wire generate flow end-to-end"
```

---

### Task 5: Controls — Bidirectional Sync with Code

**Files:**
- Modify: `/Users/moose/Downloads/vibe-origin.html` (add JS)

Sound chips and effect sliders modify Strudel code. Code changes update control positions.

- [ ] **Step 1: Add UIController module**

Add after AIBridge section:

```javascript
// ============================================================
// UIController — controls ↔ code bidirectional sync
// ============================================================

// Sound chips → update .s() or .bank() in code
document.getElementById('soundRow').addEventListener('click', (e) => {
  const chip = e.target.closest('.sound-chip');
  if (!chip || !isPlaying) return;

  document.querySelectorAll('.sound-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');

  const sound = chip.dataset.sound;
  let code = document.getElementById('codeTextarea').value;

  // Replace first .s("...") with new sound
  code = code.replace(/\.s\("([^"]+)"\)/, `.s("${sound}")`);
  document.getElementById('codeTextarea').value = code;
  updateCodeHighlight();

  strudelEval(code);
  bus.emit('code:changed', { type: 'sound', code });
});

// Effect sliders — click/drag on track to set value
document.querySelectorAll('.fx-track').forEach(track => {
  function setFx(e) {
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const val = Math.round(ratio * 100) / 100;

    track.querySelector('.fx-fill').style.width = (ratio * 100) + '%';
    track.parentElement.querySelector('.fx-val').textContent = '.' + String(Math.round(val * 100)).padStart(2, '0');

    const fx = track.dataset.fx;
    let code = document.getElementById('codeTextarea').value;

    // Find and replace the fx value in code
    const regex = new RegExp(`\\.${fx}\\(([\\d.]+)\\)`);
    if (regex.test(code)) {
      code = code.replace(regex, `.${fx}(${val})`);
    }
    document.getElementById('codeTextarea').value = code;
    updateCodeHighlight();

    if (isPlaying) strudelEval(code);
    bus.emit('code:changed', { type: 'fx', code });
  }

  track.addEventListener('mousedown', (e) => {
    setFx(e);
    const move = (ev) => setFx(ev);
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
});

// Code → controls sync (parse code and update UI)
function syncControlsFromCode(code) {
  // Sound
  const soundMatch = code.match(/\.s\("([^"]+)"\)/);
  if (soundMatch) {
    document.querySelectorAll('.sound-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.sound === soundMatch[1]);
    });
  }

  // Effects
  ['room', 'delay', 'gain'].forEach(fx => {
    const match = code.match(new RegExp(`\\.${fx}\\(([\\d.]+)\\)`));
    if (match) {
      const val = parseFloat(match[1]);
      const track = document.querySelector(`.fx-track[data-fx="${fx}"]`);
      if (track) {
        track.querySelector('.fx-fill').style.width = (val * 100) + '%';
        track.parentElement.querySelector('.fx-val').textContent =
          '.' + String(Math.round(val * 100)).padStart(2, '0');
      }
    }
  });

  // BPM
  const cpmMatch = code.match(/\.cpm\((\d+)\)/);
  if (cpmMatch) {
    document.getElementById('bpmDisplay').textContent = parseInt(cpmMatch[1]) * 4;
  }
}

// Cmd+Enter to eval code from editor
document.getElementById('codeTextarea').addEventListener('keydown', async (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    const code = document.getElementById('codeTextarea').value;
    await strudelEval(code);
    syncControlsFromCode(code);
    bus.emit('code:changed', { type: 'manual', code });
  }
});
```

- [ ] **Step 2: Verify bidirectional sync**

1. Generate a loop (hum → generate)
2. Click a different sound chip (e.g., "🎸 Synth")
3. Expected: Code updates `.s("piano")` → `.s("sawtooth")`, sound changes
4. Click on an effect slider track at different positions
5. Expected: Slider fill updates, code value updates, sound changes
6. Manually edit a number in the code editor, press Cmd+Enter
7. Expected: Music changes, slider positions update to match code

- [ ] **Step 3: Commit**

```bash
git add /Users/moose/Downloads/vibe-origin.html
git commit -m "feat: add bidirectional controls-code sync with sound chips and effect sliders"
```

---

### Task 6: Lyrics Sync + TTS Engine

**Files:**
- Modify: `/Users/moose/Downloads/vibe-origin.html` (add JS)

Beat-based lyric highlighting and TTS speech synthesis that plays over the loop.

- [ ] **Step 1: Add LyricsSync module**

Add after UIController section:

```javascript
// ============================================================
// LyricsSync — beat-based lyric highlighting
// ============================================================
let currentLyricIndex = -1;

bus.on('strudel:tick', ({ beat }) => {
  const lyrics = window._currentLyrics;
  if (!lyrics || lyrics.length === 0) return;

  // Find which lyric line we're on
  let activeIndex = -1;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (beat >= lyrics[i].beat) { activeIndex = i; break; }
  }

  if (activeIndex === currentLyricIndex) return;
  currentLyricIndex = activeIndex;

  // Update line styles
  const lines = document.querySelectorAll('#lyricsBody .lyric-line');
  lines.forEach((line, i) => {
    line.className = 'lyric-line';
    if (i < activeIndex - 1) line.classList.add('past');
    else if (i === activeIndex - 1) line.classList.add('prev');
    else if (i === activeIndex) line.classList.add('current');
    else if (i === activeIndex + 1) line.classList.add('next');
    else line.classList.add('far');
  });

  // Scroll current line into view
  const currentLine = lines[activeIndex];
  if (currentLine) {
    currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Update section tag
  const tag = document.getElementById('sectionTag');
  if (activeIndex >= 0) {
    tag.style.display = 'inline';
    tag.textContent = `${activeIndex + 1}/${lyrics.length}`;
  }

  // Trigger TTS
  if (activeIndex >= 0) {
    bus.emit('tts:speak', { text: lyrics[activeIndex].text, index: activeIndex });
  }
});

bus.on('strudel:stopped', () => {
  currentLyricIndex = -1;
  document.querySelectorAll('#lyricsBody .lyric-line').forEach(l => {
    l.className = 'lyric-line far';
  });
});
```

- [ ] **Step 2: Add TTSEngine module**

Add after LyricsSync section:

```javascript
// ============================================================
// TTSEngine — Web Speech API + optional ElevenLabs
// ============================================================
let ttsEngine = 'web'; // 'web' or 'elevenlabs'
let lastSpokenIndex = -1;
let ttsQueue = [];
let isSpeaking = false;

bus.on('tts:engine-changed', (engine) => { ttsEngine = engine; });

bus.on('tts:speak', ({ text, index }) => {
  // Don't repeat the same line
  if (index === lastSpokenIndex) return;
  lastSpokenIndex = index;

  if (ttsEngine === 'web') {
    speakWeb(text);
  } else if (ttsEngine === 'elevenlabs') {
    speakElevenLabs(text);
  }
});

function speakWeb(text) {
  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9; // slightly slower for singing feel
  utterance.pitch = 1.1;
  utterance.volume = 0.7; // don't overpower the loop

  // Try to find a Chinese voice
  const voices = speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.startsWith('zh'));
  if (zhVoice) utterance.voice = zhVoice;

  speechSynthesis.speak(utterance);
}

async function speakElevenLabs(text) {
  const elevenLabsKey = localStorage.getItem('vibe-origin-elevenlabs-key');
  if (!elevenLabsKey) {
    console.warn('[TTS] No ElevenLabs key, falling back to Web TTS');
    speakWeb(text);
    return;
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) throw new Error('ElevenLabs API error');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[TTS] ElevenLabs error:', err);
    speakWeb(text); // fallback
  }
}

// Manual speak button
document.getElementById('speakBtn').addEventListener('click', () => {
  const lyrics = window._currentLyrics;
  if (!lyrics) return;

  lastSpokenIndex = -1; // reset so all lines get spoken
  let i = 0;
  function speakNext() {
    if (i >= lyrics.length) return;
    const text = lyrics[i].text;
    if (ttsEngine === 'web') {
      speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'zh-CN';
      utt.rate = 0.9;
      utt.pitch = 1.1;
      utt.volume = 0.7;
      const voices = speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.startsWith('zh'));
      if (zhVoice) utt.voice = zhVoice;
      utt.onend = () => { i++; setTimeout(speakNext, 300); };
      speechSynthesis.speak(utt);
    } else {
      speakElevenLabs(text).then(() => { i++; setTimeout(speakNext, 1500); });
    }
  }
  speakNext();
});

// Preload voices (Chrome needs this)
speechSynthesis.getVoices();
speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices());

// Reset TTS on loop restart
bus.on('strudel:stopped', () => { lastSpokenIndex = -1; speechSynthesis.cancel(); });
```

- [ ] **Step 3: Verify lyrics sync + TTS**

1. Generate a loop (hum → generate)
2. While loop plays:
   - Expected: Lyrics lines cycle through styles (past → prev → current → next → far)
   - Current line has green left bar, larger font
   - Lines scroll smoothly
3. Expected: Web Speech API reads each line as it becomes current
4. Click 🔊 唱 button
5. Expected: All lyrics read sequentially
6. Click ⏹ stop → TTS stops, lyrics reset to "far" state

- [ ] **Step 4: Commit**

```bash
git add /Users/moose/Downloads/vibe-origin.html
git commit -m "feat: add beat-synced lyrics display and TTS engine (Web Speech + ElevenLabs)"
```

---

### Task 7: Re-adaptation — Code Changes Trigger Lyric Regeneration

**Files:**
- Modify: `/Users/moose/Downloads/vibe-origin.html` (add JS)

When user changes notes/rhythm in code, AI regenerates lyrics. Debounced. Manual button also works.

- [ ] **Step 1: Add re-adaptation logic**

Add after TTSEngine section:

```javascript
// ============================================================
// Re-adaptation — code changes trigger lyric regeneration
// ============================================================
let reAdaptTimer = null;
let lastCodeForLyrics = '';

// Detect if code change affects notes/rhythm (not just params)
function isNoteRhythmChange(oldCode, newCode) {
  // Extract note patterns and rhythm patterns
  const extractPatterns = (code) => {
    const notes = [...code.matchAll(/note\("([^"]+)"\)/g)].map(m => m[1]);
    const sounds = [...code.matchAll(/s\("([^"]+)"\)/g)].map(m => m[1]);
    const rhythm = [...code.matchAll(/\$:.*$/gm)].map(m => m[0]);
    return JSON.stringify({ notes, sounds, rhythm });
  };
  return extractPatterns(oldCode) !== extractPatterns(newCode);
}

bus.on('code:changed', ({ type, code }) => {
  // Only auto-trigger for manual code edits that change notes/rhythm
  if (type === 'manual' && isNoteRhythmChange(lastCodeForLyrics, code)) {
    // Debounce 2 seconds
    clearTimeout(reAdaptTimer);
    reAdaptTimer = setTimeout(() => triggerReAdapt(code), 2000);
  }
  // fx/sound changes don't trigger re-adaptation
});

async function triggerReAdapt(code) {
  if (!apiKey.value) return;

  const bpm = parseInt(document.getElementById('bpmDisplay').textContent) || 120;

  try {
    console.log('[ReAdapt] Regenerating lyrics...');
    const result = await reAdaptLyrics(code || currentCode, bpm);

    if (result.lyrics) {
      displayLyrics(result.lyrics);
      window._currentLyrics = result.lyrics;
      currentLyricIndex = -1; // reset sync
      lastSpokenIndex = -1;
    }
    if (result.title) {
      document.getElementById('songTitle').textContent = result.title;
    }

    lastCodeForLyrics = code || currentCode;
    bus.emit('ai:re-adapted', result);
    console.log('[ReAdapt] Done');
  } catch (err) {
    console.error('[ReAdapt] Error:', err);
  }
}

// Manual re-adapt button
document.getElementById('reAdaptBtn').addEventListener('click', () => {
  const code = document.getElementById('codeTextarea').value;
  triggerReAdapt(code);
});

// Copy lyrics button
document.getElementById('copyLyricsBtn').addEventListener('click', () => {
  const lyrics = window._currentLyrics;
  if (!lyrics) return;
  const text = lyrics.map(l => l.text).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyLyricsBtn');
    btn.textContent = '✓ 已复制';
    setTimeout(() => btn.textContent = '⎘ 复制歌词', 1500);
  });
});

// Track initial code for comparison
bus.on('ai:generated', (result) => {
  lastCodeForLyrics = result.strudel_code;
});
```

- [ ] **Step 2: Verify re-adaptation**

1. Generate a loop
2. In the code editor, change the note pattern (e.g., `"c3 eb3 g3 f3"` → `"a3 c4 e4 g4"`)
3. Press Cmd+Enter
4. Expected: After 2 seconds, console shows `[ReAdapt] Regenerating lyrics...` then `[ReAdapt] Done`
5. Expected: Lyrics update to match the new melody feel
6. Change only a `.gain()` value, press Cmd+Enter
7. Expected: No re-adaptation triggered (parameter-only change)
8. Click "↻ 重新适配" button
9. Expected: Lyrics regenerate immediately regardless of change type
10. Click "⎘ 复制歌词" → check clipboard has lyrics text

- [ ] **Step 3: Commit**

```bash
git add /Users/moose/Downloads/vibe-origin.html
git commit -m "feat: add lyric re-adaptation on code change with debounce and manual trigger"
```

---

### Task 8: State Management + Polish

**Files:**
- Modify: `/Users/moose/Downloads/vibe-origin.html` (add JS)

Handle UI state transitions, persist last session, error states, and final polish.

- [ ] **Step 1: Add state management and localStorage persistence**

Add at the end of the `<script>`, before the closing tag:

```javascript
// ============================================================
// State management + persistence
// ============================================================

// Restore last session from localStorage
function restoreSession() {
  const saved = localStorage.getItem('vibe-origin-session');
  if (!saved) return;

  try {
    const session = JSON.parse(saved);
    if (session.code) {
      document.getElementById('codeTextarea').value = session.code;
      updateCodeHighlight();
      updateLineNumbers();
      currentCode = session.code;
    }
    if (session.lyrics) {
      window._currentLyrics = session.lyrics;
      displayLyrics(session.lyrics);
    }
    if (session.title) {
      document.getElementById('songTitle').textContent = session.title;
    }
    if (session.bpm) {
      document.getElementById('bpmDisplay').textContent = session.bpm;
    }
    if (session.code) {
      document.getElementById('workspace').classList.remove('hidden');
      document.getElementById('codeWelcome').classList.add('hidden');
      document.getElementById('genBtn').disabled = false;
      syncControlsFromCode(session.code);
    }
  } catch (e) {
    console.warn('[Restore] Failed:', e);
  }
}

// Save session on changes
function saveSession() {
  const session = {
    code: document.getElementById('codeTextarea').value,
    lyrics: window._currentLyrics || [],
    title: document.getElementById('songTitle').textContent,
    bpm: document.getElementById('bpmDisplay').textContent,
  };
  localStorage.setItem('vibe-origin-session', JSON.stringify(session));
}

bus.on('ai:generated', () => setTimeout(saveSession, 500));
bus.on('ai:re-adapted', () => setTimeout(saveSession, 500));
bus.on('code:changed', () => setTimeout(saveSession, 1000));

// Error display
bus.on('strudel:error', (msg) => {
  console.error('[Strudel Error]', msg);
  // Brief red flash on code header
  const header = document.querySelector('.code-header');
  header.style.borderBottomColor = 'rgba(232,64,64,0.4)';
  setTimeout(() => header.style.borderBottomColor = '', 2000);
});

// Initialize
restoreSession();
console.log('[Vibe Origin] Ready.');
```

- [ ] **Step 2: Verify persistence and polish**

1. Generate a loop → close tab → reopen the HTML file
2. Expected: Previous code, lyrics, title, BPM restored. Workspace visible.
3. Click ▶ to replay the restored code
4. Expected: Music plays from the restored Strudel code
5. Type invalid code in editor, press Cmd+Enter
6. Expected: Code header flashes red briefly, error logged in console
7. Full end-to-end flow:
   - Open fresh (clear localStorage first)
   - Set API key
   - Hum a melody
   - Click generate
   - Hear loop + see lyrics + TTS reads them
   - Change sound chip → hear change + see code update
   - Drag effect slider → hear change + see code value update
   - Edit code manually → Cmd+Enter → hear change
   - Wait 2 seconds after note change → lyrics re-adapt
   - Click copy lyrics → verify clipboard
   - Close and reopen → session restored

- [ ] **Step 3: Final commit**

```bash
git add /Users/moose/Downloads/vibe-origin.html
git commit -m "feat: add session persistence, error handling, and final polish"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Hum → pitch detection → notes + BPM (Task 3)
- [x] AI generates Strudel code + lyrics with beat anchors (Task 4)
- [x] Strudel CDN load, eval, play/stop (Task 2)
- [x] Beat-based lyric highlighting (Task 6)
- [x] TTS (Web Speech + ElevenLabs) synced to beats (Task 6)
- [x] Controls ↔ code bidirectional sync (Task 5)
- [x] Code editor with syntax highlight and Cmd+Enter (Task 4)
- [x] Re-adaptation on code change with debounce (Task 7)
- [x] Manual re-adapt button (Task 7)
- [x] API key in localStorage (Task 1)
- [x] 30-second loop duration calculation (Task 4 — in prompt)
- [x] UI states: empty → humming → generating → playing → editing (Tasks 1-8)
- [x] Spotify-inspired design language (Task 1 CSS)
- [x] Loop step visualizer (Task 2)

**2. Placeholder scan:** No TBD, TODO, or vague steps found.

**3. Type consistency:**
- `bus.emit('hum:detected', { notes, strudelNotes, bpm })` — consumed in Task 4
- `bus.emit('ai:generated', result)` — consumed in Task 7 for lastCodeForLyrics
- `bus.emit('strudel:tick', { beat, totalBeats })` — consumed in Task 6
- `bus.emit('code:changed', { type, code })` — consumed in Task 7
- `bus.emit('tts:speak', { text, index })` — consumed in Task 6
- `window._currentLyrics` — set in Task 4, read in Tasks 6/7
- All consistent across tasks.
