import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/features/flags";
import { getLivePlatformProvider, liveStatusToChannelStatus } from "@/lib/platforms/live-providers";

export async function pollMonitoredLiveChannels() {
  if (!isFeatureEnabled("ENABLE_LIVE_CLIPPING")) return { checked: 0, live: 0 };
  const channels = await prisma.liveChannel.findMany({
    where: { monitoringEnabled: true },
    take: 40,
  });
  if (!channels.length) return { checked: 0, live: 0 };
  let live = 0;
  for (const channel of channels) {
    const provider = getLivePlatformProvider(channel.platform);
    let next: "LIVE" | "OFFLINE" | "ERROR" = "OFFLINE";
    if (!provider) {
      next = "OFFLINE";
    } else {
      const result = await provider.getLiveStatus(channel.username);
      next = liveStatusToChannelStatus(result.status);
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
