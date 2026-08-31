const SEED_DISPLAY_NAMES = new Set(["ana demo", "ana"]);
const SEED_WORKSPACE_NAMES = new Set(["ana studio"]);

export function isSeedDisplayName(name: string | null | undefined) {
  if (!name?.trim()) return false;
  return SEED_DISPLAY_NAMES.has(name.trim().toLowerCase());
}

export function isSeedWorkspaceName(name: string | null | undefined) {
  if (!name?.trim()) return false;
  return SEED_WORKSPACE_NAMES.has(name.trim().toLowerCase());
}

export function configuredOwnerDisplayName() {
  return process.env.CLIPLAB_OWNER_NAME?.trim() || process.env.DEV_OWNER_NAME?.trim() || null;
}

export function toSessionIdentity(user: { name?: string | null; email?: string | null; image?: string | null }) {
  const raw = user.name?.trim() || null;
  const name = raw && !isSeedDisplayName(raw) ? raw : null;
  return {
    name,
    email: user.email?.trim() || null,
    image: user.image ?? null,
  };
}

export function sessionDisplayName(user: { name?: string | null; email?: string | null } | null | undefined) {
  if (!user) return null;
  const identity = toSessionIdentity(user);
  return identity.name || identity.email || null;
}

export function sessionGreetingName(user: { name?: string | null; email?: string | null } | null | undefined) {
  const identity = toSessionIdentity(user ?? {});
  if (!identity.name) return null;
  return identity.name.split(/\s+/).filter(Boolean)[0] ?? null;
}

export function studioGreetingTitle(user: { name?: string | null; email?: string | null } | null | undefined) {
  const greet = sessionGreetingName(user);
  return greet ? `Olá, ${greet}` : "Olá";
}
