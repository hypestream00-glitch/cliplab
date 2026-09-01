import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const KNOWN_RECOVERABLE_MIGRATION = "20260901034100_add_processing_job";
export const RECONCILE_MIGRATION = "20260901050500_reconcile_full_schema";
export const KNOWN_RECOVERABLE_MIGRATIONS = [KNOWN_RECOVERABLE_MIGRATION, RECONCILE_MIGRATION];

const BACKTICK_MIGRATION_RE = /`(\d{14}_[A-Za-z0-9_]+)`/g;
const NAMED_MIGRATION_RE = /Migration name:\s*[\r\n]*\s*`?(\d{14}_[A-Za-z0-9_]+)`?/gi;

export function findPrismaCli(cwd = process.cwd()) {
  return path.join(cwd, "node_modules", "prisma", "build", "index.js");
}

export function listMigrationNames(cwd = process.cwd()) {
  const dir = path.join(cwd, "prisma/migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function migrationSqlPath(cwd = process.cwd(), name = KNOWN_RECOVERABLE_MIGRATION) {
  return path.join(cwd, "prisma/migrations", name, "migration.sql");
}

export function collectFailedMigrationNames(output) {
  const names = [];
  const seen = new Set();
  function add(name) {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  const text = String(output);
  for (const match of text.matchAll(BACKTICK_MIGRATION_RE)) add(match[1]);
  for (const match of text.matchAll(NAMED_MIGRATION_RE)) add(match[1]);
  return names;
}

export function namesToRecover(output, known = KNOWN_RECOVERABLE_MIGRATIONS) {
  const text = String(output);
  const names = collectFailedMigrationNames(text).filter((name) => known.includes(name));
  if (names.length > 0) return names;
  return known.filter((name) => text.includes(name));
}

export function shouldRecoverKnownFailedMigration(output, known = KNOWN_RECOVERABLE_MIGRATIONS) {
  const text = String(output);
  if (!text.includes("P3009") && !text.includes("P3018")) return false;
  const names = collectFailedMigrationNames(text);
  if (names.length > 0) return names.every((name) => known.includes(name));
  return known.some((name) => text.includes(name));
}

export function shouldRecoverExistingDatabaseBaseline(output) {
  return String(output).includes("P3005");
}

/** @deprecated use shouldRecoverKnownFailedMigration */
export const shouldRecoverKnownP3009 = shouldRecoverKnownFailedMigration;

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
  const known = options.knownMigrations ?? KNOWN_RECOVERABLE_MIGRATIONS;

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

  if (shouldRecoverKnownFailedMigration(output, known)) {
    if (output.includes("P3009")) log("P3009 KNOWN MIGRATION DETECTED");
    if (output.includes("P3018")) log("P3018 KNOWN MIGRATION DETECTED");
    const recoverNames = namesToRecover(output, known);
    for (const name of recoverNames) {
      log(`PRISMA MIGRATION RECOVERY: ${name}`);
      log("PRISMA MIGRATE RESOLVE: ROLLED-BACK (SQL will be reapplied; not marked applied)");
      const resolve = runPrismaArgs(prismaCli, ["migrate", "resolve", "--rolled-back", name], env, spawnImpl);
      writeChildOutput(resolve);
      if (resolve.error || resolve.status !== 0) {
        fail("PRISMA MIGRATE RESOLVE: FAIL");
        exit(resolve.status ?? 1);
        return { ok: false, reason: "resolve-failed" };
      }
      log("PRISMA MIGRATE RESOLVE: OK");
    }

    log("PRISMA MIGRATE DEPLOY RETRY: START");
    result = migrateDeploy();
    if (result.error || result.status !== 0) {
      fail("PRISMA MIGRATE DEPLOY: FAIL");
      fail("PRISMA MIGRATE: SQL was not applied; migration was not marked as applied");
      exit(result.status ?? 1);
      return { ok: false, reason: "retry-failed" };
    }
    log("PRISMA MIGRATE DEPLOY: OK");
    return { ok: true, recovered: true };
  }

  if (shouldRecoverExistingDatabaseBaseline(output)) {
    const sqlFiles = known.map((name) => migrationSqlPath(cwd, name));
    if (sqlFiles.some((file) => !existsSync(file))) {
      fail("PRISMA BASELINE SQL: FAIL migration file missing");
      exit(1);
      return { ok: false, reason: "missing-sql" };
    }

    log("P3005 EXISTING DATABASE DETECTED");
    log("PRISMA BASELINE: executing idempotent SQL before marking applied");
    for (const sqlFile of sqlFiles) {
      const executed = runPrismaArgs(prismaCli, ["db", "execute", "--file", sqlFile], env, spawnImpl);
      writeChildOutput(executed);
      if (executed.error || executed.status !== 0) {
        fail("PRISMA BASELINE SQL: FAIL");
        fail("PRISMA MIGRATE: SQL was not applied; migration was not marked as applied");
        exit(executed.status ?? 1);
        return { ok: false, reason: "baseline-sql-failed" };
      }
    }
    log("PRISMA BASELINE SQL: OK");

    for (const name of known) {
      log("PRISMA MIGRATE RESOLVE: APPLIED after SQL succeeded");
      const resolve = runPrismaArgs(prismaCli, ["migrate", "resolve", "--applied", name], env, spawnImpl);
      writeChildOutput(resolve);
      if (resolve.error || resolve.status !== 0) {
        fail("PRISMA MIGRATE RESOLVE: FAIL");
        exit(resolve.status ?? 1);
        return { ok: false, reason: "resolve-failed" };
      }
      log("PRISMA MIGRATE RESOLVE: OK");
    }

    log("PRISMA MIGRATE DEPLOY RETRY: START");
    result = migrateDeploy();
    if (result.error || result.status !== 0) {
      fail("PRISMA MIGRATE DEPLOY: FAIL");
      exit(result.status ?? 1);
      return { ok: false, reason: "retry-failed" };
    }
    log("PRISMA MIGRATE DEPLOY: OK");
    return { ok: true, recovered: true, baselined: true };
  }

  fail("PRISMA MIGRATE DEPLOY: FAIL");
  exit(result.status ?? 1);
  return { ok: false, reason: "unrecoverable" };
}
