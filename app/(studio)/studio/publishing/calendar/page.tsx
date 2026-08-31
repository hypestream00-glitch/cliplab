import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  format,
  isSameMonth,
  isSameDay,
  parse,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge, EmptyState } from "@/components/dashboard/primitives";
import { formatDateTime } from "@/lib/utils/format";
import { publishNowAction, cancelPublicationAction, reschedulePublicationAction } from "@/app/(studio)/studio/publishing/actions";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { PageSearchProps } from "@/types/routes";
import { visiblePublicationWhere } from "@/lib/data/visibility";

export const metadata = { title: "Calendário" };

export default async function CalendarPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const monthParam = typeof params.month === "string" ? params.month : "";
  const cursor = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? parse(`${monthParam}-01`, "yyyy-MM-dd", new Date()) : new Date();
  const posts = await prisma.socialPublication.findMany({
    where: { ...visiblePublicationWhere(workspace.id), scheduledFor: { not: null } },
    include: { targets: true, clip: true },
    orderBy: { scheduledFor: "asc" },
  });
  const view = params.view === "week" ? "week" : "month";
  const monthStart = startOfMonth(cursor);
  const prev = format(addMonths(monthStart, -1), "yyyy-MM");
  const next = format(addMonths(monthStart, 1), "yyyy-MM");
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const gridStart = view === "week" ? weekStart : startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = view === "week" ? endOfWeek(cursor, { weekStartsOn: 1 }) : endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(day);
  }
  const monthPosts = posts.filter(
    (post) => post.scheduledFor && isSameMonth(post.scheduledFor, monthStart),
  );

  return (
    <div>
      <PageHeader
        title="Calendário"
        description={`${format(monthStart, "MMMM yyyy", { locale: ptBR })}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant={view === "month" ? "default" : "outline"}>
              <Link href={`/studio/calendar?month=${format(monthStart, "yyyy-MM")}`}>Mês</Link>
            </Button>
            <Button asChild size="sm" variant={view === "week" ? "default" : "outline"}>
              <Link href={`/studio/calendar?view=week`}>Semana</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/studio/calendar?month=${prev}${view === "week" ? "&view=week" : ""}`}>Anterior</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/studio/calendar${view === "week" ? "?view=week" : ""}`}>Hoje</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/studio/calendar?month=${next}${view === "week" ? "&view=week" : ""}`}>Próximo</Link>
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-7 gap-px overflow-x-auto rounded-xl border bg-border">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label) => (
          <div key={label} className="bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const items = posts.filter((post) => post.scheduledFor && isSameDay(post.scheduledFor, day));
          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 min-w-[88px] bg-card p-1.5 ${isSameMonth(day, monthStart) ? "" : "opacity-40"} ${isSameDay(day, new Date()) ? "ring-1 ring-primary/40" : ""}`}
            >
              <p className="text-[11px] text-muted-foreground">{format(day, "d")}</p>
              <div className="mt-1 space-y-1">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/studio/publishing?id=${item.id}`}
                    className="block truncate rounded bg-primary/15 px-1 py-0.5 text-[11px] text-primary-foreground/90"
                  >
                    {item.clip?.title ?? item.caption ?? "Post"}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {monthPosts.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação agendada."
          description="Quando você agendar um clip, ele aparece aqui."
          actionLabel="Clipes"
          actionHref="/studio/clips"
        />
      ) : (
        <div className="grid gap-2">
          {monthPosts.map((post) => (
            <div key={post.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-[13px]">
              <Link href={`/studio/publishing?id=${post.id}`} className="min-w-0 truncate hover:underline">
                {post.clip?.title ?? post.caption}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                {post.scheduledFor ? formatDateTime(post.scheduledFor) : ""}
                <StatusBadge status={post.status} />
                {post.status === "SCHEDULED" ? (
                  <>
                    {post.mock ? (
                      <form action={publishNowAction}>
                        <input type="hidden" name="publicationId" value={post.id} />
                        <Button size="xs" variant="outline" type="submit">
                          Publicar agora
                        </Button>
                      </form>
                    ) : (
                      <ConfirmSubmit
                        action={publishNowAction}
                        name="publicationId"
                        value={post.id}
                        extra={{ confirmRealPublish: "1" }}
                        label="Publicar agora"
                        confirmLabel="Publicar agora"
                        message="Publicar este clip nesta conta?"
                        size="xs"
                        variant="outline"
                      />
                    )}
                    <ConfirmSubmit
                      action={cancelPublicationAction}
                      name="publicationId"
                      value={post.id}
                      label="Cancelar"
                      destructive
                      size="xs"
                    />
                    {post.provider === "UPLOAD_POST" ? (
                      <form action={reschedulePublicationAction} className="flex items-center gap-1">
                        <input type="hidden" name="publicationId" value={post.id} />
                        <input type="datetime-local" name="scheduledFor" className="h-7 rounded border bg-transparent px-1 text-[11px]" required />
                        <Button size="xs" variant="outline" type="submit">
                          Reagendar
                        </Button>
                      </form>
                    ) : null}
                  </>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
