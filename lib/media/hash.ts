import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

export async function fileIdentityHash(filePath: string) {
  const info = await stat(filePath);
  return createHash("sha256").update(`${info.size}:${Math.round(info.mtimeMs)}`).digest("hex").slice(0, 32);
}

export function analysisInputHash(params: {
  provider: string;
  fullText: string;
  clipCount: number;
  clipDurationMin: number;
  clipDurationMax: number;
  mode: string;
}) {
  return createHash("sha256")
    .update(
      `${params.provider}:${params.clipCount}:${params.clipDurationMin}:${params.clipDurationMax}:${params.mode}:${params.fullText.length}:${params.fullText.slice(0, 200)}:${params.fullText.slice(-200)}`,
    )
    .digest("hex")
    .slice(0, 32);
}
