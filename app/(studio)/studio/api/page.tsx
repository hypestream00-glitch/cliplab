import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { ApiKeysManager } from "@/components/api/api-keys-manager";
import { DevNotice } from "@/components/dashboard/dev-notice";

export const metadata = { title: "API" };

export default async function ApiKeysPage() {
  const { workspace } = await requireWorkspaceContext();
  const keys = await prisma.apiKey.findMany({ where: { workspaceId: workspace.id, revokedAt: null } });
  return (
    <div>
      <PageHeader title="API" description="O secret é exibido uma única vez. No banco fica apenas o hash." />
      <div className="mb-4">
        <DevNotice>Use o header Authorization: Bearer clp_…. Sem OpenAI/Stripe isso não altera o comportamento mock das outras APIs.</DevNotice>
      </div>
      <ApiKeysManager
        keys={keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes,
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
