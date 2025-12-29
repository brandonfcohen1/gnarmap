# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

```
gnarmap/
├── apps/web/           # Next.js web application
├── packages/pipeline/  # Rust data pipeline
```

## Commands

### Web App (from root)
- **Dev server**: `bun dev`
- **Build**: `bun run build`
- **Lint**: `bun run lint`
- **Typecheck**: `bun run typecheck`

### Pipeline (from packages/pipeline)
- **Build**: `cargo build --release`
- **Daily run**: `./target/release/snodas-pipeline daily --date yesterday --output s3://bucket/snodas`
- **Backfill**: `./target/release/snodas-pipeline backfill --start 2023-01-01 --end 2023-12-31 --output ./output`
- **Build Zarr**: `./target/release/snodas-pipeline build-zarr --cog-dir ./output --output ./zarr-output`
- **Append Zarr**: `./target/release/snodas-pipeline build-zarr --cog-dir ./output --output ./zarr-output --append`

## Web App Architecture (apps/web)

Next.js 15 app (App Router) that visualizes NOHRSC Snow Analysis data using react-map-gl with MapLibre.

### Key Components
- **Map** (`src/components/Map.tsx`) - Main map with snow depth raster, station markers, popups
- **SnowChart** (`src/components/SnowChart.tsx`) - Historical time series chart using Zarr data
- **Legend** (`src/components/Legend.tsx`) - Collapsible legend
- **DatePicker** (`src/components/DatePicker.tsx`) - Date selection for historical views
- **LayerControls** (`src/components/LayerControls.tsx`) - Toggle map layers

### Zarr Integration
- `src/lib/zarr.ts` - Zarrita client for browser-side Zarr V3 queries
- Fetches chunked time series data from S3-hosted Zarr store
- Queries native resolution (6935×3351) with 365×256×256 chunks

### Data Sources
- COG tiles: `s3://gnarmap-historical/snodas/`
- Zarr store: `s3://gnarmap-historical/zarr/`
- Station GeoJSON: `s3://graphsnowgeojson/`

## Pipeline Architecture (packages/pipeline)

Rust pipeline for SNODAS data processing.

### Modules
- `snodas.rs` - Data models, product IDs, bounding boxes
- `download.rs` - Async HTTP client with retry logic
- `extract.rs` - Tar/gz extraction
- `convert.rs` - ENVI header generation, GDAL COG conversion
- `zarr_builder.rs` - COG to Zarr V3 conversion with sparse storage
- `storage.rs` - S3 upload

### Key Features
- Sparse Zarr storage (skips zero-value chunks, ~80% size reduction)
- Append mode for fast daily updates (~10-15s per day)
- Native resolution time series (6935×3351 pixels × 8000+ days)

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
