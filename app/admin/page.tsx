import { prisma } from "@/lib/db/prisma";
import { StatCard } from "@/components/dashboard/primitives";
import { formatNumber } from "@/lib/utils/format";

export const metadata = { title: "Admin" };

export default async function AdminHomePage() {
  const [users, workspaces, jobs, publications] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.processingJob.count(),
    prisma.socialPublication.count(),
  ]);
  return (
    <div>
      <h1 className="mb-4 text-[18px] font-semibold">Overview</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Users" value={formatNumber(users)} />
        <StatCard label="Workspaces" value={formatNumber(workspaces)} />
        <StatCard label="Jobs" value={formatNumber(jobs)} />
        <StatCard label="Publications" value={formatNumber(publications)} />
      </div>
    </div>
  );
}
