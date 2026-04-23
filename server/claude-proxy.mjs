#!/usr/bin/env node
// Local Claude OAuth proxy for vibe-origin.html
// Spawns `claude -p --output-format json` per request, returns Anthropic-shaped JSON.
// Browser uses this when the page is loaded with ?proxy=1.

import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8787);
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MODEL = process.env.CLAUDE_MODEL || 'sonnet';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
}

function runClaude({ system, user }) {
  return new Promise((resolve, reject) => {
    // --system-prompt REPLACES Claude Code's default persona (we want raw model).
    // --disallowed-tools "*" blocks tool use so output is pure text.
    const args = ['-p', '--output-format', 'json', '--model', MODEL, '--disallowed-tools', '*'];
    if (system) args.push('--system-prompt', system);
    const proc = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '', stderr = '';
    const killer = setTimeout(() => proc.kill('SIGKILL'), 240_000);

    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', (e) => { clearTimeout(killer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(killer);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 400)}`));
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.is_error) return reject(new Error(parsed.error || 'claude returned is_error'));
        resolve({ text: parsed.result || '', usage: parsed.usage, cost: parsed.total_cost_usd });
      } catch (e) { reject(new Error(`proxy parse: ${e.message}; stdout head: ${stdout.slice(0, 200)}`)); }
    });

    proc.stdin.write(user);
    proc.stdin.end();
  });
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, bin: CLAUDE_BIN, model: MODEL }));
  }
  if (req.method !== 'POST' || req.url !== '/v1/messages') {
    res.writeHead(404); return res.end();
  }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body); }
    catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'bad json' } })); }

    const system = typeof payload.system === 'string' ? payload.system : '';
    const firstMsg = payload.messages?.[0];
    const user = typeof firstMsg?.content === 'string'
      ? firstMsg.content
      : (Array.isArray(firstMsg?.content) ? firstMsg.content.map((c) => c.text || '').join('\n') : '');
    if (!user) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'empty user message' } })); }

    const t0 = Date.now();
    console.log(`[proxy] ← ${user.length}-char prompt · system ${system.length} chars`);
    try {
      const { text, usage, cost } = await runClaude({ system, user });
      const ms = Date.now() - t0;
      console.log(`[proxy] → ${text.length}-char reply in ${ms}ms · cost $${cost ?? '?'}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: `proxy_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage,
      }));
    } catch (e) {
      console.error(`[proxy] ✗ ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'proxy_error', message: String(e.message || e) } }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`claude-proxy listening on http://localhost:${PORT}`);
  console.log(`  POST /v1/messages  →  spawns '${CLAUDE_BIN} -p --model ${MODEL}'`);
  console.log(`  GET  /healthz      →  liveness`);
  console.log(`open the html with  ?proxy=1  to route AI calls here.`);
});
