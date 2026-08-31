import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PaginationBar({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(pageCount, page + 1);
  return (
    <nav className="mt-4 flex items-center justify-between text-[13px]" aria-label="Paginação">
      <p className="text-muted-foreground">
        Página {page} de {pageCount}
      </p>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline" disabled={page <= 1}>
          <Link href={hrefFor(prev)} aria-disabled={page <= 1}>
            Anterior
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" disabled={page >= pageCount}>
          <Link href={hrefFor(next)} aria-disabled={page >= pageCount}>
            Próxima
          </Link>
        </Button>
      </div>
    </nav>
  );
}

export function pageFromSearch(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw ?? "1");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
