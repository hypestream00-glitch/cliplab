export function slugifyCompetitionName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "campeonato";
}

export function canJoinStatus(status: string) {
  return status === "SCHEDULED" || status === "ACTIVE";
}

export function canSubmitStatus(status: string) {
  return status === "ACTIVE";
}

export function publicCompetitionStatuses() {
  return ["SCHEDULED", "ACTIVE", "FINALIZING", "FINISHED"] as const;
}

export function competitionDaysRemaining(endsAt: Date, now = new Date()) {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
}
