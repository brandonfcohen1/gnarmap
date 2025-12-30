import { fromUrl, Pool } from "geotiff";
import type { GeoTIFF, GeoTIFFImage } from "geotiff";
import { getPresignedUrl, PRESIGNED_URL_EXPIRY } from "./r2";

const tiffCache = new Map<string, { tiff: GeoTIFF; expiry: number }>();
const pool = new Pool();

export const getCOG = async (date: string): Promise<GeoTIFF> => {
  const cacheKey = date;
  const now = Date.now();

  if (tiffCache.has(cacheKey)) {
    const cached = tiffCache.get(cacheKey)!;
    if (cached.expiry > now) {
      return cached.tiff;
    }
    tiffCache.delete(cacheKey);
  }

  const key = `snodas/snodas_snow_depth_${date}.tif`;
  const presignedUrl = await getPresignedUrl(key);
  const tiff = await fromUrl(presignedUrl);

  tiffCache.set(cacheKey, {
    tiff,
    expiry: now + (PRESIGNED_URL_EXPIRY - 300) * 1000,
  });

  return tiff;
};

export const tile2lng = (x: number, z: number): number =>
  (x / Math.pow(2, z)) * 360 - 180;

export const tile2lat = (y: number, z: number): number => {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export const getTileBounds = (
  x: number,
  y: number,
  z: number
): [number, number, number, number] => {
  const west = tile2lng(x, z);
  const north = tile2lat(y, z);
  const east = tile2lng(x + 1, z);
  const south = tile2lat(y + 1, z);
  return [west, south, east, north];
};

export interface TileData {
  data: Int16Array;
  destX: number;
  destY: number;
  destWidth: number;
  destHeight: number;
}

export const readTileData = async (
  image: GeoTIFFImage,
  bounds: [number, number, number, number],
  tileSize: number = 256
): Promise<TileData | null> => {
  const [tileWest, tileSouth, tileEast, tileNorth] = bounds;
  const bbox = image.getBoundingBox();
  const [imgWest, imgSouth, imgEast, imgNorth] = bbox;

  if (tileEast < imgWest || tileWest > imgEast || tileNorth < imgSouth || tileSouth > imgNorth) {
    return null;
  }

  const clippedWest = Math.max(tileWest, imgWest);
  const clippedEast = Math.min(tileEast, imgEast);
  const clippedNorth = Math.min(tileNorth, imgNorth);
  const clippedSouth = Math.max(tileSouth, imgSouth);

  const width = image.getWidth();
  const height = image.getHeight();
  const [resX, resY] = image.getResolution();

  const window: [number, number, number, number] = [
    Math.floor((clippedWest - imgWest) / resX),
    Math.floor((imgNorth - clippedNorth) / Math.abs(resY)),
    Math.ceil((clippedEast - imgWest) / resX),
    Math.ceil((imgNorth - clippedSouth) / Math.abs(resY)),
  ];

  const clampedWindow: [number, number, number, number] = [
    Math.max(0, Math.min(width, window[0])),
    Math.max(0, Math.min(height, window[1])),
    Math.max(0, Math.min(width, window[2])),
    Math.max(0, Math.min(height, window[3])),
  ];

  if (clampedWindow[2] <= clampedWindow[0] || clampedWindow[3] <= clampedWindow[1]) {
    return null;
  }

  const tileWidth = tileEast - tileWest;
  const tileHeight = tileNorth - tileSouth;

  const destX = Math.round(((clippedWest - tileWest) / tileWidth) * tileSize);
  const destY = Math.round(((tileNorth - clippedNorth) / tileHeight) * tileSize);
  const destWidth = Math.round(((clippedEast - clippedWest) / tileWidth) * tileSize);
  const destHeight = Math.round(((clippedNorth - clippedSouth) / tileHeight) * tileSize);

  if (destWidth <= 0 || destHeight <= 0) {
    return null;
  }

  const data = await image.readRasters({
    window: clampedWindow,
    width: destWidth,
    height: destHeight,
    resampleMethod: "nearest",
    pool,
  });

  return {
    data: data[0] as Int16Array,
    destX,
    destY,
    destWidth,
    destHeight,
  };
};

export const getSnowDepthColor = (valueInMm: number): [number, number, number, number] => {
  if (valueInMm <= 0 || valueInMm === -9999) {
    return [0, 0, 0, 0];
  }

  const inches = valueInMm / 25.4;

  if (inches < 1) return [230, 245, 255, 180];
  if (inches < 3) return [200, 230, 255, 200];
  if (inches < 6) return [150, 200, 255, 210];
  if (inches < 12) return [100, 170, 255, 220];
  if (inches < 24) return [50, 130, 220, 230];
  if (inches < 48) return [30, 90, 200, 240];
  if (inches < 72) return [60, 60, 180, 245];
  if (inches < 96) return [100, 50, 170, 250];
  if (inches < 120) return [140, 40, 160, 250];
  if (inches < 180) return [180, 30, 140, 250];
  return [220, 20, 100, 255];
};

export const getValueAtPoint = async (
  image: GeoTIFFImage,
  lng: number,
  lat: number
): Promise<number | null> => {
  const bbox = image.getBoundingBox();
  const [imgWest, imgSouth, imgEast, imgNorth] = bbox;

  if (lng < imgWest || lng > imgEast || lat < imgSouth || lat > imgNorth) {
    return null;
  }

  const width = image.getWidth();
  const height = image.getHeight();
  const [resX, resY] = image.getResolution();

  const pixelX = Math.floor((lng - imgWest) / resX);
  const pixelY = Math.floor((imgNorth - lat) / Math.abs(resY));

  if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
    return null;
  }

  const data = await image.readRasters({
    window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
    pool,
  });

  const value = (data[0] as Int16Array)[0];
  return value === -9999 ? null : value;
};
