export function isPrismaUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

export function stripeCreditReference(eventId: string) {
  return `stripe:${eventId}`;
}

export function analysisCreditKey(projectId: string) {
  return `project:${projectId}:analysis`;
}
