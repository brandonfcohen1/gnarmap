#!/usr/bin/env python3
import json
import math
import os
import subprocess
import sys
from datetime import datetime

import requests


def leading_zero(input):
    input = str(input)
    return "0" + input if len(input) == 1 else input


def fetch_geojson(data_type: str) -> dict:
    today = datetime.today()
    datestring = f"{today.year}{leading_zero(today.month)}{leading_zero(today.day)}"
    timestring = leading_zero(str(math.floor(datetime.utcnow().hour / 6) * 6))

    geojson = {"type": "FeatureCollection", "features": []}

    url = (
        f"https://www.nohrsc.noaa.gov/nsa/discussions_text/National/"
        f"{data_type}/{datestring[:6]}/{data_type}_{datestring}{timestring}_e.txt"
    )

    print(f"Fetching {data_type} from {url}")
    response = requests.get(url, timeout=30)
    response.raise_for_status()

    row_list = response.text.split("\n")[1:-1]

    for row in row_list:
        parts = row.split("|")
        try:
            if data_type == "snowfall":
                feature = {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [float(parts[1]), float(parts[0])]},
                    "properties": {
                        "name": parts[2],
                        "elevation": parts[3],
                        "value": parts[4],
                        "duration": parts[6],
                    },
                }
            else:
                feature = {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [float(parts[1]), float(parts[0])]},
                    "properties": {
                        "name": parts[2],
                        "elevation": parts[3],
                        "value": parts[4],
                    },
                }
            geojson["features"].append(feature)
        except (IndexError, ValueError):
            continue

    print(f"  {len(geojson['features'])} features")
    return geojson


def main():
    output_dir = os.environ.get("OUTPUT_DIR", "/tmp/geojson")
    os.makedirs(output_dir, exist_ok=True)

    data_types = ["snowfall", "snowdensity", "snowdepth"]

    for data_type in data_types:
        try:
            geojson = fetch_geojson(data_type)
            output_path = os.path.join(output_dir, f"{data_type}.json")
            with open(output_path, "w") as f:
                json.dump(geojson, f)
            print(f"Wrote {output_path}")
        except Exception as e:
            print(f"Error fetching {data_type}: {e}", file=sys.stderr)

    r2_bucket = os.environ.get("R2_BUCKET")
    if r2_bucket:
        print(f"Syncing to {r2_bucket}/geojson/")
        subprocess.run(
            ["rclone", "sync", output_dir, f"{r2_bucket}/geojson/", "--progress"],
            check=True,
        )
        print("Sync complete")


if __name__ == "__main__":
    main()
