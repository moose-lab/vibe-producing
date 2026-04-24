import { test, expect } from '@playwright/test';

// These tests assume the proxy is running on :8787 (npm run proxy)
const PROXY = 'http://localhost:8787';

test('healthz reports mode + authSource', async ({ request }) => {
  const res = await request.get(`${PROXY}/healthz`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(['direct-api', 'cli-fallback']).toContain(body.mode);
  expect(['oauth-file', 'cli']).toContain(body.authSource);
});

test('non-streaming roundtrip returns Anthropic-shaped body', async ({ request }) => {
  const res = await request.post(`${PROXY}/v1/messages`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      system: 'Reply with exactly: {"ok":true}',
      messages: [{ role: 'user', content: 'go' }],
      max_tokens: 50,
    },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.content?.[0]?.type).toBe('text');
  expect(body.content[0].text).toContain('"ok"');
});

test('streaming roundtrip emits SSE events', async ({ request }) => {
  const res = await request.post(`${PROXY}/v1/messages`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      stream: true,
      system: 'Reply with: hi',
      messages: [{ role: 'user', content: 'go' }],
      max_tokens: 20,
    },
  });
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('text/event-stream');
  const bodyText = await res.text();
  expect(bodyText).toContain('event:');
  expect(bodyText).toContain('data:');
});
