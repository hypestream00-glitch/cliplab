import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import type { PageSearchProps } from "@/types/routes";

export default async function AdminUsersPage({ searchParams }: PageSearchProps) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : undefined,
    include: { memberships: { include: { workspace: true } } },
    take: 50,
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Usuários" />
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar" className="h-8 w-64 rounded-md border bg-transparent px-2 text-[13px]" />
        <button className="h-8 rounded-md border px-3 text-[13px]" type="submit">
          Buscar
        </button>
      </form>
      <table className="w-full text-left text-[13px]">
        <thead className="border-b text-[11px] text-muted-foreground">
          <tr>
            <th className="py-2">Nome</th>
            <th>E-mail</th>
            <th>Role</th>
            <th>Workspaces</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b">
              <td className="py-2">{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>{user.memberships.map((m) => m.workspace.name).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
