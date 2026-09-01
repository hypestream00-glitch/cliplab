import type { LayoutChildrenProps } from "@/types/routes";
import { brand } from "@/lib/config/brand";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/chrome";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: brand.name,
  url: brand.url,
  description: brand.description,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
};

export default function MarketingLayout({ children }: LayoutChildrenProps) {
  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
