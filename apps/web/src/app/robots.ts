import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const robots = (): MetadataRoute.Robots => ({
  rules: [
    {
      userAgent: "*",
      allow: "/",
    },
  ],
  sitemap: "https://gnarmap.com/sitemap.xml",
});

export default robots;
