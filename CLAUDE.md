# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `bun dev`
- **Build**: `bun run build`
- **Lint**: `bun run lint`
- **Typecheck**: `bun run typecheck`

## Architecture

GnarMap is a Next.js 15 app (App Router) that visualizes NOHRSC Snow Analysis data using react-map-gl with MapLibre.

### Key Components

- **Map** (`src/components/Map.tsx`) - Main map component using react-map-gl/maplibre
  - Displays NOAA snow depth raster via ArcGIS MapServer export tiles
  - Shows station observation markers (snow depth, density, snowfall) with Supercluster for client-side clustering
  - Click handler queries NOAA MapServer identify endpoint for snow depth at clicked location
  - Uses pixel value conversion: `pixelValue / 0.0254` to get inches
- **Legend** (`src/components/Legend.tsx`) - Collapsible legend fetched from NOAA MapServer
- **InfoModal** (`src/components/InfoModal.tsx`) - Welcome modal with app info
- **LayerControls** (`src/components/LayerControls.tsx`) - Toggle visibility of map layers

### Data Sources

- Snow raster: `https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer`
- Station GeoJSON: S3 bucket `graphsnowgeojson.s3.us-east-2.amazonaws.com` (snowdepth.json, snowdensity.json, snowfall.json)

### Tech Stack

- Next.js 15 with App Router and TypeScript
- Bun for package management and scripts
- react-map-gl with MapLibre GL for mapping
- Supercluster for marker clustering
- Tailwind CSS for styling
