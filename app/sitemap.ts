import type { MetadataRoute } from "next";
import { CONTENT_UPDATED, absoluteUrl } from "@/lib/marketing/site";
import { SERVICES } from "@/lib/marketing/services";
import { COUNTRIES, LOCATIONS_BASE, cityIsIndexable, cityPath, countryPath } from "@/lib/marketing/locations";

// Every public, indexable URL. Generated from the same data the pages render from, so a service or
// a city added there appears here without anyone remembering to update a list.
export default function sitemap(): MetadataRoute.Sitemap {
  // A fixed, hand-maintained date — not "now". See CONTENT_UPDATED.
  const now = new Date(`${CONTENT_UPDATED}T00:00:00Z`);
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/profile-score"), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/services"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...SERVICES.map(service => ({ url: absoluteUrl(`/services/${service.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: absoluteUrl(LOCATIONS_BASE), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    ...COUNTRIES.map(country => ({ url: absoluteUrl(countryPath(country)), lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
  for (const country of COUNTRIES) for (const city of country.cities) {
    if (!cityIsIndexable(country, city)) continue;
    entries.push({ url: absoluteUrl(cityPath(country, city)), lastModified: now, changeFrequency: "monthly", priority: 0.5 });
  }
  return entries;
}
