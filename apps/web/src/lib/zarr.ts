import * as fflate from "fflate";

const ZARR_BASE_URL = "https://gnarmap-historical.s3.us-east-2.amazonaws.com/zarr";

interface ZarrMetadata {
  bounds: {
    west: number;
    east: number;
    north: number;
    south: number;
  };
  units: string;
  shape: [number, number, number];
}

interface TimeSeriesPoint {
  date: string;
  value: number;
}

let dates: string[] | null = null;
let metadata: ZarrMetadata | null = null;

async function getDates(): Promise<string[]> {
  if (!dates) {
    const response = await fetch(`${ZARR_BASE_URL}/dates.json`);
    dates = await response.json();
  }
  return dates!;
}

async function getMetadata(): Promise<ZarrMetadata> {
  if (!metadata) {
    const response = await fetch(`${ZARR_BASE_URL}/snow_depth/zarr.json`);
    const zarrJson = await response.json();
    metadata = {
      bounds: zarrJson.attributes.bounds,
      units: zarrJson.attributes.units,
      shape: zarrJson.shape,
    };
  }
  return metadata!;
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
  const url = `${ZARR_BASE_URL}/snow_depth/c/${tc}/${chunkY}/${chunkX}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const compressed = new Uint8Array(await response.arrayBuffer());
    const decompressed = fflate.gunzipSync(compressed);
    return new Int16Array(decompressed.buffer);
  } catch {
    return null;
  }
}

export async function getTimeSeriesForPixel(
  lng: number,
  lat: number,
  startDate?: string,
  endDate?: string
): Promise<TimeSeriesPoint[]> {
  const [allDates, meta] = await Promise.all([
    getDates(),
    getMetadata(),
  ]);

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

  const results: TimeSeriesPoint[] = [];
  const chunkTimeSize = 365;
  const chunkY = Math.floor(pixel.y / 256);
  const chunkX = Math.floor(pixel.x / 256);
  const yOffset = pixel.y % 256;
  const xOffset = pixel.x % 256;

  const startChunk = Math.floor(startIdx / chunkTimeSize);
  const endChunk = Math.floor(endIdx / chunkTimeSize);

  const chunkPromises = [];
  for (let tc = startChunk; tc <= endChunk; tc++) {
    chunkPromises.push(fetchChunk(tc, chunkY, chunkX).then(data => ({ tc, data })));
  }

  const chunks = await Promise.all(chunkPromises);
  const chunkMap = new Map(chunks.map(c => [c.tc, c.data]));

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

      results.push({
        date: allDates[globalT],
        value,
      });
    }
  }

  return results;
}
