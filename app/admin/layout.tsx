import { requireAdmin } from "@/lib/auth/session";
import Link from "next/link";
import { adminNav } from "@/lib/config/navigation";
import { brand } from "@/lib/config/brand";
import type { LayoutChildrenProps } from "@/types/routes";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutChildrenProps) {
  await requireAdmin();
  return (
    <div className="flex min-h-screen">
      <aside className="w-[220px] border-r p-3">
        <p className="mb-4 text-[13px] font-semibold">{brand.name} Admin</p>
        <nav className="space-y-1">
          {adminNav.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-5">{children}</main>
    </div>
  );
}
