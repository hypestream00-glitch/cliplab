import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { envPresent } from "@/lib/env/status";
import { isFeatureEnabled } from "@/lib/features/flags";

async function twitchAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }).toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) return null;
  return { clientId, token: body.access_token };
}

async function twitchLiveUsernames(logins: string[]) {
  if (!logins.length) return new Set<string>();
  const auth = await twitchAppToken();
  if (!auth) return null;
  const url = new URL("https://api.twitch.tv/helix/streams");
  for (const login of logins.slice(0, 80)) url.searchParams.append("user_login", login);
  const response = await fetch(url, {
    headers: { "Client-Id": auth.clientId, Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: Array<{ user_login?: string }> };
  return new Set((body.data ?? []).map((row) => row.user_login?.toLowerCase()).filter((item): item is string => Boolean(item)));
}

export async function pollMonitoredLiveChannels() {
  if (!isFeatureEnabled("ENABLE_LIVE_CLIPPING")) return { checked: 0, live: 0 };
  const channels = await prisma.liveChannel.findMany({
    where: { monitoringEnabled: true },
    take: 40,
  });
  if (!channels.length) return { checked: 0, live: 0 };
  const twitch = channels.filter((item) => item.platform === "TWITCH");
  const liveLogins = twitch.length ? await twitchLiveUsernames(twitch.map((item) => item.username.toLowerCase())) : new Set<string>();
  let live = 0;
  for (const channel of channels) {
    let next: "LIVE" | "OFFLINE" | "ERROR" = "OFFLINE";
    if (channel.platform === "TWITCH") {
      if (liveLogins == null) next = envPresent("TWITCH_CLIENT_ID") ? "ERROR" : "OFFLINE";
      else if (liveLogins.has(channel.username.toLowerCase())) next = "LIVE";
    } else {
      next = "OFFLINE";
    }
    if (next === "LIVE") live += 1;
    await prisma.liveChannel.update({
      where: { id: channel.id },
      data: {
        status: next,
        lastLiveAt: next === "LIVE" ? new Date() : channel.lastLiveAt,
      },
    });
  }
  logger.info({ checked: channels.length, live }, "live monitor poll");
  return { checked: channels.length, live };
}
