/**
 * Source-level contract tests for security paths that are not exported.
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/server.ts'),
  'utf-8',
);

const SECURITY_SIDECAR_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/security-sidecar-entry.ts'),
  'utf-8',
);

const SECURITY_SIDECAR_CLIENT_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/security-sidecar-client.ts'),
  'utf-8',
);

const DOMAIN_SKILLS_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/domain-skills.ts'),
  'utf-8',
);

const DOMAIN_SKILL_COMMANDS_SRC = fs.readFileSync(
  path.join(import.meta.dir, '../src/domain-skill-commands.ts'),
  'utf-8',
);

describe('security sidecar protocol', () => {
  test('sidecar handles ping, status, and scan-page-content requests', () => {
    expect(SECURITY_SIDECAR_SRC).toContain('op: "scan-page-content" | "ping" | "status"');
    expect(SECURITY_SIDECAR_SRC).toContain('if (req.op === "ping")');
    expect(SECURITY_SIDECAR_SRC).toContain('if (req.op === "status")');
    expect(SECURITY_SIDECAR_SRC).toContain('if (req.op === "scan-page-content")');
    expect(SECURITY_SIDECAR_SRC).toContain('await loadTestsavant()');
    expect(SECURITY_SIDECAR_SRC).toContain('const verdict = await scanPageContent(req.text)');
  });

  test('sidecar client uses id-correlated NDJSON with timeout protection', () => {
    expect(SECURITY_SIDECAR_CLIENT_SRC).toContain('const id = String(s.nextId++)');
    expect(SECURITY_SIDECAR_CLIENT_SRC).toContain('JSON.stringify({ id, op: "scan-page-content", text }) +');
    expect(SECURITY_SIDECAR_CLIENT_SRC).toContain('pending.set(id');
    expect(SECURITY_SIDECAR_CLIENT_SRC).toContain('setTimeout');
    expect(SECURITY_SIDECAR_CLIENT_SRC).toContain('scan-page-content');
    expect(SECURITY_SIDECAR_CLIENT_SRC).toContain('isSidecarAvailable');
  });
});

describe('PTY injection scanner', () => {
  test('server route runs local filters before returning a PTY verdict', () => {
    const block = SERVER_SRC.split("url.pathname === '/pty-inject-scan'")[1]?.split('// ─── /connect')[0] ?? '';
    expect(block).toContain('validateAuth(req)');
    expect(block).toContain('const text = typeof body.text ===');
    expect(block).toContain("verdict = 'BLOCK'");
    expect(block).toContain("reasons.push('url-blocklist')");
    expect(block).toContain('scanWithSidecar(text');
    expect(block).toContain("reasons.push('l4-unsafe')");
    expect(block).toContain("reasons.push('l4-suspicious')");
  });

  test('route degrades sidecar absence or failure to WARN, not silent PASS', () => {
    const block = SERVER_SRC.split("url.pathname === '/pty-inject-scan'")[1]?.split('// ─── /connect')[0] ?? '';
    expect(block).toContain("verdict = 'WARN'");
    expect(block).toContain("reasons.push('l4-unavailable')");
    expect(block).toContain('l4-unavailable:${sidecarAvail.reason');
  });
});

describe('domain-skill ingress guard', () => {
  test('save derives host from active tab and runs L1-L3 content filters', () => {
    const saveBlock = DOMAIN_SKILL_COMMANDS_SRC
      .split('async function handleSave')[1]
      ?.split('async function handleList')[0] ?? '';
    expect(saveBlock).toContain('deriveHostFromActiveTab(page)');
    expect(saveBlock).toContain('runContentFilters(body');
    expect(saveBlock).toContain('filterResult.blocked');
    expect(saveBlock).not.toContain('host = args[0]');
  });

  test('domain skills stay quarantined until repeated clean use', () => {
    expect(DOMAIN_SKILLS_SRC).toContain("state: 'quarantined'");
    expect(DOMAIN_SKILLS_SRC).toContain('use_count');
    expect(DOMAIN_SKILLS_SRC).toContain('flag_count');
  });
});
