"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { signUpSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations";
import { rateLimitGuard } from "@/lib/security/guard";
import { consumeAuthToken, issueAuthToken, latestTokenIssuedAt } from "@/lib/email/tokens";
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "@/lib/email/send";
import { clearVerifyEmailHint, setVerifyEmailHint } from "@/lib/email/hint-cookie";
import { logger } from "@/lib/logger";
import { completeSignup, SIGNUP_LOG, signupErrorLog } from "@/lib/auth/register";
import { isNextRedirectError, safeErrorType, withTimeout } from "@/lib/async/timeout";

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
    });
    if (!result.ok) return { error: result.error };

    logger.info(SIGNUP_LOG.sessionStart);
    await setVerifyEmailHint(result.email);
    logger.info(SIGNUP_LOG.sessionOk);
    logger.info({ userId: result.userId }, SIGNUP_LOG.complete);
    logger.info({ userId: result.userId }, "user registered pending email verification");
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

export async function resendVerificationAction() {
  const limited = await rateLimitGuard("resend-verification", 4, 15 * 60_000);
  if (limited) return limited;
  const email = await (await import("@/lib/email/hint-cookie")).getVerifyEmailHint();
  if (!email) return { error: "Não encontramos um e-mail para reenviar. Entre ou crie a conta novamente." };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return { ok: true as const };
  const last = await latestTokenIssuedAt("verify", email);
  if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) {
    return { error: "Aguarde um minuto antes de reenviar." };
  }
  const rawToken = await issueAuthToken("verify", email);
  await sendVerificationEmail({ to: email, userId: user.id, name: user.name, rawToken });
  return { ok: true as const };
}

export async function verifyEmailByToken(raw: string) {
  const consumed = await consumeAuthToken("verify", raw);
  if (!consumed.ok) return consumed;
  const user = await prisma.user.findUnique({ where: { email: consumed.email } });
  if (!user) return { ok: false as const, reason: "invalid" as const };
  if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
    await sendWelcomeEmail({ to: user.email, userId: user.id, name: user.name });
  }
  await clearVerifyEmailHint();
  const loginToken = await issueAuthToken("autologin", user.email);
  await signIn("credentials", { email: user.email, verifyLoginToken: loginToken, password: "verified", redirect: false });
  return { ok: true as const, onboardingCompleted: user.onboardingCompleted };
}
