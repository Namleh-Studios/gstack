/**
 * Regression coverage for the removed one-shot sidebar chat queue.
 *
 * The server intentionally ripped out /sidebar-command, /sidebar-chat,
 * /sidebar-session, and /sidebar-agent/* when the extension moved to the
 * interactive PTY terminal. Keep a live HTTP test so those old command surfaces
 * do not silently reappear.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let serverProc: Subprocess | null = null;
let serverPort = 0;
let authToken = '';
let tmpDir = '';
let stateFile = '';

async function api(pathname: string, opts: RequestInit & { noAuth?: boolean } = {}): Promise<Response> {
  const { noAuth, ...fetchOpts } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOpts.headers as Record<string, string> || {}),
  };
  if (!noAuth && !headers.Authorization && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return fetch(`http://127.0.0.1:${serverPort}${pathname}`, { ...fetchOpts, headers });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidebar-removed-'));
  stateFile = path.join(tmpDir, 'browse.json');

  const serverScript = path.resolve(__dirname, '..', 'src', 'server.ts');
  serverProc = spawn(['bun', 'run', serverScript], {
    env: {
      ...process.env,
      BROWSE_STATE_FILE: stateFile,
      BROWSE_HEADLESS_SKIP: '1',
      BROWSE_PORT: '0',
      BROWSE_IDLE_TIMEOUT: '300',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        if (state.port && state.token) {
          serverPort = state.port;
          authToken = state.token;
          break;
        }
      } catch {
        // Keep waiting until the state file is fully written.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!serverPort) throw new Error('Server did not start in time');
}, 20_000);

afterAll(() => {
  if (serverProc) {
    try { serverProc.kill(); } catch {}
  }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe('removed sidebar chat queue endpoints', () => {
  const removedRoutes: Array<{ path: string; method: string; body?: unknown }> = [
    { path: '/sidebar-command', method: 'POST', body: { message: 'hello' } },
    { path: '/sidebar-chat?after=0', method: 'GET' },
    { path: '/sidebar-chat/clear', method: 'POST' },
    { path: '/sidebar-agent/event', method: 'POST', body: { type: 'text', text: 'hello' } },
    { path: '/sidebar-agent/kill', method: 'POST' },
    { path: '/sidebar-session', method: 'GET' },
    { path: '/sidebar-session/new', method: 'POST' },
    { path: '/sidebar-tabs', method: 'GET' },
  ];

  for (const route of removedRoutes) {
    test(`${route.method} ${route.path} is gone`, async () => {
      const resp = await api(route.path, {
        method: route.method,
        body: route.body === undefined ? undefined : JSON.stringify(route.body),
      });
      expect(resp.status).toBe(404);
    });
  }

  test('/pty-session is the replacement auth surface', async () => {
    const unauth = await api('/pty-session', { method: 'POST', noAuth: true });
    expect(unauth.status).toBe(401);

    const authed = await api('/pty-session', { method: 'POST' });
    expect([200, 503]).toContain(authed.status);
    const data = await authed.json();
    if (authed.status === 200) {
      expect(typeof data.ptySessionToken).toBe('string');
    } else {
      expect(data.error).toBe('terminal-agent not ready');
    }
  });
});
