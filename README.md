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
- **Storage**: Cloudflare R2 (Zarr + PMTiles + GeoJSON)

## Deployment

### Web App (Cloudflare Pages)

1. Connect repo to Cloudflare Pages
2. Set build command: `bun run build`
3. Set output directory: `apps/web/out`
4. Add environment variables:
   - `NEXT_PUBLIC_ZARR_URL` - R2 public URL for Zarr (e.g., `https://pub-xxx.r2.dev/zarr`)
   - `NEXT_PUBLIC_PMTILES_URL` - R2 public URL for PMTiles (e.g., `https://pub-xxx.r2.dev/pmtiles`)
   - `NEXT_PUBLIC_GEOJSON_URL` - R2 public URL for GeoJSON (e.g., `https://pub-xxx.r2.dev/geojson`)

### R2 Storage Setup

1. Create R2 bucket `gnarmap-historical` in Cloudflare dashboard
2. Enable public access (Settings > Public access)
3. Create API token with R2 read/write permissions
4. Add CORS policy in bucket settings:
```json
[{"AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400}]
```

### GitHub Actions (Daily Pipeline)

The workflow at `.github/workflows/daily-pipeline.yml` runs daily at 10:00 UTC.

**Required Secrets** (Settings > Secrets and variables > Actions):
- `R2_ACCOUNT_ID` - Cloudflare account ID
- `R2_ACCESS_KEY_ID` - R2 API token access key
- `R2_SECRET_ACCESS_KEY` - R2 API token secret
- `EMAIL_USERNAME` - Gmail address for notifications
- `EMAIL_PASSWORD` - Gmail app password
- `NOTIFICATION_EMAIL` - Recipient email address

**Manual trigger**: Actions > Daily Pipeline > Run workflow (optionally specify date)

### Local Development with rclone

Create `~/.config/rclone/rclone.conf`:
```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = YOUR_ACCESS_KEY
secret_access_key = YOUR_SECRET_KEY
endpoint = https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

## Background

This project visualizes the [NOHRSC](https://www.nohrsc.noaa.gov/nsa/) Snow Depth data. Originally published as _GraphSnow_, renamed to _GnarMap_.

The Snow Depth raster data comes from the NOAA [MapServer](https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer). Site observation data is scraped from NOHRSC text files and posted to R2.

### Pixel Value Conversion

Per NOAA (December 2025): Raw pixel values need conversion. Divide by 25.4 to get inches (values are stored in mm).
