# GraphSnow

This is a simple app to visualize the [NOHRSC](https://www.nohrsc.noaa.gov/nsa/) Snow Depth map and underlying site observations.

The Snow Depth raster data is from this [MapServer](https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/NOHRSC_Snow_Analysis/MapServer), which I visualize using [react-esri-leaflet](https://github.com/slutske22/react-esri-leaflet).

The most accessible way I found the site observation data was through text files posted to the NOHRSC site every 6 hours, which I scrape and post to s3 every 6 hours using [this script](https://github.com/brandonfcohen1/graphsnow-utils).
