"use client";

import { useState } from "react";

interface BasemapControlProps {
  basemap: string;
  setBasemap: (basemap: string) => void;
}

const basemaps = [
  { id: "positron", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "voyager", name: "Streets" },
  { id: "osm", name: "Liberty" },
];

const BasemapControl = ({ basemap, setBasemap }: BasemapControlProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="absolute top-[160px] right-[10px] z-10">
      {expanded ? (
        <div className="bg-white rounded-md shadow-md p-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold">Basemap</span>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {basemaps.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setBasemap(b.id);
                  setExpanded(false);
                }}
                className={`text-left px-2 py-1 text-sm rounded ${
                  basemap === b.id
                    ? "bg-blue-500 text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="bg-white rounded-md p-2 shadow-md hover:bg-gray-100"
          aria-label="Change basemap"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default BasemapControl;
