import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function envPresent(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

console.log(`REDIS_URL PRESENT: ${envPresent("REDIS_URL")}`);
console.log(`DATABASE_URL PRESENT: ${envPresent("DATABASE_URL")}`);

const compiled = path.join(process.cwd(), "dist", "worker.mjs");
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const source = path.join(process.cwd(), "workers", "index.ts");
const extraArgs = process.argv.slice(2);

let args;
if (existsSync(compiled)) {
  args = [compiled, ...extraArgs];
} else if (existsSync(tsxCli)) {
  args = [tsxCli, source, ...extraArgs];
} else {
  console.error("CLIPLAB worker: dist/worker.mjs not found and tsx is not installed.");
  process.exit(1);
}

const child = spawn(process.execPath, args, { stdio: "inherit" });

function forward(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
