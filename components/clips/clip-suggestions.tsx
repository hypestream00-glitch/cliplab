"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { regenerateSuggestionsAction, updateClipCopyAction } from "@/app/(studio)/studio/clips/actions";

export function ClipSuggestionsForm({
  clipId,
  title,
  summary,
  reason,
  caption,
  hashtags,
  canRegenerate,
}: {
  clipId: string;
  title: string;
  summary: string;
  reason: string;
  caption: string;
  hashtags: string[];
  canRegenerate: boolean;
  mocked: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="mt-4 space-y-3 rounded-lg border p-3">
      <p className="text-[12px] font-medium">Sugestões</p>
      <form
        className="space-y-2"
        action={async (formData) => {
          setError(null);
          await updateClipCopyAction(formData);
        }}
      >
        <input type="hidden" name="clipId" value={clipId} />
        <label className="block text-[12px]">
          Título sugerido
          <input name="title" defaultValue={title} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
        </label>
        <label className="block text-[12px]">
          Caption sugerida
          <textarea name="caption" defaultValue={caption} className="mt-1 h-20 w-full rounded-md border bg-transparent px-2 py-1" />
        </label>
        <label className="block text-[12px]">
          Hashtags sugeridas
          <input name="hashtags" defaultValue={hashtags.map((tag) => `#${tag}`).join(" ")} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
        </label>
        <label className="block text-[12px]">
          Motivo do corte
          <textarea name="reason" defaultValue={reason || summary} className="mt-1 h-16 w-full rounded-md border bg-transparent px-2 py-1" />
        </label>
        <Button type="submit" size="sm">
          Salvar sugestões
        </Button>
      </form>
      <form
        action={async () => {
          if (!canRegenerate) return;
          setPending(true);
          setError(null);
          const result = await regenerateSuggestionsAction(clipId);
          setPending(false);
          if (result && "error" in result) setError(result.error ?? "Falha ao regenerar.");
        }}
      >
        <Button type="submit" size="sm" variant="outline" disabled={!canRegenerate || pending}>
          {pending ? "Regenerando..." : "Regenerar sugestões"}
        </Button>
        {!canRegenerate ? <p className="mt-1 text-[11px] text-muted-foreground">Indisponível no momento.</p> : null}
        {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}
