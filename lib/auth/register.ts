import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { ensureProductPlans } from "@/lib/billing/ensure-plans";
import { ensurePromoCodes } from "@/lib/promo/ensure";
import { issueAuthToken } from "@/lib/email/tokens";
import { sendVerificationEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import { withTimeout } from "@/lib/async/timeout";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { isPublicHttpsUrl } from "@/lib/env/app-url";
import { ensureReferralProfile } from "@/lib/referral/profile";
import { attributeReferral } from "@/lib/referral/attribute";

export const SIGNUP_LOG = {
  start: "SIGNUP START",
  validationOk: "SIGNUP VALIDATION OK",
  passwordHashOk: "SIGNUP PASSWORD HASH OK",
  dbStart: "SIGNUP DB START",
  userCreated: "SIGNUP USER CREATED",
  workspaceCreated: "SIGNUP WORKSPACE CREATED",
  sessionStart: "SIGNUP SESSION START",
  sessionOk: "SIGNUP SESSION OK",
  complete: "SIGNUP COMPLETE",
} as const;

export function signupErrorLog(type: string) {
  return `SIGNUP ERROR: ${type}`;
}

function firstNameFrom(name: string) {
  return name.trim().split(/\s+/)[0] || "Criador";
}

export function signupAppUrlOk(source: NodeJS.ProcessEnv = process.env) {
  const url = (source.APP_URL ?? source.AUTH_URL ?? "").trim();
  return Boolean(url) && isPublicHttpsUrl(url);
}

export async function provisionWorkspace(user: { id: string; name: string | null }) {
  const firstName = firstNameFrom(user.name ?? "Criador");
  const slug = `${firstName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${user.id.slice(-4)}`;
  const workspace = await prisma.workspace.create({
    data: {
      name: `Workspace de ${firstName}`,
      slug,
      type: "PERSONAL",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
    await ensureProductPlans();
    await ensurePromoCodes();
  const free = await prisma.plan.findUnique({ where: { code: "FREE" } });
  if (free) {
    const now = new Date();
    await prisma.subscription.create({
      data: {
        workspaceId: workspace.id,
        planId: free.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30),
      },
    });
  }
  return workspace;
}

function scheduleUploadPostProvisioning(workspaceId: string) {
  if (process.env.SOCIAL_PROVIDER === "native" || !process.env.UPLOAD_POST_API_KEY?.trim()) return;
  void (async () => {
    try {
      const { ensureUploadPostProfile } = await import("@/lib/social/upload-post/profiles");
      await withTimeout(ensureUploadPostProfile(workspaceId), 5_000, "upload-post profile");
    } catch {
      logger.warn({ workspaceId }, "UPLOADPOST PROFILE SKIPPED");
    }
  })();
}

export type CompleteSignupInput = {
  name: string;
  email: string;
  password: string;
  referralCode?: string | null;
};

export type CompleteSignupResult =
  | { ok: true; userId: string; workspaceId: string; email: string; outboxId: string | null }
  | { ok: false; error: string; code: "EMAIL_IN_USE" | "DATABASE" | "HASH" | "EMAIL_QUEUE" };

export async function completeSignup(input: CompleteSignupInput): Promise<CompleteSignupResult> {
  const email = input.email.toLowerCase();
  let passwordHash: string;
  try {
    passwordHash = await withTimeout(hashPassword(input.password), 10_000, "password hash");
    logger.info(SIGNUP_LOG.passwordHashOk);
  } catch {
    logger.warn(signupErrorLog("HASH"));
    return { ok: false, error: "Não foi possível criar a conta. Tente novamente.", code: "HASH" };
  }

  logger.info(SIGNUP_LOG.dbStart);
  try {
    const exists = await withTimeout(
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      8_000,
      "signup lookup",
    );
    if (exists) {
      logger.info(signupErrorLog("EMAIL_IN_USE"));
      return { ok: false, error: "Este e-mail já está em uso.", code: "EMAIL_IN_USE" };
    }
    const user = await withTimeout(
      prisma.user.create({
        data: {
          name: input.name,
          email,
          passwordHash,
        },
      }),
      12_000,
      "signup user create",
    );
    logger.info({ userId: user.id }, SIGNUP_LOG.userCreated);
    const workspace = await withTimeout(provisionWorkspace(user), 12_000, "signup workspace");
    logger.info({ workspaceId: workspace.id }, SIGNUP_LOG.workspaceCreated);
    scheduleUploadPostProvisioning(workspace.id);
    await ensureReferralProfile(user.id).catch(() => undefined);
    if (input.referralCode) {
      await attributeReferral({ referredUserId: user.id, code: input.referralCode }).catch(() => undefined);
    }

    try {
      const rawToken = await issueAuthToken("verify", email);
      logger.info("EMAIL VERIFY TOKEN CREATED");
      const sent = await withTimeout(
        sendVerificationEmail({ to: email, userId: user.id, name: user.name, rawToken }),
        5_000,
        "signup email queue",
      );
      if (!sent.queued && !sent.duplicate) {
        logger.warn(signupErrorLog("EMAIL_QUEUE"));
      }
      return { ok: true, userId: user.id, workspaceId: workspace.id, email, outboxId: sent.outboxId ?? null };
    } catch {
      logger.warn(signupErrorLog("EMAIL_QUEUE"));
      return { ok: true, userId: user.id, workspaceId: workspace.id, email, outboxId: null };
    }
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      logger.info(signupErrorLog("EMAIL_IN_USE"));
      return { ok: false, error: "Este e-mail já está em uso.", code: "EMAIL_IN_USE" };
    }
    logger.warn({ errType: error instanceof Error ? error.name : "Error" }, signupErrorLog("DATABASE"));
    return { ok: false, error: "Não foi possível criar a conta. Tente novamente.", code: "DATABASE" };
  }
}
