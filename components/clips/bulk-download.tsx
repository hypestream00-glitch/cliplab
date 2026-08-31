"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function BulkDownloadStatus({
  jobId,
  status,
  message,
  errorMessage,
}: {
  jobId: string;
  status: string;
  message?: string | null;
  errorMessage?: string | null;
}) {
  const router = useRouter();
  useEffect(() => {
    if (status === "COMPLETED" || status === "FAILED") return;
    const id = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(id);
  }, [router, status]);

  if (status === "COMPLETED" && message) {
    return (
      <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px]">
        ZIP pronto.{" "}
        <a className="underline" href={`/api/media?key=${encodeURIComponent(message)}&download=1&filename=clipes.zip`}>
          Baixar arquivo
        </a>
      </div>
    );
  }
  if (status === "FAILED") {
    return <p className="mb-3 text-[12px] text-destructive">ZIP falhou: {errorMessage}</p>;
  }
  return (
    <p className="mb-3 text-[12px] text-muted-foreground">
      Gerando ZIP {jobId.slice(-6)}… {status}
    </p>
  );
}

export function BulkDownloadBar() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Button type="submit" size="sm" variant="outline">
        Baixar selecionados (ZIP)
      </Button>
      <p className="text-[11px] text-muted-foreground">Marque os clips para baixar em um ZIP.</p>
    </div>
  );
}
