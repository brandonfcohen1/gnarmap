interface TimeSeriesPoint {
  date: string;
  value: number;
}

export async function getTimeSeriesForPixel(
  lng: number,
  lat: number,
  startDate?: string,
  endDate?: string
): Promise<TimeSeriesPoint[]> {
  const params = new URLSearchParams({
    lng: lng.toString(),
    lat: lat.toString(),
  });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);

  const response = await fetch(`/api/timeseries?${params}`);
  if (!response.ok) {
    throw new Error("Failed to fetch timeseries data");
  }
  return response.json();
}
