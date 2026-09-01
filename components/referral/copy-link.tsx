"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ReferralCopyButton({ url }: { url: string }) {
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de indicação copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }
  return (
    <Button type="button" className="gradient-brand text-white" onClick={() => void copyLink()}>
      Copiar meu link
    </Button>
  );
}
