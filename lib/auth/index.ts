import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validations";
import { verifyPassword } from "@/lib/auth/password";
import { logger } from "@/lib/logger";

const googleReady = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/verify-email",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
        verifyLoginToken: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const verifyLoginToken =
          typeof credentials?.verifyLoginToken === "string" ? credentials.verifyLoginToken : "";
        if (verifyLoginToken) {
          const { consumeAuthToken } = await import("@/lib/email/tokens");
          const consumed = await consumeAuthToken("autologin", verifyLoginToken);
          if (!consumed.ok) return null;
          const user = await prisma.user.findUnique({ where: { email: consumed.email } });
          if (!user?.emailVerified) return null;
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        }
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;
        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            success: valid,
            userAgent: "credentials",
          },
        });
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    ...(googleReady
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            role: true,
            onboardingCompleted: true,
            name: true,
            email: true,
            image: true,
            passwordChangedAt: true,
            emailVerified: true,
          },
        });
        if (dbUser) {
          if (dbUser.passwordChangedAt && typeof token.iat === "number" && dbUser.passwordChangedAt.getTime() / 1000 > token.iat) {
            return {};
          }
          token.role = dbUser.role;
          token.onboardingCompleted = dbUser.onboardingCompleted;
          token.name = dbUser.name;
          token.email = dbUser.email;
          token.picture = dbUser.image;
          token.emailVerified = Boolean(dbUser.emailVerified);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as "USER" | "SUPER_ADMIN") ?? "USER";
        session.user.onboardingCompleted = Boolean(token.onboardingCompleted);
        session.user.name = (token.name as string | null | undefined) ?? session.user.name;
        session.user.email = (token.email as string | null | undefined) ?? session.user.email;
        session.user.image = (token.picture as string | null | undefined) ?? session.user.image;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      logger.info({ userId: user.id }, "user signed in");
      if (account?.provider === "google" && user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        }).catch(() => undefined);
      }
    },
  },
});

export const isGoogleAuthEnabled = googleReady;
