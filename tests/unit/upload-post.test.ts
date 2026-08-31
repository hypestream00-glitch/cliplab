import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { socialBackend, isUploadPostPrimary } from "@/lib/social/router";
import { mapUploadPostStatus, publicationStatusFromResults } from "@/lib/social/upload-post/status";
import { normalizeUploadPostAnalytics } from "@/lib/social/upload-post/analytics";
import { verifyUploadPostSignature } from "@/lib/social/upload-post/webhooks";
import { toUploadPostPlatform, fromUploadPostPlatform, getSupportedPlatforms } from "@/lib/social/upload-post/platforms";
import { setUploadPostHttpForTests, parseUploadPostError } from "@/lib/social/upload-post/http";
import { UploadPostConfigError, UploadPostPlanError, friendlyUploadPostMessage } from "@/lib/social/upload-post/errors";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { getUploadPostStatus, testUploadPostConnection } from "@/lib/social/upload-post/diagnose";
import { getSocialProvider } from "@/lib/social";
import { LOG_REDACT_PATHS } from "@/lib/logger";

const findProfile = vi.fn();
const createProfile = vi.fn();
const updateProfile = vi.fn();
const findAccount = vi.fn();
const upsertAccount = vi.fn();
const findManyAccounts = vi.fn();
const updateAccount = vi.fn();
const deleteAccount = vi.fn();
const updateLive = vi.fn();
const createAudit = vi.fn();
const findPublication = vi.fn();
const updatePublication = vi.fn();
const updateManyTargets = vi.fn();
const updateTarget = vi.fn();
const createUsage = vi.fn();
const createWebhookEvent = vi.fn();
const findClip = vi.fn();
const updateSchedule = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    uploadPostProfile: {
      findUnique: (...args: unknown[]) => findProfile(...args),
      create: (...args: unknown[]) => createProfile(...args),
      update: (...args: unknown[]) => updateProfile(...args),
    },
    socialAccount: {
      findFirst: (...args: unknown[]) => findAccount(...args),
      findMany: (...args: unknown[]) => findManyAccounts(...args),
      upsert: (...args: unknown[]) => upsertAccount(...args),
      update: (...args: unknown[]) => updateAccount(...args),
      delete: (...args: unknown[]) => deleteAccount(...args),
    },
    liveChannel: { updateMany: (...args: unknown[]) => updateLive(...args) },
    auditLog: { create: (...args: unknown[]) => createAudit(...args) },
    socialPublication: {
      findFirst: (...args: unknown[]) => findPublication(...args),
      update: (...args: unknown[]) => updatePublication(...args),
    },
    socialPublicationTarget: {
      updateMany: (...args: unknown[]) => updateManyTargets(...args),
      update: (...args: unknown[]) => updateTarget(...args),
    },
    socialUsageEvent: { create: (...args: unknown[]) => createUsage(...args) },
    processedWebhookEvent: { create: (...args: unknown[]) => createWebhookEvent(...args) },
    clip: { findFirst: (...args: unknown[]) => findClip(...args) },
    schedule: { updateMany: (...args: unknown[]) => updateSchedule(...args) },
  },
}));

describe("social provider router", () => {
  it("defaults to upload-post", () => {
    const prev = process.env.SOCIAL_PROVIDER;
    delete process.env.SOCIAL_PROVIDER;
    expect(socialBackend()).toBe("upload-post");
    expect(isUploadPostPrimary()).toBe(true);
    process.env.SOCIAL_PROVIDER = "native";
    expect(socialBackend()).toBe("native");
    process.env.SOCIAL_PROVIDER = prev;
  });

  it("keeps native getSocialProvider for legacy tests", () => {
    const prevKey = process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_ID;
    const provider = getSocialProvider("TIKTOK");
    expect(provider.mocked).toBe(false);
    if (prevKey) process.env.TIKTOK_CLIENT_KEY = prevKey;
  });
});

describe("missing API key", () => {
  it("does not pretend OAuth exists", () => {
    const prev = process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_API_KEY;
    expect(isUploadPostConfigured()).toBe(false);
    if (prev) process.env.UPLOAD_POST_API_KEY = prev;
  });
});

describe("status mapping", () => {
  it("does not mark published just because a request was accepted", () => {
    expect(publicationStatusFromResults({ topStatus: "queued" })).toBe("QUEUED");
    expect(publicationStatusFromResults({ topStatus: "completed" })).toBe("PROCESSING");
    expect(
      publicationStatusFromResults({
        topStatus: "completed",
        results: [{ success: true, status: "completed" }, { success: true, status: "completed" }],
      }),
    ).toBe("PUBLISHED");
    expect(mapUploadPostStatus("pending", { scheduled: true })).toBe("SCHEDULED");
    expect(mapUploadPostStatus("failed")).toBe("FAILED");
  });
});

