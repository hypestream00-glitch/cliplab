import { SettingsNav } from "@/components/layout/settings-nav";
import type { LayoutChildrenProps } from "@/types/routes";

export default function SettingsLayout({ children }: LayoutChildrenProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-48">
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
