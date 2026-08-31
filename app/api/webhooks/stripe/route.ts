import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  try {
    const result = await handleStripeWebhook({ rawBody, signature, ip });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ received: true, duplicate: result.duplicate ?? false, type: result.type });
  } catch (error) {
    logger.error({ err: error }, "stripe webhook failed");
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
