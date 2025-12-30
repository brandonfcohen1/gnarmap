import { NextRequest, NextResponse } from "next/server";
import { getS3Object } from "@/lib/s3";
import * as fflate from "fflate";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "gnarmap-historical";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

interface ZarrMetadata {
  bounds: { west: number; east: number; north: number; south: number };
  units: string;
  shape: [number, number, number];
}

let cachedDates: string[] | null = null;
let cachedMetadata: ZarrMetadata | null = null;

async function getDates(): Promise<string[]> {
  if (!cachedDates) {
    const data = await getS3Object("zarr/dates.json");
    cachedDates = JSON.parse(data!);
  }
  return cachedDates!;
}

async function getMetadata(): Promise<ZarrMetadata> {
  if (!cachedMetadata) {
    const data = await getS3Object("zarr/snow_depth/zarr.json");
    const zarrJson = JSON.parse(data!);
    cachedMetadata = {
      bounds: zarrJson.attributes.bounds,
      units: zarrJson.attributes.units,
      shape: zarrJson.shape,
    };
  }
  return cachedMetadata!;
}

function lngLatToPixel(
  lng: number,
  lat: number,
  bounds: ZarrMetadata["bounds"],
  width: number,
  height: number
): { x: number; y: number } | null {
  if (lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north) {
    return null;
  }
  const x = Math.floor(((lng - bounds.west) / (bounds.east - bounds.west)) * width);
  const y = Math.floor(((bounds.north - lat) / (bounds.north - bounds.south)) * height);
  return { x: Math.min(x, width - 1), y: Math.min(y, height - 1) };
}

async function fetchChunk(tc: number, chunkY: number, chunkX: number): Promise<Int16Array | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: `zarr/snow_depth/c/${tc}/${chunkY}/${chunkX}`,
    });
    const response = await s3Client.send(command);
    const compressed = new Uint8Array(await response.Body!.transformToByteArray());
    const decompressed = fflate.gunzipSync(compressed);
    return new Int16Array(decompressed.buffer);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lng = parseFloat(searchParams.get("lng") || "");
  const lat = parseFloat(searchParams.get("lat") || "");
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  if (isNaN(lng) || isNaN(lat)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const [allDates, meta] = await Promise.all([getDates(), getMetadata()]);
  const [, height, width] = meta.shape;

  const pixel = lngLatToPixel(lng, lat, meta.bounds, width, height);
  if (!pixel) {
    return NextResponse.json([]);
  }

  let startIdx = 0;
  let endIdx = allDates.length - 1;

  if (startDate) {
    startIdx = allDates.findIndex((d) => d >= startDate);
    if (startIdx === -1) startIdx = 0;
  }
  if (endDate) {
    endIdx = allDates.findIndex((d) => d > endDate);
    if (endIdx === -1) endIdx = allDates.length - 1;
    else endIdx = endIdx - 1;
  }

  const chunkTimeSize = 365;
  const chunkY = Math.floor(pixel.y / 256);
  const chunkX = Math.floor(pixel.x / 256);
  const yOffset = pixel.y % 256;
  const xOffset = pixel.x % 256;

  const startChunk = Math.floor(startIdx / chunkTimeSize);
  const endChunk = Math.floor(endIdx / chunkTimeSize);

  const chunkPromises = [];
  for (let tc = startChunk; tc <= endChunk; tc++) {
    chunkPromises.push(fetchChunk(tc, chunkY, chunkX).then((data) => ({ tc, data })));
  }

  const chunks = await Promise.all(chunkPromises);
  const chunkMap = new Map(chunks.map((c) => [c.tc, c.data]));

  const results: { date: string; value: number }[] = [];

  for (let tc = startChunk; tc <= endChunk; tc++) {
    const data = chunkMap.get(tc);
    const chunkStartT = tc * chunkTimeSize;
    const localStart = Math.max(0, startIdx - chunkStartT);
    const localEnd = Math.min(chunkTimeSize - 1, endIdx - chunkStartT);

    for (let t = localStart; t <= localEnd; t++) {
      const globalT = chunkStartT + t;
      if (globalT >= allDates.length) break;

      let value = 0;
      if (data) {
        const idx = t * 256 * 256 + yOffset * 256 + xOffset;
        const rawValue = data[idx];
        value = rawValue > 0 ? rawValue / 25.4 : 0;
      }

      results.push({ date: allDates[globalT], value });
    }
  }

  return NextResponse.json(results);
}
