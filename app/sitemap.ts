import type { MetadataRoute } from "next";
import { brandMetadataBase } from "@/lib/config/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = brandMetadataBase().origin;
  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${origin}/register`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
