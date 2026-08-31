"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DebouncedSearch({
  name = "q",
  placeholder,
  defaultValue = "",
}: {
  name?: string;
  placeholder: string;
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const timeoutRef = useRef<number | null>(null);
  const [, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set(name, value.trim());
      else next.delete(name);
      next.delete("page");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }, 300);
  }

  return (
    <input
      name={name}
      defaultValue={defaultValue}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 w-full max-w-sm rounded-md border bg-transparent px-2 text-[13px]"
    />
  );
}
