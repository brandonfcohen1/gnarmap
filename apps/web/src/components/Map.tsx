"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import MapGL, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  MapLayerMouseEvent,
  MapRef,
} from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Legend from "./Legend";
import InfoModal from "./InfoModal";
import LayerControls from "./LayerControls";
import DatePicker from "./DatePicker";
import BasemapControl from "./BasemapControl";
import SnowChart from "./SnowChart";

interface StationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    name: string;
    elevation: string;
    report_time_utc: string;
    amount: string;
    units: string;
    duration?: string;
    durationunits?: string;
  };
}

interface StationData {
  type: "FeatureCollection";
  features: StationFeature[];
}

interface ClickPopupData {
  lng: number;
  lat: number;
  snowDepth: string;
}

interface StationPopupData {
  lng: number;
  lat: number;
  name: string;
  elevation: string;
  reportTime: string;
  amount: string;
  units: string;
  duration?: string;
  durationUnits?: string;
  dataType: string;
}

const clusterLayer = (id: string, color: string): LayerProps => ({
  id,
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": color,
    "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
  },
});

const clusterCountLayer = (id: string): LayerProps => ({
  id,
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-size": 12,
  },
  paint: {
    "text-color": "#fff",
  },
});

const unclusteredPointLayer = (id: string): LayerProps => ({
  id,
  type: "symbol",
  filter: ["!", ["has", "point_count"]],
  layout: {
    "icon-image": "snowflake",
    "icon-size": 0.04,
    "icon-allow-overlap": true,
  },
});

