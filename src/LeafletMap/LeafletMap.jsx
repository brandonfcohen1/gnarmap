import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  useMapEvents,
  Popup,
  GeoJSON,
} from "react-leaflet";
import { DynamicMapLayer, TiledMapLayer } from "react-esri-leaflet";
import "./LeafletMap.css";
import "leaflet/dist/leaflet.css";
import MarkerClusterGroup from "react-leaflet-markercluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-markercluster/dist/styles.min.css";
import Legend from "../Legend/Legend";
import InfoButton from "../InfoButton/InfoButton";
import icon from "../assets/markerIcons/snowicon.png";
const esri = require("esri-leaflet");

let DefaultIcon = L.icon({
  iconUrl: icon,
  iconSize: [20, 20],
});

L.Marker.prototype.options.icon = DefaultIcon;

const mapboxURL = (id) => {
  return (
    "https://api.mapbox.com/styles/v1/graphsnow/" +
    id +
    "/tiles/{z}/{x}/{y}{r}?access_token=" +
    process.env.REACT_APP_MAPBOX
  );
};

const stationPopup = (p, sf = false) => {
  try {
    let popupString =
      "<b>Name: </b>" +
      p.name +
      "<br><b>Elevation: </b>" +
      p.elevation +
      "<br><b>Report Time (UTC): </b>" +
      p.report_time_utc +
      "<br><b>Amount: </b>" +
      p.amount +
      " (" +
      p.units +
      ")";
    if (sf) {
      popupString +=
        "<br><b>Duration: </b>" + p.duration + " (" + p.durationunits + ")";
    }
    return popupString;
  } catch {
    return null;
  }
};

const latlngDisp = (ll) => {
  return (
    "(" +
    Math.round(100 * ll.lat) / 100 +
    ", " +
    Math.round(100 * ll.lng) / 100 +
    ")"
  );
};

const HandleClick = (button) => {
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
  const [snowdepth, setSnowdepth] = useState(null);
  const [snowdensity, setSnowdensity] = useState(null);
  const [snowfall, setSnowfall] = useState(null);

  useEffect(() => {
    fetch(
      "https://graphsnowgeojson.s3.us-east-2.amazonaws.com/snowdensity.json"
    )
      .then((res) => {
        return res.json();
      })
      .then((js) => {
        setSnowdensity(js);
      });
    fetch("https://graphsnowgeojson.s3.us-east-2.amazonaws.com/snowfall.json")
      .then((res) => {
        return res.json();
      })
      .then((js) => {
        setSnowfall(js);
      });
    fetch("https://graphsnowgeojson.s3.us-east-2.amazonaws.com/snowdepth.json")
      .then((res) => {
        return res.json();
      })
      .then((js) => {
        setSnowdepth(js);
      });
  }, []);

  return (
    <div className={"map-container-div"}>
      <MapContainer center={[44, -75]} zoom={7}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Topo">
            <TileLayer
              attribution='Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>'
              url={mapboxURL("ckxby1vbx4rsd14mt3dooh55v")}
              tileSize={512}
              zoomOffset={-1}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LayersControl.BaseLayer name="USGS Topo">
              <TiledMapLayer url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="USGS Imagery">
              <TiledMapLayer url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer" />
            </LayersControl.BaseLayer>
          </LayersControl.BaseLayer>
          <LayersControl.Overlay checked name="Snow Depth">
            <DynamicMapLayer
              url="https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/NOHRSC_Snow_Analysis/MapServer"
              opacity={0.7}
              f="image"
            />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Stations: Snow Depth">
            <MarkerClusterGroup>
              {snowdepth ? (
                <GeoJSON
                  data={snowdepth}
                  onEachFeature={(feature, layer) => {
                    const p = feature.properties;
                    layer.bindPopup("<b>Snow Depth</b><br>" + stationPopup(p));
                  }}
                />
              ) : null}
            </MarkerClusterGroup>
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Stations: Snow Density">
            <MarkerClusterGroup>
              {snowdensity ? (
                <GeoJSON
                  data={snowdensity}
                  onEachFeature={(feature, layer) => {
                    const p = feature.properties;
                    layer.bindPopup(
                      "<b>Snow Density</b><br>" + stationPopup(p)
                    );
                  }}
                />
              ) : null}
            </MarkerClusterGroup>
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Stations: Snowfall">
            <MarkerClusterGroup>
              {snowfall ? (
                <GeoJSON
                  data={snowfall}
                  onEachFeature={(feature, layer) => {
                    const p = feature.properties;
                    layer.bindPopup(
                      "<b>Snowfall</b><br>" + stationPopup(p, true)
                    );
                  }}
                />
              ) : null}
            </MarkerClusterGroup>
          </LayersControl.Overlay>
        </LayersControl>
        <HandleClick />
        <Legend />
        <InfoButton />
      </MapContainer>
    </div>
  );
}
