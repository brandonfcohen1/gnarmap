# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

```
gnarmap/
├── apps/web/           # Next.js web application
├── packages/pipeline/  # Rust data pipeline + Python PMTiles scripts
```

## Commands

### Web App (from root)
- **Dev server**: `bun dev`
- **Build**: `bun run build`
- **Lint**: `bun run lint`
- **Typecheck**: `bun run typecheck`

### Pipeline (from root, uses package.json scripts)
- **Build**: `bun run pipeline:build`
- **Daily run**: `bun run pipeline:daily` (generates COGs locally)
- **Daily with date**: `bun run pipeline:daily -- --date 2024-12-27`
- **Backfill**: `bun run pipeline:backfill -- --start 2024-12-27 --end 2024-12-30`
- **Build Zarr (local)**: `bun run pipeline:build-zarr` (COG → local Zarr)
- **Append Zarr to R2**: `./target/release/snodas-pipeline build-zarr --cog-dir ./output --output r2://gnarmap-historical/zarr --append`
- **Build PMTiles**: `bun run pipeline:build-pmtiles` (COG → PMTiles, parallel)
- **Sync Zarr to R2**: `bun run pipeline:sync-zarr` (requires rclone)
- **Sync PMTiles to R2**: `bun run pipeline:sync-pmtiles` (requires rclone)

### Backfill Script (resumable, for historical data)
```bash
cd packages/pipeline/scripts

./backfill.sh status    # Show progress (local + R2 by default)
./backfill.sh cogs      # Download COGs (30-day chunks, skips existing)
./backfill.sh zarr      # Build Zarr (append mode)
./backfill.sh pmtiles   # Generate PMTiles (parallel, skips existing)
./backfill.sh sync      # Upload to R2
./backfill.sh all       # Run full pipeline

# Environment variables
START_DATE=2020-01-01 END_DATE=2023-12-31 ./backfill.sh cogs
WORKERS=8 ZOOM_LEVELS="4..8" ./backfill.sh pmtiles
CHECK_R2=false ./backfill.sh status  # Skip R2 checks
```

**Environment Variables:**
- `START_DATE` - Start date (default: 2003-10-01)
- `END_DATE` - End date (default: today)
- `CHUNK_DAYS` - Days per COG download chunk (default: 30)
- `WORKERS` - Parallel workers for PMTiles (default: CPU count)
- `ZOOM_LEVELS` - PMTiles zoom range (default: 4..8)
- `CHECK_R2` - Check R2 for status (default: true)
- `R2_BUCKET` - R2 bucket path (default: r2:gnarmap-historical)

## Deployment

### Static Site (Cloudflare Pages / Any Static Host)
The web app builds as a static site (`output: "export"`). All data is fetched client-side from R2.

### R2 Setup
1. Create bucket `gnarmap-historical` in Cloudflare dashboard
2. Enable public access (Settings > Public access)
3. Note the public URL (e.g., `https://pub-xxx.r2.dev`)
4. Create API token with R2 read/write permissions

### rclone Configuration
Create `~/.config/rclone/rclone.conf`:
```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = YOUR_ACCESS_KEY
secret_access_key = YOUR_SECRET_KEY
endpoint = https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

### CORS Configuration
In Cloudflare R2 bucket settings, add CORS policy:
```json
[{"AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400}]
```

### GitHub Actions (Daily Pipeline)
Automated daily pipeline runs at 10:00 UTC via `.github/workflows/daily-pipeline.yml`.

**Required Secrets** (Settings > Secrets and variables > Actions):
- `R2_ACCOUNT_ID` - Cloudflare account ID
- `R2_ACCESS_KEY_ID` - R2 API token access key
- `R2_SECRET_ACCESS_KEY` - R2 API token secret
- `EMAIL_USERNAME` - Gmail address for notifications
- `EMAIL_PASSWORD` - Gmail app password
- `NOTIFICATION_EMAIL` - Recipient email address

**Manual trigger**: Actions > Daily Pipeline > Run workflow (optionally specify date)

### Environment Variables
- `NEXT_PUBLIC_ZARR_URL` - Public R2 URL for Zarr data (e.g., `https://pub-xxx.r2.dev/zarr`)
- `NEXT_PUBLIC_PMTILES_URL` - Public R2 URL for PMTiles (e.g., `https://pub-xxx.r2.dev/pmtiles`)
- `NEXT_PUBLIC_GEOJSON_URL` - Public R2 URL for GeoJSON (e.g., `https://pub-xxx.r2.dev/geojson`)

## Web App Architecture (apps/web)

Next.js 15 app (App Router) with react-map-gl and MapLibre.

### Key Components
- **Map** (`src/components/Map.tsx`) - Main map with PMTiles raster, station markers, popups
- **SnowChart** (`src/components/SnowChart.tsx`) - Historical time series chart (client-side Zarr)
- **Legend** (`src/components/Legend.tsx`) - Collapsible legend
- **DatePicker** (`src/components/DatePicker.tsx`) - Date selection for historical views
- **LayerControls** (`src/components/LayerControls.tsx`) - Toggle map layers

### Data Loading (all client-side)
- **PMTiles** - Snow depth raster tiles loaded from R2 via pmtiles protocol
- **Zarr** - Point queries and time series fetched from R2 (`src/lib/zarr.ts`)
- **Stations** - GeoJSON loaded directly from R2

### Data Sources (Cloudflare R2)
All data stored in `gnarmap-historical` R2 bucket:
- PMTiles: `/pmtiles/{date}.pmtiles` (rendered tiles)
- Zarr store: `/zarr/` (raw values for point queries and time series)
- Station GeoJSON: `/geojson/`

## Pipeline Architecture (packages/pipeline)

### Rust Pipeline
- `snodas.rs` - Data models, product IDs, bounding boxes
- `download.rs` - Async HTTP client with retry logic
- `extract.rs` - Tar/gz extraction
- `convert.rs` - ENVI header generation, GDAL COG conversion
- `zarr_builder.rs` - COG to Zarr V3 conversion with sparse storage
- `storage.rs` - R2 upload (uses `r2://bucket/prefix` URLs)

### Python Scripts (`scripts/`)
- `generate_pmtiles.py` - Convert COGs to PMTiles with color ramp (supports parallel processing)
- `generate_geojson.py` - Fetch NOHRSC station data and generate GeoJSON
- `backfill.sh` - Resumable backfill script for historical data
- `requirements.txt` - Python dependencies (rio-pmtiles, rasterio, numpy, requests)

### Key Features
- **R2-native Zarr append**: Directly reads/writes to R2, only fetches affected time chunks (~25MB vs 500MB full download)
- Sparse Zarr storage (skips zero-value chunks, ~80% size reduction)
- Append mode for fast daily updates (~2-3 min including R2 sync)
- PMTiles for serverless tile serving
- Parallel PMTiles generation (uses all CPU cores)
- Resumable backfill (can stop/restart at any point)

## Code Conventions

### TypeScript/JavaScript (Web App)
- Use arrow functions for all function declarations
- Use async/await for asynchronous operations
- Keep functions small and modular
- Extract shared utilities to `src/lib/`
- Use TypeScript interfaces for data shapes
- Prefer `const` over `let`

### Rust (Pipeline)
- One module per file with clear responsibilities
- Shared utilities in `snodas.rs`
- Use `anyhow::Result` for error handling
- Parallel processing with `rayon` where applicable

### General
- DRY: Extract repeated code to shared functions/modules
- Readable code with descriptive variable names
- No unnecessary comments - code should be self-documenting

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
