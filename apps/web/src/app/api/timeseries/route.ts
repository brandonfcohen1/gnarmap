import { NextRequest, NextResponse } from "next/server";
import { getR2Object, r2Client, BUCKET } from "@/lib/r2";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import * as fflate from "fflate";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const CHUNK_SIZE = 256;
const CHUNK_TIME_SIZE = 365;
const MM_TO_INCHES = 25.4;

interface ZarrMetadata {
  bounds: { west: number; east: number; north: number; south: number };
  units: string;
  shape: [number, number, number];
}

let cachedDates: string[] | null = null;
let cachedMetadata: ZarrMetadata | null = null;

async function getDates(): Promise<string[]> {
  if (!cachedDates) {
    const data = await getR2Object("zarr/dates.json");
    if (!data) throw new Error("Failed to fetch dates");
    cachedDates = JSON.parse(data);
  }
  return cachedDates!;
}

async function getMetadata(): Promise<ZarrMetadata> {
  if (!cachedMetadata) {
    const data = await getR2Object("zarr/snow_depth/zarr.json");
    if (!data) throw new Error("Failed to fetch metadata");
    const zarrJson = JSON.parse(data);
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
    const response = await r2Client.send(command);
    const compressed = new Uint8Array(await response.Body!.transformToByteArray());
    const decompressed = fflate.gunzipSync(compressed);
    return new Int16Array(decompressed.buffer);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

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

  const chunkY = Math.floor(pixel.y / CHUNK_SIZE);
  const chunkX = Math.floor(pixel.x / CHUNK_SIZE);
  const yOffset = pixel.y % CHUNK_SIZE;
  const xOffset = pixel.x % CHUNK_SIZE;

  const startChunk = Math.floor(startIdx / CHUNK_TIME_SIZE);
  const endChunk = Math.floor(endIdx / CHUNK_TIME_SIZE);

  const chunkPromises = [];
  for (let tc = startChunk; tc <= endChunk; tc++) {
    chunkPromises.push(fetchChunk(tc, chunkY, chunkX).then((data) => ({ tc, data })));
  }

  const chunks = await Promise.all(chunkPromises);
  const chunkMap = new Map(chunks.map((c) => [c.tc, c.data]));

  const results: { date: string; value: number }[] = [];

  for (let tc = startChunk; tc <= endChunk; tc++) {
    const data = chunkMap.get(tc);
    const chunkStartT = tc * CHUNK_TIME_SIZE;
    const localStart = Math.max(0, startIdx - chunkStartT);
    const localEnd = Math.min(CHUNK_TIME_SIZE - 1, endIdx - chunkStartT);

    for (let t = localStart; t <= localEnd; t++) {
      const globalT = chunkStartT + t;
      if (globalT >= allDates.length) break;

      let value = 0;
      if (data) {
        const idx = t * CHUNK_SIZE * CHUNK_SIZE + yOffset * CHUNK_SIZE + xOffset;
        const rawValue = data[idx];
        value = rawValue > 0 ? rawValue / MM_TO_INCHES : 0;
      }

      results.push({ date: allDates[globalT], value });
    }
  }

  return NextResponse.json(results);
}
