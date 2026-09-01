import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "prisma/migrations/20260901034100_add_processing_job");

const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/prisma/build/index.js"),
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ],
  { cwd: root, encoding: "utf8", env: process.env },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "prisma migrate diff failed\n");
  process.exit(result.status ?? 1);
}

const raw = String(result.stdout || "");
const start = raw.indexOf("-- CreateSchema");
if (start < 0) {
  process.stderr.write("unexpected prisma migrate diff output: missing -- CreateSchema\n");
  process.exit(1);
}

function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inSingle = false;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === "'" && sql[i - 1] !== "\\") inSingle = !inSingle;
    current += c;
    if (c === ";" && !inSingle) {
      statements.push(current);
      current = "";
    }
  }
  if (current.trim()) statements.push(current);
  return statements;
}

function stripLeadingComments(statement) {
  return statement
    .replace(/^\s*(--[^\n]*\n\s*)+/, "")
    .trim();
}

function toIdempotent(statement) {
  const trimmed = stripLeadingComments(statement);
  if (!trimmed) return "";

  const typeMatch = trimmed.match(/^CREATE TYPE ("[^"]+") AS ENUM \(([\s\S]*)\);$/);
  if (typeMatch) {
    return `-- CreateEnum\nDO $$ BEGIN\n    CREATE TYPE ${typeMatch[1]} AS ENUM (${typeMatch[2]});\nEXCEPTION\n    WHEN duplicate_object THEN null;\nEND $$;`;
  }

  let next = trimmed
    .replace(/^CREATE TABLE ("[^"]+")/, "CREATE TABLE IF NOT EXISTS $1")
    .replace(/^CREATE UNIQUE INDEX "/, 'CREATE UNIQUE INDEX IF NOT EXISTS "')
    .replace(/^CREATE INDEX "/, 'CREATE INDEX IF NOT EXISTS "');

  if (/^ALTER TABLE /.test(next) && next.includes(" ADD CONSTRAINT ") && next.includes(" FOREIGN KEY ")) {
    return `-- AddForeignKey\nDO $$ BEGIN\n    ${next.replace(/;$/, "")};\nEXCEPTION\n    WHEN duplicate_object THEN null;\nEND $$;`;
  }

  if (/^CREATE TABLE IF NOT EXISTS /.test(next)) {
    return `-- CreateTable\n${next.endsWith(";") ? next : `${next};`}`;
  }
  if (/^CREATE UNIQUE INDEX IF NOT EXISTS /.test(next) || /^CREATE INDEX IF NOT EXISTS /.test(next)) {
    return `-- CreateIndex\n${next.endsWith(";") ? next : `${next};`}`;
  }

  return next.endsWith(";") ? next : `${next};`;
}

const header = `-- CLIPLAB schema baseline + ProcessingJob.
-- Production originally had no versioned migrations.
-- The isolated ProcessingJob migration assumed "Workspace" / "Project" already existed.
-- This SQL is idempotent so it works on:
--   * empty databases (creates the full Prisma schema)
--   * existing databases (CREATE/ADD IF NOT EXISTS; does not drop tables or rows)
-- Do not drop, wipe, or reset. Foreign keys are created after parent tables.

`;

const body = splitStatements(raw.slice(start))
  .map((statement) => toIdempotent(statement))
  .filter(Boolean)
  .join("\n\n");

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "migration.sql"), `${header}${body}\n`, "utf8");
process.stdout.write(`wrote ${path.join(outDir, "migration.sql")}\n`);
