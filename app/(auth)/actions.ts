"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { signUpSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations";
import { rateLimitGuard } from "@/lib/security/guard";
import { consumeAuthToken, issueAuthToken, latestTokenIssuedAt, peekAuthToken } from "@/lib/email/tokens";
import { canConfirmVerificationResend, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email/send";
import { clearVerifyEmailHint, getVerifyEmailHint, setVerifyEmailHint } from "@/lib/email/hint-cookie";
import { confirmEmailFromToken, verificationFailureMessage } from "@/lib/email/verify";
import { logger } from "@/lib/logger";
import { completeSignup, SIGNUP_LOG, signupErrorLog } from "@/lib/auth/register";
import { isNextRedirectError, safeErrorType, withTimeout } from "@/lib/async/timeout";
import { after } from "next/server";
import { flushEmail, processEmailOutbox } from "@/lib/email/outbox";
import { isEmailConfigured } from "@/lib/email/config";
import { getReferralCookie } from "@/lib/referral/cookie";

const RESEND_COOLDOWN_MS = 60_000;

export async function registerAction(_prev: unknown, formData: FormData) {
  logger.info(SIGNUP_LOG.start);
  try {
    const limited = await withTimeout(rateLimitGuard("register", 8, 15 * 60_000), 4_000, "signup rate limit").catch(
      () => null,
    );
    if (limited) {
      logger.info(signupErrorLog("RATE_LIMIT"));
      return limited;
    }
    const parsed = signUpSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      terms: formData.get("terms") === "on" ? true : undefined,
    });
    if (!parsed.success) {
      logger.info(signupErrorLog("VALIDATION"));
      return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }
    logger.info(SIGNUP_LOG.validationOk);

    const result = await completeSignup({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      referralCode: String(formData.get("ref") ?? "") || (await getReferralCookie()),
    });
    if (!result.ok) return { error: result.error };

    logger.info(SIGNUP_LOG.sessionStart);
    await setVerifyEmailHint(result.email);
    logger.info(SIGNUP_LOG.sessionOk);
    logger.info({ userId: result.userId }, SIGNUP_LOG.complete);
    logger.info({ userId: result.userId }, "user registered pending email verification");
    const outboxId = result.outboxId;
    after(() => {
      void (async () => {
        try {
          if (outboxId) await withTimeout(flushEmail(outboxId), 8_000, "signup email flush");
          else await processEmailOutbox(5);
        } catch (error) {
          logger.warn({ errType: safeErrorType(error) }, "EMAIL SMTP ERROR: Timeout");
        }
      })();
    });
    redirect("/verify-email");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const type = safeErrorType(error);
    logger.warn({ errType: type }, signupErrorLog(type));
    return { error: "Não foi possível criar a conta. Tente novamente." };
  }
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const limited = await rateLimitGuard("login", 12, 15 * 60_000);
  if (limited) return limited;
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.passwordHash && !user.emailVerified) {
    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (valid) {
      await setVerifyEmailHint(email);
      redirect("/verify-email");
    }
  }
  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: "E-mail ou senha inválidos." };
    throw error;
  }
  const next = await prisma.user.findUnique({
    where: { email },
    select: { onboardingCompleted: true },
  });
  redirect(next?.onboardingCompleted ? "/studio" : "/onboarding");
}

export async function googleLoginAction() {
  await signIn("google", { redirectTo: "/studio" });
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const limited = await rateLimitGuard("forgot-password", 6, 15 * 60_000);
  if (limited) return limited;
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "E-mail inválido" };
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.passwordHash) {
    const last = await latestTokenIssuedAt("reset", email);
    if (!last || Date.now() - last.getTime() > RESEND_COOLDOWN_MS) {
      const rawToken = await issueAuthToken("reset", email);
      await sendPasswordResetEmail({ to: email, userId: user.id, name: user.name, rawToken });
    }
  }
  return { ok: true as const };
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const limited = await rateLimitGuard("reset-password", 8, 15 * 60_000);
  if (limited) return limited;
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Não foi possível redefinir a senha." };
  const consumed = await consumeAuthToken("reset", parsed.data.token);
  if (!consumed.ok) {
    return { error: consumed.reason === "expired" ? "Este link expirou. Solicite uma nova redefinição." : "Este link não é mais válido." };
  }
  const user = await prisma.user.findUnique({ where: { email: consumed.email } });
  if (!user) return { error: "Este link não é mais válido." };
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      passwordChangedAt: new Date(),
    },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: `reset:${consumed.email}` } } });
  logger.info({ userId: user.id }, "password reset completed");
  redirect("/login?reset=1");
}

