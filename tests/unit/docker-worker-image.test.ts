import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.worker", "utf8");
const startWorker = readFileSync("scripts/start-worker.mjs", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("Railway worker image", () => {
  it("builds a worker-only image without Next.js start", () => {
    expect(dockerfile).toContain("npx prisma generate && node scripts/build-worker.mjs");
    expect(dockerfile).toContain("ffmpeg");
    expect(dockerfile).toContain("ca-certificates");
    expect(dockerfile).toContain('CMD ["node", "scripts/start-worker.mjs"]');
    expect(dockerfile).not.toContain("next start");
    expect(dockerfile).not.toContain("start-web.mjs");
    expect(dockerfile).not.toContain("EXPOSE");
  });

  it("starts compiled JS in production and keeps a local tsx fallback", () => {
    expect(pkg.scripts.worker).toBe("node scripts/start-worker.mjs");
    expect(pkg.scripts["worker:dev"]).toBe("tsx workers/index.ts");
    expect(pkg.scripts["build:worker"]).toBe("node scripts/build-worker.mjs");
    expect(startWorker).toContain("dist");
    expect(startWorker).toContain("worker.mjs");
    expect(startWorker).toContain("tsx");
    expect(startWorker).not.toContain("next");
  });
});
