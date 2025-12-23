import { NextResponse } from "next/server";
import { S3Client, paginateListObjectsV2 } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.GNARMAP_AWS_ACCESS_KEY!,
    secretAccessKey: process.env.GNARMAP_AWS_SECRET!,
  },
});

const BUCKET = "gnarmap-historical";
const PREFIX = "snodas/";

let cachedDates: string[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60 * 60 * 1000;

async function fetchDates(): Promise<string[]> {
  const now = Date.now();
  if (cachedDates && cacheExpiry > now) {
    return cachedDates;
  }

  const dates: string[] = [];
  const paginator = paginateListObjectsV2(
    { client: s3Client },
    { Bucket: BUCKET, Prefix: PREFIX }
  );

  for await (const page of paginator) {
    if (page.Contents) {
      for (const obj of page.Contents) {
        const key = obj.Key;
        if (key && key.includes("snow_depth")) {
          const match = key.match(/snodas_snow_depth_(\d{8})\.tif/);
          if (match) {
            dates.push(match[1]);
          }
        }
      }
    }
  }

  dates.sort((a, b) => b.localeCompare(a));
  cachedDates = dates;
  cacheExpiry = now + CACHE_TTL;
  return dates;
}

export async function GET() {
  try {
    const dates = await fetchDates();
    return NextResponse.json({ dates }, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Error listing S3 objects:", error);
    return NextResponse.json({ error: "Failed to list dates" }, { status: 500 });
  }
}
