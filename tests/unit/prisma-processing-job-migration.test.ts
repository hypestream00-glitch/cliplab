import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migrationsDir = path.join(root, "prisma/migrations");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const processingJobSql = readFileSync(
  path.join(migrationsDir, "20260901034100_add_processing_job/migration.sql"),
  "utf8",
);
const reconcileSql = readFileSync(
  path.join(migrationsDir, "20260901050500_reconcile_full_schema/migration.sql"),
  "utf8",
);

const schemaModels = [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1]);
const schemaEnums = [...schema.matchAll(/^enum (\w+)/gm)].map((match) => match[1]);

describe("CLIPLAB Prisma schema audit and reconciliation", () => {
  it("has no Video model; media source is SourceVideo", () => {
    expect(schema).not.toMatch(/^model Video\b/m);
    expect(schemaModels).toContain("SourceVideo");
    expect(schema).not.toMatch(/@@map\(/);
    expect(schema).not.toMatch(/@map\(/);
  });

  it("keeps two versioned migrations: applied ProcessingJob baseline plus new reconciliation", () => {
    const names = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(names).toEqual(["20260901034100_add_processing_job", "20260901050500_reconcile_full_schema"]);
  });

  it("covers every Prisma model and enum in the reconciliation SQL", () => {
    for (const model of schemaModels) {
      expect(reconcileSql).toContain(`CREATE TABLE IF NOT EXISTS "${model}"`);
    }
    for (const enumName of schemaEnums) {
      expect(reconcileSql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
    }
    expect(reconcileSql).toContain('CREATE TABLE IF NOT EXISTS "SocialAccount"');
    expect(reconcileSql).toContain('CREATE TABLE IF NOT EXISTS "SocialPublication"');
    expect(reconcileSql).toContain('CREATE TABLE IF NOT EXISTS "UploadSession"');
    expect(reconcileSql).toContain('CREATE TABLE IF NOT EXISTS "ProcessingJob"');
    expect(reconcileSql).toContain('CREATE TABLE IF NOT EXISTS "Workspace"');
    expect(reconcileSql.indexOf('CREATE TABLE IF NOT EXISTS "Workspace"')).toBeLessThan(
      reconcileSql.indexOf('CREATE TABLE IF NOT EXISTS "ProcessingJob"'),
    );
    expect(reconcileSql.indexOf('CREATE TABLE IF NOT EXISTS "Workspace"')).toBeLessThan(
      reconcileSql.indexOf("ProcessingJob_workspaceId_fkey"),
    );
    expect(reconcileSql).toContain("FROM pg_constraint");
    expect(reconcileSql).toContain("ADD COLUMN IF NOT EXISTS");
    expect(reconcileSql).toContain("ADD VALUE IF NOT EXISTS");
  });

  it("never drops, truncates, force-resets, or marks migrations applied in SQL", () => {
    for (const sql of [processingJobSql, reconcileSql]) {
      expect(sql).not.toMatch(/\bDROP TABLE\b/i);
      expect(sql).not.toMatch(/\bDROP COLUMN\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE TABLE\b/i);
      expect(sql).not.toMatch(/\bDROP DATABASE\b/i);
      expect(sql).not.toMatch(/\bDROP SCHEMA\b/i);
      expect(sql).not.toContain("--applied");
      expect(sql).not.toContain("migrate reset");
      expect(sql).not.toContain("force-reset");
      expect(sql).not.toContain("RENATO");
    }
  });

  it("is what worker recovery queries after schema exists", () => {
    const recovery = readFileSync(path.join(root, "lib/services/job-recovery.ts"), "utf8");
    expect(recovery).toContain("prisma.processingJob.findMany");
    expect(recovery).not.toContain("migrate deploy");
  });
});
