import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", override: true });

import { prisma } from "../lib/db/prisma";

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

function runStripe(args: string[], extraEnv: Record<string, string>) {
  return new Promise<{ code: number }>((resolve) => {
    const child = spawn(STRIPE_EXE, args, {
      env: { ...process.env, ...extraEnv },
      windowsHide: true,
    });
    child.stdout.resume();
    child.stderr.resume();
    child.on("exit", (code) => resolve({ code: code ?? 1 }));
  });
}

async function main() {
  const env = parseEnvFile(path.join(process.cwd(), ".env.local"));
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!secret.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, reason: "missing-test-secret" }));
    process.exit(1);
  }
  const latest = await prisma.processedStripeEvent.findFirst({ orderBy: { createdAt: "desc" } });
  if (!latest) {
    console.log(JSON.stringify({ ok: false, reason: "no-processed-event" }));
    process.exit(1);
  }
  const before = await prisma.processedStripeEvent.count({ where: { id: latest.id } });
  const resend = await runStripe(["events", "resend", latest.id], { STRIPE_API_KEY: secret });
  await new Promise((r) => setTimeout(r, 3000));
  const after = await prisma.processedStripeEvent.count({ where: { id: latest.id } });
  const owner = await prisma.workspaceMember.findFirst({
    where: { role: "OWNER" },
    select: { workspaceId: true },
  });
  const subscription = owner
    ? await prisma.subscription.findUnique({
        where: { workspaceId: owner.workspaceId },
        include: { plan: { select: { code: true } } },
      })
    : null;
  console.log(
    JSON.stringify({
      resendOk: resend.code === 0,
      before,
      after,
      idempotent: before === 1 && after === 1,
      planCode: subscription?.plan.code ?? null,
      status: subscription?.status ?? null,
      eventType: latest.type,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "unknown" }));
  await prisma.$disconnect();
  process.exit(1);
});
