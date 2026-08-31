import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile", "utf8");
const startWeb = readFileSync("scripts/start-web.mjs", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("Railway web image", () => {
  it("defaults to the web stage, not the worker", () => {
    const stages = [...dockerfile.matchAll(/^FROM .+ AS (\S+)/gm)].map((m) => m[1]);
    expect(stages.at(-1)).toBe("web");
    expect(dockerfile.trimEnd().endsWith('CMD ["node", "scripts/start-web.mjs"]')).toBe(true);
    expect(dockerfile).toContain("FROM builder AS worker");
  });

  it("starts Next.js on 0.0.0.0 and honors PORT", () => {
    expect(pkg.scripts.start).toBe("node scripts/start-web.mjs");
    expect(pkg.scripts["start:web"]).toBe("node scripts/start-web.mjs");
    expect(pkg.scripts.worker).toBe("node scripts/start-worker.mjs");
    expect(startWeb).toContain('HOSTNAME: "0.0.0.0"');
    expect(startWeb).toContain('process.env.PORT ?? "3000"');
    expect(startWeb).toContain('"start", "-H", "0.0.0.0"');
    expect(startWeb).not.toContain("127.0.0.1");
    expect(startWeb).not.toContain("workers/index");
  });
});
