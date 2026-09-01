import type { MetadataRoute } from "next";
import { brandMetadataBase } from "@/lib/config/brand";

export default function robots(): MetadataRoute.Robots {
  const origin = brandMetadataBase().origin;
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${origin}/sitemap.xml`,
  };
}
