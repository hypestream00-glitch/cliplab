const PATTERNS: Array<{ test: RegExp; message: string }> = [
  { test: /atingiu o limite do seu plano|plan limit/i, message: "Você atingiu o limite do seu plano." },
  { test: /insufficient|créditos insuficientes|quota/i, message: "Não há créditos suficientes para concluir esta ação." },
  { test: /ffmpeg|ffprobe/i, message: "Não conseguimos processar seu vídeo agora. Tente novamente." },
  { test: /openai|whisper|gpt-4/i, message: "Não conseguimos analisar o vídeo agora. Tente novamente em instantes." },
  { test: /prisma|econnrefused|database/i, message: "Não foi possível concluir. Tente novamente." },
  { test: /429|rate limit/i, message: "Muitas tentativas ao mesmo tempo. Espere um pouco e tente de novo." },
  { test: /500|internal server/i, message: "Não foi possível concluir. Tente novamente." },
  { test: /unauthorized|forbidden|401|403/i, message: "Você não tem permissão para esta ação." },
  { test: /upload-post|provider/i, message: "Não foi possível falar com a rede social. Tente novamente." },
];

export function friendlyError(input: unknown, fallback = "Não foi possível concluir.") {
  const raw = input instanceof Error ? input.message : String(input ?? "");
  if (!raw.trim()) return fallback;
  const hit = PATTERNS.find((item) => item.test.test(raw));
  if (hit) return hit.message;
  if (/stack|prisma\.|at Object\.|ENOENT/i.test(raw)) return fallback;
  return raw.length > 180 ? fallback : raw;
}
