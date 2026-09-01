import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { runProductionMigrations } from "./prisma-migrate-production.mjs";

runProductionMigrations();

const port = (process.env.PORT ?? "3000").trim() || "3000";
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "production",
  PORT: port,
  HOSTNAME: "0.0.0.0",
};

const standalone = path.join(process.cwd(), "server.js");
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const args = existsSync(standalone)
  ? [standalone]
  : [nextBin, "start", "-H", "0.0.0.0", "-p", port];

const child = spawn(process.execPath, args, { stdio: "inherit", env });

function forward(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
