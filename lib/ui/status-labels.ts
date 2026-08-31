const STATUS_LABELS: Record<string, string> = {
  READY: "Pronto",
  PUBLISHED: "Publicado",
  CONNECTED: "Conectada",
  LIVE: "Ao vivo",
  PROCESSING: "Processando",
  TRANSCRIBING: "Lendo o conteúdo",
  ANALYZING: "Analisando",
  GENERATING: "Criando clips",
  PROBING: "Preparando",
  AUDIO_EXTRACTING: "Preparando áudio",
  CLIPPING: "Criando clips",
  QUEUED: "Na fila",
  WAITING: "Na fila",
  ACTIVE: "Processando",
  COMPLETED: "Concluído",
  SCHEDULED: "Agendado",
  FAILED: "Falhou",
  TOKEN_EXPIRING: "Reconectar em breve",
  REAUTH_REQUIRED: "Reconectar",
  CONFIGURATION_REQUIRED: "Configuração necessária",
  EXPIRED: "Expirada",
  ERROR: "Erro",
  UPLOADING: "Enviando",
  DRAFT: "Rascunho",
  OFFLINE: "Desconectada",
  CANCELED: "Cancelado",
  ARCHIVED: "Arquivado",
  CREATED: "Criado",
  CANDIDATE: "Candidato",
  RENDERED: "Exportado",
  RENDERING: "Exportando",
  DONE: "Concluído",
};

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Público",
  MUTUAL_FOLLOW_FRIENDS: "Amigos",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Somente eu",
};