describe("platform map", () => {
  it("maps X to twitter on upload and back", () => {
    expect(toUploadPostPlatform("X")).toBe("twitter");
    expect(fromUploadPostPlatform("twitter")).toBe("X");
    expect(fromUploadPostPlatform("x")).toBe("X");
  });
});

describe("analytics normalization", () => {
  it("does not invent missing metrics", () => {
    const normalized = normalizeUploadPostAnalytics({ followers: 10, views: 100 });
    expect(normalized.followers).toBe(10);
    expect(normalized.views).toBe(100);
    expect(normalized.likes).toBeNull();
    expect(normalized.available.likes).toBe(false);
    expect(normalized.available.followers).toBe(true);
  });
});

describe("webhook signature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts official HMAC", () => {
    const secret = "whsec_test";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"event":"upload_completed"}';
    const sig = createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");
    expect(verifyUploadPostSignature({ rawBody: body, timestamp: ts, signature: `sha256=${sig}`, secret })).toBe(true);
    expect(verifyUploadPostSignature({ rawBody: body, timestamp: ts, signature: "deadbeef", secret })).toBe(false);
  });

  it("rejects unsigned webhooks in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPLOAD_POST_WEBHOOK_SECRET", "");
    const { handleUploadPostWebhook } = await import("@/lib/social/upload-post/webhooks");
    const result = await handleUploadPostWebhook({
      rawBody: "{}",
      signature: null,
      timestamp: null,
      event: "upload_completed",
      deliveryId: "d1",
    });
    expect(result).toEqual({ ok: false, status: 401, error: "Webhook secret required" });
  });
});

describe("plan limitation", () => {
  it("maps PROFILE_LIMIT_REACHED", () => {
    const error = parseUploadPostError(403, { error_code: "PROFILE_LIMIT_REACHED", message: "limit" }, "x");
    expect(error).toBeInstanceOf(UploadPostPlanError);
    expect(error.message).toContain("Limite de perfis");
  });
});

describe("redaction", () => {
  it("redacts upload-post secrets", () => {
    expect(LOG_REDACT_PATHS).toContain("UPLOAD_POST_API_KEY");
    expect(LOG_REDACT_PATHS).toContain("UPLOAD_POST_WEBHOOK_SECRET");
  });
});

