/**
 * Sidebar security contract tests for the PTY-backed terminal surface.
 *
 * The old sidebar-agent chat queue is gone. These tests keep the remaining
 * browser-extension -> local-daemon -> terminal-agent trust boundary pinned.
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/server.ts'),
  'utf-8',
);

const TERMINAL_AGENT_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/terminal-agent.ts'),
  'utf-8',
);

const PTY_COOKIE_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/pty-session-cookie.ts'),
  'utf-8',
);

const SIDEPANEL_TERMINAL_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../../extension/sidepanel-terminal.js'),
  'utf-8',
);

describe('Sidebar PTY security boundary', () => {
  test('legacy sidebar-agent HTTP routes stay removed', () => {
    expect(SERVER_SRC).toContain('Sidebar chat endpoints ripped');
    expect(SERVER_SRC).not.toMatch(/url\.pathname\.startsWith\(['"]\/sidebar-agent\//);
    expect(SERVER_SRC).not.toMatch(/url\.pathname === ['"]\/sidebar-agent\/event['"]/);
    expect(SERVER_SRC).not.toMatch(/url\.pathname === ['"]\/sidebar-command['"]/);
    expect(SERVER_SRC).not.toMatch(/url\.pathname === ['"]\/sidebar-chat['"]/);
  });

  test('/health exposes security state and terminal port, not PTY credentials', () => {
    const healthBlock = SERVER_SRC.split("url.pathname === '/health'")[1]?.split('// ─── /pty-session')[0] ?? '';
    expect(healthBlock).toContain('security: getSecurityStatus()');
    expect(healthBlock).toContain('terminalPort: readTerminalPort()');
    expect(healthBlock).not.toContain('ptySessionToken');
    expect(healthBlock).not.toContain('buildPtySetCookie');
  });

  test('/pty-session requires root auth and grants the token over loopback', () => {
    const ptyBlock = SERVER_SRC.split("url.pathname === '/pty-session'")[1]?.split('// ─── /pty-inject-scan')[0] ?? '';
    expect(ptyBlock).toContain('validateAuth(req)');
    expect(ptyBlock).toContain('mintPtySessionToken()');
    expect(ptyBlock).toContain('grantPtyToken(minted.token)');
    expect(ptyBlock).toContain('revokePtySessionToken(minted.token)');
    expect(ptyBlock).toContain('Set-Cookie');
    expect(ptyBlock).toContain('buildPtySetCookie(minted.token)');
  });

  test('PTY cookies are HttpOnly, SameSite strict, bounded, and revocable', () => {
    expect(PTY_COOKIE_SRC).toContain('const TTL_MS = 30 * 60 * 1000');
    expect(PTY_COOKIE_SRC).toContain('const MAX_SESSIONS = 10_000');
    expect(PTY_COOKIE_SRC).toContain('HttpOnly; SameSite=Strict; Path=/; Max-Age=');
    expect(PTY_COOKIE_SRC).toContain('revokePtySessionToken');
    expect(PTY_COOKIE_SRC).toContain('sessions.delete(token)');
  });

  test('terminal-agent WebSocket requires extension origin and granted token', () => {
    const wsBlock = TERMINAL_AGENT_SRC.split("if (url.pathname === '/ws')")[1]?.split("return new Response('not found'")[0] ?? '';
    expect(wsBlock).toContain("origin.startsWith('chrome-extension://')");
    expect(wsBlock).toContain('EXTENSION_ID');
    expect(wsBlock).toContain('sec-websocket-protocol');
    expect(wsBlock).toContain("raw.startsWith('gstack-pty.')");
    expect(wsBlock).toContain('validTokens.has(candidate)');
    expect(wsBlock).toContain("return new Response('unauthorized', { status: 401 })");
  });

  test('page-derived PTY injection path scans before terminal write', () => {
    expect(SIDEPANEL_TERMINAL_SRC).toContain('window.gstackScanForPTYInject');
    expect(SIDEPANEL_TERMINAL_SRC).toContain('/pty-inject-scan');
    expect(SIDEPANEL_TERMINAL_SRC).toContain("'Authorization': `Bearer ${await getAuthTokenForScan()}`");
    expect(SIDEPANEL_TERMINAL_SRC).toContain('const token = body.token || body.AUTH_TOKEN || body.authToken ||');
    expect(SIDEPANEL_TERMINAL_SRC).toContain("verdict: 'WARN'");
    expect(SIDEPANEL_TERMINAL_SRC).toContain('scan-unreachable');
  });

  test('/pty-inject-scan authenticates, caps payloads, and blocks known exfil URLs', () => {
    const scanBlock = SERVER_SRC.split("url.pathname === '/pty-inject-scan'")[1]?.split('// ─── /connect')[0] ?? '';
    expect(scanBlock).toContain('validateAuth(req)');
    expect(scanBlock).toContain('contentLength > 64 * 1024');
    expect(scanBlock).toContain('payload-too-large');
    expect(scanBlock).toMatch(/bit\\.ly\|\\btinyurl\\.com\|\\bdiscord\\.gg/);
    expect(scanBlock).toContain("reasons.push('url-blocklist')");
    expect(scanBlock).toContain('scanWithSidecar(text');
    expect(scanBlock).toContain("reasons.push('l4-unavailable')");
  });
});
