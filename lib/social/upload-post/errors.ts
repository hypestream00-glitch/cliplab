export class UploadPostConfigError extends Error {
  constructor(message = "Configuração necessária: UPLOAD_POST_API_KEY") {
    super(message);
    this.name = "UploadPostConfigError";
  }
}

export class UploadPostApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "UploadPostApiError";
    this.status = status;
    this.code = code;
  }
}

export class UploadPostPlanError extends UploadPostApiError {
  constructor(message: string, code?: string) {
    super(message, 403, code);
    this.name = "UploadPostPlanError";
  }
}

export function friendlyUploadPostMessage(status: number, code: string | undefined, message: string) {
  if (code === "PROFILE_LIMIT_REACHED") return "Limite de perfis sociais atingido no plano atual.";
  if (code === "PROFILE_BLOCKED" || /white.?label/i.test(message)) {
    return "Seu plano Upload-Post não inclui White Label.";
  }
  if (status === 403 && /schedul/i.test(message)) {
    return "Seu plano Upload-Post não inclui agendamento.";
  }
  if (status === 403 && /analytics/i.test(message)) {
    return "Seu plano Upload-Post não inclui analytics.";
  }
  return message;
}
