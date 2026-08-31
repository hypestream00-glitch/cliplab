"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SETUP_GUIDES } from "@/lib/features/setup-guides";

function stateClass(state: string) {
  if (state === "READY") return "text-emerald-300";
  if (state === "ERROR" || state === "UNAVAILABLE") return "text-red-300";
  if (state === "OPTIONAL") return "text-zinc-400";
  return "text-amber-200";
}

function CopyField({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="text-[12px] text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-[12px]">{url}</p>
      </div>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

type StatusRow = {
  id: string;
  label: string;
  detail: string;
  state: string;
  setupId?: string;
};

type CallbackItem = { id: string; label: string; url: string };

export function SystemStatusClient({
  rows,
  callbacks,
  flags,
}: {
  rows: StatusRow[];
  callbacks: CallbackItem[];
  flags: Record<string, boolean>;
}) {
  const [probe, setProbe] = useState<string>("");
  const [guideId, setGuideId] = useState<string | null>(null);
  const guide = SETUP_GUIDES.find((item) => item.id === guideId);

  async function test(target: string) {
    setProbe("Testando…");
    const response = await fetch("/api/studio/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    const data = (await response.json()) as { ok?: boolean; message?: string; error?: string };
    setProbe(data.message ?? data.error ?? "Falha");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div>
              <p className="font-medium">{row.label}</p>
              <p className="text-[12px] text-muted-foreground">{row.detail}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={stateClass(row.state)}>
                {row.state}
              </span>
              {row.state === "CONFIGURATION REQUIRED" && row.setupId ? (
                <Button type="button" size="xs" variant="outline" onClick={() => setGuideId(row.setupId!)}>
                  Configurar
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      {guide ? (
        <section className="rounded-md border p-3 text-[13px]">
          <p className="font-medium">{guide.title}</p>
          <p className="mt-1 text-muted-foreground">Crie o app no painel externo e configure estas variáveis no servidor. Nenhum secret é pedido aqui.</p>
          <p className="mt-2 font-mono text-[12px]">{guide.env.join(", ")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px]">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <Button type="button" size="xs" variant="ghost" className="mt-2" onClick={() => setGuideId(null)}>
            Fechar
          </Button>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium">Callback URLs</h2>
        <p className="mb-2 text-[12px] text-muted-foreground">Copie para o painel do provedor social. Sem secrets.</p>
        <div className="space-y-2">
          {callbacks.map((item) => (
            <CopyField key={item.id} label={item.label} url={item.url} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Testar conexão</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void test("database")}>
            Database
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void test("storage")}>
            Storage
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void test("redis")}>
            Redis
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void test("openai")}>
            OpenAI
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void test("upload-post")}>
            Upload-Post
          </Button>
        </div>
        {probe ? <p className="mt-2 text-[12px] text-muted-foreground">{probe}</p> : null}
      </section>

      <section className="text-[12px] text-muted-foreground">
        Flags: OPENAI_REAL={String(flags.OPENAI_REAL)} · STRIPE_BILLING={String(flags.STRIPE_BILLING)}
        {rows.some((row) => row.id === "tiktok-credentials")
          ? ` · TIKTOK_PUBLISHING=${String(flags.TIKTOK_PUBLISHING)} · META_PUBLISHING=${String(flags.META_PUBLISHING)} · X_PUBLISHING=${String(flags.X_PUBLISHING)} · YOUTUBE_PUBLISHING=${String(flags.YOUTUBE_PUBLISHING)}`
          : ""}
      </section>
    </div>
  );
}
