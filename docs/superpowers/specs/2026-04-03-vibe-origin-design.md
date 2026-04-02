# Vibe Origin — 设计文档

## 概述

一个能在浏览器里跑的单 HTML 文件原型。你哼一段旋律，Strudel 生成器乐骨架实时跑，AI 同步生成配套歌词显示在屏幕上，TTS 把歌词"唱"出来压在 loop 上。你实时改代码，音乐跟着变，歌词跟着重新适配。

**输出文件：** `/Users/moose/Downloads/vibe-origin.html`

## 核心流程

```
你哼一段旋律
     ↓
pitch detection (YIN 算法) → 音符序列 + BPM 估算
     ↓
AI 一次调用同时返回：
├─ Strudel loop 代码（约 30 秒，含旋律/鼓组/低音）
└─ 配套歌词（6~8 行，每行带 beat 入点）
     ↓                    ↓
Strudel eval → loop 跑起来   歌词显示在左栏
     ↓                    ↓
     ←── TTS 按 beat 踩点唱歌词，混入 loop 音频 ──→
     ↓
你改代码/调旋钮 → loop 热更新
     ↓
改了音符/节奏 → 触发 AI 重新适配歌词（debounce 2 秒）
改了音色/效果 → 只更新 Strudel 参数，不触发歌词适配
```

## 模块架构

5 个模块通过 EventBus（发布/订阅）通信，互不直接引用。

```
┌─────────────────────────────────────────────┐
│              EventBus (发布/订阅)              │
└──┬───────┬────────┬────────┬────────┬───────┘
   ↓       ↓        ↓        ↓        ↓
PitchDetect AIBridge StrudelEngine LyricsSync TTSEngine
```

### PitchDetect
- **输入：** 麦克风音频流 (getUserMedia)
- **输出：** `hum:detected { notes: ["C4","Eb4","G4"], bpm: 95 }`
- **实现：** Web Audio API + YIN 算法（autocorrelation 改进版），纯 JS ~80 行
- 实时显示检测到的音符在 pitch display 区域

### AIBridge
- **输入：** 音符序列 + BPM + 风格 + 文字描述(可选)
- **输出：** `ai:generated { strudelCode, lyrics: [{beat, text}], bpm }`
- **实现：** fetch → api.anthropic.com/v1/messages，前端直连，API key 存 localStorage
- 生成 prompt 包含音符、BPM、风格，要求返回 Strudel 代码 + 带 beat 锚点的歌词
- 重新适配时只发送当前 Strudel 代码，只要求返回新的 lyrics 数组

### StrudelEngine
- **输入：** Strudel mini-notation 代码字符串
- **输出：** Web Audio 播放 + `strudel:tick(currentBeat)` 事件
- **实现：** @strudel/core + @strudel/mini + @strudel/webaudio，通过 esm.sh CDN 加载
- eval 代码启动 loop，暴露 currentBeat 给 LyricsSync 和 TTSEngine
- 旋钮/滑块变化时直接修改代码中的对应参数并重新 eval

### LyricsSync
- **输入：** 歌词数组 [{beat, text}] + strudel:tick(currentBeat)
- **输出：** UI 渲染（当前行高亮，前后行渐隐）+ `tts:speak(text)` 触发
- **实现：** 监听 currentBeat，到达某行的 beat 锚点时高亮该行并触发 TTS

### TTSEngine
- **输入：** `tts:speak(text)` 事件
- **输出：** AudioNode 接入主 AudioContext
- **实现：**
  - 默认：Web Speech API (SpeechSynthesis)，零配置即用
  - 可选：ElevenLabs API（用户填 API key 后解锁），音频缓存避免重复调用
- TTS 音频接入 Strudel 的同一个 AudioContext，混合输出

### EventBus
- 自写发布/订阅，约 20 行
- 事件列表：
  - `hum:detected` — 哼唱音符检测结果
  - `ai:generated` — AI 返回 Strudel 代码 + 歌词
  - `ai:re-adapted` — AI 歌词重新适配结果
  - `strudel:play` / `strudel:stop` — 播放控制
  - `strudel:tick(currentBeat)` — 每 beat 广播
  - `code:changed` — 用户修改了代码/旋钮
  - `lyrics:highlight(index)` — 高亮某行歌词
  - `tts:speak(text)` — 触发 TTS 朗读

## UI 设计

