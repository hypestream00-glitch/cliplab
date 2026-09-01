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
    expect(sql).toContain('CREATE TABLE "ProcessingJob"');
    expect(sql).toContain('CREATE INDEX "ProcessingJob_workspaceId_createdAt_idx"');
    expect(sql).toContain('REFERENCES "Workspace"("id") ON DELETE CASCADE');
    expect(sql).toContain('REFERENCES "Project"("id") ON DELETE SET NULL');
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP DATABASE\b/i);
    expect(sql).not.toMatch(/\bALTER TABLE "(?!ProcessingJob)/);
    expect(sql).not.toContain("User");
    expect(sql).not.toContain("Clip");
    expect(sql).not.toContain("RENATO");
  });
});
