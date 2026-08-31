import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge } from "@/components/dashboard/primitives";

export default async function AdminJobsPage() {
  const jobs = await prisma.processingJob.findMany({ orderBy: { createdAt: "desc" }, take: 80 });
  return (
    <div>
      <PageHeader title="Jobs" description="Filas: video, transcription, clips, render, publish, analytics, live." />
      <table className="w-full text-left text-[13px]">
        <thead className="border-b text-[11px] text-muted-foreground">
          <tr>
            <th className="py-2">Tipo</th>
            <th>Status</th>
            <th>Progresso</th>
            <th>Mensagem</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b">
              <td className="py-2">{job.type}</td>
              <td>
                <StatusBadge status={job.status} />
              </td>
              <td>{job.progress}%</td>
              <td>{job.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
