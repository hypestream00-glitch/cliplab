import { describe, expect, it } from "vitest";
import {
  KNOWN_RECOVERABLE_MIGRATION,
  collectFailedMigrationNames,
  runProductionMigrations,
  shouldRecoverKnownFailedMigration,
  shouldRecoverKnownP3009,
} from "../../scripts/prisma-migrate-production.mjs";

type PrismaCliResult = { status: number; stdout: string; stderr: string };

function capture() {
  const calls: string[][] = [];
  const logs: string[] = [];
  const exits: number[] = [];
  return { calls, logs, exits };
}

const P3009_KNOWN = `Error: P3009

migrate found failed migrations in the target database, new migrations will not be applied.

The \`${KNOWN_RECOVERABLE_MIGRATION}\` migration started at 2026-09-01 04:10:00.000 UTC failed
`;

const P3009_UNKNOWN = `Error: P3009

The \`20240101000000_other_migration\` migration started at 2026-09-01 04:10:00.000 UTC failed
`;

const P3018_KNOWN = `Error: P3018

A migration failed to apply. New migrations cannot be applied before the error is recovered from.

Migration name:
${KNOWN_RECOVERABLE_MIGRATION}

Database error code: 42P01

Database error:
ERROR: relation "Workspace" does not exist
`;

const P3018_UNKNOWN = `Error: P3018

Migration name:
20240101000000_other_migration

Database error code: 42P01
`;

