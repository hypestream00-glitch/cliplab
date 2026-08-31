"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PublishingRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(id);
  }, [active, router]);
  return null;
}
