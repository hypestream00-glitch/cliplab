export type ClipScoreParts = {
  overall: number;
  hookScore: number;
  retentionScore: number;
  clarityScore: number;
  emotionScore: number;
  shareabilityScore: number;
};

export function platformFitScores(score: ClipScoreParts, durationMs: number) {
  const durationSec = Math.max(1, Math.round(durationMs / 1000));
  const tiktokDuration = durationSec <= 34 ? 8 : durationSec <= 60 ? 4 : durationSec <= 90 ? 0 : -8;
  const reelsDuration = durationSec <= 30 ? 6 : durationSec <= 90 ? 3 : -4;
  const shortsDuration = durationSec >= 15 && durationSec <= 60 ? 8 : durationSec < 15 ? -6 : 2;
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  return {
    tiktok: clamp(score.overall * 0.55 + score.hookScore * 0.25 + score.shareabilityScore * 0.2 + tiktokDuration),
    reels: clamp(score.overall * 0.5 + score.clarityScore * 0.2 + score.emotionScore * 0.2 + reelsDuration),
    shorts: clamp(score.overall * 0.5 + score.retentionScore * 0.25 + score.hookScore * 0.15 + shortsDuration),
  };
}

export function viralScoreInsights(score: ClipScoreParts) {
  const strengths: string[] = [];
  const improvements: string[] = [];
  if (score.hookScore >= 80) strengths.push("Ponto forte: o gancho inicial é direto.");
  else improvements.push("Melhoria: começar mais perto do conflito ou da fala principal.");
  if (score.retentionScore >= 75) strengths.push("Ponto forte: o ritmo favorece retenção.");
  else improvements.push("Melhoria: cortar segundos mortos no meio do clip.");
  if (score.clarityScore < 70) improvements.push("Melhoria: deixar a fala mais limpa e o contexto mais óbvio.");
  if (score.emotionScore >= 80) strengths.push("Ponto forte: o trecho carrega emoção clara.");
  if (score.shareabilityScore >= 80) strengths.push("Ponto forte: o momento tem potencial de compartilhamento.");
  return {
    label: score.overall >= 85 ? "Alto potencial estimado" : score.overall >= 70 ? "Bom potencial estimado" : "Potencial moderado",
    strengths,
    improvements,
    disclaimer: "Estimativa algorítmica com base no conteúdo analisado. Não é garantia de performance.",
  };
}
