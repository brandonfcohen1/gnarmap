import { NextRequest, NextResponse } from "next/server";
import { getCOG, getValueAtPoint } from "@/lib/cog";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const GET = async (request: NextRequest) => {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const { searchParams } = new URL(request.url);
  const lng = parseFloat(searchParams.get("lng") || "");
  const lat = parseFloat(searchParams.get("lat") || "");
  const date = searchParams.get("date");

  if (isNaN(lng) || isNaN(lat) || !date) {
    return NextResponse.json(
      { error: "Missing or invalid parameters" },
      { status: 400 }
    );
  }

  try {
    const tiff = await getCOG(date);
    const image = await tiff.getImage();
    const value = await getValueAtPoint(image, lng, lat);

    if (value === null) {
      return NextResponse.json({ snowDepth: null, snowDepthInches: null });
    }

    const snowDepthInches = Math.max(value / 25.4, 0);

    return NextResponse.json({
      snowDepth: value,
      snowDepthInches: snowDepthInches.toFixed(1),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to identify point" },
      { status: 500 }
    );
  }
};
