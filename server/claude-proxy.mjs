#!/usr/bin/env node
// Local Claude proxy for vibe-origin.html
// Primary: direct POST to api.anthropic.com with OAuth bearer from ~/.claude/.credentials.json
// Fallback: spawn `claude -p --output-format json` subprocess (legacy path)
// Supports SSE streaming pass-through when client sends stream:true

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
// Prefer full path to avoid shell-alias resolution issues in sub-process env
const CLAUDE_BIN = process.env.CLAUDE_BIN || '/opt/homebrew/bin/claude';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CREDS_PATH = path.join(homedir(), '.claude', '.credentials.json');

function loadOAuthToken() {
  try {
    const raw = readFileSync(CREDS_PATH, 'utf8');
    const creds = JSON.parse(raw);
    const oauth = creds?.claudeAiOauth || creds?.oauth || creds;
    const token = oauth?.accessToken || oauth?.access_token;
    return token || null;
  } catch { return null; }
}

let cachedToken = loadOAuthToken();
let authMode = cachedToken ? 'direct-api' : 'cli-fallback';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
}

async function directApi({ body, streaming, res }) {
  const upstream = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cachedToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ ...body, model: body.model || MODEL }),
  });
  if (!upstream.ok) {
    const errText = await upstream.text();
    throw new Error(`anthropic ${upstream.status}: ${errText.slice(0, 300)}`);
  }
  if (streaming) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } else {
    const text = await upstream.text();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(text);
  }
}

function cliFallback({ body, streaming, res }) {
  return new Promise((resolve, reject) => {
    const system = typeof body.system === 'string' ? body.system : '';
    const userMsg = body.messages?.[0]?.content || '';
    const user = typeof userMsg === 'string' ? userMsg : userMsg.map((c) => c.text || '').join('\n');
    // Use --output-format text to get clean model reply without Claude Code boilerplate.
    // Spawn from /tmp to avoid loading project CLAUDE.md / memories.
    // --no-session-persistence avoids writing session files.
    // --dangerously-skip-permissions prevents interactive permission prompts from hanging.
    const args = ['-p', '--output-format', 'text', '--model', MODEL, '--disallowed-tools', '*',
      '--no-session-persistence', '--dangerously-skip-permissions'];
    if (system) args.push('--system-prompt', system);
    const proc = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: '/tmp' });
    let stdout = '', stderr = '';
    const killer = setTimeout(() => proc.kill('SIGKILL'), 60_000); // 60s hard ceiling
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', (e) => { clearTimeout(killer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(killer);
      if (code !== 0 && code !== null) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      if (code === null) return reject(new Error(`claude killed by signal: ${stderr.slice(0, 300)}`));
      const text = stdout.trim();
      const msgId = `cli_${Date.now()}`;
      if (streaming) {
        // Emit synthetic SSE stream mimicking Anthropic's streaming format
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        const write = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        write('message_start', { type: 'message_start', message: { id: msgId, type: 'message', role: 'assistant', model: MODEL, content: [], usage: { input_tokens: 0, output_tokens: 0 } } });
        write('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        write('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
        write('content_block_stop', { type: 'content_block_stop', index: 0 });
        write('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } });
        write('message_stop', { type: 'message_stop' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          id: msgId, type: 'message', role: 'assistant', model: MODEL,
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
        }));
      }
      resolve();
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
    return res.end(JSON.stringify({
      ok: true, mode: authMode, authSource: cachedToken ? 'oauth-file' : 'cli', model: MODEL,
    }));
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
    const streaming = payload.stream === true;
    const t0 = Date.now();
    try {
      if (cachedToken) {
        try {
          await directApi({ body: payload, streaming, res });
          console.log(`[proxy] direct ${streaming ? 'stream' : 'sync'} ${Date.now() - t0}ms`);
          return;
        } catch (e) {
          console.warn(`[proxy] direct failed (${e.message}); falling back to CLI`);
          if (String(e.message).includes('401')) { cachedToken = null; authMode = 'cli-fallback'; }
        }
      }
      await cliFallback({ body: payload, streaming, res });
      console.log(`[proxy] cli ${Date.now() - t0}ms`);
    } catch (e) {
      console.error(`[proxy] ✗ ${e.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { type: 'proxy_error', message: String(e.message || e) } }));
      } else { res.end(); }
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`claude-proxy listening on http://localhost:${PORT}`);
  console.log(`  mode: ${authMode} (${cachedToken ? 'oauth-file' : 'cli fallback'})`);
  console.log(`  model: ${MODEL}`);
});
