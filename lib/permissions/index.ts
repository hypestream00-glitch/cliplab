import type { WorkspaceRole } from "@/generated/prisma/client";

const rank: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function hasRole(role: WorkspaceRole, needed: WorkspaceRole) {
  return rank[role] >= rank[needed];
}

export function canEditContent(role: WorkspaceRole) {
  return hasRole(role, "EDITOR");
}

export function canManageTeam(role: WorkspaceRole) {
  return hasRole(role, "ADMIN");
}

export function canManageBilling(role: WorkspaceRole) {
  return hasRole(role, "OWNER");
}
