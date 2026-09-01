import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isDatabaseUrlConfigured } from "@/lib/db/prisma";
import { logWorkerEnvPresence, runtimeEnv, runtimeEnvPresent } from "@/lib/env/runtime";
import { isRedisConfigured } from "@/lib/queue/redis";

const root = path.resolve(__dirname, "../..");

describe("worker runtime env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads REDIS_URL and DATABASE_URL from process.env at runtime", () => {
    vi.stubEnv("REDIS_URL", "rediss://example");
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    expect(runtimeEnv("REDIS_URL")).toBe("rediss://example");
    expect(runtimeEnv("DATABASE_URL")).toBe("postgresql://example");
    expect(runtimeEnvPresent("REDIS_URL")).toBe(true);
    expect(runtimeEnvPresent("DATABASE_URL")).toBe(true);
    expect(isRedisConfigured()).toBe(true);
    expect(isDatabaseUrlConfigured()).toBe(true);
  });

  it("treats missing or blank REDIS_URL as absent without throwing", () => {
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("DATABASE_URL", "   ");
    expect(runtimeEnvPresent("REDIS_URL")).toBe(false);
    expect(runtimeEnvPresent("DATABASE_URL")).toBe(false);
    expect(isRedisConfigured()).toBe(false);
  });

  it("logs presence only, never secret values", () => {
    vi.stubEnv("REDIS_URL", "rediss://example");
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    logWorkerEnvPresence();
    spy.mockRestore();
    expect(lines).toEqual(["REDIS_URL PRESENT: true", "DATABASE_URL PRESENT: true"]);
    expect(lines.join("\n")).not.toMatch(/rediss:\/\/example|postgresql:\/\/example/i);
  });
});

describe("start-worker env preservation", () => {
  it("does not replace process.env when spawning the worker", () => {
    const source = readFileSync(path.join(root, "scripts/start-worker.mjs"), "utf8");
    expect(source).not.toContain("env: process.env");
    expect(source).not.toContain("dotenv");
    expect(source).toContain("WORKER ENTRYPOINT STARTED");
    expect(source).toContain("pathToFileURL");
  });

  it("loads the compiled worker in-process so boot logs are not trapped in a child", () => {
    const source = readFileSync(path.join(root, "scripts/start-worker.mjs"), "utf8");
    expect(source).toContain("await import(pathToFileURL(compiled).href)");
    expect(source).not.toMatch(/spawn\(process\.execPath,\s*\[compiled/);
    const index = readFileSync(path.join(root, "workers/index.ts"), "utf8");
    expect(index).toContain('bootLog("WORKER STARTED")');
    expect(index).toContain('await import("@/lib/queue/boot")');
    expect(index).toContain("processEmailOutbox");
    expect(index).toContain("logSmtpEnvPresence");
    expect(index).not.toMatch(/import\s+\{[^}]*startClipLabWorkers/);
  });

  it("reports REDIS_URL and DATABASE_URL present without connecting", () => {
    const build = spawnSync(process.execPath, ["scripts/build-worker.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(build.status).toBe(0);

    const bundle = readFileSync(path.join(root, "dist/worker.mjs"), "utf8");
    expect(bundle).toContain("REDIS_URL");
    expect(bundle).toContain("DATABASE_URL");
    expect(bundle).not.toContain("rediss://example");
    expect(bundle).not.toMatch(/define:\s*\{[^}]*REDIS_URL/);

    const result = spawnSync(process.execPath, ["scripts/start-worker.mjs", "--check-env"], {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        PATHEXT: process.env.PATHEXT,
        COMSPEC: process.env.COMSPEC,
        NODE_ENV: "production",
        REDIS_URL: "rediss://example",
        DATABASE_URL: "postgresql://example",
      },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toMatch(/WORKER ENTRYPOINT STARTED/);
    expect(output).toMatch(/WORKER STARTED/);
    expect(output).toMatch(/WORKER BUILD:/);
    expect(output).toMatch(/REDIS_URL PRESENT: true/);
    expect(output).toMatch(/DATABASE_URL PRESENT: true/);
    expect(output).not.toMatch(/rediss:\/\/example/);
    expect(output).not.toMatch(/postgresql:\/\/example/);
    expect(output).not.toMatch(/WORKER PREFLIGHT FAIL/);
    expect(result.status).toBe(0);
  });
});
