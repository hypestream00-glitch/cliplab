/** Whisper language code, or undefined so the API auto-detects. */
export function whisperLanguageParam(language: string | undefined | null): string | undefined {
  const raw = language?.trim().toLowerCase();
  if (!raw || raw === "auto") return undefined;
  const code = raw.split("-")[0]?.trim();
  return code || undefined;
}
