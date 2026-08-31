"use client";

import { isDevMockMode } from "@/lib/config/app";
import { Badge } from "@/components/ui/badge";

export function DevModeBadge() {
  if (!isDevMockMode()) return null;
  return (
    <Badge variant="outline" className="hidden h-6 text-[10px] font-medium sm:inline-flex">
      Modo de desenvolvimento
    </Badge>
  );
}
