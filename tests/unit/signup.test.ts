import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_LOG, signupAppUrlOk, signupErrorLog } from "@/lib/auth/register";
import { withTimeout, isNextRedirectError, safeErrorType } from "@/lib/async/timeout";
import { appOrigin, appPathUrl } from "@/lib/email/app-url";

const findUnique = vi.fn();
const userCreate = vi.fn();
const workspaceCreate = vi.fn();
const planFindUnique = vi.fn();
const subscriptionCreate = vi.fn();
const hashMock = vi.fn(async (_password: string) => "$2a$12$hashed");
const issueToken = vi.fn(async (_kind: string, _email: string) => "raw-verify-token");
const sendVerify = vi.fn(async (_params: unknown) => ({ ok: true, id: "verify-email", delivered: false, duplicate: false }));
const ensurePlans = vi.fn(async () => undefined);

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
    workspace: { create: (...args: unknown[]) => workspaceCreate(...args) },
    plan: { findUnique: (...args: unknown[]) => planFindUnique(...args) },
    subscription: { create: (...args: unknown[]) => subscriptionCreate(...args) },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: (password: string) => hashMock(password),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/email/tokens", () => ({
  issueAuthToken: (kind: string, email: string) => issueToken(kind, email),
}));

vi.mock("@/lib/email/send", () => ({
  sendVerificationEmail: (params: unknown) => sendVerify(params),
}));

vi.mock("@/lib/billing/ensure-plans", () => ({
  ensureProductPlans: () => ensurePlans(),
}));

describe("signup timeouts", () => {
  it("rejects a hanging promise instead of waiting forever", async () => {
    const hanging = new Promise<string>(() => undefined);
    const started = Date.now();
    await expect(withTimeout(hanging, 25, "hang")).rejects.toThrow("hang timeout");
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("detects Next.js redirects so signup can rethrow them", () => {
    expect(isNextRedirectError({ digest: "NEXT_REDIRECT;replace;/verify-email;307;" })).toBe(true);
    expect(isNextRedirectError(new Error("db down"))).toBe(false);
    expect(safeErrorType({ code: "P2002" })).toBe("Prisma P2002");
  });
});

describe("completeSignup", () => {
  afterEach(() => {
    findUnique.mockReset();
    userCreate.mockReset();
    workspaceCreate.mockReset();
    planFindUnique.mockReset();
    subscriptionCreate.mockReset();
    hashMock.mockReset();
    hashMock.mockResolvedValue("$2a$12$hashed");
    issueToken.mockReset();
    issueToken.mockResolvedValue("raw-verify-token");
    sendVerify.mockReset();
    sendVerify.mockResolvedValue({ ok: true, id: "verify-email", delivered: false, duplicate: false });
    ensurePlans.mockReset();
    delete process.env.UPLOAD_POST_API_KEY;
  });

  it("creates a new user and workspace without sending SMTP on the critical path", async () => {
    findUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "user_1", name: "Pablo", email: "pablo@example.com" });
    workspaceCreate.mockResolvedValue({ id: "ws_1" });
    planFindUnique.mockResolvedValue({ id: "plan_free", code: "FREE" });
    subscriptionCreate.mockResolvedValue({ id: "sub_1" });
    const { completeSignup } = await import("@/lib/auth/register");
    const result = await completeSignup({ name: "Pablo", email: "pablo@example.com", password: "secret123" });
    expect(result).toEqual({ ok: true, userId: "user_1", workspaceId: "ws_1", email: "pablo@example.com" });
    expect(hashMock).toHaveBeenCalledWith("secret123");
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "pablo@example.com", passwordHash: "$2a$12$hashed" }),
      }),
    );
    expect(sendVerify).toHaveBeenCalledWith(expect.objectContaining({ to: "pablo@example.com", userId: "user_1" }));
  });

  it("rejects an email that already exists", async () => {
    findUnique.mockResolvedValue({ id: "existing" });
    const { completeSignup } = await import("@/lib/auth/register");
    const result = await completeSignup({ name: "Pablo", email: "pablo@example.com", password: "secret123" });
    expect(result).toEqual({ ok: false, error: "Este e-mail já está em uso.", code: "EMAIL_IN_USE" });
    expect(userCreate).not.toHaveBeenCalled();
    expect(sendVerify).not.toHaveBeenCalled();
  });

  it("returns a controlled database error", async () => {
    findUnique.mockResolvedValue(null);
    userCreate.mockRejectedValue(new Error("db down"));
    const { completeSignup } = await import("@/lib/auth/register");
    const result = await completeSignup({ name: "Pablo", email: "pablo@example.com", password: "secret123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DATABASE");
    expect(sendVerify).not.toHaveBeenCalled();
  });

  it("still completes when verification email is unavailable", async () => {
    findUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "user_1", name: "Pablo", email: "pablo@example.com" });
    workspaceCreate.mockResolvedValue({ id: "ws_1" });
    planFindUnique.mockResolvedValue(null);
    sendVerify.mockRejectedValue(new Error("SMTP down"));
    const { completeSignup } = await import("@/lib/auth/register");
    const result = await completeSignup({ name: "Pablo", email: "pablo@example.com", password: "secret123" });
    expect(result.ok).toBe(true);
  });
});

describe("signup production URLs", () => {
  it("requires public HTTPS APP_URL/AUTH_URL and does not use localhost in verify links when set", () => {
    expect(signupAppUrlOk({ APP_URL: "https://cliplab-production-6972.up.railway.app" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(signupAppUrlOk({ APP_URL: "http://localhost:3000" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    const prevApp = process.env.APP_URL;
    const prevAuth = process.env.AUTH_URL;
    process.env.APP_URL = "https://cliplab-production-6972.up.railway.app";
    process.env.AUTH_URL = "https://cliplab-production-6972.up.railway.app";
    expect(appOrigin()).toBe("https://cliplab-production-6972.up.railway.app");
    expect(appPathUrl("/verify-email?token=abc")).toBe(
      "https://cliplab-production-6972.up.railway.app/verify-email?token=abc",
    );
    expect(appPathUrl("/verify-email")).not.toContain("localhost");
    if (prevApp) process.env.APP_URL = prevApp;
    else delete process.env.APP_URL;
    if (prevAuth) process.env.AUTH_URL = prevAuth;
    else delete process.env.AUTH_URL;
  });

  it("uses the required signup log lines", () => {
    expect(SIGNUP_LOG.start).toBe("SIGNUP START");
    expect(SIGNUP_LOG.complete).toBe("SIGNUP COMPLETE");
    expect(signupErrorLog("TimeoutError")).toBe("SIGNUP ERROR: TimeoutError");
  });
});
