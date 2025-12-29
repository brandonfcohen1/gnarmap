import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "us-east-2",
  credentials: process.env.GNARMAP_AWS_ACCESS_KEY && process.env.GNARMAP_AWS_SECRET
    ? {
        accessKeyId: process.env.GNARMAP_AWS_ACCESS_KEY,
        secretAccessKey: process.env.GNARMAP_AWS_SECRET,
      }
    : undefined,
});

const VALID_TYPES = ["snowdepth", "snowdensity", "snowfall"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: "gnarmap-historical",
      Key: `geojson/${type}.json`,
    });

    const response = await s3.send(command);
    const body = await response.Body?.transformToString();

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
