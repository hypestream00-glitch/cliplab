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

mkdirSync(path.join(root, "dist"), { recursive: true });

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
  // Never define process.env.* here. REDIS_URL / DATABASE_URL / S3_* must stay runtime reads.
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
