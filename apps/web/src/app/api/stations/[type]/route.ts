import { NextRequest, NextResponse } from "next/server";
import { getR2Object } from "@/lib/r2";

const VALID_TYPES = ["snowdepth", "snowdensity", "snowfall"];

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) => {
  const { type } = await params;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    const body = await getR2Object(`geojson/${type}.json`);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
};
