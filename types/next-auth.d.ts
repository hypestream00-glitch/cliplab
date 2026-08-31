import type { Session } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "USER" | "SUPER_ADMIN";
      onboardingCompleted: boolean;
    };
  }

  interface User {
    role?: "USER" | "SUPER_ADMIN";
    onboardingCompleted?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "USER" | "SUPER_ADMIN";
    onboardingCompleted?: boolean;
  }
}

export type AppSession = Session;
