import type { MetadataRoute } from "next";

// Crawlers get the landing page only: /demo makes a copy of the school for each visitor,
// and family pages are private links.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/$", disallow: ["/demo", "/office", "/family", "/api"] } };
}
