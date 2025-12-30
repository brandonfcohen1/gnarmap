import { NextResponse } from "next/server";
import { paginateListObjectsV2 } from "@aws-sdk/client-s3";
import { r2Client, BUCKET } from "@/lib/r2";

const PREFIX = "snodas/";

let cachedDates: string[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchDates(): Promise<string[]> {
  const now = Date.now();
  if (cachedDates && cacheExpiry > now) {
    return cachedDates;
  }

  const dates: string[] = [];
  const paginator = paginateListObjectsV2(
    { client: r2Client },
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
    return NextResponse.json({ dates });
  } catch {
    return NextResponse.json({ error: "Failed to list dates" }, { status: 500 });
  }
}
