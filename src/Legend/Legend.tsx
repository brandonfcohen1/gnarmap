import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "./Legend.css";

interface LegendObj {
  label: string;
  imageData: string;
  url: string;
  contentType: string;
  height: number;
  width: number;
}

interface LegendResponse {
  layers: {
    layerId: number;
    layerName: string;
    layerType: string;
    minScale: number;
    maxScale: number;
    legend: LegendObj[];
  }[];
}

const legendURL =
  "https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/NOHRSC_Snow_Analysis/MapServer/legend?f=json";

export default function Legend() {
  const map = useMap();

  useEffect(() => {
    fetch(legendURL)
      .then((res: any) => {
        return res.json();
      })
      .then((js: LegendResponse) => {
        const imageLegend: LegendObj[] =
          js?.layers.find((layer) => layer?.layerId === 3)?.legend || [];
        let legend = new L.Control();

        legend.options.position = "bottomleft";

        legend.onAdd = function (map) {
          let div = L.DomUtil.create("div", "info legend");

          div.innerHTML +=
            "<div style='text-align:center' <b>Snow Depth (in.)</b></div>";

          // loop through our density intervals and generate a label with a colored square for each interval
          for (let i = 0; i < imageLegend.length; i++) {
            div.innerHTML +=
              '<div class="row"><div class="column"><img src="data:image/png;base64,' +
              imageLegend[i].imageData +
              '"></div><div class="column">' +
              imageLegend[i].label +
              "</div></div>";
          }
          return div;
        };

        legend.addTo(map);
      });
  }, [map]);
  return null;
}
