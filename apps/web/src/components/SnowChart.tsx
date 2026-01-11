"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getTimeSeriesForPixel } from "@/lib/zarr";
import LoadingOverlay from "./LoadingOverlay";

interface SnowChartProps {
  lng: number;
  lat: number;
  onClose: () => void;
}

const YEAR_OPTIONS = [1, 2, 5, 10, 20, 100];
const AGG_OPTIONS = ["daily", "weekly", "monthly"] as const;
const STAT_OPTIONS = ["avg", "max"] as const;
type AggType = (typeof AGG_OPTIONS)[number];
type StatType = (typeof STAT_OPTIONS)[number];

const aggregateData = (
  data: { date: string; value: number }[],
  aggType: AggType,
  statType: StatType
): { date: string; value: number }[] => {
  if (aggType === "daily") return data;

  const buckets = new Map<string, { sum: number; count: number; max: number }>();

  for (const point of data) {
    let key: string;
    if (aggType === "weekly") {
      const d = new Date(
        `${point.date.slice(0, 4)}-${point.date.slice(4, 6)}-${point.date.slice(6, 8)}`
      );
      const dayOfYear = Math.floor(
        (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000
      );
      const week = Math.floor(dayOfYear / 7);
      key = `${point.date.slice(0, 4)}W${week.toString().padStart(2, "0")}`;
    } else {
      key = point.date.slice(0, 6);
    }

    const bucket = buckets.get(key) || { sum: 0, count: 0, max: 0 };
    bucket.sum += point.value;
    bucket.count += 1;
    bucket.max = Math.max(bucket.max, point.value);
    buckets.set(key, bucket);
  }

  const result: { date: string; value: number }[] = [];
  for (const [key, bucket] of buckets) {
    let date: string;
    if (aggType === "weekly") {
      const year = parseInt(key.slice(0, 4));
      const week = parseInt(key.slice(5));
      const d = new Date(year, 0, 1 + week * 7);
      date = d.toISOString().slice(0, 10).replace(/-/g, "");
    } else {
      date = key + "15";
    }
    const value = statType === "max" ? bucket.max : bucket.sum / bucket.count;
    result.push({ date, value });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
};

const formatDateAxis = (dateStr: string): string => {
  const month = parseInt(dateStr.slice(4, 6));
  const year = dateStr.slice(2, 4);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} '${year}`;
};

const formatDateTooltip = (dateStr: string): string => {
  const year = dateStr.slice(0, 4);
  const month = parseInt(dateStr.slice(4, 6));
  const day = parseInt(dateStr.slice(6, 8));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} ${day}, ${year}`;
};

const SnowChart = ({ lng, lat, onClose }: SnowChartProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [years, setYears] = useState(5);
  const [aggregation, setAggregation] = useState<AggType>("weekly");
  const [statType, setStatType] = useState<StatType>("avg");
  const [chartData, setChartData] = useState<{ date: string; value: number }[]>([]);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - years);

        const startStr = startDate.toISOString().slice(0, 10).replace(/-/g, "");
        const endStr = endDate.toISOString().slice(0, 10).replace(/-/g, "");

        const data = await getTimeSeriesForPixel(lng, lat, startStr, endStr);

        if (data.length === 0) {
          setError("No data available for this location");
          setLoading(false);
          return;
        }

        const aggregated = aggregateData(data, aggregation, statType);
        setChartData(aggregated);
      } catch (err) {
        setError("Failed to load historical data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [lng, lat, years, aggregation, statType]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-xl flex flex-col ${
          maximized ? "w-[95vw] h-[90vh]" : "w-full max-w-3xl mx-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            Snow Depth History ({lat.toFixed(3)}, {lng.toFixed(3)})
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMaximized(!maximized)}
              className="p-1 hover:bg-gray-100 rounded"
              aria-label={maximized ? "Minimize" : "Maximize"}
            >
              {maximized ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className={`px-4 pt-3 flex flex-wrap items-center gap-4 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Range:</span>
            {YEAR_OPTIONS.map((y) => (
              <button
                key={y}
                onClick={() => setYears(y)}
                disabled={loading}
                className={`px-2 py-1 text-sm rounded ${
                  years === y
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {y === 100 ? "All" : `${y}y`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Interval:</span>
            {AGG_OPTIONS.map((agg) => (
              <button
                key={agg}
                onClick={() => setAggregation(agg)}
                disabled={loading}
                className={`px-2 py-1 text-sm rounded capitalize ${
                  aggregation === agg
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {agg}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Stat:</span>
            {STAT_OPTIONS.map((stat) => (
              <button
                key={stat}
                onClick={() => setStatType(stat)}
                disabled={loading}
                className={`px-2 py-1 text-sm rounded uppercase ${
                  statType === stat
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {stat}
              </button>
            ))}
          </div>
        </div>

        <div className={`p-4 relative ${maximized ? "flex-1 min-h-0" : "h-[360px]"}`}>
          {loading && <LoadingOverlay />}
          {error && (
            <div className="flex items-center justify-center h-full text-gray-500">
              {error}
            </div>
          )}
          {!error && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={maximized ? "100%" : 320}>
              <AreaChart data={chartData} style={{ cursor: "crosshair" }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateAxis}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "inches",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#666" },
                  }}
                />
                <Tooltip
                  labelFormatter={formatDateTooltip}
                  formatter={(value) => [(value as number).toFixed(1), "Snow Depth (in)"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  fill="rgba(37, 99, 235, 0.3)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>
    </div>
  );
};

export default SnowChart;
