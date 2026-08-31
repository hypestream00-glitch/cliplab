"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DashboardQuickCreate() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[14px] font-medium">Criar projeto</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Envie um MP4, MOV ou WEBM. Ingestão por URL não está disponível.
      </p>
      <Button asChild className="mt-3">
        <Link href="/studio/create">Novo projeto</Link>
      </Button>
    </div>
  );
}
