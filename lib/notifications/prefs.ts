import type { NotificationType } from "@/generated/prisma/client";

export type NotificationPrefs = {
  clipsReady: boolean;
  processingFailed: boolean;
  publishing: boolean;
  creditsLow: boolean;
  teamInvites: boolean;
  billing: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  clipsReady: true,
  processingFailed: true,
  publishing: true,
  creditsLow: true,
  teamInvites: false,
  billing: true,
};

export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    clipsReady: typeof raw.clipsReady === "boolean" ? raw.clipsReady : DEFAULT_NOTIFICATION_PREFS.clipsReady,
    processingFailed:
      typeof raw.processingFailed === "boolean" ? raw.processingFailed : DEFAULT_NOTIFICATION_PREFS.processingFailed,
    publishing: typeof raw.publishing === "boolean" ? raw.publishing : DEFAULT_NOTIFICATION_PREFS.publishing,
    creditsLow: typeof raw.creditsLow === "boolean" ? raw.creditsLow : DEFAULT_NOTIFICATION_PREFS.creditsLow,
    teamInvites: typeof raw.teamInvites === "boolean" ? raw.teamInvites : DEFAULT_NOTIFICATION_PREFS.teamInvites,
    billing: typeof raw.billing === "boolean" ? raw.billing : DEFAULT_NOTIFICATION_PREFS.billing,
  };
}

export function notificationAllowed(type: NotificationType, prefs: NotificationPrefs) {
  if (type === "CLIPS_READY" || type === "PROJECT_READY" || type === "RENDER_READY") return prefs.clipsReady;
  if (type === "PROCESSING_FAILED") return prefs.processingFailed;
  if (type === "PUBLISH_SUCCESS" || type === "PUBLISH_FAILED" || type === "ACCOUNT_RECONNECT") return prefs.publishing;
  if (type === "CREDITS_LOW") return prefs.creditsLow;
  if (type === "TEAM_INVITE") return prefs.teamInvites;
  if (type === "SUBSCRIPTION") return prefs.billing;
  return true;
}
