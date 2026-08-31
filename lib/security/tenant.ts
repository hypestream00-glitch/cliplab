export class TenantAccessError extends Error {
  constructor(message = "NOT_FOUND") {
    super(message);
    this.name = "TenantAccessError";
  }
}

export function assertWorkspaceMatch(resourceWorkspaceId: string | null | undefined, sessionWorkspaceId: string) {
  if (!resourceWorkspaceId || resourceWorkspaceId !== sessionWorkspaceId) {
    throw new TenantAccessError();
  }
}

export function tenantWhere(workspaceId: string) {
  return { workspaceId };
}
