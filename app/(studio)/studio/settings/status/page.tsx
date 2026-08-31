import { PageHeader } from "@/components/dashboard/primitives";
import { getSystemStatus, publicCallbackUrls } from "@/lib/features/system-status";
import { featureFlags } from "@/lib/features/flags";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { SystemStatusClient } from "@/components/settings/system-status-client";
import { CapabilityBanner } from "@/components/processing/capability-banner";
import { getProcessingCapabilities } from "@/lib/media/capabilities";

export const metadata = { title: "System Status" };

export default async function SystemStatusPage() {
  await requireWorkspaceContext();
  const rows = await getSystemStatus();
  const capabilities = await getProcessingCapabilities();
  return (
    <div>
      <PageHeader
        title="System Status"
        description="Diagnóstico interno das integrações. Nenhum secret, token ou chave é exibido."
      />
      <CapabilityBanner capabilities={capabilities} />
      <SystemStatusClient rows={rows} callbacks={[...publicCallbackUrls()]} flags={featureFlags()} />
    </div>
  );
}
