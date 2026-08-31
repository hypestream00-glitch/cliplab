"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmSubmit({
  action,
  name,
  value,
  extra,
  label,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  message,
  destructive,
  size = "sm",
  variant = "ghost",
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  value: string;
  extra?: Record<string, string>;
  label: string;
  confirmLabel?: string;
  cancelLabel?: string;
  message?: string;
  destructive?: boolean;
  size?: "xs" | "sm" | "default";
  variant?: "ghost" | "outline" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size={size} variant={destructive ? "destructive" : variant} type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name={name} value={value} />
      {extra
        ? Object.entries(extra).map(([key, val]) => <input key={key} type="hidden" name={key} value={val} />)
        : null}
      {message ? <span className="mr-1 text-[11px] text-muted-foreground">{message}</span> : null}
      <Button size={size} variant="destructive" type="submit">
        {confirmLabel}
      </Button>
      <Button size={size} variant="ghost" type="button" onClick={() => setOpen(false)}>
        {cancelLabel}
      </Button>
    </form>
  );
}
