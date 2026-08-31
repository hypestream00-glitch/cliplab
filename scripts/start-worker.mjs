import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const compiled = path.join(process.cwd(), "dist", "worker.mjs");
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const source = path.join(process.cwd(), "workers", "index.ts");

let args;
if (existsSync(compiled)) {
  args = [compiled];
} else if (existsSync(tsxCli)) {
  args = [tsxCli, source];
} else {
  console.error("CLIPLAB worker: dist/worker.mjs not found and tsx is not installed.");
  process.exit(1);
}

const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });

function forward(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
