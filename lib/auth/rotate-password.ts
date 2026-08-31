import { prisma } from "@/lib/db/prisma";

/** Hash already computed. Invalidates JWT via passwordChangedAt and Auth.js DB sessions. */
export async function rotateUserPassword(userId: string, passwordHash: string) {
  const passwordChangedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt },
    }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  return passwordChangedAt;
}
