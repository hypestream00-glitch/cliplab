import { describe, expect, it } from "vitest";
import {
  KNOWN_RECOVERABLE_MIGRATION,
  collectFailedMigrationNames,
  runProductionMigrations,
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
});
