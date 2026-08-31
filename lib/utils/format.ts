import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(date: Date | string) {
  return format(new Date(date), "dd MMM yyyy", { locale: ptBR });
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "dd MMM yyyy HH:mm", { locale: ptBR });
}

export function fromNow(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

export function scoreLabel(score: number) {
  if (score >= 90) return "Excelente";
  if (score >= 75) return "Muito bom";
  if (score >= 60) return "Bom";
  return "Regular";
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

export function initials(name?: string | null) {
  if (!name) return "CL";
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
