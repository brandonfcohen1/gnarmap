import * as fflate from "fflate";

const ZARR_BASE_URL = process.env.NEXT_PUBLIC_ZARR_URL || "https://pub-271adb240f434715904d54aa1aa3ddc8.r2.dev/zarr";
const CHUNK_SIZE = 256;
const CHUNK_TIME_SIZE = 365;
const MM_TO_INCHES = 25.4;

interface TimeSeriesPoint {
  date: string;
  value: number;
}

interface ZarrMetadata {
  bounds: { west: number; east: number; north: number; south: number };
  units: string;
  shape: [number, number, number];
}

let cachedDates: string[] | null = null;
let cachedMetadata: ZarrMetadata | null = null;

const chunkCache = new Map<string, Int16Array | null>();
const CHUNK_CACHE_MAX = 50;

const getCachedChunk = (key: string): Int16Array | null | undefined => {
  const value = chunkCache.get(key);
  if (value !== undefined) {
    chunkCache.delete(key);
    chunkCache.set(key, value);
  }
  return value;
};

const setCachedChunk = (key: string, value: Int16Array | null) => {
  if (chunkCache.size >= CHUNK_CACHE_MAX) {
    const firstKey = chunkCache.keys().next().value;
    if (firstKey) chunkCache.delete(firstKey);
  }
  chunkCache.set(key, value);
};

const getDates = async (): Promise<string[]> => {
  if (!cachedDates) {
    const response = await fetch(`${ZARR_BASE_URL}/dates.json`);
    if (!response.ok) throw new Error("Failed to fetch dates");
    cachedDates = await response.json();
  }
  return cachedDates!;
};

const getMetadata = async (): Promise<ZarrMetadata> => {
  if (!cachedMetadata) {
    const response = await fetch(`${ZARR_BASE_URL}/snow_depth/zarr.json`);
    if (!response.ok) throw new Error("Failed to fetch metadata");
    const zarrJson = await response.json();
    cachedMetadata = {
      bounds: zarrJson.attributes.bounds,
      units: zarrJson.attributes.units,
      shape: zarrJson.shape,
    };
  }
  return cachedMetadata!;
};

const lngLatToPixel = (
  lng: number,
  lat: number,
  bounds: ZarrMetadata["bounds"],
  width: number,
  height: number
): { x: number; y: number } | null => {
  if (lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north) {
    return null;
  }
  const x = Math.floor(((lng - bounds.west) / (bounds.east - bounds.west)) * width);
  const y = Math.floor(((bounds.north - lat) / (bounds.north - bounds.south)) * height);
  return { x: Math.min(x, width - 1), y: Math.min(y, height - 1) };
};

const fetchChunk = async (tc: number, chunkY: number, chunkX: number): Promise<Int16Array | null> => {
  const key = `${tc}/${chunkY}/${chunkX}`;
  const cached = getCachedChunk(key);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(`${ZARR_BASE_URL}/snow_depth/c/${tc}/${chunkY}/${chunkX}`);
    if (!response.ok) {
      setCachedChunk(key, null);
      return null;
    }
    const compressed = new Uint8Array(await response.arrayBuffer());
    const decompressed = fflate.gunzipSync(compressed);
    const data = new Int16Array(decompressed.buffer);
    setCachedChunk(key, data);
    return data;
  } catch {
    setCachedChunk(key, null);
    return null;
  }
};

export const getAvailableDates = async (): Promise<string[]> => {
  return getDates();
};

export const getSnowDepthAtPoint = async (
  lng: number,
  lat: number,
  date: string
): Promise<number | null> => {
  const [allDates, meta] = await Promise.all([getDates(), getMetadata()]);
  const [, height, width] = meta.shape;

  const pixel = lngLatToPixel(lng, lat, meta.bounds, width, height);
  if (!pixel) {
    return null;
  }

  const dateIdx = allDates.indexOf(date);
  if (dateIdx === -1) {
    return null;
  }

  const chunkY = Math.floor(pixel.y / CHUNK_SIZE);
  const chunkX = Math.floor(pixel.x / CHUNK_SIZE);
  const yOffset = pixel.y % CHUNK_SIZE;
  const xOffset = pixel.x % CHUNK_SIZE;
  const tc = Math.floor(dateIdx / CHUNK_TIME_SIZE);
  const tOffset = dateIdx % CHUNK_TIME_SIZE;

  const data = await fetchChunk(tc, chunkY, chunkX);
  if (!data) {
    return 0;
  }

  const idx = tOffset * CHUNK_SIZE * CHUNK_SIZE + yOffset * CHUNK_SIZE + xOffset;
  const rawValue = data[idx];
  return rawValue > 0 ? rawValue / MM_TO_INCHES : 0;
};

export const getTimeSeriesForPixel = async (
  lng: number,
  lat: number,
  startDate?: string,
  endDate?: string
): Promise<TimeSeriesPoint[]> => {
  const [allDates, meta] = await Promise.all([getDates(), getMetadata()]);
  const [, height, width] = meta.shape;

  const pixel = lngLatToPixel(lng, lat, meta.bounds, width, height);
  if (!pixel) {
    return [];
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

  const results: TimeSeriesPoint[] = [];

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

  return results;
};
