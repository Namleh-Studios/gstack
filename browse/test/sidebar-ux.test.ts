import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

describe('PTY-first sidebar architecture', () => {
  const html = read('../extension/sidepanel.html');
  const sidepanel = read('../extension/sidepanel.js');
  const terminal = read('../extension/sidepanel-terminal.js');
  const server = read('src/server.ts');
  const terminalAgent = read('src/terminal-agent.ts');

  test('terminal pane is the primary surface', () => {
    expect(html).toContain('id="tab-terminal"');
    expect(html).toContain('id="terminal-mount"');
    expect(html).toContain('id="terminal-bootstrap"');
    expect(html).toContain('id="terminal-restart-now"');
    expect(html).not.toContain('id="chat-input"');
  });

  test('old one-shot chat queue stays removed', () => {
    expect(sidepanel).not.toContain('async function sendMessage');
    expect(sidepanel).not.toContain('function pollChat');
    expect(sidepanel).not.toContain('/sidebar-chat');
    expect(sidepanel).not.toContain('/sidebar-command');
    expect(server).not.toMatch(/url\.pathname === ['"]\/sidebar-chat['"]/);
    expect(server).not.toMatch(/url\.pathname === ['"]\/sidebar-command['"]/);
  });

  test('terminal sessions use the PTY auth chain', () => {
    expect(server).toContain("url.pathname === '/pty-session'");
    expect(server).toContain('mintPtySessionToken');
    expect(server).toContain('grantPtyToken');
    expect(terminal).toContain('/pty-session');
    expect(terminal).toContain('gstack-pty.${ptySessionToken}');
    expect(terminalAgent).toContain("url.pathname === '/internal/grant'");
    expect(terminalAgent).toContain("url.pathname === '/ws'");
    expect(terminalAgent).toContain('chrome-extension://');
  });

  test('page-derived terminal injection is scan-gated', () => {
    expect(terminal).toContain('window.gstackInjectToTerminal');
    expect(terminal).toContain('window.gstackScanForPTYInject');
    expect(terminal).toContain('/pty-inject-scan');
    expect(sidepanel).toContain('gstackScanForPTYInject');
    expect(sidepanel).toContain('gstackInjectToTerminal');
  });
});

describe('sidebar activity and security UI', () => {
  const html = read('../extension/sidepanel.html');
  const sidepanel = read('../extension/sidepanel.js');
  const server = read('src/server.ts');

  test('debug activity stream uses the SSE session cookie path', () => {
    expect(sidepanel).toContain('/sse-session');
    expect(sidepanel).toContain('/activity/stream');
    expect(sidepanel).toContain("eventSource.addEventListener('activity'");
    expect(server).toContain("url.pathname === '/sse-session'");
    expect(server).toContain("url.pathname === '/activity/stream'");
    const streamHandler = server.slice(
      server.indexOf("url.pathname === '/activity/stream'"),
      server.indexOf("url.pathname === '/activity/history'"),
    );
    expect(streamHandler).toContain('extractSseCookie');
    expect(streamHandler).toContain('validateSseSessionToken');
  });

  test('security shield is driven by /health.security', () => {
    expect(html).toContain('id="security-shield"');
    expect(server).toContain('security: getSecurityStatus()');
    expect(sidepanel).toContain('function applySecurityStatus');
    expect(sidepanel).toContain('data.security');
  });

  test('security events render a dismissible banner from activity entries', () => {
    expect(sidepanel).toContain("entry.type === 'security_event'");
    expect(sidepanel).toContain('function renderSecurityNotice');
    expect(sidepanel).toContain("banner.id = 'security-banner'");
    expect(sidepanel).toContain('security-banner-expand');
    expect(sidepanel).toContain("e.key === 'Escape'");
  });
});

describe('quick actions', () => {
  const html = read('../extension/sidepanel.html');
  const sidepanel = read('../extension/sidepanel.js');
  const writeCommands = read('src/write-commands.ts');

  test('cleanup injects a vetted PTY prompt, not a removed chat command', () => {
    const cleanupFn = sidepanel.slice(
      sidepanel.indexOf('async function runCleanup'),
      sidepanel.indexOf('async function runScreenshot'),
    );
    expect(cleanupFn).toContain('$B cleanup --all');
    expect(cleanupFn).toContain('$B snapshot -i');
    expect(cleanupFn).toContain('gstackScanForPTYInject');
    expect(cleanupFn).toContain('gstackInjectToTerminal');
    expect(cleanupFn).not.toContain('/sidebar-command');
  });

  test('screenshot and cookie buttons use current browse endpoints', () => {
    expect(html).toContain('id="chat-screenshot-btn"');
    expect(html).toContain('id="chat-cookies-btn"');
    expect(sidepanel).toContain("command: 'screenshot'");
    expect(sidepanel).toContain('/cookie-picker');
  });

  test('deterministic cleanup still has broad selector coverage', () => {
    expect(writeCommands).toContain('CLEANUP_SELECTORS');
    expect(writeCommands).toContain('ADVERTISEMENT');
    expect(writeCommands).toContain('cookie');
    expect(writeCommands).toContain('overflow');
    expect(writeCommands).toContain('max-height');
  });
});

describe('browser tab state handoff', () => {
  const background = read('../extension/background.js');
  const content = read('../extension/content.js');
  const sidepanel = read('../extension/sidepanel.js');
  const terminal = read('../extension/sidepanel-terminal.js');
  const terminalAgent = read('src/terminal-agent.ts');
  const browserManager = read('src/browser-manager.ts');

  test('sidebar open signal hides the welcome arrow through the content script', () => {
    expect(sidepanel).toContain("{ type: 'sidebarOpened' }");
    expect(background).toContain("msg.type === 'sidebarOpened'");
    expect(background).toContain('chrome.tabs.sendMessage');
    expect(content).toContain("msg.type === 'sidebarOpened'");
    expect(content).toContain('gstack-extension-ready');
  });

  test('tab snapshots flow into the terminal agent instead of chat state', () => {
    expect(background).toContain("type: 'browserTabState'");
    expect(sidepanel).toContain("msg.type === 'browserTabState'");
    expect(terminal).toContain("type: 'tabState'");
    expect(terminalAgent).toContain('tabs.json');
    expect(terminalAgent).toContain('active-tab.json');
  });

  test('browser manager still tracks tab ownership and URL sync', () => {
    expect(browserManager).toContain('syncActiveTabByUrl(activeUrl: string)');
    expect(browserManager).toContain('this.pages.set(id, page)');
    expect(browserManager).toContain('this.pages.delete(id)');
    expect(browserManager).toContain('this.activeTabId = id');
  });
});

describe('connection resilience', () => {
  const sidepanel = read('../extension/sidepanel.js');
  const background = read('../extension/background.js');
  const cli = read('src/cli.ts');
  const terminalAgent = read('src/terminal-agent.ts');
  const server = read('src/server.ts');

  test('background exposes the bootstrap token to close the auth race', () => {
    const getPortHandler = background.slice(
      background.indexOf("msg.type === 'getPort'"),
      background.indexOf("msg.type === 'setPort'"),
    );
    expect(getPortHandler).toContain('token: authToken');
    expect(sidepanel).toContain('updateConnection(`http://127.0.0.1:${port}`, resp.token)');
  });

  test('startup and reconnect states stay visible', () => {
    expect(background).toContain('startupAttempts');
    expect(background).toContain('}, 1000);');
    expect(background).toContain('setInterval(checkHealth, 10000)');
    expect(sidepanel).toContain("'dead'");
    expect(sidepanel).toContain('MAX_RECONNECT_ATTEMPTS');
    expect(sidepanel).toContain('reconnectAttempts');
  });

  test('terminal agent prevents child browse autostart', () => {
    expect(cli).toContain('BROWSE_NO_AUTOSTART');
    expect(cli).toContain('/open-gstack-browser');
    expect(terminalAgent).toContain("BROWSE_NO_AUTOSTART: '1'");
    expect(terminalAgent).toContain('BROWSE_PORT: String(BROWSE_SERVER_PORT)');
  });

  test('shutdown cleans up terminal-agent state', () => {
    expect(server).toContain('terminal-agent\\\\.ts');
    expect(server).toContain('terminal-port');
    expect(server).toContain('terminal-internal-token');
  });
});
