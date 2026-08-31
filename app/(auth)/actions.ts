"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { signUpSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations";
import { rateLimitGuard } from "@/lib/security/guard";
import { ensureProductPlans } from "@/lib/billing/ensure-plans";
import { consumeAuthToken, issueAuthToken, latestTokenIssuedAt } from "@/lib/email/tokens";
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "@/lib/email/send";
import { clearVerifyEmailHint, setVerifyEmailHint } from "@/lib/email/hint-cookie";
import { logger } from "@/lib/logger";

const RESEND_COOLDOWN_MS = 60_000;

function firstNameFrom(name: string) {
  return name.trim().split(/\s+/)[0] || "Criador";
}

async function provisionWorkspace(user: { id: string; name: string | null }) {
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
  if (process.env.SOCIAL_PROVIDER !== "native" && process.env.UPLOAD_POST_API_KEY?.trim()) {
    const { ensureUploadPostProfile } = await import("@/lib/social/upload-post/profiles");
    await ensureUploadPostProfile(workspace.id).catch(() => undefined);
  }
  return workspace;
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const limited = await rateLimitGuard("register", 8, 15 * 60_000);
  if (limited) return limited;
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    terms: formData.get("terms") === "on" ? true : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const email = parsed.data.email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Este e-mail já está em uso." };

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
    },
  });
  await provisionWorkspace(user);
  const rawToken = await issueAuthToken("verify", email);
  await sendVerificationEmail({ to: email, userId: user.id, name: user.name, rawToken });
  await setVerifyEmailHint(email);
  logger.info({ userId: user.id }, "user registered pending email verification");
  redirect("/verify-email");
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
