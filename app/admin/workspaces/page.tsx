import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";

export default async function AdminWorkspacesPage() {
  const workspaces = await prisma.workspace.findMany({ include: { _count: { select: { members: true, projects: true } } } });
  return (
    <div>
      <PageHeader title="Workspaces" />
      <table className="w-full text-left text-[13px]">
        <thead className="border-b text-[11px] text-muted-foreground">
          <tr>
            <th className="py-2">Nome</th>
            <th>Tipo</th>
            <th>Membros</th>
            <th>Projetos</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-2">{item.name}</td>
              <td>{item.type}</td>
              <td>{item._count.members}</td>
              <td>{item._count.projects}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
