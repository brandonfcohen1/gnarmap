import { NextRequest, NextResponse } from "next/server";
import UPNG from "upng-js";
import { getCOG, getTileBounds, readTileData, getSnowDepthColor } from "@/lib/cog";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const createPNG = (rgba: Uint8Array, width: number, height: number): ArrayBuffer => {
  return UPNG.encode([rgba.buffer as ArrayBuffer], width, height, 0);
};

const createEmptyPNG = (width: number, height: number): ArrayBuffer => {
  const rgba = new Uint8Array(width * height * 4);
  return UPNG.encode([rgba.buffer as ArrayBuffer], width, height, 0);
};

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ date: string; z: string; x: string; y: string }> }
) => {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip);

  if (!allowed) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "X-RateLimit-Remaining": "0", "Retry-After": "60" },
    });
  }

  const { date, z, x, y: yWithExt } = await params;
  const yClean = yWithExt.replace(/\.png$/, "");

  const zNum = parseInt(z, 10);
  const xNum = parseInt(x, 10);
  const yNum = parseInt(yClean, 10);

  if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) {
    return new NextResponse("Invalid tile coordinates", { status: 400 });
  }

  const tileSize = 256;
  const bounds = getTileBounds(xNum, yNum, zNum);

  try {
    const tiff = await getCOG(date);
    const image = await tiff.getImage();
    const tileData = await readTileData(image, bounds, tileSize);

    if (!tileData) {
      const emptyPng = createEmptyPNG(tileSize, tileSize);
      return new NextResponse(new Uint8Array(emptyPng), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const { data, destX, destY, destWidth, destHeight } = tileData;

    const fullRgba = new Uint8Array(tileSize * tileSize * 4);

    for (let row = 0; row < destHeight; row++) {
      for (let col = 0; col < destWidth; col++) {
        const srcIdx = row * destWidth + col;
        const dstIdx = (destY + row) * tileSize + (destX + col);
        const [r, g, b, a] = getSnowDepthColor(data[srcIdx]);
        fullRgba[dstIdx * 4] = r;
        fullRgba[dstIdx * 4 + 1] = g;
        fullRgba[dstIdx * 4 + 2] = b;
        fullRgba[dstIdx * 4 + 3] = a;
      }
    }

    const png = createPNG(fullRgba, tileSize, tileSize);

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Error generating tile", { status: 500 });
  }
};
