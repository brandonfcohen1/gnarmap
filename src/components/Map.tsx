"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import MapGL, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";
import Legend from "./Legend";
import InfoModal from "./InfoModal";
import LayerControls from "./LayerControls";
import DatePicker from "./DatePicker";


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

interface ClusterProperties {
  cluster: boolean;
  cluster_id: number;
  point_count: number;
  point_count_abbreviated: number;
}

type ClusterFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: ClusterProperties | StationFeature["properties"];
};

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

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#51bbd6",
      10,
      "#f1f075",
      50,
      "#f28cb1",
    ],
    "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 50, 25],
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-size": 12,
  },
};

const createUnclusteredPointLayer = (id: string, color: string): LayerProps => ({
  id,
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": color,
    "circle-radius": 6,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#fff",
  },
});

export default function Map() {
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

  const [layers, setLayers] = useState({
    snowDepthRaster: true,
    stationsSnowDepth: false,
    stationsSnowDensity: false,
    stationsSnowfall: false,
  });

  useEffect(() => {
    if (!isReady) return;
    fetch("https://graphsnowgeojson.s3.us-east-2.amazonaws.com/snowdepth.json")
      .then((res) => res.json())
      .then(setSnowDepthData);
    fetch("https://graphsnowgeojson.s3.us-east-2.amazonaws.com/snowdensity.json")
      .then((res) => res.json())
      .then(setSnowDensityData);
    fetch("https://graphsnowgeojson.s3.us-east-2.amazonaws.com/snowfall.json")
      .then((res) => res.json())
      .then(setSnowfallData);
  }, [isReady]);

  const superclusterDepth = useMemo(() => {
    if (!snowDepthData) return null;
    const index = new Supercluster({ radius: 40, maxZoom: 16 });
    index.load(snowDepthData.features);
    return index;
  }, [snowDepthData]);

  const superclusterDensity = useMemo(() => {
    if (!snowDensityData) return null;
    const index = new Supercluster({ radius: 40, maxZoom: 16 });
    index.load(snowDensityData.features);
    return index;
  }, [snowDensityData]);

  const superclusterSnowfall = useMemo(() => {
    if (!snowfallData) return null;
    const index = new Supercluster({ radius: 40, maxZoom: 16 });
    index.load(snowfallData.features);
    return index;
  }, [snowfallData]);

  const getBounds = useCallback((): [number, number, number, number] => {
    const latRange = 180 / Math.pow(2, viewState.zoom);
    const lngRange = 360 / Math.pow(2, viewState.zoom);
    return [
      viewState.longitude - lngRange,
      viewState.latitude - latRange,
      viewState.longitude + lngRange,
      viewState.latitude + latRange,
    ];
  }, [viewState]);

  const depthClusters = useMemo(() => {
    if (!superclusterDepth) return [];
    return superclusterDepth.getClusters(getBounds(), Math.floor(viewState.zoom)) as ClusterFeature[];
  }, [superclusterDepth, getBounds, viewState.zoom]);

  const densityClusters = useMemo(() => {
    if (!superclusterDensity) return [];
    return superclusterDensity.getClusters(getBounds(), Math.floor(viewState.zoom)) as ClusterFeature[];
  }, [superclusterDensity, getBounds, viewState.zoom]);

  const snowfallClusters = useMemo(() => {
    if (!superclusterSnowfall) return [];
    return superclusterSnowfall.getClusters(getBounds(), Math.floor(viewState.zoom)) as ClusterFeature[];
  }, [superclusterSnowfall, getBounds, viewState.zoom]);

  const handleMapClick = useCallback(async (e: MapLayerMouseEvent) => {
    const features = e.features;
    if (features && features.length > 0) {
      const feature = features[0];
      if (feature.properties && "cluster" in feature.properties) {
        return;
      }
      if (feature.properties && "name" in feature.properties) {
        const coords = (feature.geometry as { type: "Point"; coordinates: [number, number] }).coordinates;
        const props = feature.properties as StationFeature["properties"];
        let dataType = "Snow Depth";
        if (feature.layer?.id?.includes("density")) dataType = "Snow Density";
        if (feature.layer?.id?.includes("snowfall")) dataType = "Snowfall";
        setStationPopup({
          lng: coords[0],
          lat: coords[1],
          name: props.name,
          elevation: props.elevation,
          reportTime: props.report_time_utc,
          amount: props.amount,
          units: props.units,
          duration: props.duration,
          durationUnits: props.durationunits,
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

  return (
    <div className="relative h-full w-full">
      <MapGL
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        onClick={handleMapClick}
        interactiveLayerIds={[
          ...(layers.stationsSnowDepth ? ["unclustered-point-depth"] : []),
          ...(layers.stationsSnowDensity ? ["unclustered-point-density"] : []),
          ...(layers.stationsSnowfall ? ["unclustered-point-snowfall"] : []),
        ]}
      >
        <NavigationControl position="top-right" />

        {layers.snowDepthRaster && rasterTileUrl && (
          <Source
            id="snow-depth"
            type="raster"
            tiles={[rasterTileUrl]}
            tileSize={256}
          >
            <Layer
              id="snow-depth-layer"
              type="raster"
              paint={{ "raster-opacity": 0.7 }}
            />
          </Source>
        )}

        {layers.stationsSnowDepth && depthClusters.length > 0 && (
          <Source
            id="stations-depth"
            type="geojson"
            data={{ type: "FeatureCollection", features: depthClusters }}
            cluster={false}
          >
            <Layer {...clusterLayer} id="clusters-depth" />
            <Layer {...clusterCountLayer} id="cluster-count-depth" />
            <Layer {...createUnclusteredPointLayer("unclustered-point-depth", "#3b82f6")} />
          </Source>
        )}

        {layers.stationsSnowDensity && densityClusters.length > 0 && (
          <Source
            id="stations-density"
            type="geojson"
            data={{ type: "FeatureCollection", features: densityClusters }}
            cluster={false}
          >
            <Layer {...clusterLayer} id="clusters-density" />
            <Layer {...clusterCountLayer} id="cluster-count-density" />
            <Layer {...createUnclusteredPointLayer("unclustered-point-density", "#8b5cf6")} />
          </Source>
        )}

        {layers.stationsSnowfall && snowfallClusters.length > 0 && (
          <Source
            id="stations-snowfall"
            type="geojson"
            data={{ type: "FeatureCollection", features: snowfallClusters }}
            cluster={false}
          >
            <Layer {...clusterLayer} id="clusters-snowfall" />
            <Layer {...clusterCountLayer} id="cluster-count-snowfall" />
            <Layer {...createUnclusteredPointLayer("unclustered-point-snowfall", "#06b6d4")} />
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
              <p>
                <strong>Snow Depth:</strong> {clickPopup.snowDepth}
              </p>
              <p>
                <strong>Location:</strong> ({clickPopup.lat.toFixed(2)},{" "}
                {clickPopup.lng.toFixed(2)})
              </p>
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
              <p>
                <strong>Name:</strong> {stationPopup.name}
              </p>
              <p>
                <strong>Elevation:</strong> {stationPopup.elevation}
              </p>
              <p>
                <strong>Report Time (UTC):</strong> {stationPopup.reportTime}
              </p>
              <p>
                <strong>Amount:</strong> {stationPopup.amount} ({stationPopup.units})
              </p>
              {stationPopup.duration && (
                <p>
                  <strong>Duration:</strong> {stationPopup.duration} (
                  {stationPopup.durationUnits})
                </p>
              )}
            </div>
          </Popup>
        )}
      </MapGL>

      {isReady && <Legend />}
      {isReady && <LayerControls layers={layers} setLayers={setLayers} />}
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
    </div>
  );
}
