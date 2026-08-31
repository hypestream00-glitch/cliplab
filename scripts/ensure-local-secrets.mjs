import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
const examplePath = path.join(process.cwd(), ".env.example");

function placeholder(value) {
  const v = (value ?? "").trim();
  if (!v) return true;
  if (v.length < 24) return true;
  return /replace-with|change-me|changeme|todo|example|your-secret/i.test(v);
}

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    map.set(line.slice(0, idx).trim(), line.slice(idx + 1));
  }
  return map;
}

function upsert(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.replace(/\s*$/, "")}\n${line}\n`;
}

if (!existsSync(envPath) && existsSync(examplePath)) {
  writeFileSync(envPath, readFileSync(examplePath, "utf8"));
  console.log(".env created from .env.example");
}

if (!existsSync(envPath)) {
  console.log("No .env file; skip local secret generation.");
  process.exit(0);
}

let contents = readFileSync(envPath, "utf8");
const parsed = parseEnv(contents);
let changed = false;

if (placeholder(parsed.get("AUTH_SECRET"))) {
  contents = upsert(contents, "AUTH_SECRET", randomBytes(32).toString("base64url"));
  changed = true;
  console.log("AUTH_SECRET generated for local development.");
}

if (placeholder(parsed.get("ENCRYPTION_KEY"))) {
  contents = upsert(contents, "ENCRYPTION_KEY", randomBytes(32).toString("base64url"));
  changed = true;
  console.log("ENCRYPTION_KEY generated for local development.");
}

if (changed) {
  writeFileSync(envPath, contents);
  console.log("Local secrets written to gitignored .env (values not printed).");
} else {
  console.log("Local AUTH_SECRET and ENCRYPTION_KEY already set.");
}
