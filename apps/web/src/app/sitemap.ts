import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const sitemap = (): MetadataRoute.Sitemap => [
  {
    url: "https://gnarmap.com",
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1,
  },
];

export default sitemap;
