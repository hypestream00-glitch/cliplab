import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationName = "20260901050500_reconcile_full_schema";
const outDir = path.join(root, "prisma/migrations", migrationName);

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
  return statement.replace(/^\s*(--[^\n]*\n\s*)+/, "").trim();
}

function enumAddValues(typeName, valuesInner) {
  return valuesInner
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => `ALTER TYPE ${typeName} ADD VALUE IF NOT EXISTS ${value};`)
    .join("\n");
}

function addColumnStatements(createTableSql) {
  const tableMatch = createTableSql.match(/^CREATE TABLE IF NOT EXISTS ("[^"]+")/);
  if (!tableMatch) return "";
  const table = tableMatch[1];
  const open = createTableSql.indexOf("(");
  const close = createTableSql.lastIndexOf(")");
  if (open < 0 || close < 0) return "";
  const body = createTableSql.slice(open + 1, close);
  const statements = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().replace(/,$/, "");
    if (!line || line.startsWith("CONSTRAINT")) continue;
    const colMatch = line.match(/^("[^"]+")\s+(.+)$/);
    if (!colMatch) continue;
    const definition = colMatch[2].replace(/\s+NOT NULL/g, "").replace(/\s+PRIMARY KEY/g, "").trim();
    statements.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colMatch[1]} ${definition};`);
  }
  return statements.join("\n");
}

function addPrimaryKeyIfMissing(createTableSql) {
  const tableMatch = createTableSql.match(/^CREATE TABLE IF NOT EXISTS ("[^"]+")/);
  const pkMatch = createTableSql.match(/CONSTRAINT ("[^"]+") PRIMARY KEY \(([^)]+)\)/);
  if (!tableMatch || !pkMatch) return "";
  const table = tableMatch[1];
  const constraint = pkMatch[1];
  const cols = pkMatch[2];
  return `-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public.${table}') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint.replaceAll('"', "")}') THEN
        ALTER TABLE ${table} ADD CONSTRAINT ${constraint} PRIMARY KEY (${cols});
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;`;
}

function wrapForeignKey(statement) {
  const match = statement.match(
    /^ALTER TABLE ("[^"]+") ADD CONSTRAINT ("[^"]+") FOREIGN KEY/,
  );
  if (!match) return statement;
  return `-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public.${match[1]}') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = '${match[2].replaceAll('"', "")}'
       ) THEN
        ${statement.replace(/;$/, "")};
    END IF;
END $$;`;
}

function toIdempotent(statement) {
  const trimmed = stripLeadingComments(statement);
  if (!trimmed) return "";

  const typeMatch = trimmed.match(/^CREATE TYPE ("[^"]+") AS ENUM \(([\s\S]*)\);$/);
  if (typeMatch) {
    return `-- CreateEnum
DO $$ BEGIN
    CREATE TYPE ${typeMatch[1]} AS ENUM (${typeMatch[2]});
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
${enumAddValues(typeMatch[1], typeMatch[2])}`;
  }

  let next = trimmed
    .replace(/^CREATE TABLE ("[^"]+")/, "CREATE TABLE IF NOT EXISTS $1")
    .replace(/^CREATE UNIQUE INDEX "/, 'CREATE UNIQUE INDEX IF NOT EXISTS "')
    .replace(/^CREATE INDEX "/, 'CREATE INDEX IF NOT EXISTS "');

  if (/^ALTER TABLE /.test(next) && next.includes(" ADD CONSTRAINT ") && next.includes(" FOREIGN KEY ")) {
    return wrapForeignKey(next.endsWith(";") ? next : `${next};`);
  }

  if (/^CREATE TABLE IF NOT EXISTS /.test(next)) {
    const tableSql = next.endsWith(";") ? next : `${next};`;
    const extras = [addColumnStatements(tableSql), addPrimaryKeyIfMissing(tableSql)].filter(Boolean);
    return `-- CreateTable\n${tableSql}${extras.length ? `\n${extras.join("\n")}` : ""}`;
  }
  if (/^CREATE UNIQUE INDEX IF NOT EXISTS /.test(next) || /^CREATE INDEX IF NOT EXISTS /.test(next)) {
    return `-- CreateIndex\n${next.endsWith(";") ? next : `${next};`}`;
  }

  return next.endsWith(";") ? next : `${next};`;
}

const header = `-- CLIPLAB full-schema reconciliation.
-- 20260901034100_add_processing_job is already applied in production and will not re-run.
-- This additive migration creates any missing enums/tables/indexes/FKs for the current Prisma schema.
-- Safe on empty databases and on partial Railway databases. Does not drop or wipe data.

`;

const body = splitStatements(raw.slice(start))
  .map((statement) => toIdempotent(statement))
  .filter(Boolean)
  .join("\n\n");

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "migration.sql"), `${header}${body}\n`, "utf8");
process.stdout.write(`wrote ${path.join(outDir, "migration.sql")}\n`);
