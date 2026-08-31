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

const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

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
  return new Promise<{ code: number; text: string }>((resolve) => {
    const child = spawn(STRIPE_EXE, args, {
      env: { ...process.env, ...extraEnv },
      windowsHide: true,
    });
    let text = "";
    child.stdout.on("data", (chunk) => {
      text += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      text += String(chunk);
    });
    child.on("exit", (code) => resolve({ code: code ?? 1, text }));
  });
}

function redact(text: string) {
  return text
    .replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]")
    .replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "sk_[redacted]")
    .replace(/rk_(?:test|live)_[A-Za-z0-9]+/g, "rk_[redacted]");
}

async function snapshot() {
  const project = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    select: { status: true, _count: { select: { clips: true } } },
  });
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
  return {
    workspaceId: owner?.workspaceId ?? null,
    planCode: subscription?.plan.code ?? null,
    status: subscription?.status ?? null,
    stripeSubscriptionId: subscription?.stripeSubscriptionId ? "SET" : "UNSET",
    projectStatus: project?.status ?? null,
    clips: project?._count.clips ?? null,
  };
}

async function main() {
  const env = parseEnvFile(path.join(process.cwd(), ".env.local"));
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!secret.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, reason: "missing-test-secret" }));
    process.exit(1);
  }
  const stripeEnv = { STRIPE_API_KEY: secret };
  const before = await snapshot();
  const processedBefore = await prisma.processedStripeEvent.count();
  const results: Array<{ event: string; triggerOk: boolean; processedDelta: number }> = [];

  for (const event of EVENTS) {
    const countBefore = await prisma.processedStripeEvent.count();
    const triggered = await runStripe(["trigger", event], stripeEnv);
    const ok = triggered.code === 0 && /Trigger succeeded|event created|succeeded/i.test(triggered.text);
    await new Promise((r) => setTimeout(r, 2500));
    const countAfter = await prisma.processedStripeEvent.count();
    results.push({
      event,
      triggerOk: ok || triggered.code === 0,
      processedDelta: countAfter - countBefore,
    });
  }

  const list = await runStripe(["events", "list", "--limit", "1"], stripeEnv);
  const eventId = list.text.match(/evt_[A-Za-z0-9]+/)?.[0] ?? null;
  let duplicate = { attempted: false, stillSingle: false, resendOk: false };
  if (eventId) {
    const existing = await prisma.processedStripeEvent.findUnique({ where: { id: eventId } });
    const resend = await runStripe(["events", "resend", eventId], stripeEnv);
    await new Promise((r) => setTimeout(r, 2500));
    const afterResend = await prisma.processedStripeEvent.findUnique({ where: { id: eventId } });
    duplicate = {
      attempted: true,
      stillSingle: Boolean(existing || afterResend) && (await prisma.processedStripeEvent.count({ where: { id: eventId } })) === 1,
      resendOk: resend.code === 0,
    };
  }

  const after = await snapshot();
  const processedAfter = await prisma.processedStripeEvent.count();
  const genericDidNotMutatePlan =
    before.planCode === after.planCode &&
    before.status === after.status &&
    before.stripeSubscriptionId === after.stripeSubscriptionId;
  const projectPreserved = before.projectStatus === after.projectStatus && before.clips === after.clips;

  console.log(
    JSON.stringify(
      {
        stripeCliPresent: existsSync(STRIPE_EXE),
        triggers: results,
        receivedAny: results.some((item) => item.processedDelta > 0),
        processedDelta: processedAfter - processedBefore,
        duplicate,
        genericDidNotMutatePlan,
        projectPreserved,
        listenNote: redact(list.text).slice(0, 80),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "unknown" }));
  await prisma.$disconnect();
  process.exit(1);
});
