# GnarMap

This is a simple React app to visualize the [NOHRSC](https://www.nohrsc.noaa.gov/nsa/) Snow Depth map and underlying site observations. I originally published it under the name _GraphSnow_, but thought _GnarMap_ was a better name.

The Snow Depth raster data is from this [MapServer](https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer), which I visualize using [react-esri-leaflet](https://github.com/slutske22/react-esri-leaflet).

The most accessible way I found the site observation data was through text files posted to the NOHRSC site every 24 hours, which I scrape and post to s3 every 6 hours using [this script](https://github.com/brandonfcohen1/graphsnow-utils).

I'd love for this project to grow! If you have any ideas, please open an issue or submit a PR. Some ideas I have are:

- Automatically take a screenshot of the map every day
- Automated email reports
- API for the site observation data