### 设计语言
- Spotify 暗色纪律 × Udio AI 光效 × GarageBand 亲和力
- 色板：`#060608` 深底 + `#1ed760` 荧光绿主色 + `#ff6b2b` 橙(代码字符串) + `#a855f7` 紫(人声区)
- 字体：Outfit（UI）+ Noto Serif SC（歌词）+ JetBrains Mono（代码）
- 大圆角 12px，pill 形控件，backdrop-blur 毛玻璃

### 布局（左右分栏 DAW 风格）

```
┌─ 顶栏：Logo + API key pill ─────────────────────────────┐
├─ 输入区：[🎤 麦克风] [音符显示] [文字补充] ──────────────┤
│          [风格 chips]                    [✦ 生成]       │
├─────────────────┬───────────────────────────────────────┤
│  左栏：歌词      │  右栏：控件 + 代码                     │
│  (260px 窄栏)    │  ┌ Transport: ▶ ⏹ BPM ──────────┐  │
│                  │  ├ 控件条: 音色|效果|人声 ──────────┤  │
│  歌名            │  ├ ─────────────────────────────── ┤  │
│  段落标签         │  │                                 │  │
│  歌词逐行高亮     │  │    Strudel 代码编辑器（主角）     │  │
│                  │  │    行号 + 语法高亮 + LIVE 标记    │  │
│  哼唱→歌词映射    │  │                                 │  │
│                  │  │    底部：Loop 步进可视化           │  │
│  [重新适配][复制]  │  └─────────────────────────────────┘  │
└─────────────────┴───────────────────────────────────────┘
```

### 界面状态

| 状态 | 表现 |
|------|------|
| 空白态 | 输入区可见，工作站隐藏 |
| 哼唱中 | 麦克风脉冲动画，音符实时出现 |
| 生成中 | loading 动画，2~5 秒 |
| 播放态 | Loop 跑，歌词滚动，TTS 在唱 |
| 编辑态 | 与播放态同时 — 改旋钮/代码，loop 热更新 |

### 控件与代码双向同步
- 拖 Reverb 滑块 → 代码里 `.room(0.5)` 变 `.room(0.7)`
- 点音色卡片 → 代码里 `.s("piano")` 变 `.s("sawtooth")`
- 直接改代码 → 旋钮位置更新
- 小白操作旋钮 = 改代码，只是不用打字

## Loop 时长计算

```
Loop 时长 = cycle 数 × (60 / BPM × 4)

目标 ≈ 30 秒 → AI 根据 BPM 计算所需 cycle 数
例：BPM 95 → 每 cycle 2.53 秒 → 需要 ~12 cycles → .slow(12)
```

AI prompt 约束："总时长约 30 秒，用 .slow() 控制 cycle 数"。

## 歌词与 Loop 同步（beat 锚点）

AI 返回歌词时每行带 beat 编号：

```json
[
  { "beat": 1,  "text": "深夜的霓虹灯" },
  { "beat": 9,  "text": "倒映在雨水里" },
  { "beat": 17, "text": "我走过空荡的街" },
  { "beat": 25, "text": "像一首没写完的诗" },
  { "beat": 33, "text": "城市在呼吸 我在沉默" },
  { "beat": 41, "text": "路灯拉长了影子" }
]
```

- beat 与 Strudel cycle 天然对齐
- Strudel 提供 currentCycle → 换算 beat → 精确触发 TTS
- TTS 预加载：提前 0.5 秒触发，或一次性预合成所有行缓存

## 技术栈

```
单文件 HTML，零构建，浏览器直接打开

├─ Strudel      — esm.sh CDN (@strudel/core, @strudel/mini, @strudel/webaudio)
├─ Pitch Detect — 手写 YIN 算法，~80 行 JS
├─ AI           — fetch → api.anthropic.com/v1/messages
├─ TTS          — Web Speech API (默认) / ElevenLabs API (可选)
├─ UI           — 原生 HTML + CSS，无框架
├─ 代码编辑器    — contenteditable div + 手写语法高亮
├─ 状态管理      — EventBus (自写发布/订阅，~20 行)
└─ 存储         — localStorage (API key、上次的作品)
```

外部依赖只有 Strudel CDN，其余全部手写。

## 改代码触发歌词重新适配的规则

- 改旋钮/滑块（音色、效果值）→ 只更新 Strudel 参数，**不触发**
- 改代码中的音符/节奏 → debounce 2 秒后**触发** AI 重新适配歌词
- 手动点"重新适配"按钮 → **强制触发**
