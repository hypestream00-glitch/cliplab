import { platformFitScores, viralScoreInsights, type ClipScoreParts } from "@/lib/config/platform-score";

export function ViralScorePanel({ score, durationMs }: { score: ClipScoreParts; durationMs: number }) {
  const platforms = platformFitScores(score, durationMs);
  const insights = viralScoreInsights(score);
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-5">
        <div className="rounded-xl border p-2">Gancho {score.hookScore}</div>
        <div className="rounded-xl border p-2">Retenção {score.retentionScore}</div>
        <div className="rounded-xl border p-2">Clareza {score.clarityScore}</div>
        <div className="rounded-xl border p-2">Emoção {score.emotionScore}</div>
        <div className="rounded-xl border p-2">Compartilhar {score.shareabilityScore}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-xl border border-border p-2">TikTok {platforms.tiktok}</div>
        <div className="rounded-xl border border-border p-2">Reels {platforms.reels}</div>
        <div className="rounded-xl border border-border p-2">Shorts {platforms.shorts}</div>
      </div>
      <p className="text-[12px] font-medium text-white">{insights.label}</p>
      <ul className="space-y-1 text-[12px] text-muted-foreground">
        {insights.strengths.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {insights.improvements.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">{insights.disclaimer} Scores por plataforma são preditivos internos, não métricas oficiais.</p>
    </div>
  );
}
