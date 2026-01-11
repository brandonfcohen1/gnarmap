#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$PIPELINE_DIR")")"

COG_DIR="$PIPELINE_DIR/output"
ZARR_DIR="$PIPELINE_DIR/zarr-output"
PMTILES_DIR="$PIPELINE_DIR/pmtiles-output"

START_DATE="${START_DATE:-2003-10-01}"
END_DATE="${END_DATE:-$(date +%Y-%m-%d)}"
CHUNK_DAYS="${CHUNK_DAYS:-30}"
WORKERS="${WORKERS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc)}"

show_progress() {
    local dir="$1"
    local pattern="$2"
    local total="$3"
    local count=$(find "$dir" -name "$pattern" 2>/dev/null | wc -l | tr -d ' ')
    local pct=$((count * 100 / total))
    echo "$count / $total ($pct%)"
}

cmd_status() {
    echo "=== Backfill Status ==="
    echo "Date range: $START_DATE to $END_DATE"
    echo ""

    local total_days=$(( ($(date -j -f "%Y-%m-%d" "$END_DATE" +%s 2>/dev/null || date -d "$END_DATE" +%s) - $(date -j -f "%Y-%m-%d" "$START_DATE" +%s 2>/dev/null || date -d "$START_DATE" +%s)) / 86400 + 1 ))

    echo "COGs:     $(show_progress "$COG_DIR" "snodas_snow_depth_*.tif" "$total_days")"
    echo "PMTiles:  $(show_progress "$PMTILES_DIR" "*.pmtiles" "$total_days")"

    if [ -d "$ZARR_DIR" ]; then
        if [ -f "$ZARR_DIR/dates.json" ]; then
            local zarr_dates=$(python3 -c "import json; print(len(json.load(open('$ZARR_DIR/dates.json'))))" 2>/dev/null || echo "?")
            echo "Zarr:     $zarr_dates / $total_days dates"
        else
            echo "Zarr:     not built yet"
        fi
    else
        echo "Zarr:     not built yet"
    fi
    echo ""
}

count_cogs_in_range() {
    local start="$1"
    local end="$2"
    local count=0
    local current="$start"
    while [[ "$current" < "$end" ]] || [[ "$current" == "$end" ]]; do
        local file="$COG_DIR/snodas_snow_depth_$(echo $current | tr -d '-').tif"
        if [ -f "$file" ]; then
            count=$((count + 1))
        fi
        current=$(date -j -v+1d -f "%Y-%m-%d" "$current" +%Y-%m-%d 2>/dev/null || date -d "$current + 1 day" +%Y-%m-%d)
    done
    echo $count
}

days_in_range() {
    local start="$1"
    local end="$2"
    local start_sec=$(date -j -f "%Y-%m-%d" "$start" +%s 2>/dev/null || date -d "$start" +%s)
    local end_sec=$(date -j -f "%Y-%m-%d" "$end" +%s 2>/dev/null || date -d "$end" +%s)
    echo $(( (end_sec - start_sec) / 86400 + 1 ))
}

cmd_cogs() {
    echo "=== Building COGs (resumable) ==="
    mkdir -p "$COG_DIR"

    local current="$START_DATE"
    while [[ "$current" < "$END_DATE" ]] || [[ "$current" == "$END_DATE" ]]; do
        local chunk_end=$(date -j -v+${CHUNK_DAYS}d -f "%Y-%m-%d" "$current" +%Y-%m-%d 2>/dev/null || date -d "$current + $CHUNK_DAYS days" +%Y-%m-%d)
        if [[ "$chunk_end" > "$END_DATE" ]]; then
            chunk_end="$END_DATE"
        fi

        local expected=$(days_in_range "$current" "$chunk_end")
        local existing=$(count_cogs_in_range "$current" "$chunk_end")
        local threshold=$((expected * 95 / 100))

        if [ "$existing" -ge "$threshold" ]; then
            echo "Chunk $current to $chunk_end: complete ($existing/$expected), skipping"
        else
            echo "Processing chunk: $current to $chunk_end ($existing/$expected exist)"
            cd "$ROOT_DIR" && bun run pipeline:backfill -- --start "$current" --end "$chunk_end"
        fi

        current=$(date -j -v+1d -f "%Y-%m-%d" "$chunk_end" +%Y-%m-%d 2>/dev/null || date -d "$chunk_end + 1 day" +%Y-%m-%d)
    done

    echo "=== COGs complete ==="
    cmd_status
}

cmd_zarr() {
    echo "=== Building Zarr (append mode) ==="
    cd "$ROOT_DIR" && bun run pipeline:build-zarr -- --append
    echo "=== Zarr complete ==="
    cmd_status
}

cmd_pmtiles() {
    echo "=== Building PMTiles (parallel, resumable) ==="
    echo "Using $WORKERS workers"
    mkdir -p "$PMTILES_DIR"

    cd "$SCRIPT_DIR" && python3 generate_pmtiles.py --batch "$COG_DIR" "$PMTILES_DIR" --workers "$WORKERS"

    echo "=== PMTiles complete ==="
    cmd_status
}

cmd_sync() {
    echo "=== Syncing to R2 ==="

    echo "Syncing Zarr..."
    cd "$ROOT_DIR" && bun run pipeline:sync-zarr

    echo "Syncing PMTiles..."
    cd "$ROOT_DIR" && bun run pipeline:sync-pmtiles

    echo "=== Sync complete ==="
}

cmd_all() {
    cmd_cogs
    cmd_zarr
    cmd_pmtiles
    cmd_sync
}

cmd_help() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  status   - Show current progress"
    echo "  cogs     - Download and build COGs (resumable in chunks)"
    echo "  zarr     - Build Zarr store (append mode)"
    echo "  pmtiles  - Generate PMTiles (parallel, skips existing)"
    echo "  sync     - Sync Zarr and PMTiles to R2"
    echo "  all      - Run full pipeline (cogs → zarr → pmtiles → sync)"
    echo ""
    echo "Environment variables:"
    echo "  START_DATE  - Start date (default: 2003-10-01)"
    echo "  END_DATE    - End date (default: today)"
    echo "  CHUNK_DAYS  - Days per chunk for COG downloads (default: 30)"
    echo "  WORKERS     - Parallel workers for PMTiles (default: CPU count)"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 cogs"
    echo "  START_DATE=2020-01-01 END_DATE=2020-12-31 $0 all"
    echo "  WORKERS=4 $0 pmtiles"
}

case "${1:-help}" in
    status) cmd_status ;;
    cogs) cmd_cogs ;;
    zarr) cmd_zarr ;;
    pmtiles) cmd_pmtiles ;;
    sync) cmd_sync ;;
    all) cmd_all ;;
    help|--help|-h) cmd_help ;;
    *) echo "Unknown command: $1"; cmd_help; exit 1 ;;
esac
