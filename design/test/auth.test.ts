/**
 * Tests for $D OpenAI auth source reporting (#1278, closes #1248).
 *
 * Verifies that resolveApiKey + requireApiKey:
 *   - prefer ~/.gstack/openai.json over OPENAI_API_KEY
 *   - report when the env-var key matches a cwd .env / .env.local
 *   - never echo the key itself to stderr (only the source label)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  describeApiKeySource,
  requireApiKey,
  resolveApiKey,
  resolveApiKeyInfo,
  saveApiKey,
  isNamlehProfile,
} from "../src/auth";

let tmpDir: string;
let tmpHome: string;
let originalHome: string | undefined;
let originalKey: string | undefined;
let originalGstackHome: string | undefined;
let originalNamlehProfile: string | undefined;
let originalNodeEnv: string | undefined;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gstack-design-auth-"));
  tmpHome = path.join(tmpDir, "home");
  fs.mkdirSync(tmpHome, { recursive: true });

  originalHome = process.env.HOME;
  originalKey = process.env.OPENAI_API_KEY;
  originalGstackHome = process.env.GSTACK_HOME;
  originalNamlehProfile = process.env.GSTACK_NAMLEH_PROFILE;
  originalNodeEnv = process.env.NODE_ENV;
  originalCwd = process.cwd();

  process.env.HOME = tmpHome;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GSTACK_HOME;
  delete process.env.GSTACK_NAMLEH_PROFILE;
  delete process.env.NODE_ENV;
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalGstackHome === undefined) delete process.env.GSTACK_HOME;
  else process.env.GSTACK_HOME = originalGstackHome;
  if (originalNamlehProfile === undefined) delete process.env.GSTACK_NAMLEH_PROFILE;
  else process.env.GSTACK_NAMLEH_PROFILE = originalNamlehProfile;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveApiKeyInfo", () => {
  test("uses ~/.gstack/openai.json before OPENAI_API_KEY", () => {
    saveApiKey("sk-config");
    process.env.OPENAI_API_KEY = "sk-env";

    const resolution = resolveApiKeyInfo();

    expect(resolution?.key).toBe("sk-config");
    expect(resolution?.source).toBe("config");
    expect(describeApiKeySource(resolution!)).toBe("~/.gstack/openai.json");
    expect(resolveApiKey()).toBe("sk-config");
  });

  test("uses OPENAI_API_KEY when no config file exists", () => {
    process.env.OPENAI_API_KEY = "sk-env";

    const resolution = resolveApiKeyInfo();

    expect(resolution?.key).toBe("sk-env");
    expect(resolution?.source).toBe("env");
    expect(resolution?.envFile).toBeUndefined();
    expect(describeApiKeySource(resolution!)).toBe("OPENAI_API_KEY environment variable");
  });

  test("reports when OPENAI_API_KEY matches current-directory .env", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "OPENAI_API_KEY=sk-project\n");
    process.env.OPENAI_API_KEY = "sk-project";

    const resolution = resolveApiKeyInfo();

    expect(resolution?.key).toBe("sk-project");
    expect(resolution?.envFile).toBe(".env");
    expect(describeApiKeySource(resolution!)).toBe("OPENAI_API_KEY environment variable (matches .env in current directory)");
    expect(resolution?.warning).toContain("may bill that project's OpenAI account");
  });

  test("detects quoted and exported env-file values", () => {
    fs.writeFileSync(path.join(tmpDir, ".env.local"), "export OPENAI_API_KEY=\"sk-local\"\n");
    process.env.OPENAI_API_KEY = "sk-local";

    const resolution = resolveApiKeyInfo();

    expect(resolution?.envFile).toBe(".env.local");
    expect(resolution?.warning).toContain(".env.local");
  });

  test("does not claim env-file source when values differ", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "OPENAI_API_KEY=sk-other\n");
    process.env.OPENAI_API_KEY = "sk-shell";

    const resolution = resolveApiKeyInfo();

    expect(resolution?.key).toBe("sk-shell");
    expect(resolution?.envFile).toBeUndefined();
    expect(resolution?.warning).toBeUndefined();
  });

  test("Namleh profile skips local config files and uses process-injected env", () => {
    process.env.GSTACK_HOME = path.join(tmpDir, ".gstack-namleh");
    process.env.GSTACK_NAMLEH_PROFILE = "1";
    fs.mkdirSync(process.env.GSTACK_HOME, { recursive: true });
    fs.writeFileSync(path.join(process.env.GSTACK_HOME, "openai.json"), JSON.stringify({ api_key: "sk-config" }));
    process.env.OPENAI_API_KEY = "sk-env";

    const resolution = resolveApiKeyInfo();

    expect(isNamlehProfile()).toBe(true);
    expect(resolution?.key).toBe("sk-env");
    expect(resolution?.source).toBe("env");
    expect(() => saveApiKey("sk-new")).toThrow(/does not save API keys locally/);
  });
});

describe("requireApiKey", () => {
  test("prints source disclosure without leaking the key", () => {
    process.env.OPENAI_API_KEY = "sk-secret-value";
    const messages: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      messages.push(args.map(String).join(" "));
    };

    try {
      expect(requireApiKey()).toBe("sk-secret-value");
    } finally {
      console.error = originalError;
    }

    const stderr = messages.join("\n");
    expect(stderr).toContain("Using OpenAI key from OPENAI_API_KEY environment variable.");
    expect(stderr).not.toContain("sk-secret-value");
  });
});
