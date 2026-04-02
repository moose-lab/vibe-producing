# Vibe Origin

**你脑子里有音乐，只是一直没有出口。**

Vibe Origin 是一个浏览器端的 AI 音乐创作原型。你哼一段旋律，它实时生成 loop + 歌词，你能听、能看、能调。

## 工作流程

```
你哼一段旋律
    → Strudel 生成器乐骨架，浏览器里实时跑
    → AI 同步生成配套歌词，显示在屏幕上
    → TTS 把歌词"唱"出来，压在 loop 上
    → 你实时改代码/调旋钮，音乐跟着变，歌词自动重新适配
```

## 快速开始

1. 用浏览器打开 `vibe-origin.html`（推荐 Chrome）
2. 点右上角设置 Claude API Key
3. 点 🎤 哼一段旋律（3~10 秒），再点一次停止
4. 点 **✦ 生成** — 等几秒，loop 开始跑，歌词同步出现
5. 用右边的旋钮调音色/效果，或者直接改 Strudel 代码（⌘Enter 执行）

## 功能

- **哼唱识别** — YIN 算法实时检测音高，提取音符序列和 BPM
- **AI 一键生成** — Claude API 同时返回 Strudel loop 代码和带 beat 锚点的歌词
- **Strudel 实时播放** — 浏览器内 live-coding 音乐引擎，约 30 秒 loop
- **歌词同步** — 逐行卡拉 OK 高亮，跟随 loop 节拍滚动
- **TTS 人声** — Web Speech API（默认）或 ElevenLabs，歌词压在 loop 上播放
- **旋钮控制** — 音色切换、Reverb/Delay/Gain 滑块，改旋钮 = 改代码
- **代码编辑器** — 语法高亮，⌘Enter 热更新，改音符 → 歌词自动重新适配
- **会话持久化** — 代码、歌词、设置存在 localStorage，刷新不丢

## 技术栈

```
单文件 HTML，零构建，浏览器直接打开

├─ Strudel        — esm.sh CDN (live-coding 音乐引擎)
├─ Pitch Detect   — YIN 算法 (Web Audio API)
├─ AI             — Claude API (前端直连)
├─ TTS            — Web Speech API / ElevenLabs
├─ UI             — 原生 HTML + CSS (Spotify 暗色风格)
├─ Code Editor    — textarea + pre overlay 语法高亮
├─ State          — EventBus 发布/订阅
└─ Storage        — localStorage
```

## 架构

5 个 JS 模块通过 EventBus 通信，互不直接引用：

| 模块 | 职责 |
|------|------|
| PitchDetect | 麦克风 → YIN 算法 → 音符 + BPM |
| AIBridge | 音符 + 风格 → Claude API → Strudel 代码 + 歌词 |
| StrudelEngine | eval 代码 → Web Audio 播放 → 广播 beat |
| LyricsSync | 监听 beat → 高亮当前歌词行 → 触发 TTS |
| TTSEngine | Web Speech / ElevenLabs → 音频混入 loop |

## 需要

- 现代浏览器（Chrome 推荐）
- 麦克风权限
- Claude API Key（[console.anthropic.com](https://console.anthropic.com)）
- （可选）ElevenLabs API Key 获得更好的 TTS 音质

## 项目结构

```
├── vibe-origin.html                          # 完整应用（单文件）
├── docs/superpowers/specs/                   # 设计文档
│   └── 2026-04-03-vibe-origin-design.md
├── docs/superpowers/plans/                   # 实施计划
│   └── 2026-04-03-vibe-origin-plan.md
└── README.md
```

## License

MIT
