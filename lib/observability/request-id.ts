import { randomUUID } from "node:crypto";

export function newRequestId() {
  return randomUUID();
}

export function publicErrorMessage(error: unknown, requestId: string) {
  const safe = error instanceof Error ? error.message : "Erro interno";
  const stripped = /secret|token|password|api[_-]?key|authorization/i.test(safe)
    ? "Não foi possível concluir a operação."
    : safe;
  return { error: stripped, requestId };
}
