"use client";

import { useState } from "react";

const LEGEND_ITEMS = [
  { label: "< 1", color: "rgb(230, 245, 255)" },
  { label: "1 - 3", color: "rgb(200, 230, 255)" },
  { label: "3 - 6", color: "rgb(150, 200, 255)" },
  { label: "6 - 12", color: "rgb(100, 170, 255)" },
  { label: "12 - 24", color: "rgb(50, 130, 220)" },
  { label: "24 - 48", color: "rgb(30, 90, 200)" },
  { label: "48 - 72", color: "rgb(60, 60, 180)" },
  { label: "72 - 96", color: "rgb(100, 50, 170)" },
  { label: "96 - 120", color: "rgb(140, 40, 160)" },
  { label: "120 - 180", color: "rgb(180, 30, 140)" },
  { label: "> 180", color: "rgb(220, 20, 100)" },
];

const Legend = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-10 bg-white rounded-md shadow-md">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-2 text-sm font-semibold text-left flex justify-between items-center"
      >
        <span>Snow Depth (in.)</span>
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
        <div className="px-3 pb-2">
          {LEGEND_ITEMS.map((item, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <div
                className="w-5 h-5 rounded-sm border border-gray-300"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Legend;
