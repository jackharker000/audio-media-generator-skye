import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl().replace(/\/$/, "");
  const lastModified = new Date();

  // Only public, unauthenticated routes belong in the sitemap.
  return [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/signin`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
