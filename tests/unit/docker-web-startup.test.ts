import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile", "utf8");
const startWeb = readFileSync("scripts/start-web.mjs", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  packages: Record<string, { dev?: boolean; devOptional?: boolean; dependencies?: Record<string, string> }>;
};

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

  it("runs prisma migrate deploy once before Next.js and never uses destructive prisma commands", () => {
    expect(pkg.scripts["db:deploy"]).toBe("prisma migrate deploy");
    expect(pkg.dependencies.prisma).toBe("^7.10.0");
    expect(pkg.dependencies["@prisma/client"]).toBe("^7.10.0");
    expect(pkg.devDependencies?.prisma).toBeUndefined();
    expect(startWeb).toContain('"migrate", "deploy"');
    expect(startWeb).toContain("PRISMA MIGRATE DEPLOY: START");
    expect(startWeb.indexOf("runPrismaMigrateDeploy()")).toBeLessThan(startWeb.indexOf("spawn(process.execPath, args"));
    expect(startWeb).not.toContain("migrate dev");
    expect(startWeb).not.toContain("migrate reset");
    expect(startWeb).not.toContain("db push");
    expect(startWeb).not.toContain("npm install");
    expect(dockerfile).toContain("prisma.config.ts");
    expect(dockerfile).toContain("npm ci --omit=dev --ignore-scripts");
    expect(dockerfile).not.toContain("COPY --from=builder /app/node_modules/prisma");
    expect(dockerfile).not.toContain("migrate reset");
    expect(dockerfile).not.toContain("db push");
    expect(dockerfile).not.toContain("migrate dev");
    const prismaLock = lockfile.packages["node_modules/prisma"];
    const configLock = lockfile.packages["node_modules/@prisma/config"];
    const effectLock = lockfile.packages["node_modules/effect"];
    expect(prismaLock?.dev).not.toBe(true);
    expect(prismaLock?.devOptional).not.toBe(true);
    expect(configLock?.devOptional).not.toBe(true);
    expect(configLock?.dependencies?.effect).toBe("3.20.0");
    expect(effectLock?.dev).not.toBe(true);
    expect(effectLock?.devOptional).not.toBe(true);
  });
});