export default function Map() {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    longitude: -96.7,
    latitude: 42.1,
    zoom: 4,
  });

  const [snowDepthData, setSnowDepthData] = useState<StationData | null>(null);
  const [snowDensityData, setSnowDensityData] = useState<StationData | null>(null);
  const [snowfallData, setSnowfallData] = useState<StationData | null>(null);

  const [clickPopup, setClickPopup] = useState<ClickPopupData | null>(null);
  const [stationPopup, setStationPopup] = useState<StationPopupData | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [cursor, setCursor] = useState("crosshair");
  const [basemap, setBasemap] = useState("positron");
  const [chartLocation, setChartLocation] = useState<{ lng: number; lat: number } | null>(null);

  const [layers, setLayers] = useState({
    snowDepthRaster: true,
    stationsSnowDepth: false,
    stationsSnowDensity: false,
    stationsSnowfall: false,
  });

  useEffect(() => {
    if (!isReady) return;
    fetch("/api/stations/snowdepth")
      .then((res) => res.json())
      .then(setSnowDepthData);
    fetch("/api/stations/snowdensity")
      .then((res) => res.json())
      .then(setSnowDensityData);
    fetch("/api/stations/snowfall")
      .then((res) => res.json())
      .then(setSnowfallData);
  }, [isReady]);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const img = new Image();
    img.onload = () => {
      if (!map.hasImage("snowflake")) {
        map.addImage("snowflake", img);
      }
      setMapLoaded(true);
    };
    img.src = "/snowicon.png";

    const handleIdle = () => {
      if (map.getSource("snow-depth-raster")) {
        const globalLoader = document.getElementById("global-loader");
        if (globalLoader) globalLoader.remove();
      }
    };

    map.on("idle", handleIdle);

    return () => {
      map.off("idle", handleIdle);
    };
  }, []);

  const handleMapClick = useCallback(async (e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    const features = e.features;

    if (features && features.length > 0) {
      const feature = features[0];

      if (feature.properties && feature.properties.cluster) {
        const sourceId = feature.source;
        if (map && sourceId) {
          const source = map.getSource(sourceId);
          if (source && source.type === "geojson") {
            const clusterId = feature.properties.cluster_id as number;
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

            try {
              const zoom = await (source as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId);
              map.easeTo({
                center: coords,
                zoom: Math.min(zoom, 14),
                duration: 500,
              });
            } catch {
              // ignore
            }
          }
        }
        return;
      }

      if (feature.properties && "name" in feature.properties) {
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        const props = feature.properties;
        let dataType = "Snow Depth";
        if (feature.layer?.id?.includes("density")) dataType = "Snow Density";
        if (feature.layer?.id?.includes("snowfall")) dataType = "Snowfall";
        setStationPopup({
          lng: coords[0],
          lat: coords[1],
          name: props.name as string,
          elevation: props.elevation as string,
          reportTime: props.report_time_utc as string,
          amount: props.amount as string,
          units: props.units as string,
          duration: props.duration as string | undefined,
          durationUnits: props.durationunits as string | undefined,
          dataType,
        });
        setClickPopup(null);
        return;
      }
    }

    setStationPopup(null);
    setClickPopup({ lng: e.lngLat.lng, lat: e.lngLat.lat, snowDepth: "..." });

    if (!selectedDate) {
      setClickPopup({ lng: e.lngLat.lng, lat: e.lngLat.lat, snowDepth: "No date selected" });
      return;
    }

    try {
      const { lng, lat } = e.lngLat;
      const url = `/api/identify?lng=${lng}&lat=${lat}&date=${selectedDate}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.snowDepthInches !== null) {
        setClickPopup({ lng, lat, snowDepth: `${data.snowDepthInches} in.` });
      } else {
        setClickPopup({ lng, lat, snowDepth: "No Data" });
      }
    } catch {
      setClickPopup({ lng: e.lngLat.lng, lat: e.lngLat.lat, snowDepth: "Error" });
    }
  }, [selectedDate]);

  const rasterTileUrl = selectedDate
    ? `/api/tiles/${selectedDate}/{z}/{x}/{y}.png`
    : null;

  const interactiveLayerIds = [
    ...(layers.stationsSnowDepth ? ["clusters-depth", "unclustered-depth"] : []),
    ...(layers.stationsSnowDensity ? ["clusters-density", "unclustered-density"] : []),
    ...(layers.stationsSnowfall ? ["clusters-snowfall", "unclustered-snowfall"] : []),
  ];

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onLoad={handleMapLoad}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor("crosshair")}
        style={{ width: "100%", height: "100%" }}
        mapStyle={{
          positron: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
          dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
          voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
          osm: "https://tiles.openfreemap.org/styles/liberty",
        }[basemap]}
        onClick={handleMapClick}
        interactiveLayerIds={interactiveLayerIds}
        cursor={cursor}
        dragRotate={false}
        touchZoomRotate={false}
        minZoom={4}
      >
        <NavigationControl position="top-right" style={{ marginTop: "205px" }} />

        {layers.snowDepthRaster && rasterTileUrl && (
          <Source
            id="snow-depth-raster"
            type="raster"
            tiles={[rasterTileUrl]}
            tileSize={256}
            minzoom={3.5}
          >
            <Layer
              id="snow-depth-layer"
              type="raster"
              minzoom={4}
              paint={{ "raster-opacity": 0.7 }}
            />
          </Source>
        )}

        {mapLoaded && layers.stationsSnowDepth && snowDepthData && (
          <Source
            id="stations-depth"
            type="geojson"
            data={snowDepthData}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer {...clusterLayer("clusters-depth", "#2563eb")} />
            <Layer {...clusterCountLayer("cluster-count-depth")} />
            <Layer {...unclusteredPointLayer("unclustered-depth")} />
          </Source>
        )}

        {mapLoaded && layers.stationsSnowDensity && snowDensityData && (
          <Source
            id="stations-density"
            type="geojson"
            data={snowDensityData}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer {...clusterLayer("clusters-density", "#7c3aed")} />
            <Layer {...clusterCountLayer("cluster-count-density")} />
            <Layer {...unclusteredPointLayer("unclustered-density")} />
          </Source>
        )}

        {mapLoaded && layers.stationsSnowfall && snowfallData && (
          <Source
            id="stations-snowfall"
            type="geojson"
            data={snowfallData}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer {...clusterLayer("clusters-snowfall", "#0891b2")} />
            <Layer {...clusterCountLayer("cluster-count-snowfall")} />
            <Layer {...unclusteredPointLayer("unclustered-snowfall")} />
          </Source>
        )}

        {clickPopup && (
          <Popup
            longitude={clickPopup.lng}
            latitude={clickPopup.lat}
            onClose={() => setClickPopup(null)}
            closeButton={true}
            closeOnClick={false}
          >
            <div className="text-sm">
              <p><strong>Snow Depth:</strong> {clickPopup.snowDepth}</p>
              <p><strong>Location:</strong> ({clickPopup.lat.toFixed(2)}, {clickPopup.lng.toFixed(2)})</p>
              <button
                onClick={() => {
                  setChartLocation({ lng: clickPopup.lng, lat: clickPopup.lat });
                  setClickPopup(null);
                }}
                className="mt-2 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
              >
                View History
              </button>
            </div>
          </Popup>
        )}

        {stationPopup && (
          <Popup
            longitude={stationPopup.lng}
            latitude={stationPopup.lat}
            onClose={() => setStationPopup(null)}
            closeButton={true}
            closeOnClick={false}
          >
            <div className="text-sm">
              <p className="font-bold">{stationPopup.dataType}</p>
              <p><strong>Name:</strong> {stationPopup.name}</p>
              <p><strong>Elevation:</strong> {stationPopup.elevation}</p>
              <p><strong>Report Time (UTC):</strong> {stationPopup.reportTime}</p>
              <p><strong>Amount:</strong> {stationPopup.amount} ({stationPopup.units})</p>
              {stationPopup.duration && (
                <p><strong>Duration:</strong> {stationPopup.duration} ({stationPopup.durationUnits})</p>
              )}
            </div>
          </Popup>
        )}
      </MapGL>

      {isReady && <Legend />}
      {isReady && <LayerControls layers={layers} setLayers={setLayers} />}
      {isReady && <BasemapControl basemap={basemap} setBasemap={setBasemap} />}
      <DatePicker
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        enabled={!infoOpen}
        onReady={() => setIsReady(true)}
      />
      {isReady && (
        <button
          onClick={() => setInfoOpen(true)}
          className="absolute top-4 left-4 z-10 bg-white rounded-md p-2 shadow-md hover:bg-gray-100"
          aria-label="Info"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
            />
          </svg>
        </button>
      )}
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
            {chartLocation && (
        <SnowChart
          lng={chartLocation.lng}
          lat={chartLocation.lat}
          onClose={() => setChartLocation(null)}
        />
      )}
    </div>
  );
}
