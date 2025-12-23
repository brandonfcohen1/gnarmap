"use client";

import { Dispatch, SetStateAction, useState } from "react";

interface Layers {
  snowDepthRaster: boolean;
  stationsSnowDepth: boolean;
  stationsSnowDensity: boolean;
  stationsSnowfall: boolean;
}

interface LayerControlsProps {
  layers: Layers;
  setLayers: Dispatch<SetStateAction<Layers>>;
}

export default function LayerControls({ layers, setLayers }: LayerControlsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = (key: keyof Layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="absolute top-4 right-14 z-10 bg-white rounded-md shadow-md">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-2 text-sm font-semibold text-left flex justify-between items-center gap-2"
      >
        <span>Layers</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {!collapsed && (
        <div className="px-3 pb-2 space-y-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={layers.snowDepthRaster}
              onChange={() => toggle("snowDepthRaster")}
              className="rounded"
            />
            Snow Depth
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={layers.stationsSnowDepth}
              onChange={() => toggle("stationsSnowDepth")}
              className="rounded"
            />
            Stations: Snow Depth
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={layers.stationsSnowDensity}
              onChange={() => toggle("stationsSnowDensity")}
              className="rounded"
            />
            Stations: Snow Density
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={layers.stationsSnowfall}
              onChange={() => toggle("stationsSnowfall")}
              className="rounded"
            />
            Stations: Snowfall
          </label>
        </div>
      )}
    </div>
  );
}
