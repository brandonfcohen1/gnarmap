import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getCOG, getTileBounds, readTileData, getSnowDepthColor } from "@/lib/cog";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string; z: string; x: string; y: string }> }
) {
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
      const emptyPng = await sharp({
        create: {
          width: tileSize,
          height: tileSize,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();

      return new NextResponse(new Uint8Array(emptyPng), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const { data, destX, destY, destWidth, destHeight } = tileData;

    const dataRgba = new Uint8Array(destWidth * destHeight * 4);
    for (let i = 0; i < data.length; i++) {
      const [r, g, b, a] = getSnowDepthColor(data[i]);
      dataRgba[i * 4] = r;
      dataRgba[i * 4 + 1] = g;
      dataRgba[i * 4 + 2] = b;
      dataRgba[i * 4 + 3] = a;
    }

    const dataImage = sharp(Buffer.from(dataRgba), {
      raw: {
        width: destWidth,
        height: destHeight,
        channels: 4,
      },
    });

    const png = await sharp({
      create: {
        width: tileSize,
        height: tileSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await dataImage.toBuffer(),
          left: destX,
          top: destY,
          raw: {
            width: destWidth,
            height: destHeight,
            channels: 4,
          },
        },
      ])
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Error generating tile:", date, z, x, yClean, error);
    return new NextResponse(`Error generating tile: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}
