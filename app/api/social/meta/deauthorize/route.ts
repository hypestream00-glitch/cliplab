import { NextRequest, NextResponse } from "next/server";
import { parseSignedRequest } from "@/lib/social/meta/signed-request";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const parsed = signed ? parseSignedRequest(signed) : null;
  if (!parsed?.user_id) {
    return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: { in: ["INSTAGRAM", "FACEBOOK"] }, mock: false },
  });
  const matched = accounts.filter((account) => {
    const meta = (account.providerMeta ?? {}) as { facebookUserId?: string };
    return account.externalAccountId === parsed.user_id || meta.facebookUserId === parsed.user_id;
  });
  for (const account of matched) {
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: "REAUTH_REQUIRED", accessTokenEncrypted: null, refreshTokenEncrypted: null },
    });
  }
  logger.info({ facebookUserId: parsed.user_id, accounts: matched.length }, "meta deauthorize processed");
  return NextResponse.json({ ok: true });
}
