import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ENV_LOCAL = path.join(process.cwd(), ".env.local");
const STATUS = path.join(process.cwd(), "storage", "stripe-listen.status.json");
const STRIPE_EXE =
  process.env.STRIPE_CLI_PATH ||
  path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "WinGet",
    "Packages",
    "Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "stripe.exe",
  );

function parseEnvFile(filePath: string) {
  const out: Record<string, string> = {};
  if (!existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function upsertEnv(filePath: string, key: string, value: string) {
  let text = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  if (text.length && !text.endsWith("\n")) text += "\n";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (pattern.test(text)) text = text.replace(pattern, line);
  else text += `${line}\n`;
  writeFileSync(filePath, text, "utf8");
}

function writeStatus(payload: Record<string, unknown>) {
  writeFileSync(STATUS, JSON.stringify(payload), "utf8");
}

const env = { ...parseEnvFile(path.join(process.cwd(), ".env")), ...parseEnvFile(ENV_LOCAL) };
const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
if (!secret.startsWith("sk_test_")) {
  writeStatus({ ok: false, reason: "missing-test-secret" });
  process.exit(1);
}
if (!existsSync(STRIPE_EXE)) {
  writeStatus({ ok: false, reason: "stripe-cli-missing" });
  process.exit(1);
}

const events = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
].join(",");

writeStatus({ ok: false, phase: "starting" });

const child = spawn(
  STRIPE_EXE,
  ["listen", "--forward-to", "http://localhost:3000/api/webhooks/stripe", "--events", events],
  {
    env: { ...process.env, STRIPE_API_KEY: secret },
    windowsHide: true,
  },
);

let captured = false;
let buffer = "";

function consume(chunk: string) {
  buffer += chunk;
  const match = buffer.match(/whsec_[A-Za-z0-9]+/);
  if (match && !captured) {
    captured = true;
    upsertEnv(ENV_LOCAL, "STRIPE_WEBHOOK_SECRET", match[0]);
    writeStatus({ ok: true, phase: "secret-captured", webhookSecret: "CONFIGURED" });
    buffer = buffer.replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]");
  }
  if (buffer.length > 8000) buffer = buffer.slice(-2000);
}

child.stdout.on("data", (data) => consume(String(data)));
child.stderr.on("data", (data) => consume(String(data)));
child.on("exit", (code) => {
  if (!captured) writeStatus({ ok: false, phase: "exited", code });
  process.exit(code ?? 1);
});
