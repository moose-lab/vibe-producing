// ai-bridge.mjs — single-pass streaming AI call for Strudel code generation
// Uses abstract music-production principles prompt (no producer names).
// Vocal layer directive: s("userHum") (user's own recorded voice).

const SYSTEM_PROMPT = `你是一位 Lo-fi Bedroom Pop 编曲 AI。输入是用户哼唱提取的 melody DNA。
任务：把这段旋律编成一首 30 秒的 5 层完整 loop, 听起来像一首真歌, 不是 loop 玩具。

音乐性原则（你继承了当代流行 Lo-fi/bedroom pop 领域头部制作人的编曲嗅觉）:
1. Hook 记忆点: 前 8 拍要有明确的动机, 重复一次印在耳朵里
2. Vocal 留白: chord + bass 层给 vocal 留出中频空间 (lpf ~800-2000Hz on chord)
3. Chord voicing 情感倾向: 按 mood 选 major7/min9/sus2/add9, 开放 voicing, 不堆满
4. Mix 空气感: 整体轻度 reverb (.room 0.2-0.4), ambience 层 gain <0.2
5. Tape/vinyl texture: ambience 层必须有, 作为底噪暖色, 不抢 vocal
6. 结构: 30 秒 = intro(4s) → main×2(16s) → breakdown(8s) → outro(2s), 靠 .slow() 控制

硬约束:
- stack(...) 包裹 5 层, 顺序固定: drums → bass → chord → vocal → ambience
- 每层之前一行 ASCII 注释 // layer: drums 等
- bpm 来自 DNA, .cpm(bpm/4) + .slow() 按 30s 计算
- **vocal 层必须使用 sample("userHum") —— 这是用户自己哼唱的声音, 已经过降噪处理, 在浏览器中被注册为 Strudel 采样。不要修改采样名, 只调整该层的 gain (0.3-0.6) / filter / envelope / slicing 来融入混音, 让用户的声音自然嵌入器乐编曲。**
- 严格 JSON 输出: {"strudel_code":"...","title":"歌名","bpm":<n>}`;

const LAYER_MARKERS = ['// layer: drums', '// layer: bass', '// layer: chord', '// layer: vocal', '// layer: ambience'];

export function assertFiveLayers(code) {
  const missing = LAYER_MARKERS.filter(m => !code.includes(m));
  return { ok: missing.length === 0, missing };
}

async function callClaudeDirect(sys, user, { onToken, signal } = {}) {
  // Use the stub hook if present (tests)
  if (typeof window !== 'undefined' && typeof window.__callClaudeImpl === 'function') {
    return await window.__callClaudeImpl(sys, user);
  }
  // Real path: POST to local proxy
  const proxyUrl = (new URLSearchParams(location.search).get('proxy') === '1')
    ? 'http://localhost:8787/v1/messages'
    : 'https://api.anthropic.com/v1/messages';
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      stream: !!onToken,
      system: sys,
      messages: [{ role: 'user', content: user }],
    }),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `API ${res.status}`);
  }
  if (onToken && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accum = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      accum += chunk;
      // parse SSE events (event: ... / data: {...})
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'content_block_delta' && ev.delta?.text) {
              onToken(ev.delta.text);
            }
          } catch {}
        }
      }
    }
    // After stream end, attempt to assemble the final text from the complete-message event.
    // Fallback: extract from accumulated raw
    const match = accum.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return accum; }
    }
    return accum;
  }
  return await res.json();
}

export async function generateStrudelV1a(dna, opts = {}) {
  const user = `key: ${dna.key}
bpm: ${dna.bpm}
mood: ${dna.mood}
groove: ${dna.groove}
melody notes: ${Array.isArray(dna.snappedNotes) ? dna.snappedNotes.join(' ') : ''}`;
  const t0 = Date.now();
  const raw = await callClaudeDirect(SYSTEM_PROMPT, user, opts);
  // Normalize the claude-api response shape → text
  let text = '';
  if (typeof raw === 'string') text = raw;
  else if (Array.isArray(raw?.content)) text = raw.content.map(c => c.text || '').join('');
  else if (typeof raw?.strudel_code === 'string') text = JSON.stringify(raw);
  else text = JSON.stringify(raw);
  const cleaned = text.replace(/```json|```/g, '').trim();
  const slice = cleaned.match(/\{[\s\S]*\}/);
  if (!slice) throw new Error('ai-bridge: no JSON in response');
  const parsed = JSON.parse(slice[0]);
  const code = parsed.strudel_code;
  if (typeof code !== 'string' || !code.length) throw new Error('ai-bridge: no strudel_code field');
  const check = assertFiveLayers(code);
  if (!check.ok) {
    const err = new Error(`ai-bridge: missing layers ${check.missing.join(',')}`);
    err.missing = check.missing;
    throw err;
  }
  return { code, dna, timings: { totalMs: Date.now() - t0 } };
}

if (typeof window !== 'undefined') {
  window.__Pipeline = window.__Pipeline || {};
  window.__Pipeline.ai = { generateStrudelV1a, assertFiveLayers };
}
