import type { MetadataRoute } from "next";

export const SITE = "https://webhook-tester.bookchaowalit.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE + "/", changeFrequency: "monthly", priority: 1 }];
}
