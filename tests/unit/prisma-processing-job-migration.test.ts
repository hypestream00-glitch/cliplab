import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migrationsDir = path.join(root, "prisma/migrations");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(path.join(migrationsDir, "20260901034100_add_processing_job/migration.sql"), "utf8");

const schemaModels = [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1]);
const schemaEnums = [...schema.matchAll(/^enum (\w+)/gm)].map((match) => match[1]);

describe("CLIPLAB Prisma baseline + ProcessingJob migration", () => {
  it("keeps ProcessingJob in the Prisma schema with required relations", () => {
    expect(schema).toContain("model ProcessingJob");
    expect(schema).toContain("enum ProcessingJobType");
    expect(schema).toContain("enum JobStatus");
    expect(schema).toMatch(/processingJobs\s+ProcessingJob\[\]/);
    expect(schema).toMatch(/jobs\s+ProcessingJob\[\]/);
    expect(schema).not.toMatch(/@@map\(/);
    expect(schema).not.toMatch(/@map\(/);
  });

  it("has a single versioned migration that baselines the full schema", () => {
    const names = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(names).toEqual(["20260901034100_add_processing_job"]);
  });

  it("creates every Prisma model and enum idempotently before ProcessingJob FKs", () => {
    for (const model of schemaModels) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${model}"`);
    }
    for (const enumName of schemaEnums) {
      expect(sql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
    }

    const workspaceTableAt = sql.indexOf('CREATE TABLE IF NOT EXISTS "Workspace"');
    const projectTableAt = sql.indexOf('CREATE TABLE IF NOT EXISTS "Project"');
    const processingJobTableAt = sql.indexOf('CREATE TABLE IF NOT EXISTS "ProcessingJob"');
    const processingJobFkAt = sql.indexOf('CONSTRAINT "ProcessingJob_workspaceId_fkey"');
    expect(workspaceTableAt).toBeGreaterThan(0);
    expect(projectTableAt).toBeGreaterThan(workspaceTableAt);
    expect(processingJobTableAt).toBeGreaterThan(projectTableAt);
    expect(processingJobFkAt).toBeGreaterThan(processingJobTableAt);

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_createdAt_idx"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_entityId_type_idx"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_status_idx"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_status_idx"');
    expect(sql).toContain('REFERENCES "Workspace"("id") ON DELETE CASCADE');
    expect(sql).toContain('REFERENCES "Project"("id") ON DELETE SET NULL');
    expect(sql).toContain("WHEN duplicate_object THEN null");
  });

  it("never drops, truncates, force-resets, or marks migrations applied", () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP DATABASE\b/i);
    expect(sql).not.toMatch(/\bDROP SCHEMA\b/i);
    expect(sql).not.toContain("--applied");
    expect(sql).not.toContain("migrate reset");
    expect(sql).not.toContain("db push");
    expect(sql).not.toContain("force-reset");
    expect(sql).not.toContain("RENATO");
  });

  it("is what worker recovery queries after schema exists", () => {
    const recovery = readFileSync(path.join(root, "lib/services/job-recovery.ts"), "utf8");
    expect(recovery).toContain("prisma.processingJob.findMany");
    expect(recovery).not.toContain("migrate deploy");
  });
});
