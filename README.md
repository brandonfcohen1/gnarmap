# GnarMap

Interactive snow depth visualization using NOAA SNODAS data.

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
- **Storage**: AWS S3 (COGs + Zarr)

## Background

This project visualizes the [NOHRSC](https://www.nohrsc.noaa.gov/nsa/) Snow Depth data. Originally published as _GraphSnow_, renamed to _GnarMap_.

The Snow Depth raster data comes from the NOAA [MapServer](https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer). Site observation data is scraped from NOHRSC text files and posted to S3.

### Pixel Value Conversion

Per NOAA (December 2025): Raw pixel values need conversion. Divide by 25.4 to get inches (values are stored in mm).
