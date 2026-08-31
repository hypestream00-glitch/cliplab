import { NextRequest, NextResponse } from "next/server";
import { isMetaConfigured } from "@/lib/social/meta/config";
import { verifyWebhookSignature } from "@/lib/social/meta/signed-request";
import { logger } from "@/lib/logger";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { prisma } from "@/lib/db/prisma";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  if (!isMetaConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const payload = JSON.parse(raw) as { object?: string; entry?: Array<{ id?: string }> };
  const eventId = `meta:${createHash("sha256").update(raw).digest("hex")}`;
  try {
    await prisma.processedWebhookEvent.create({ data: { id: eventId, provider: "meta", type: payload.object ?? "unknown" } });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }
  logger.info({ object: payload.object, entries: payload.entry?.length ?? 0 }, "meta webhook received");
  return NextResponse.json({ ok: true });
}