describe("upload-post http mock", () => {
  afterEach(() => {
    setUploadPostHttpForTests(null);
    findProfile.mockReset();
    createProfile.mockReset();
    findManyAccounts.mockReset();
    upsertAccount.mockReset();
    createUsage.mockReset();
    findAccount.mockReset();
    deleteAccount.mockReset();
    updateProfile.mockReset();
    findPublication.mockReset();
    updatePublication.mockReset();
    updateLive.mockReset();
    createAudit.mockReset();
  });

  it("creates profile and is idempotent on 409", async () => {
    const calls: string[] = [];
    setUploadPostHttpForTests({
      async request(opts) {
        calls.push(`${opts.method} ${opts.path}`);
        if (opts.method === "POST" && opts.path === "/uploadposts/users") {
          return { status: 409, json: { success: false }, text: "" };
        }
        if (opts.path === "/uploadposts/users") {
          return {
            status: 200,
            json: { success: true, limit: 10, plan: "Professional", profiles: [{ username: "cliplab_ws1" }] },
            text: "",
          };
        }
        return { status: 200, json: { success: true }, text: "" };
      },
    });
    findProfile.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    createProfile.mockResolvedValue({ id: "p1", workspaceId: "ws1", username: "cliplab_ws1" });
    const { ensureUploadPostProfile } = await import("@/lib/social/upload-post/profiles");
    const profile = await ensureUploadPostProfile("ws1");
    expect(profile.username).toBe("cliplab_ws1");
    expect(calls.filter((item) => item === "POST /uploadposts/users")).toHaveLength(1);
  });

  it("reuses existing local profile", async () => {
    findProfile.mockResolvedValue({
      id: "p1",
      workspaceId: "ws1",
      username: "cliplab_ws1",
      metadata: { source: "upload-post", providerProfileId: "cliplab_ws1" },
    });
    const { ensureUploadPostProfile } = await import("@/lib/social/upload-post/profiles");
    const profile = await ensureUploadPostProfile("ws1");
    expect(profile.id).toBe("p1");
  });

  it("generates JWT for the workspace profile only", async () => {
    findProfile.mockResolvedValue({
      id: "p1",
      workspaceId: "wsA",
      username: "cliplab_wsA",
      metadata: { source: "upload-post", providerProfileId: "cliplab_wsA" },
    });
    createUsage.mockResolvedValue({});
    let body: Record<string, unknown> | undefined;
    setUploadPostHttpForTests({
      async request(opts) {
        body = opts.json as Record<string, unknown>;
        return { status: 200, json: { success: true, access_url: "https://app.upload-post.com/connect?token=abc", duration: "48h" }, text: "" };
      },
    });
    const { generateUploadPostConnectUrl } = await import("@/lib/social/upload-post/connect");
    const result = await generateUploadPostConnectUrl("wsA");
    expect(result.accessUrl).toContain("connect?token=");
    expect(body?.username).toBe("cliplab_wsA");
    expect(String(body?.redirect_url)).toContain("/studio/accounts?connected=1");
  });

  it("rejects connect URLs without a token query param", async () => {
    const { assertUploadPostAccessUrl } = await import("@/lib/social/upload-post/connect");
    expect(() => assertUploadPostAccessUrl("https://app.upload-post.com/connect")).toThrow(/token/);
    expect(() => assertUploadPostAccessUrl("https://evil.example/connect?token=abc")).toThrow(/inválida/);
    const ok = assertUploadPostAccessUrl("https://app.upload-post.com/connect?token=abc");
    expect(ok.pathname).toBe("/connect");
    expect(ok.searchParams.has("token")).toBe(true);
  });

  it("syncs accounts without storing tokens", async () => {
    findProfile.mockResolvedValue({ id: "p1", workspaceId: "wsA", username: "cliplab_wsA", metadata: {} });
    upsertAccount.mockResolvedValue({});
    findManyAccounts.mockResolvedValue([]);
    updateProfile.mockResolvedValue({});
    setUploadPostHttpForTests({
      async request() {
        return {
          status: 200,
          json: {
            success: true,
            profile: {
              username: "cliplab_wsA",
              social_accounts: {
                tiktok: { username: "creator", display_name: "Creator", social_images: "https://img" },
                instagram: "",
              },
            },
          },
          text: "",
        };
      },
    });
    const { syncUploadPostAccounts } = await import("@/lib/social/upload-post/accounts");
    await syncUploadPostAccounts("wsA");
    expect(upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: "UPLOAD_POST",
          platform: "TIKTOK",
          username: "creator",
        }),
      }),
    );
    expect(upsertAccount.mock.calls[0][0].create.accessTokenEncrypted).toBeUndefined();
  });

  it("uses TikTok handle as public username when the provider sends both id and handle", async () => {
    findProfile.mockResolvedValue({ id: "p1", workspaceId: "wsA", username: "cliplab_wsA", metadata: {} });
    upsertAccount.mockResolvedValue({});
    findManyAccounts.mockResolvedValue([]);
    updateProfile.mockResolvedValue({});
    setUploadPostHttpForTests({
      async request() {
        return {
          status: 200,
          json: {
            success: true,
            profile: {
              username: "cliplab_wsA",
              social_accounts: {
                tiktok: {
                  username: "open-id-value",
                  handle: "publichandle",
                  display_name: "Public Name",
                  social_images: "https://img",
                },
              },
            },
          },
          text: "",
        };
      },
    });
    const { syncUploadPostAccounts } = await import("@/lib/social/upload-post/accounts");
    await syncUploadPostAccounts("wsA");
    expect(upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: "UPLOAD_POST",
          platform: "TIKTOK",
          mock: false,
          username: "publichandle",
          displayName: "Public Name",
          externalAccountId: "open-id-value",
        }),
      }),
    );
  });

  it("isolates workspaces on publish", async () => {
    findPublication.mockResolvedValue(null);
    const { publishViaUploadPost } = await import("@/lib/social/upload-post/publish");
    await expect(publishViaUploadPost({ workspaceId: "wsB", publicationId: "pub1", mode: "now" })).rejects.toThrow(
      "Publicação não encontrada",
    );
  });

  it("cancels schedule idempotently on 404", async () => {
    findPublication.mockResolvedValue({ id: "pub1", providerPublicationId: "job_1" });
    setUploadPostHttpForTests({
      async request(opts) {
        expect(opts.method).toBe("DELETE");
        return { status: 404, json: { message: "not found" }, text: "" };
      },
    });
    const { cancelUploadPostSchedule } = await import("@/lib/social/upload-post/publish");
    await expect(cancelUploadPostSchedule("wsA", "pub1")).resolves.toBeUndefined();
  });

  it("updates schedule on the provider", async () => {
    findPublication.mockResolvedValue({ id: "pub1", providerPublicationId: "job_1", timezone: "America/Sao_Paulo" });
    updatePublication.mockResolvedValue({});
    updateSchedule.mockResolvedValue({});
    setUploadPostHttpForTests({
      async request() {
        return { status: 200, json: { success: true }, text: "" };
      },
    });
    const { updateUploadPostSchedule } = await import("@/lib/social/upload-post/publish");
    await updateUploadPostSchedule({
      workspaceId: "wsA",
      publicationId: "pub1",
      scheduledFor: new Date("2026-09-01T12:00:00Z"),
    });
    expect(updatePublication).toHaveBeenCalled();
  });

  it("disconnects already-removed remote accounts idempotently", async () => {
    findAccount.mockResolvedValue({
      id: "acc1",
      workspaceId: "wsA",
      provider: "UPLOAD_POST",
      platform: "TIKTOK",
    });
    findProfile.mockResolvedValue({ id: "p1", workspaceId: "wsA", username: "cliplab_wsA", metadata: {} });
    updateProfile.mockResolvedValue({});
    updateLive.mockResolvedValue({});
    deleteAccount.mockResolvedValue({});
    createAudit.mockResolvedValue({});
    setUploadPostHttpForTests({
      async request() {
        return { status: 200, json: { success: true, profile: { username: "cliplab_wsA", social_accounts: {} } }, text: "" };
      },
    });
    const { disconnectUploadPostAccount } = await import("@/lib/social/upload-post/accounts");
    await disconnectUploadPostAccount({ workspaceId: "wsA", userId: "u1", accountId: "acc1" });
    expect(deleteAccount).toHaveBeenCalled();
  });
});

