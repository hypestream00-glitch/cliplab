import { PageHeader } from "@/components/dashboard/primitives";
import { settingsNav } from "@/lib/config/navigation";
import Link from "next/link";

export const metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="grid gap-2">
        {settingsNav.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-md border px-3 py-2 text-[13px] hover:bg-muted/40">
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
