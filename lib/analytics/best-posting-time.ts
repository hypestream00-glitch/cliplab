export type BestPostingSlot = {
  weekday: number;
  hour: number;
  posts: number;
  avgViews: number;
};

export function recommendPostingHours(
  rows: Array<{ publishedAt: Date | null; views: number | null }>,
  now = new Date(),
) {
  const buckets = new Map<string, { posts: number; views: number }>();
  for (const row of rows) {
    if (!row.publishedAt || row.views == null || row.views < 0) continue;
    const weekday = row.publishedAt.getDay();
    const hour = row.publishedAt.getHours();
    const key = `${weekday}:${hour}`;
    const current = buckets.get(key) ?? { posts: 0, views: 0 };
    current.posts += 1;
    current.views += row.views;
    buckets.set(key, current);
  }
  const ranked: BestPostingSlot[] = [...buckets.entries()]
    .map(([key, value]) => {
      const [weekday, hour] = key.split(":").map(Number);
      return { weekday, hour, posts: value.posts, avgViews: value.views / value.posts };
    })
    .filter((item) => item.posts >= 2)
    .sort((a, b) => b.avgViews - a.avgViews || b.posts - a.posts)
    .slice(0, 4);

  if (ranked.length === 0) {
    return {
      ready: false as const,
      message: "Ainda precisamos de mais publicações para gerar uma recomendação personalizada.",
      slots: [] as Array<{ label: string; time: string }>,
    };
  }

  const weekdayLabel = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const today = now.getDay();
  const slots = ranked.slice(0, 3).map((item) => {
    const when = item.weekday === today ? "Hoje" : item.weekday === (today + 1) % 7 ? "Amanhã" : weekdayLabel[item.weekday];
    return {
      label: when,
      time: `${String(item.hour).padStart(2, "0")}:00`,
    };
  });
  return { ready: true as const, message: "Horários com melhor média de views nas suas publicações CortaClip.", slots };
}
