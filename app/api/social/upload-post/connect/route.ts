import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { generateUploadPostConnectUrl } from "@/lib/social/upload-post/connect";
import { UploadPostConfigError, UploadPostPlanError } from "@/lib/social/upload-post/errors";
import { PlanLimitError, assertSocialAccountLimit } from "@/lib/billing/usage";

function accountsError(request: Request, code: string) {
  return NextResponse.redirect(new URL(`/studio/accounts?error=${encodeURIComponent(code)}`, request.url));
}

export async function GET(request: Request) {
  if (!isUploadPostConfigured()) {
    return accountsError(request, "upload-post-config");
  }
  const ctx = await requireWorkspaceContext();
  try {
    await assertSocialAccountLimit(ctx.workspace.id);
    const { accessUrl } = await generateUploadPostConnectUrl(ctx.workspace.id);
    const response = NextResponse.redirect(accessUrl, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return accountsError(request, "plan-limit");
    }
    if (error instanceof UploadPostPlanError) {
      return accountsError(request, "profile-limit");
    }
    if (error instanceof UploadPostConfigError) {
      return accountsError(request, "upload-post-config");
    }
    return accountsError(request, "invalid-connect-url");
  }
}