export async function resendVerificationAction(_prev: unknown, formData?: FormData) {
  logger.info("EMAIL RESEND START");
  const limited = await rateLimitGuard("resend-verification", 4, 15 * 60_000);
  if (limited) {
    logger.warn("EMAIL RESEND ERROR: RATE_LIMIT");
    return limited;
  }
  const hintToken = typeof formData?.get("token") === "string" ? String(formData.get("token")) : "";
  let email = await getVerifyEmailHint();
  if (!email && hintToken) {
    const peeked = await peekAuthToken("verify", hintToken);
    email = "email" in peeked && peeked.email ? peeked.email : null;
  }
  if (!email) {
    logger.warn("EMAIL RESEND ERROR: NO_HINT");
    return { error: "Não encontramos um e-mail para reenviar. Entre ou crie a conta novamente." };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return { ok: true as const };
  const last = await latestTokenIssuedAt("verify", email);
  if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) {
    logger.warn("EMAIL RESEND ERROR: COOLDOWN");
    return { error: "Aguarde um minuto antes de reenviar." };
  }
  try {
    const rawToken = await issueAuthToken("verify", email);
    logger.info("EMAIL RESEND TOKEN CREATED");
    const sent = await sendVerificationEmail({ to: email, userId: user.id, name: user.name, rawToken });
    if (!canConfirmVerificationResend(sent, isEmailConfigured())) {
      if (!sent.queued && !("duplicate" in sent && sent.duplicate)) {
        logger.warn(`EMAIL RESEND ERROR: ${"reason" in sent ? sent.reason : "ENQUEUE_FAILED"}`);
        return { error: "Não foi possível enfileirar o e-mail de verificação. Tente novamente." };
      }
      logger.warn("EMAIL RESEND ERROR: CONFIGURATION_REQUIRED");
      return { error: "O serviço de e-mail ainda não está configurado. Tente novamente em alguns minutos." };
    }
    logger.info("EMAIL RESEND QUEUED");
    const outboxId = sent.outboxId;
    after(() => {
      void (async () => {
        try {
          if (outboxId) {
            const flush = await withTimeout(flushEmail(outboxId), 8_000, "resend email flush");
            if (flush.sent) logger.info("EMAIL RESEND SMTP SUCCESS");
          } else {
            await processEmailOutbox(5);
          }
        } catch (error) {
          logger.warn({ errType: safeErrorType(error) }, "EMAIL RESEND ERROR: Timeout");
        }
      })();
    });
    return { ok: true as const };
  } catch (error) {
    logger.warn({ errType: safeErrorType(error) }, `EMAIL RESEND ERROR: ${safeErrorType(error)}`);
    return { error: "Não foi possível reenviar o e-mail. Tente novamente." };
  }
}

export async function confirmEmailVerificationAction(_prev: unknown, formData: FormData) {
  const limited = await rateLimitGuard("confirm-email", 12, 15 * 60_000);
  if (limited) return limited;
  const raw = typeof formData.get("token") === "string" ? String(formData.get("token")) : "";
  if (!raw.trim()) {
    return { error: verificationFailureMessage("invalid") };
  }
  try {
    const result = await confirmEmailFromToken(raw);
    if (!result.ok) {
      return { error: verificationFailureMessage(result.reason) };
    }
    await clearVerifyEmailHint();
    const loginToken = await issueAuthToken("autologin", result.email);
    try {
      await signIn("credentials", {
        email: result.email,
        verifyLoginToken: loginToken,
        password: "verified",
        redirect: false,
      });
    } catch (error) {
      if (error instanceof AuthError) redirect("/login?verified=1");
      throw error;
    }
    redirect(result.onboardingCompleted ? "/studio" : "/onboarding");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    logger.warn({ errType: safeErrorType(error) }, "EMAIL VERIFY CONFIRM ERROR");
    return { error: "Não foi possível confirmar o e-mail. Tente de novo." };
  }
}
