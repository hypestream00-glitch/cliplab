import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function runPrismaMigrateDeploy() {
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  if (!existsSync(prismaCli)) {
    process.stderr.write("PRISMA MIGRATE DEPLOY: FAIL prisma CLI not found\n");
    process.exit(1);
  }
  process.stdout.write("PRISMA MIGRATE DEPLOY: START\n");
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    process.stderr.write(`PRISMA MIGRATE DEPLOY: FAIL ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write("PRISMA MIGRATE DEPLOY: FAIL\n");
    process.exit(result.status ?? 1);
  }
  process.stdout.write("PRISMA MIGRATE DEPLOY: OK\n");
}

runPrismaMigrateDeploy();

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
