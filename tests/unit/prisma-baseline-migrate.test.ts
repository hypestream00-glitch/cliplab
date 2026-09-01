import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runProductionMigrations } from "../../scripts/prisma-migrate-production.mjs";

const LOCAL_ADMIN = "postgresql://cliplab:cliplab@localhost:5432/postgres";
const FRESH_DB = "cliplab_migrate_fresh";
const EXISTING_DB = "cliplab_migrate_existing";
const FAILED_DB = "cliplab_migrate_failed";
const MIGRATION_SQL = readFileSync(
  path.resolve("prisma/migrations/20260901034100_add_processing_job/migration.sql"),
  "utf8",
);

const REQUIRED_TABLES = [
  "User",
  "Workspace",
  "Project",
  "Clip",
  "ProcessingJob",
  "Account",
  "Session",
  "WorkspaceMember",
  "SourceVideo",
  "Transcript",
];

let postgresAvailable = false;

function dbUrl(name: string) {
  return `postgresql://cliplab:cliplab@localhost:5432/${name}`;
}

async function withAdmin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: LOCAL_ADMIN, connectionTimeoutMillis: 2500 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function recreateDatabase(name: string) {
  await withAdmin(async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await client.query(`DROP DATABASE IF EXISTS ${name}`);
    await client.query(`CREATE DATABASE ${name}`);
  });
}

async function dropDatabase(name: string) {
  await withAdmin(async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await client.query(`DROP DATABASE IF EXISTS ${name}`);
  });
}

async function withDb<T>(name: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: dbUrl(name) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function migrateEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    REDIS_URL: "",
    DIRECT_URL: databaseUrl,
  };
}

function runSqlFile(databaseUrl: string, file: string) {
  const prismaCli = path.resolve("node_modules/prisma/build/index.js");
  return spawnSync(process.execPath, [prismaCli, "db", "execute", "--file", file], {
    encoding: "utf8",
    env: migrateEnv(databaseUrl),
  });
}

function runMigrateDeploy(databaseUrl: string) {
  const prismaCli = path.resolve("node_modules/prisma/build/index.js");
  return spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    encoding: "utf8",
    env: migrateEnv(databaseUrl),
  });
}

async function tableNames(client: pg.Client) {
  const result = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return result.rows.map((row) => row.tablename);
}

