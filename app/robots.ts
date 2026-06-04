import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.appUrl().replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private, authenticated app areas and the API are not for crawlers.
      disallow: ["/api/", "/admin", "/projects", "/songs", "/library", "/friends"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
