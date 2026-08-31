import type { LayoutChildrenProps } from "@/types/routes";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/chrome";

export default function MarketingLayout({ children }: LayoutChildrenProps) {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