describe("P3009 known ProcessingJob recovery", () => {
  it("identifies only the known failed ProcessingJob migration", () => {
    expect(collectFailedMigrationNames(P3009_KNOWN)).toEqual([KNOWN_RECOVERABLE_MIGRATION]);
    expect(shouldRecoverKnownP3009(P3009_KNOWN)).toBe(true);
  });

  it("does not recover unknown or mixed failed migrations", () => {
    expect(shouldRecoverKnownP3009(P3009_UNKNOWN)).toBe(false);
    expect(
      shouldRecoverKnownP3009(
        `Error: P3009\nThe \`${KNOWN_RECOVERABLE_MIGRATION}\` migration failed\nThe \`20240101000000_other_migration\` migration failed\n`,
      ),
    ).toBe(false);
    expect(shouldRecoverKnownP3009("Error: P1001 connection refused")).toBe(false);
  });

  it("recovers P3018 only for the known ProcessingJob migration and never uses --applied", () => {
    expect(collectFailedMigrationNames(P3018_KNOWN)).toEqual([KNOWN_RECOVERABLE_MIGRATION]);
    expect(shouldRecoverKnownFailedMigration(P3018_KNOWN)).toBe(true);
    expect(shouldRecoverKnownFailedMigration(P3018_UNKNOWN)).toBe(false);

    const { calls, logs, exits } = capture();
    const result = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        const prismaArgs = args.slice(1);
        calls.push(prismaArgs);
        if (prismaArgs[0] === "migrate" && prismaArgs[1] === "deploy") {
          if (calls.filter((item) => item[1] === "deploy").length === 1) {
            return { status: 1, stdout: "", stderr: P3018_KNOWN };
          }
          return { status: 0, stdout: "Applied 20260901034100_add_processing_job\n", stderr: "" };
        }
        expect(prismaArgs).toEqual(["migrate", "resolve", "--rolled-back", KNOWN_RECOVERABLE_MIGRATION]);
        return { status: 0, stdout: "Migration marked as rolled back\n", stderr: "" };
      },
      log: (line: string) => logs.push(line),
      fail: (line: string) => logs.push(line),
      exit: (code: number) => exits.push(code),
    });
    expect(result).toEqual({ ok: true, recovered: true });
    expect(exits).toEqual([]);
    expect(calls.flat().join(" ")).not.toContain("--applied");
    expect(logs).toContain("P3018 KNOWN MIGRATION DETECTED");
    expect(logs).toContain("PRISMA MIGRATE RESOLVE: ROLLED-BACK (SQL will be reapplied; not marked applied)");
  });

  it("does not mark the migration applied when retry SQL still fails", () => {
    const { calls, logs, exits } = capture();
    const result = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        calls.push(args.slice(1));
        if (args.slice(1)[1] === "resolve") return { status: 0, stdout: "", stderr: "" };
        return { status: 1, stdout: "", stderr: P3018_KNOWN };
      },
      log: (line: string) => logs.push(line),
      fail: (line: string) => logs.push(line),
      exit: (code: number) => exits.push(code),
    });
    expect(result).toEqual({ ok: false, reason: "retry-failed" });
    expect(exits).toEqual([1]);
    expect(calls.flat().join(" ")).not.toContain("--applied");
    expect(logs).toContain("PRISMA MIGRATE: SQL was not applied; migration was not marked as applied");
  });

  it("applies migrate deploy on the happy path and then allows Next.js to start", () => {
    const { calls, logs, exits } = capture();
    const result = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        calls.push(args.slice(1));
        return { status: 0, stdout: "No pending migrations\n", stderr: "" };
      },
      log: (line: string) => logs.push(line),
      fail: (line: string) => logs.push(line),
      exit: (code: number) => exits.push(code),
    });
    expect(result).toEqual({ ok: true, recovered: false });
    expect(exits).toEqual([]);
    expect(calls).toEqual([["migrate", "deploy"]]);
    expect(logs).toEqual(["PRISMA MIGRATE DEPLOY: START", "PRISMA MIGRATE DEPLOY: OK"]);
  });

  it("resolves the known migration as rolled-back then retries deploy", () => {
    const { calls, logs, exits } = capture();
    let deployCount = 0;
    const result = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        const prismaArgs = args.slice(1);
        calls.push(prismaArgs);
        if (prismaArgs[0] === "migrate" && prismaArgs[1] === "deploy") {
          deployCount += 1;
          if (deployCount === 1) return { status: 1, stdout: "", stderr: P3009_KNOWN };
          return { status: 0, stdout: "Applied 20260901034100_add_processing_job\n", stderr: "" };
        }
        return { status: 0, stdout: "Migration marked as rolled back\n", stderr: "" };
      },
      log: (line: string) => logs.push(line),
      fail: (line: string) => logs.push(line),
      exit: (code: number) => exits.push(code),
    });
    expect(result).toEqual({ ok: true, recovered: true });
    expect(exits).toEqual([]);
    expect(calls).toEqual([
      ["migrate", "deploy"],
      ["migrate", "resolve", "--rolled-back", KNOWN_RECOVERABLE_MIGRATION],
      ["migrate", "deploy"],
    ]);
    expect(calls.flat().join(" ")).not.toContain("--applied");
    expect(logs).toEqual([
      "PRISMA MIGRATE DEPLOY: START",
      "P3009 KNOWN MIGRATION DETECTED",
      `PRISMA MIGRATION RECOVERY: ${KNOWN_RECOVERABLE_MIGRATION}`,
      "PRISMA MIGRATE RESOLVE: ROLLED-BACK (SQL will be reapplied; not marked applied)",
      "PRISMA MIGRATE RESOLVE: OK",
      "PRISMA MIGRATE DEPLOY RETRY: START",
      "PRISMA MIGRATE DEPLOY: OK",
    ]);
  });

  it("does not resolve an unknown failed migration", () => {
    const { calls, exits } = capture();
    const result = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        calls.push(args.slice(1));
        return { status: 1, stdout: "", stderr: P3009_UNKNOWN };
      },
      log: () => undefined,
      fail: () => undefined,
      exit: (code: number) => exits.push(code),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unrecoverable");
    expect(calls).toEqual([["migrate", "deploy"]]);
    expect(exits).toEqual([1]);
  });

  it("aborts startup if resolve or retry still fails", () => {
    const { exits } = capture();
    const retryFail = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        const prismaArgs = args.slice(1);
        if (prismaArgs[1] === "resolve") return { status: 0, stdout: "", stderr: "" };
        return { status: 1, stdout: "", stderr: P3009_KNOWN };
      },
      log: () => undefined,
      fail: () => undefined,
      exit: (code: number) => exits.push(code),
    });
    expect(retryFail.ok).toBe(false);
    expect(retryFail.reason).toBe("retry-failed");
    expect(exits).toEqual([1]);

    exits.length = 0;
    const resolveFail = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        const prismaArgs = args.slice(1);
        if (prismaArgs[1] === "resolve") return { status: 1, stdout: "", stderr: "resolve failed" };
        return { status: 1, stdout: "", stderr: P3009_KNOWN };
      },
      log: () => undefined,
      fail: () => undefined,
      exit: (code: number) => exits.push(code),
    });
    expect(resolveFail.reason).toBe("resolve-failed");
    expect(exits).toEqual([1]);
  });

  it("baselines a non-empty database with P3005 only after SQL actually runs", () => {
    const P3005 = `Error: P3005\n\nThe database schema is not empty.\n`;
    const { calls, logs, exits } = capture();
    const result = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        const prismaArgs = args.slice(1);
        calls.push(prismaArgs);
        if (prismaArgs[0] === "db" && prismaArgs[1] === "execute") {
          return { status: 0, stdout: "Script executed\n", stderr: "" };
        }
        if (prismaArgs[0] === "migrate" && prismaArgs[1] === "deploy") {
          if (calls.filter((item) => item[1] === "deploy").length === 1) {
            return { status: 1, stdout: "", stderr: P3005 };
          }
          return { status: 0, stdout: "No pending migrations\n", stderr: "" };
        }
        expect(prismaArgs).toEqual(["migrate", "resolve", "--applied", KNOWN_RECOVERABLE_MIGRATION]);
        return { status: 0, stdout: "Migration marked as applied\n", stderr: "" };
      },
      log: (line: string) => logs.push(line),
      fail: (line: string) => logs.push(line),
      exit: (code: number) => exits.push(code),
    });
    expect(result).toEqual({ ok: true, recovered: true, baselined: true });
    expect(exits).toEqual([]);
    expect(calls[0]).toEqual(["migrate", "deploy"]);
    expect(calls[1]?.[0]).toBe("db");
    expect(calls[1]?.[1]).toBe("execute");
    expect(calls[2]).toEqual(["migrate", "resolve", "--applied", KNOWN_RECOVERABLE_MIGRATION]);
    expect(calls[3]).toEqual(["migrate", "deploy"]);
    expect(logs).toContain("P3005 EXISTING DATABASE DETECTED");
    expect(logs).toContain("PRISMA BASELINE SQL: OK");
    expect(logs).toContain("PRISMA MIGRATE RESOLVE: APPLIED after SQL succeeded");
  });

  it("does not mark applied when P3005 baseline SQL fails", () => {
    const P3005 = `Error: P3005\n\nThe database schema is not empty.\n`;
    const { calls, logs, exits } = capture();
    const result = runProductionMigrations({
      spawnSync: (_cmd: string, args: string[]): PrismaCliResult => {
        calls.push(args.slice(1));
        if (args.slice(1)[0] === "db") return { status: 1, stdout: "", stderr: "SQL failed" };
        return { status: 1, stdout: "", stderr: P3005 };
      },
      log: (line: string) => logs.push(line),
      fail: (line: string) => logs.push(line),
      exit: (code: number) => exits.push(code),
    });
    expect(result).toEqual({ ok: false, reason: "baseline-sql-failed" });
    expect(exits).toEqual([1]);
    expect(calls.flat().join(" ")).not.toContain("--applied");
    expect(logs).toContain("PRISMA MIGRATE: SQL was not applied; migration was not marked as applied");
  });
});
