import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { hashPassword } from "../lib/auth/password";

async function main() {
  const email = process.env.DEV_OWNER_EMAIL?.trim();
  const password = process.env.DEV_OWNER_PASSWORD;

  if (process.env.NODE_ENV === "production") {
    console.error("auth:dev-owner is not allowed in production.");
    process.exit(1);
  }

  if (!email || !password || password.length < 8) {
    console.error("Set DEV_OWNER_EMAIL and DEV_OWNER_PASSWORD (min 8 chars) in the environment. Password is never printed.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error("No user found for DEV_OWNER_EMAIL.");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      onboardingCompleted: true,
      onboardingCompletedAt: user.onboardingCompletedAt ?? new Date(),
    },
  });

  console.log("Local owner password updated for the configured DEV_OWNER_EMAIL. Value not printed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
