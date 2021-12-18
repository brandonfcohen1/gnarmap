import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  useMapEvents,
  Popup,
} from "react-leaflet";
import { DynamicMapLayer } from "react-esri-leaflet";
import "./LeafletMap.css";
import "leaflet/dist/leaflet.css";
//import * as esri from "esri-leaflet";
const esri = require("esri-leaflet");

const latlngDisp = (ll) => {
  return (
    "(" +
    Math.round(100 * ll.lat) / 100 +
    ", " +
    Math.round(100 * ll.lng) / 100 +
    ")"
  );
};

const HandleClick = () => {
  const [position, setPosition] = useState(null);
  const [snowDepth, setSnowDepth] = useState("...");
  const map = useMapEvents({
    click(e) {
      setPosition(e.latlng);
      setSnowDepth("...");
      esri
        .identifyFeatures({
          url: "https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/NOHRSC_Snow_Analysis/MapServer",
        })
        .layers("all:3,7")
        .on(map)
        .at(e.latlng)
        .run(function (error, featureCollection) {
          if (error) {
            console.log(error);
            return;
          }
          const _snowDepth = Math.max(
            Math.round(
              10 *
                featureCollection.features.filter((p) => p.layerId === 3)[0]
                  .properties["Pixel Value"]
            ) / 10,
            0
          );
          setSnowDepth(_snowDepth + " in.");
        });
    },
  });

  return position === null ? null : (
    <Popup position={position}>
      <b>{"Snow Depth: "}</b>
      {snowDepth}
      <br />
      <b>{"Location: "}</b>
      {latlngDisp(position)}
    </Popup>
  );
};

export default function LeafletMap() {
  return (
    <MapContainer center={[44, -75]} zoom={7}>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="OSM">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="Snow Depth">
          <DynamicMapLayer
            url="https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/NOHRSC_Snow_Analysis/MapServer"
            opacity={0.5}
            f="image"
          />
        </LayersControl.Overlay>
      </LayersControl>
      <HandleClick />
    </MapContainer>
  );
}
