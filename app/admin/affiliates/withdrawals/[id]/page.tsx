import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/primitives";
import { formatBrlFromCents } from "@/lib/referral/config";
import { formatDateTime } from "@/lib/utils/format";
import { pixTypeLabel, revealPixKey } from "@/lib/referral/admin";
import { isPixKeyType } from "@/lib/referral/pix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveWithdrawalAction,
  markWithdrawalPaidAction,
  rejectWithdrawalAction,
} from "@/app/admin/affiliates/actions";
import Link from "next/link";
import type { PageSearchProps } from "@/types/routes";

export default async function AdminWithdrawalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
} & PageSearchProps) {
  const { id } = await params;
  const query = await searchParams;
  const row = await prisma.withdrawal.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!row) notFound();
  let pixFull = row.pixKeyMasked;
  try {
    pixFull = revealPixKey(row.pixKeyCipher);
  } catch {
    pixFull = row.pixKeyMasked;
  }
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <div>
      <PageHeader title="Detalhe do saque" description={`${formatBrlFromCents(row.amountCents)} · ${row.status}`} />
      {error ? <p className="mb-4 text-[13px] text-red-300">{error}</p> : null}
      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Usuário</dt>
          <dd>
            <Link href={`/admin/affiliates/${row.userId}`} className="hover:underline">
              {row.user.name ?? row.user.email}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tipo PIX</dt>
          <dd>{pixTypeLabel(row.pixKeyType)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Chave PIX (somente admin)</dt>
          <dd className="break-all font-mono">{isPixKeyType(row.pixKeyType) ? pixFull : row.pixKeyMasked}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Titular</dt>
          <dd>{row.holderName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Documento mascarado</dt>
          <dd>{row.holderDocumentMasked ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Solicitado</dt>
          <dd>{formatDateTime(row.requestedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pago em</dt>
          <dd>{row.paidAt ? formatDateTime(row.paidAt) : "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Referência</dt>
          <dd>{row.paymentReference ?? "—"}</dd>
        </div>
      </dl>

      {row.status === "REQUESTED" ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <form action={approveWithdrawalAction}>
            <input type="hidden" name="withdrawalId" value={row.id} />
            <Button type="submit">Aprovar</Button>
          </form>
        </div>
      ) : null}

      {row.status === "APPROVED" ? (
        <form action={markWithdrawalPaidAction} className="mt-6 flex max-w-xl flex-wrap gap-2">
          <input type="hidden" name="withdrawalId" value={row.id} />
          <Input name="paymentReference" placeholder="PIX 01/09/2026 18:30" required className="h-9 min-w-56 flex-1" />
          <Button type="submit">Marcar como pago</Button>
        </form>
      ) : null}

      {row.status === "REQUESTED" || row.status === "APPROVED" ? (
        <form action={rejectWithdrawalAction} className="mt-4 flex max-w-xl flex-wrap gap-2">
          <input type="hidden" name="withdrawalId" value={row.id} />
          <select name="reason" required className="h-9 rounded-md border bg-transparent px-2 text-[13px]">
            <option value="Chave PIX inválida">Chave PIX inválida</option>
            <option value="Dados incorretos">Dados incorretos</option>
            <option value="Conta em revisão">Conta em revisão</option>
            <option value="Outro">Outro</option>
          </select>
          <Button type="submit" variant="destructive">
            Rejeitar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
