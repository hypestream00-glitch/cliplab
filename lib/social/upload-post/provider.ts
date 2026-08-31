import type { UnifiedSocialProvider } from "@/lib/social/unified";
import { supportedPublishPlatforms } from "@/lib/social/upload-post/publish";
import { ensureUploadPostProfile, deleteUploadPostProfile, refreshUploadPostProfile } from "@/lib/social/upload-post/profiles";
import { generateUploadPostConnectUrl } from "@/lib/social/upload-post/connect";
import { syncUploadPostAccounts, disconnectUploadPostAccount } from "@/lib/social/upload-post/accounts";
import {
  publishViaUploadPost,
  syncUploadPostPublicationStatus,
} from "@/lib/social/upload-post/publish";
import { syncUploadPostAnalytics } from "@/lib/social/upload-post/analytics";
import { fromUploadPostPlatform } from "@/lib/social/upload-post/platforms";

export const uploadPostProvider: UnifiedSocialProvider = {
  id: "upload-post",
  async createUserProfile(workspaceId) {
    const profile = await ensureUploadPostProfile(workspaceId);
    return { username: profile.username };
  },
  deleteUserProfile: deleteUploadPostProfile,
  async generateConnectToken(workspaceId) {
    const result = await generateUploadPostConnectUrl(workspaceId);
    return { accessUrl: result.accessUrl, duration: result.duration };
  },
  async generateConnectUrl(workspaceId) {
    return (await generateUploadPostConnectUrl(workspaceId)).accessUrl;
  },
  async getConnectedAccounts(workspaceId) {
    const accounts = await syncUploadPostAccounts(workspaceId);
    return accounts.map((account) => ({
      platform: account.platform,
      externalAccountId: account.externalAccountId,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
    }));
  },
  async publish(workspaceId, publicationId) {
    await publishViaUploadPost({ workspaceId, publicationId, mode: "now" });
  },
  async schedule(workspaceId, publicationId) {
    await publishViaUploadPost({ workspaceId, publicationId, mode: "schedule" });
  },
  getPublicationStatus: syncUploadPostPublicationStatus,
  async getAnalytics(workspaceId) {
    await syncUploadPostAnalytics(workspaceId);
  },
  disconnectAccount(workspaceId, accountId, userId) {
    return disconnectUploadPostAccount({ workspaceId, accountId, userId });
  },
  async refreshProfile(workspaceId) {
    await refreshUploadPostProfile(workspaceId);
    await syncUploadPostAccounts(workspaceId);
  },
  getCapabilities() {
    return {
      platforms: supportedPublishPlatforms(),
      whiteLabel: true,
      scheduling: true,
      analytics: true,
      webhooks: true,
    };
  },
};

export { fromUploadPostPlatform };
