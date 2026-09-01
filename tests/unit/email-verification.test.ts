import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken, randomToken } from "@/lib/security/crypto";
import { normalizeRawToken } from "@/lib/email/token-encoding";
import {
  appOrigin,
  isForbiddenPublicVerifyUrl,
  isUsablePublicActionUrl,
  verificationEmailUrl,
} from "@/lib/email/app-url";
import { isEmailLinkPrefetch, isEmailLinkHead } from "@/lib/email/verify-request";
import { verificationFailureMessage } from "@/lib/email/verify";
import { emailProviderName } from "@/lib/email/config";
import { getEmailProvider } from "@/lib/email/send-email";
import { ResendEmailProvider } from "@/lib/email/resend-provider";
import { renderEmailTemplate } from "@/lib/email/templates";

type TokenRow = { identifier: string; token: string; expires: Date };
type UserRow = {
  id: string;
  email: string;
  name: string;
  emailVerified: Date | null;
  onboardingCompleted: boolean;
};

const tokens = new Map<string, TokenRow>();
const users = new Map<string, UserRow>();
const sendEmailMock = vi.fn<(...args: unknown[]) => Promise<{ ok: true }>>(async () => ({ ok: true as const }));
const sendWelcomeMock = vi.fn<(...args: unknown[]) => Promise<{
  ok: true;
  queued: true;
  delivered: false;
  duplicate: false;
  outboxId: string;
}>>(async () => ({
  ok: true as const,
  queued: true,
  delivered: false,
  duplicate: false,
  outboxId: "welcome_1",
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    verificationToken: {
      create: async ({ data }: { data: TokenRow }) => {
        tokens.set(data.token, { ...data });
        return data;
      },
      deleteMany: async ({ where }: { where: { identifier?: string | { startsWith?: string } } }) => {
        let count = 0;
        for (const [hash, row] of [...tokens.entries()]) {
          const identifier = where.identifier;
          const match =
            typeof identifier === "string"
              ? row.identifier === identifier
              : Boolean(identifier?.startsWith && row.identifier.startsWith(identifier.startsWith));
          if (match) {
            tokens.delete(hash);
            count += 1;
          }
        }
        return { count };
      },
      findFirst: async ({
        where,
      }: {
        where: { token?: string; identifier?: string | { startsWith?: string } };
        orderBy?: { expires: string };
      }) => {
        const rows = [...tokens.values()];
        if (where.token) {
          const row = tokens.get(where.token);
          if (!row) return null;
          if (typeof where.identifier === "object" && where.identifier.startsWith && !row.identifier.startsWith(where.identifier.startsWith)) {
            return null;
          }
          if (typeof where.identifier === "string" && row.identifier !== where.identifier) return null;
          return row;
        }
        if (typeof where.identifier === "string") {
          return rows.find((row) => row.identifier === where.identifier) ?? null;
        }
        return null;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return users.get(where.email.toLowerCase()) ?? null;
        if (where.id) return [...users.values()].find((user) => user.id === where.id) ?? null;
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { emailVerified?: Date } }) => {
        const user = [...users.values()].find((row) => row.id === where.id);
        if (!user) throw new Error("user not found");
        if (data.emailVerified) user.emailVerified = data.emailVerified;
        return user;
      },
    },
    emailOutbox: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "ob_verify",
        status: "PENDING",
        ...data,
      }),
    },
  },
}));

vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    sendWelcomeEmail: (params: unknown) => sendWelcomeMock(params),
  };
});

vi.mock("@/lib/email/send-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send-email")>();
  return {
    ...actual,
    sendEmail: (message: unknown) => sendEmailMock(message),
  };
});

const root = path.resolve(__dirname, "../..");

function addUser(email: string, id = `user_${email}`) {
  const row: UserRow = {
    id,
    email: email.toLowerCase(),
    name: email.split("@")[0] ?? "User",
    emailVerified: null,
    onboardingCompleted: false,
  };
  users.set(row.email, row);
  return row;
}

