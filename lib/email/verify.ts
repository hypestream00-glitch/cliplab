import { prisma } from "@/lib/db/prisma";
import { consumeAuthToken } from "@/lib/email/tokens";
import { sendWelcomeEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import { safeErrorType } from "@/lib/async/timeout";

export function verificationFailureMessage(reason: "invalid" | "expired") {
  if (reason === "expired") {
    return "Este link de verificação expirou. Solicite um novo e-mail para continuar.";
  }
  return "Este link de verificação não é mais válido.";
}

export async function confirmEmailFromToken(raw: string) {
  const consumed = await consumeAuthToken("verify", raw);
  if (!consumed.ok) return consumed;
  const user = await prisma.user.findUnique({
    where: { email: consumed.email },
    select: { id: true, email: true, name: true, emailVerified: true, onboardingCompleted: true },
  });
  if (!user) return { ok: false as const, reason: "invalid" as const };
  if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
    try {
      await sendWelcomeEmail({ to: user.email, userId: user.id, name: user.name });
    } catch (error) {
      logger.warn({ errType: safeErrorType(error) }, "EMAIL WELCOME QUEUE FAILED");
    }
  }
  return {
    ok: true as const,
    email: user.email,
    userId: user.id,
    onboardingCompleted: user.onboardingCompleted,
  };
}
