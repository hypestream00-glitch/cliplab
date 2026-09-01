import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migrationsDir = path.join(root, "prisma/migrations");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");

describe("ProcessingJob production migration", () => {
  it("keeps ProcessingJob in the Prisma schema with required relations", () => {
    expect(schema).toContain("model ProcessingJob");
    expect(schema).toContain("enum ProcessingJobType");
    expect(schema).toContain("enum JobStatus");
    expect(schema).toMatch(/processingJobs\s+ProcessingJob\[\]/);
    expect(schema).toMatch(/jobs\s+ProcessingJob\[\]/);
  });

  it("adds only ProcessingJob via a new additive migration", () => {
    const names = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(names).toContain("20260901034100_add_processing_job");

    const sql = readFileSync(path.join(migrationsDir, "20260901034100_add_processing_job/migration.sql"), "utf8");
    expect(sql).toContain('CREATE TYPE "ProcessingJobType"');
    expect(sql).toContain('CREATE TYPE "JobStatus"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ProcessingJob"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_createdAt_idx"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_entityId_type_idx"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_status_idx"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_status_idx"');
    expect(sql).toContain('CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")');
    expect(sql).toContain('"status" "JobStatus" NOT NULL DEFAULT \'WAITING\'');
    expect(sql).toContain('"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
    expect(sql).toContain('"updatedAt" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain('REFERENCES "Workspace"("id") ON DELETE CASCADE');
    expect(sql).toContain('REFERENCES "Project"("id") ON DELETE SET NULL');
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP DATABASE\b/i);
    expect(sql).not.toMatch(/\bDROP SCHEMA\b/i);
    expect(sql).not.toContain("--applied");
    expect(sql).not.toContain("migrate reset");
    expect(sql).not.toContain("User");
    expect(sql).not.toContain("Clip");
    expect(sql).not.toContain("RENATO");
  });

  it("is what worker recovery queries after schema exists", () => {
    const recovery = readFileSync(path.join(root, "lib/services/job-recovery.ts"), "utf8");
    expect(recovery).toContain("prisma.processingJob.findMany");
    expect(recovery).not.toContain("migrate deploy");
  });
});
