import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const KNOWN_RECOVERABLE_MIGRATION = "20260901034100_add_processing_job";

const MIGRATION_NAME_RE = /`(\d{14}_[A-Za-z0-9_]+)`/g;

export function findPrismaCli(cwd = process.cwd()) {
  return path.join(cwd, "node_modules", "prisma", "build", "index.js");
}

export function collectFailedMigrationNames(output) {
  const names = [];
  const seen = new Set();
  for (const match of String(output).matchAll(MIGRATION_NAME_RE)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function shouldRecoverKnownP3009(output) {
  const text = String(output);
  if (!text.includes("P3009")) return false;
  const names = collectFailedMigrationNames(text);
  return names.length === 1 && names[0] === KNOWN_RECOVERABLE_MIGRATION;
}

function defaultLog(line) {
  process.stdout.write(`${line}\n`);
}

function defaultFail(line) {
  process.stderr.write(`${line}\n`);
}

function runPrismaArgs(prismaCli, args, env, spawnImpl) {
  return spawnImpl(process.execPath, [prismaCli, ...args], {
    encoding: "utf8",
    env,
  });
}

function writeChildOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

export function runProductionMigrations(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const spawnImpl = options.spawnSync ?? spawnSync;
  const log = options.log ?? defaultLog;
  const fail = options.fail ?? defaultFail;
  const exit = options.exit ?? ((code) => process.exit(code));

  const prismaCli = findPrismaCli(cwd);
  if (!existsSync(prismaCli)) {
    fail("PRISMA MIGRATE DEPLOY: FAIL prisma CLI not found");
    exit(1);
    return { ok: false, reason: "missing-cli" };
  }

  function migrateDeploy() {
    const result = runPrismaArgs(prismaCli, ["migrate", "deploy"], env, spawnImpl);
    writeChildOutput(result);
    return result;
  }

  log("PRISMA MIGRATE DEPLOY: START");
  let result = migrateDeploy();
  if (result.error) {
    fail(`PRISMA MIGRATE DEPLOY: FAIL ${result.error.message}`);
    exit(1);
    return { ok: false, reason: "spawn-error" };
  }
  if (result.status === 0) {
    log("PRISMA MIGRATE DEPLOY: OK");
    return { ok: true, recovered: false };
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (!shouldRecoverKnownP3009(output)) {
    fail("PRISMA MIGRATE DEPLOY: FAIL");
    exit(result.status ?? 1);
    return { ok: false, reason: "unrecoverable" };
  }

  log("P3009 KNOWN MIGRATION DETECTED");
  log(`PRISMA MIGRATION RECOVERY: ${KNOWN_RECOVERABLE_MIGRATION}`);
  const resolve = runPrismaArgs(
    prismaCli,
    ["migrate", "resolve", "--rolled-back", KNOWN_RECOVERABLE_MIGRATION],
    env,
    spawnImpl,
  );
  writeChildOutput(resolve);
  if (resolve.error || resolve.status !== 0) {
    fail("PRISMA MIGRATE RESOLVE: FAIL");
    exit(resolve.status ?? 1);
    return { ok: false, reason: "resolve-failed" };
  }
  log("PRISMA MIGRATE RESOLVE: OK");

  log("PRISMA MIGRATE DEPLOY RETRY: START");
  result = migrateDeploy();
  if (result.error || result.status !== 0) {
    fail("PRISMA MIGRATE DEPLOY: FAIL");
    exit(result.status ?? 1);
    return { ok: false, reason: "retry-failed" };
  }
  log("PRISMA MIGRATE DEPLOY: OK");
  return { ok: true, recovered: true };
}
