import { PageHeader } from "@/components/dashboard/primitives";
import { settingsNav } from "@/lib/config/navigation";
import Link from "next/link";

export const metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="grid gap-3">
        {settingsNav.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-2xl border border-border bg-card px-5 py-4 text-[15px] font-medium text-white hover:bg-surface-hover">
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
