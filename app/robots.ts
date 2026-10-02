import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/marketing/site";

// Crawlers are welcome on the public marketing pages and nowhere else. The signed-in app and the
// API are also sent `X-Robots-Tag: noindex` (next.config.ts) — robots.txt alone only asks crawlers
// not to fetch a URL; it does not stop one that is linked from elsewhere from being listed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/audits", "/audit", "/portal", "/client-portal", "/account", "/notifications", "/auth/", "/verify", "/reset-password"],
    }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
