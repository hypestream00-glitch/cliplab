import { limitAction } from "@/lib/security/action-limit";

export async function rateLimitGuard(scope: string, limit: number, windowMs: number) {
  const result = await limitAction(scope, limit, windowMs);
  if (!result.ok) {
    return { error: `Muitas tentativas. Aguarde ${result.retryAfterSec}s.` };
  }
  return null;
}
