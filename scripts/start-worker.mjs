import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function bootLog(line) {
  process.stdout.write(`${line}\n`);
}

function envPresent(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function workerBuildId() {
  const baked = globalThis.__CLIPLAB_WORKER_BUILD__;
  const raw = (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT ||
    process.env.SOURCE_COMMIT ||
    process.env.CLIPLAB_WORKER_BUILD ||
    (typeof baked === "string" ? baked : "")
  ).trim();
  return raw ? raw.slice(0, 12) : "unknown";
}

bootLog("WORKER ENTRYPOINT STARTED");
bootLog(`WORKER BUILD: ${workerBuildId()}`);
bootLog(`REDIS_URL PRESENT: ${envPresent("REDIS_URL")}`);
bootLog(`DATABASE_URL PRESENT: ${envPresent("DATABASE_URL")}`);

const compiled = path.join(process.cwd(), "dist", "worker.mjs");
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const source = path.join(process.cwd(), "workers", "index.ts");
const extraArgs = process.argv.slice(2);
if (existsSync(compiled)) {
  await import(pathToFileURL(compiled).href);
} else if (existsSync(tsxCli)) {
  const child = spawn(process.execPath, [tsxCli, source, ...extraArgs], { stdio: "inherit" });
  function forward(signal) {
    if (!child.killed) child.kill(signal);
  }
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));
  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
} else {
  console.error("CLIPLAB worker: dist/worker.mjs not found and tsx is not installed.");
  process.exit(1);
}
