# GnarMap

A few years ago I noticed [NOAA's Snow Depth Maps](https://www.nohrsc.noaa.gov/nsa/) which I thought would be interesting to use to get a general sense for backcountry ski conditions. The static .png tiles aren't terribly useful but then I noticed they published an [Esri REST service](https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer). I built v1 of this app to just visualize that in a more friendly way and bring in point observation data. I then realized that they publish full raster files as daily backups going back to 2003 and thought it would be interesting to do something with that data. A few years later I had some time to explore it and built this current verson of the app.

The app is a nextjs app but I don't use a backend at all- the client reads directly from R2 buckets. I processed the historical data into both .zarr (for historical data by point) and .pmtiles (for visualization), and I have a GitHub Action to process the latest day's data every day at 16:00 UTC. Saving the data in both .zarr and .pmtiles doubles the storage, but it was the best way I could come up with to use serve this volume of data (~50GB) in 2 different ways in a performant way (and Cloudflare is cheap).

GnarMap can be used for

1. Viewing current **modeled** snow conditions at any point (with 1km resolution) in the Continental US.
2. View up to date real observations from snow observtion stations.
3. View historical snow data for the entire Continental US.
4. View daily snow depth at any point on the map charted since 2003.

The snow depths displayed here are **modeled** to 1km resolution, so this map cannot tell whether a particular line is in, but can help answer generally what sort of snow coverage to expect. This data should not be used to evaluate avalanche or other safety conditions.

## Structure

```
gnarmap/
├── apps/
│   └── web/              # Next.js web application
├── packages/
│   └── pipeline/         # Rust data pipeline (COG generation, Zarr conversion)
```

## Quick Start

### Web App

```bash
bun install
bun dev
```

### Pipeline

```bash
cd packages/pipeline
cargo build --release

# Daily COG update
./target/release/snodas-pipeline daily --date yesterday --output s3://bucket/snodas

# Backfill historical data
./target/release/snodas-pipeline backfill --start 2003-10-01 --end 2025-12-31 --output ./output

# Build Zarr time series store
./target/release/snodas-pipeline build-zarr --cog-dir ./output --output ./zarr-output

# Append new dates to existing Zarr
./target/release/snodas-pipeline build-zarr --cog-dir ./output --output ./zarr-output --append
```

## Data Flow

1. **Pipeline** downloads SNODAS archives from NSIDC
2. Converts to Cloud-Optimized GeoTIFFs (COGs)
3. Builds Zarr V3 time series store (sparse, ~80% smaller)
4. Uploads to S3
5. **Web app** serves tiles from COGs and queries Zarr for historical charts

## Tech Stack

- **Web**: Next.js 15, React 19, MapLibre, react-map-gl, zarrita, lightweight-charts
- **Pipeline**: Rust, GDAL, zarrs
- **Storage**: Cloudflare R2 (Zarr + PMTiles + GeoJSON)
