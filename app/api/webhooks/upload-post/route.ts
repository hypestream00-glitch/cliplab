import { NextResponse } from "next/server";
import { handleUploadPostWebhook } from "@/lib/social/upload-post/webhooks";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-upload-post-signature");
  const timestamp = request.headers.get("x-upload-post-timestamp");
  const event = request.headers.get("x-upload-post-event");
  const deliveryId = request.headers.get("x-upload-post-delivery");
  try {
    const result = await handleUploadPostWebhook({
      rawBody,
      signature,
      timestamp,
      event,
      deliveryId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ received: true, duplicate: result.duplicate ?? false });
  } catch (error) {
    logger.error({ err: error }, "upload-post webhook failed");
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
