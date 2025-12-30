# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

```
gnarmap/
├── apps/web/           # Next.js web application (deployed to Cloudflare Workers)
├── packages/pipeline/  # Rust data pipeline
```

## Commands

### Web App (from root)
- **Dev server**: `bun dev`
- **Build**: `bun run build`
- **Lint**: `bun run lint`
- **Typecheck**: `bun run typecheck`
- **Preview (Cloudflare)**: `cd apps/web && bun run preview`
- **Deploy (Cloudflare)**: `cd apps/web && bun run deploy`

### Pipeline (from root, uses package.json scripts)
- **Build**: `bun run pipeline:build`
- **Daily run**: `bun run pipeline:daily` (uploads to R2)
- **Daily with date**: `bun run pipeline:daily -- --date 2024-12-27`
- **Backfill**: `bun run pipeline:backfill -- --start 2024-12-27 --end 2024-12-30`
- **Build Zarr**: `bun run pipeline:build-zarr` (local only)
- **Append Zarr**: `bun run pipeline:build-zarr -- --append`
- **Sync Zarr to R2**: `bun run pipeline:sync-zarr` (requires rclone with r2 remote configured)

### Pipeline Direct Commands (from packages/pipeline)
- **Daily to R2**: `./target/release/snodas-pipeline daily --date yesterday --output r2://gnarmap-historical/snodas`
- **Backfill to R2**: `./target/release/snodas-pipeline backfill --start 2024-01-01 --end 2024-12-31 --output r2://gnarmap-historical/snodas`
- **Build Zarr locally**: `./target/release/snodas-pipeline build-zarr --cog-dir ./output --output ./zarr-output`
- **Append Zarr**: `./target/release/snodas-pipeline build-zarr --cog-dir ./output --output ./zarr-output --append`

## Deployment

### Cloudflare Workers (Web App)

The web app is deployed to Cloudflare Workers using OpenNext. Configuration is in `apps/web/wrangler.jsonc`.

**First-time setup:**
1. Install Wrangler CLI: `npm install -g wrangler`
2. Login to Cloudflare: `wrangler login`
3. Create R2 bucket: `wrangler r2 bucket create gnarmap-historical`
4. Set environment variables in Cloudflare dashboard or via `wrangler secret put`

**Deploy:**
```bash
cd apps/web
bun run deploy
```

**Environment Variables (set in Cloudflare dashboard):**
- `R2_ACCOUNT_ID` - Cloudflare account ID
- `R2_ACCESS_KEY_ID` - R2 API token access key
- `R2_SECRET_ACCESS_KEY` - R2 API token secret
- `NEXT_PUBLIC_ZARR_URL` - Public URL for Zarr data

### R2 Setup

1. Create bucket `gnarmap-historical` in Cloudflare dashboard
2. Enable public access for the bucket (Settings > Public access)
3. Note the public URL (e.g., `https://pub-xxx.r2.dev`)
4. Create API token with R2 read/write permissions

### rclone Configuration (for Zarr sync)

Create `~/.config/rclone/rclone.conf`:
```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = YOUR_ACCESS_KEY
secret_access_key = YOUR_SECRET_KEY
endpoint = https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

## Web App Architecture (apps/web)

Next.js 15 app (App Router) deployed to Cloudflare Workers using @opennextjs/cloudflare.

### Key Components
- **Map** (`src/components/Map.tsx`) - Main map with snow depth raster, station markers, popups
- **SnowChart** (`src/components/SnowChart.tsx`) - Historical time series chart using Zarr data (client-side)
- **Legend** (`src/components/Legend.tsx`) - Collapsible legend
- **DatePicker** (`src/components/DatePicker.tsx`) - Date selection for historical views
- **LayerControls** (`src/components/LayerControls.tsx`) - Toggle map layers

### Zarr Integration
- `src/lib/zarr.ts` - Client-side chunk fetching for Zarr V3 with fflate gzip decompression
- Fetches directly from R2 public URL (offloads memory from server)
- Parallel chunk loading for performance
- Queries native resolution (6935x3351) with 365x256x256 chunks

### API Routes
- `/api/tiles/[date]/[z]/[x]/[y]` - COG tile generation (uses upng-js for Workers compatibility)
- `/api/identify` - Point query for snow depth
- `/api/dates` - Available dates list
- `/api/stations/[type]` - Station GeoJSON proxy (snowdepth, snowdensity, snowfall)

### Data Sources (Cloudflare R2)
All data stored in `gnarmap-historical` R2 bucket:
- COG tiles: `/snodas/`
- Zarr store: `/zarr/`
- Station GeoJSON: `/geojson/`

## Pipeline Architecture (packages/pipeline)

Rust pipeline for SNODAS data processing.

### Modules
- `snodas.rs` - Data models, product IDs, bounding boxes
- `download.rs` - Async HTTP client with retry logic
- `extract.rs` - Tar/gz extraction
- `convert.rs` - ENVI header generation, GDAL COG conversion
- `zarr_builder.rs` - COG to Zarr V3 conversion with sparse storage
- `storage.rs` - R2 upload (uses `r2://bucket/prefix` URLs)

### Key Features
- Sparse Zarr storage (skips zero-value chunks, ~80% size reduction)
- Append mode for fast daily updates (~10-15s per day)
- Native resolution time series (6935x3351 pixels x 8000+ days)

## Code Conventions

### TypeScript/JavaScript (Web App)
- Use arrow functions for all function declarations
- Use async/await for asynchronous operations
- Keep functions small and modular
- Extract shared utilities to `src/lib/` (e.g., `r2.ts` for R2 client, `zarr.ts` for Zarr access)
- Use TypeScript interfaces for data shapes
- Prefer `const` over `let`
- No native Node.js modules (must be Workers-compatible)

### Rust (Pipeline)
- One module per file with clear responsibilities
- Shared utilities in `snodas.rs` (e.g., `extract_date_from_cog_filename`)
- Use `anyhow::Result` for error handling
- Parallel processing with `rayon` where applicable
- Unit tests at bottom of module files

### General
- DRY: Extract repeated code to shared functions/modules
- Readable code with descriptive variable names
- No unnecessary comments - code should be self-documenting

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
