import type { MetadataRoute } from "next";
import { SITE } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  // The capture API is per-visitor and temporary: keep crawlers on the page itself.
  return { rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }], sitemap: SITE + "/sitemap.xml" };
}
