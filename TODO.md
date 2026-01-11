## Immediate
- [x] Configure rclone with R2 credentials
- [x] Configure CORS on R2 bucket
- [x] Test app locally
- [ ] Run historical backfill (2003-present)
- [ ] Deploy static site to Cloudflare Pages

## Pipeline (Cloud)
- [ ] Set up GitHub Actions workflow for daily pipeline (COG → Zarr → PMTiles → R2)
- [ ] Add station GeoJSON script to ETL process

## Completed
- [x] Convert to static site (removed all API routes)
- [x] Add parallel PMTiles generation
- [x] Create resumable backfill script
- [x] Deprecate s3://graphsnowgeojson
- [x] Clean up old COG files on R2 (bucket cleared)
