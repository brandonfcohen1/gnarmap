#!/usr/bin/env python3
"""
Generate PMTiles from SNODAS COG files.

Usage:
    python generate_pmtiles.py input.tif output.pmtiles
    python generate_pmtiles.py --batch ./cog_dir ./pmtiles_dir
    python generate_pmtiles.py --batch ./cog_dir ./pmtiles_dir --workers 8

Requirements:
    pip install rio-pmtiles rasterio numpy
"""

import argparse
import subprocess
import sys
from pathlib import Path
import tempfile
import shutil
import multiprocessing as mp
from functools import partial


def apply_color_ramp(input_path: Path, output_path: Path) -> None:
    """Apply snow depth color ramp to COG and save as RGB GeoTIFF."""
    import rasterio
    import numpy as np

    with rasterio.open(input_path) as src:
        data = src.read(1)
        profile = src.profile.copy()

        inches = data / 25.4
        inches = np.where(data == -9999, 0, inches)
        inches = np.where(data <= 0, 0, inches)

        r = np.zeros_like(data, dtype=np.uint8)
        g = np.zeros_like(data, dtype=np.uint8)
        b = np.zeros_like(data, dtype=np.uint8)
        a = np.zeros_like(data, dtype=np.uint8)

        # Color ramp matching getSnowDepthColor - apply from lowest to highest
        # so higher values overwrite lower ones
        conditions = [
            (inches > 0, (230, 245, 255, 180)),
            (inches >= 1, (200, 230, 255, 200)),
            (inches >= 3, (150, 200, 255, 210)),
            (inches >= 6, (100, 170, 255, 220)),
            (inches >= 12, (50, 130, 220, 230)),
            (inches >= 24, (30, 90, 200, 240)),
            (inches >= 48, (60, 60, 180, 245)),
            (inches >= 72, (100, 50, 170, 250)),
            (inches >= 96, (140, 40, 160, 250)),
            (inches >= 120, (180, 30, 140, 250)),
            (inches >= 180, (220, 20, 100, 255)),
        ]

        for condition, (rv, gv, bv, av) in conditions:
            mask = condition
            r[mask] = rv
            g[mask] = gv
            b[mask] = bv
            a[mask] = av

        profile.update(
            dtype=rasterio.uint8,
            count=4,
            nodata=None,
        )

        with rasterio.open(output_path, 'w', **profile) as dst:
            dst.write(r, 1)
            dst.write(g, 2)
            dst.write(b, 3)
            dst.write(a, 4)


def generate_pmtiles(input_cog: Path, output_pmtiles: Path, zoom_levels: str = "4..10") -> None:
    """Generate PMTiles from a COG file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        rgb_tif = Path(tmpdir) / "rgb.tif"

        print(f"Applying color ramp to {input_cog}...")
        apply_color_ramp(input_cog, rgb_tif)

        print(f"Generating PMTiles {output_pmtiles}...")
        cmd = [
            "rio", "pmtiles",
            str(rgb_tif),
            str(output_pmtiles),
            "--format", "PNG",
            "--tile-size", "512",
            "--resampling", "nearest",
            "--zoom-levels", zoom_levels,
        ]
        subprocess.run(cmd, check=True)

    print(f"Done: {output_pmtiles}")


def process_single_file(args: tuple, pmtiles_dir: Path, zoom_levels: str) -> str:
    """Process a single COG file (for multiprocessing)."""
    cog_file = args
    date = cog_file.stem.replace("snodas_snow_depth_", "")
    pmtiles_file = pmtiles_dir / f"{date}.pmtiles"

    if pmtiles_file.exists():
        return f"Skipped {date} (exists)"

    try:
        generate_pmtiles(cog_file, pmtiles_file, zoom_levels)
        return f"Done {date}"
    except Exception as e:
        return f"Error {date}: {e}"


def batch_process(cog_dir: Path, pmtiles_dir: Path, zoom_levels: str = "4..10", workers: int = None) -> None:
    """Process all COG files in a directory using multiprocessing."""
    pmtiles_dir.mkdir(parents=True, exist_ok=True)

    cog_files = sorted(cog_dir.glob("snodas_snow_depth_*.tif"))
    print(f"Found {len(cog_files)} COG files")

    if not cog_files:
        return

    if workers is None:
        workers = max(1, mp.cpu_count() - 1)

    print(f"Processing with {workers} workers...")

    process_func = partial(process_single_file, pmtiles_dir=pmtiles_dir, zoom_levels=zoom_levels)

    with mp.Pool(workers) as pool:
        for result in pool.imap_unordered(process_func, cog_files):
            print(result)


def main():
    parser = argparse.ArgumentParser(description="Generate PMTiles from SNODAS COG files")
    parser.add_argument("input", help="Input COG file or directory (with --batch)")
    parser.add_argument("output", help="Output PMTiles file or directory (with --batch)")
    parser.add_argument("--batch", action="store_true", help="Process entire directory")
    parser.add_argument("--zoom-levels", default="4..10", help="Zoom level range (default: 4..10)")
    parser.add_argument("--workers", type=int, default=None, help="Number of parallel workers (default: CPU count - 1)")

    args = parser.parse_args()

    if args.batch:
        batch_process(Path(args.input), Path(args.output), args.zoom_levels, args.workers)
    else:
        generate_pmtiles(Path(args.input), Path(args.output), args.zoom_levels)


if __name__ == "__main__":
    main()
