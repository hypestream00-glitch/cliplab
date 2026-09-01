import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge } from "@/components/dashboard/primitives";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils/format";
import { inviteMemberAction } from "@/app/(studio)/studio/team/actions";

export const metadata = { title: "Equipe" };

export default async function TeamPage() {
  const { workspace } = await requireWorkspaceContext();
  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { user: true },
    }),
    prisma.workspaceInvitation.findMany({
      where: { workspaceId: workspace.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <div>
      <PageHeader title="Equipe" description="Convide membros por e-mail. Sem provedor de e-mail, copie o link de aceite." />
      <form action={inviteMemberAction} className="mb-4 flex max-w-lg gap-2">
        <input name="email" type="email" required placeholder="email@empresa.com" className="h-8 flex-1 rounded-md border bg-transparent px-2 text-[13px]" />
        <select name="role" className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="EDITOR">EDITOR</option>
          <option value="ADMIN">ADMIN</option>
          <option value="VIEWER">VIEWER</option>
        </select>
        <button className="h-8 rounded-md border px-3 text-[13px]" type="submit">
          Convidar
        </button>
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b bg-muted/30 text-[11px] text-muted-foreground uppercase">
            <tr>
              {["Membro", "E-mail", "Role", "Status"].map((col) => (
                <th key={col} className="px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback>{initials(member.user.name)}</AvatarFallback>
                    </Avatar>
                    {member.user.name}
                  </div>
                </td>
                <td className="px-3 py-2">{member.user.email}</td>
                <td className="px-3 py-2">{member.role}</td>
                <td className="px-3 py-2">
                  <StatusBadge status="READY" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invitations.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-[14px] font-semibold">Convites pendentes</h2>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            {invitations.map((invite) => (
              <li key={invite.id}>
                {invite.email} · {invite.role} · expira {invite.expiresAt.toLocaleDateString("pt-BR")} ·{" "}
                <a className="text-primary" href={`/studio/team/accept?token=${invite.token}`}>
                  link de aceite
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