describe("connection diagnose", () => {
  it("reports CONFIGURATION_REQUIRED without a key", async () => {
    const prev = process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_API_KEY;
    expect(await getUploadPostStatus()).toBe("CONFIGURATION_REQUIRED");
    expect(await testUploadPostConnection()).toBe("INVALID_KEY");
    if (prev) process.env.UPLOAD_POST_API_KEY = prev;
  });

  it("maps GET /me 200 to CONNECTED without leaking email", async () => {
    const prev = process.env.UPLOAD_POST_API_KEY;
    process.env.UPLOAD_POST_API_KEY = "test-key";
    setUploadPostHttpForTests({
      async request() {
        return { status: 200, json: { success: true, email: "secret@example.com", plan: "Professional" }, text: "" };
      },
    });
    expect(await testUploadPostConnection()).toBe("CONNECTED");
    expect(await getUploadPostStatus()).toBe("READY");
    setUploadPostHttpForTests(null);
    if (prev) process.env.UPLOAD_POST_API_KEY = prev;
    else delete process.env.UPLOAD_POST_API_KEY;
  });

  it("maps GET /me 401 to INVALID_CREDENTIALS", async () => {
    const prev = process.env.UPLOAD_POST_API_KEY;
    process.env.UPLOAD_POST_API_KEY = "test-key";
    setUploadPostHttpForTests({
      async request() {
        return { status: 401, json: { success: false, message: "Invalid or expired token" }, text: "" };
      },
    });
    expect(await testUploadPostConnection()).toBe("INVALID_KEY");
    expect(await getUploadPostStatus()).toBe("INVALID_CREDENTIALS");
    setUploadPostHttpForTests(null);
    if (prev) process.env.UPLOAD_POST_API_KEY = prev;
    else delete process.env.UPLOAD_POST_API_KEY;
  });

  it("maps fetch failures to NETWORK_ERROR", async () => {
    const prev = process.env.UPLOAD_POST_API_KEY;
    process.env.UPLOAD_POST_API_KEY = "test-key";
    setUploadPostHttpForTests({
      async request() {
        const error = new TypeError("fetch failed");
        (error as { code?: string }).code = "ENOTFOUND";
        throw error;
      },
    });
    expect(await testUploadPostConnection()).toBe("NETWORK_ERROR");
    expect(await getUploadPostStatus()).toBe("ERROR");
    setUploadPostHttpForTests(null);
    if (prev) process.env.UPLOAD_POST_API_KEY = prev;
    else delete process.env.UPLOAD_POST_API_KEY;
  });
});

describe("supported platforms", () => {
  it("exposes documented video networks", () => {
    expect(getSupportedPlatforms()).toContain("TIKTOK");
    expect(getSupportedPlatforms()).toContain("REDDIT");
  });
});

describe("white-label plan copy", () => {
  it("does not show stack traces", () => {
    expect(friendlyUploadPostMessage(403, "PROFILE_BLOCKED", "blocked")).toBe("Seu plano Upload-Post não inclui White Label.");
    const error = parseUploadPostError(403, { error_code: "PROFILE_BLOCKED", message: "blocked" }, "x");
    expect(error).toBeInstanceOf(UploadPostPlanError);
    expect(error.message).not.toMatch(/at /);
  });
});

describe("config error class", () => {
  it("is distinct from plan errors", () => {
    expect(new UploadPostConfigError().message).toContain("UPLOAD_POST_API_KEY");
    expect(new UploadPostPlanError("Limite").name).toBe("UploadPostPlanError");
  });
});
