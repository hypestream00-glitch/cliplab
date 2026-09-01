import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveAtImport(spec) {
  const base = path.join(root, spec.slice(2));
  const files = ["", ".ts", ".tsx", ".js", ".mjs", ".json"];
  for (const ext of files) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const index of ["index.ts", "index.tsx", "index.js", "index.mjs"]) {
      const candidate = path.join(base, index);
      if (existsSync(candidate)) return candidate;
    }
  }
  return `${base}.ts`;
}

function workerBuildId() {
  const fromEnv = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || "").trim();
  if (fromEnv) return fromEnv.slice(0, 12);
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  if (git.status === 0 && git.stdout.trim()) return git.stdout.trim().slice(0, 12);
  return "unknown";
}

mkdirSync(path.join(root, "dist"), { recursive: true });

const buildId = workerBuildId();

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "workers/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: path.join(root, "dist/worker.mjs"),
  packages: "external",
  sourcemap: false,
  logLevel: "info",
  banner: {
    js: `globalThis.__CLIPLAB_WORKER_BUILD__ = ${JSON.stringify(buildId)};`,
  },
  plugins: [
    {
      name: "alias-at",
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => ({
          path: resolveAtImport(args.path),
        }));
      },
    },
  ],
});