describe("email verification A–K", () => {
  afterEach(() => {
    tokens.clear();
    users.clear();
    sendEmailMock.mockClear();
    sendWelcomeMock.mockClear();
    vi.unstubAllEnvs();
  });

  it("A) signup generates a hashed token that peeks and consumes as the same raw value", async () => {
    const { issueAuthToken, peekAuthToken, consumeAuthToken } = await import("@/lib/email/tokens");
    addUser("ana@example.com", "user_ana");
    const raw = await issueAuthToken("verify", "ana@example.com");
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect([...tokens.values()][0]?.token).toBe(hashToken(raw));
    expect([...tokens.values()][0]?.token).not.toBe(raw);
    expect(await peekAuthToken("verify", raw)).toEqual({ ok: true, email: "ana@example.com" });
    expect(tokens.size).toBe(1);
    expect(await consumeAuthToken("verify", raw)).toEqual({ ok: true, email: "ana@example.com" });
    expect(tokens.size).toBe(0);
  });

  it("B) confirmation URL uses https://cortaclip.com", () => {
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    vi.stubEnv("AUTH_URL", "https://cortaclip.com");
    const url = verificationEmailUrl("abc_token");
    expect(url).toBe("https://cortaclip.com/verify-email?token=abc_token");
    expect(appOrigin()).toBe("https://cortaclip.com");
  });

  it("C) a valid token confirms only that user", async () => {
    const { issueAuthToken } = await import("@/lib/email/tokens");
    const { confirmEmailFromToken } = await import("@/lib/email/verify");
    const ana = addUser("ana@example.com", "user_ana");
    const raw = await issueAuthToken("verify", ana.email);
    const result = await confirmEmailFromToken(raw);
    expect(result).toMatchObject({ ok: true, email: "ana@example.com", userId: "user_ana" });
    expect(ana.emailVerified).toBeInstanceOf(Date);
    expect(sendWelcomeMock).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com", userId: "user_ana" }));
  });

  it("D) invalid token returns a controlled error", async () => {
    const { confirmEmailFromToken } = await import("@/lib/email/verify");
    addUser("ana@example.com", "user_ana");
    const result = await confirmEmailFromToken("not-a-real-token");
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(verificationFailureMessage("invalid")).toMatch(/não é mais válido/i);
    expect(users.get("ana@example.com")?.emailVerified).toBeNull();
  });

  it("E) expired token returns a controlled error", async () => {
    const { issueAuthToken, consumeAuthToken } = await import("@/lib/email/tokens");
    const { confirmEmailFromToken } = await import("@/lib/email/verify");
    addUser("ana@example.com", "user_ana");
    const raw = await issueAuthToken("verify", "ana@example.com");
    const stored = [...tokens.values()][0];
    if (stored) stored.expires = new Date(Date.now() - 1000);
    const result = await confirmEmailFromToken(raw);
    expect(result).toMatchObject({ ok: false, reason: "expired", email: "ana@example.com" });
    expect(verificationFailureMessage("expired")).toMatch(/expirou/i);
    expect(users.get("ana@example.com")?.emailVerified).toBeNull();
    expect(await consumeAuthToken("verify", raw)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("F) a token cannot confirm the wrong user", async () => {
    const { issueAuthToken } = await import("@/lib/email/tokens");
    const { confirmEmailFromToken } = await import("@/lib/email/verify");
    const ana = addUser("ana@example.com", "user_ana");
    const bruno = addUser("bruno@example.com", "user_bruno");
    const raw = await issueAuthToken("verify", ana.email);
    const result = await confirmEmailFromToken(raw);
    expect(result).toMatchObject({ ok: true, email: "ana@example.com", userId: "user_ana" });
    expect(ana.emailVerified).toBeInstanceOf(Date);
    expect(bruno.emailVerified).toBeNull();
  });

  it("G) resend invalidates previous verify tokens", async () => {
    const { issueAuthToken, peekAuthToken, consumeAuthToken } = await import("@/lib/email/tokens");
    addUser("ana@example.com", "user_ana");
    const first = await issueAuthToken("verify", "ana@example.com");
    const second = await issueAuthToken("verify", "ana@example.com");
    expect(await peekAuthToken("verify", first)).toEqual({ ok: false, reason: "invalid" });
    expect(await peekAuthToken("verify", second)).toEqual({ ok: true, email: "ana@example.com" });
    expect(await consumeAuthToken("verify", first)).toEqual({ ok: false, reason: "invalid" });
    expect(await consumeAuthToken("verify", second)).toEqual({ ok: true, email: "ana@example.com" });
  });

  it("H) confirmation links are HTTPS in production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    vi.stubEnv("AUTH_URL", "https://cortaclip.com");
    const raw = randomToken();
    const url = verificationEmailUrl(raw);
    expect(url.startsWith("https://cortaclip.com/verify-email?token=")).toBe(true);
    expect(new URL(url).protocol).toBe("https:");
    expect(decodeURIComponent(new URL(url).searchParams.get("token") ?? "")).toBe(raw);
  });

  it("I) public verify links never use CLIPLAB, localhost, or Railway", () => {
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    vi.stubEnv("AUTH_URL", "https://cortaclip.com");
    const url = verificationEmailUrl("tok");
    const html = renderEmailTemplate("verify-email", { name: "Ana", actionUrl: url });
    const publicText = `${url}\n${html.html}\n${html.text}`;
    expect(publicText).not.toMatch(/localhost|127\.0\.0\.1|railway\.app|cliplab/i);
    expect(isForbiddenPublicVerifyUrl(url)).toBe(false);
    expect(isUsablePublicActionUrl(url)).toBe(true);
    expect(isForbiddenPublicVerifyUrl("https://cliplab-production-6972.up.railway.app/verify-email?token=x")).toBe(true);
    expect(isForbiddenPublicVerifyUrl("http://localhost:3000/verify-email?token=x")).toBe(true);
  });

  it("J) flow selects Resend when RESEND_API_KEY is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_not_for_network");
    vi.stubEnv("EMAIL_FROM", "CortaClip <noreply@cortaclip.com>");
    vi.stubEnv("ENCRYPTION_KEY", "test-encryption-key-for-cliplab");
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    expect(emailProviderName()).toBe("resend");
    expect(getEmailProvider().name).toBe("resend");
    const { sendVerificationEmail } = await import("@/lib/email/send");
    const sent = await sendVerificationEmail({ to: "ana@example.com", userId: "user_ana", rawToken: "raw-verify-token" });
    expect(sent.queued).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("K) tests never send a real email", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_not_for_network");
    vi.stubEnv("EMAIL_FROM", "noreply@cortaclip.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("network should not run in tests");
    });
    const result = await new ResendEmailProvider().send({
      to: "ana@example.com",
      subject: "x",
      html: "<p>x</p>",
      text: "x",
    });
    expect(result).toEqual({ ok: false, error: "TEST_OR_BUILD" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("token encoding and scanners", () => {
  afterEach(() => {
    tokens.clear();
    users.clear();
    vi.unstubAllEnvs();
  });

  it("round-trips encodeURIComponent and whitespace wrapping for base64url tokens", async () => {
    const { issueAuthToken, peekAuthToken } = await import("@/lib/email/tokens");
    addUser("ana@example.com");
    const raw = await issueAuthToken("verify", "ana@example.com");
    const encoded = encodeURIComponent(raw);
    expect(normalizeRawToken(encoded)).toBe(raw);
    expect(normalizeRawToken(` ${raw}\n`)).toBe(raw);
    expect(await peekAuthToken("verify", encoded)).toEqual({ ok: true, email: "ana@example.com" });
    expect(await peekAuthToken("verify", ` \n${raw} `)).toEqual({ ok: true, email: "ana@example.com" });
  });

  it("treats Outlook/Safe Links prefetch and HEAD as non-consuming", () => {
    expect(isEmailLinkHead("HEAD")).toBe(true);
    expect(isEmailLinkPrefetch({ get: (name) => (name === "purpose" ? "prefetch" : null) })).toBe(true);
    expect(isEmailLinkPrefetch({ get: (name) => (name === "sec-purpose" ? "prefetch" : null) })).toBe(true);
    expect(isEmailLinkPrefetch({ get: (name) => (name === "next-router-prefetch" ? "1" : null) })).toBe(true);
    expect(
      isEmailLinkPrefetch({
        get: (name) => (name === "user-agent" ? "Mozilla/5.0 Microsoft Office Outlook SafeLinks" : null),
      }),
    ).toBe(true);
    expect(isEmailLinkPrefetch({ get: () => null })).toBe(false);
  });
});

describe("E1180 cookie mutation during render", () => {
  it("is Next.js ReadonlyRequestCookiesError", () => {
    const source = readFileSync(
      path.join(root, "node_modules/next/dist/server/web/spec-extension/adapters/request-cookies.js"),
      "utf8",
    );
    expect(source).toContain('value: "E1180"');
    expect(source).toContain("Cookies can only be modified in a Server Action or Route Handler");
  });

  it("verify-email page peeks on GET and never mutates cookies or consumes during render", () => {
    const page = readFileSync(path.join(root, "app/(auth)/verify-email/page.tsx"), "utf8");
    const actions = readFileSync(path.join(root, "app/(auth)/actions.ts"), "utf8");
    expect(page).toContain("peekAuthToken");
    expect(page).toContain("isEmailLinkPrefetch");
    expect(page).toContain("ConfirmEmailClient");
    expect(page).not.toContain("verifyEmailByToken");
    expect(page).not.toContain("confirmEmailFromToken");
    expect(page).not.toContain("setVerifyEmailHint");
    expect(page).not.toContain("clearVerifyEmailHint");
    expect(page).not.toContain("consumeAuthToken");
    expect(actions).toContain("confirmEmailVerificationAction");
    expect(actions).not.toMatch(/export async function verifyEmailByToken/);
  });
});