async function foreignKeyExists(client: pg.Client, name: string) {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = $1) AS exists`,
    [name],
  );
  return result.rows[0]?.exists === true;
}

describe("local Postgres migrate deploy (never production)", () => {
  beforeAll(async () => {
    try {
      await withAdmin(async (client) => {
        await client.query("SELECT 1");
      });
      postgresAvailable = true;
      await recreateDatabase(FRESH_DB);
      await recreateDatabase(EXISTING_DB);
      await recreateDatabase(FAILED_DB);
    } catch {
      postgresAvailable = false;
    }
  }, 30_000);

  afterAll(async () => {
    if (!postgresAvailable) return;
    await dropDatabase(FRESH_DB);
    await dropDatabase(EXISTING_DB);
    await dropDatabase(FAILED_DB);
  }, 30_000);

  it("applies the full schema on an empty database, including ProcessingJob FKs", async () => {
    expect(postgresAvailable).toBe(true);
    const deployed = runMigrateDeploy(dbUrl(FRESH_DB));
    expect(deployed.status, deployed.stderr || deployed.stdout).toBe(0);

    await withDb(FRESH_DB, async (client) => {
      const tables = await tableNames(client);
      for (const table of REQUIRED_TABLES) {
        expect(tables).toContain(table);
      }
      expect(await foreignKeyExists(client, "ProcessingJob_workspaceId_fkey")).toBe(true);
      expect(await foreignKeyExists(client, "ProcessingJob_projectId_fkey")).toBe(true);
      expect(await foreignKeyExists(client, "Project_workspaceId_fkey")).toBe(true);
      expect(await foreignKeyExists(client, "Clip_workspaceId_fkey")).toBe(true);

      const applied = await client.query<{ migration_name: string; finished_at: Date | null }>(
        `SELECT migration_name, finished_at FROM "_prisma_migrations"`,
      );
      expect(applied.rows).toHaveLength(1);
      expect(applied.rows[0]?.migration_name).toBe("20260901034100_add_processing_job");
      expect(applied.rows[0]?.finished_at).not.toBeNull();
    });
  }, 60_000);

  it("is additive on a database that already has Workspace/Project/Clip data", async () => {
    expect(postgresAvailable).toBe(true);

    const appliedSql = runSqlFile(
      dbUrl(EXISTING_DB),
      path.resolve("prisma/migrations/20260901034100_add_processing_job/migration.sql"),
    );
    expect(appliedSql.status, appliedSql.stderr || appliedSql.stdout).toBe(0);

    await withDb(EXISTING_DB, async (client) => {
      await client.query(
        `INSERT INTO "Workspace" ("id", "name", "slug", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        ["ws_renato", "RENATO GARCIA", "renato-garcia"],
      );
      await client.query(
        `INSERT INTO "Project" ("id", "workspaceId", "name", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        ["proj_renato", "ws_renato", "RENATO GARCIA"],
      );
      await client.query(
        `INSERT INTO "Clip" ("id", "workspaceId", "projectId", "title", "startMs", "endMs", "durationMs", "updatedAt") VALUES
          ($1, $4, $5, 'clip-1', 0, 1000, 1000, CURRENT_TIMESTAMP),
          ($2, $4, $5, 'clip-2', 1000, 2000, 1000, CURRENT_TIMESTAMP),
          ($3, $4, $5, 'clip-3', 2000, 3000, 1000, CURRENT_TIMESTAMP)`,
        ["clip_1", "clip_2", "clip_3", "ws_renato", "proj_renato"],
      );
    });

    const deployed = runProductionMigrations({
      env: migrateEnv(dbUrl(EXISTING_DB)),
      log: () => undefined,
      fail: () => undefined,
      exit: (code: number) => {
        throw new Error(`migrate helper exited ${code}`);
      },
    });
    expect(deployed.ok).toBe(true);
    expect(deployed.baselined).toBe(true);

    await withDb(EXISTING_DB, async (client) => {
      const workspace = await client.query(`SELECT name FROM "Workspace"`);
      expect(workspace.rows).toEqual([{ name: "RENATO GARCIA" }]);
      const clips = await client.query(`SELECT id FROM "Clip" ORDER BY id`);
      expect(clips.rows.map((row) => row.id)).toEqual(["clip_1", "clip_2", "clip_3"]);
      expect(await foreignKeyExists(client, "ProcessingJob_workspaceId_fkey")).toBe(true);
      const jobs = await client.query(`SELECT count(*)::int AS n FROM "ProcessingJob"`);
      expect(jobs.rows[0]?.n).toBe(0);
    });
  }, 60_000);

  it("recovers a failed ProcessingJob migration without marking it applied before SQL succeeds", async () => {
    expect(postgresAvailable).toBe(true);

    await withDb(FAILED_DB, async (client) => {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "ProcessingJobType" AS ENUM ('VIDEO_IMPORT', 'VIDEO_PROCESSING', 'TRANSCRIPTION', 'AI_ANALYSIS', 'CLIP_GENERATION', 'RENDER', 'SOCIAL_PUBLISHING', 'ANALYTICS_SYNC', 'LIVE_MONITOR', 'NOTIFICATIONS', 'EXTRACT_AUDIO', 'BULK_DOWNLOAD');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'CANCELED');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "ProcessingJob" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "projectId" TEXT,
          "type" "ProcessingJobType" NOT NULL,
          "entityId" TEXT NOT NULL,
          "status" "JobStatus" NOT NULL DEFAULT 'WAITING',
          "progress" INTEGER NOT NULL DEFAULT 0,
          "message" TEXT,
          "attempt" INTEGER NOT NULL DEFAULT 0,
          "errorCode" TEXT,
          "errorMessage" TEXT,
          "startedAt" TIMESTAMP(3),
          "finishedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
        )
      `);
      await client.query(`
        CREATE TABLE "_prisma_migrations" (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        )
      `);
      await client.query(
        `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
         VALUES ($1, $2, NULL, $3, $4, NOW(), 0)`,
        [
          "00000000-0000-0000-0000-000000000001",
          createHash("sha256").update(MIGRATION_SQL).digest("hex"),
          "20260901034100_add_processing_job",
          'ERROR: relation "Workspace" does not exist',
        ],
      );
    });

    const exits: number[] = [];
    const result = runProductionMigrations({
      env: migrateEnv(dbUrl(FAILED_DB)),
      log: () => undefined,
      fail: () => undefined,
      exit: (code: number) => exits.push(code),
    });
    expect(result.ok).toBe(true);
    expect(exits).toEqual([]);

    await withDb(FAILED_DB, async (client) => {
      const tables = await tableNames(client);
      expect(tables).toContain("Workspace");
      expect(tables).toContain("User");
      expect(tables).toContain("Project");
      expect(tables).toContain("Clip");
      expect(tables).toContain("ProcessingJob");
      expect(await foreignKeyExists(client, "ProcessingJob_workspaceId_fkey")).toBe(true);
      const applied = await client.query<{ finished_at: Date | null; rolled_back_at: Date | null }>(
        `SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`,
        ["20260901034100_add_processing_job"],
      );
      expect(applied.rows.some((row) => row.finished_at != null && row.rolled_back_at == null)).toBe(true);
    });
  }, 60_000);
});
