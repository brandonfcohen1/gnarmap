use anyhow::{Context, Result};
use dashmap::DashMap;
use gdal::Dataset;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{debug, info, warn};

use crate::snodas::{extract_date_from_cog_filename, BBOX_POST_2013, NODATA_VALUE};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridPoint {
    pub lat: f64,
    pub lng: f64,
}

impl GridPoint {
    pub fn grid_id(&self) -> String {
        format!("{:.1}_{:.1}", self.lat, self.lng)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesEntry {
    pub date: String,
    pub value: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridTimeSeries {
    pub lat: f64,
    pub lng: f64,
    pub data: Vec<TimeSeriesEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridIndex {
    pub resolution: f64,
    pub bounds: GridBounds,
    pub cell_count: usize,
    pub date_range: DateRange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridBounds {
    pub west: f64,
    pub east: f64,
    pub north: f64,
    pub south: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub start: String,
    pub end: String,
}

pub struct TimeSeriesExtractor {
    resolution: f64,
    grid_points: Vec<GridPoint>,
    timeseries_data: Arc<DashMap<String, Vec<TimeSeriesEntry>>>,
    existing_dates: HashSet<String>,
}

impl TimeSeriesExtractor {
    pub fn new(resolution: f64) -> Self {
        let grid_points = Self::generate_grid(resolution);
        info!(
            "Generated {} grid points at {:.1}° resolution",
            grid_points.len(),
            resolution
        );

        Self {
            resolution,
            grid_points,
            timeseries_data: Arc::new(DashMap::new()),
            existing_dates: HashSet::new(),
        }
    }

    pub fn load_existing(&mut self, output_dir: &Path) -> Result<usize> {
        let timeseries_dir = output_dir.join("timeseries");
        if !timeseries_dir.exists() {
            info!("No existing timeseries data found");
            return Ok(0);
        }

        let files: Vec<PathBuf> = std::fs::read_dir(&timeseries_dir)
            .context("Failed to read timeseries directory")?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("grid_") && n.ends_with(".json"))
                    .unwrap_or(false)
            })
            .collect();

        info!("Loading {} existing grid files...", files.len());

        let loaded: Vec<(String, GridTimeSeries)> = files
            .par_iter()
            .filter_map(|path| {
                let content = std::fs::read_to_string(path).ok()?;
                let ts: GridTimeSeries = serde_json::from_str(&content).ok()?;
                let grid_id = format!("{:.1}_{:.1}", ts.lat, ts.lng);
                Some((grid_id, ts))
            })
            .collect();

        for (grid_id, ts) in &loaded {
            for entry in &ts.data {
                self.existing_dates.insert(entry.date.clone());
            }
            self.timeseries_data.insert(grid_id.clone(), ts.data.clone());
        }

        let date_count = self.existing_dates.len();
        info!(
            "Loaded {} grid cells with {} unique dates",
            loaded.len(),
            date_count
        );

        Ok(date_count)
    }

    pub fn get_existing_dates(&self) -> &HashSet<String> {
        &self.existing_dates
    }

    fn generate_grid(resolution: f64) -> Vec<GridPoint> {
        let bbox = BBOX_POST_2013;
        let mut points = Vec::new();

        let mut lat = bbox.south;
        while lat <= bbox.north {
            let mut lng = bbox.west;
            while lng <= bbox.east {
                points.push(GridPoint {
                    lat: (lat * 10.0).round() / 10.0,
                    lng: (lng * 10.0).round() / 10.0,
                });
                lng += resolution;
            }
            lat += resolution;
        }

        points
    }

    pub fn process_cog(&self, cog_path: &Path) -> Result<usize> {
        let filename = cog_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        let date = extract_date_from_cog_filename(filename)
            .context("Failed to extract date from filename")?;

        if self.existing_dates.contains(&date) {
            debug!("Skipping {} - already processed", date);
            return Ok(0);
        }

        let dataset = Dataset::open(cog_path).context("Failed to open COG")?;
        let transform = dataset.geo_transform().context("Failed to get transform")?;
        let band = dataset.rasterband(1).context("Failed to get raster band")?;

        let width = dataset.raster_size().0;
        let height = dataset.raster_size().1;

        let origin_x = transform[0];
        let pixel_width = transform[1];
        let origin_y = transform[3];
        let pixel_height = transform[5];

        let mut count = 0;

        for point in &self.grid_points {
            let pixel_x = ((point.lng - origin_x) / pixel_width) as isize;
            let pixel_y = ((point.lat - origin_y) / pixel_height) as isize;

            if pixel_x < 0 || pixel_x >= width as isize || pixel_y < 0 || pixel_y >= height as isize
            {
                continue;
            }

            let mut buffer = vec![0i16; 1];
            if band
                .read_into_slice::<i16>(
                    (pixel_x, pixel_y),
                    (1, 1),
                    (1, 1),
                    &mut buffer,
                    None,
                )
                .is_ok()
            {
                let value = buffer[0];
                if value != NODATA_VALUE {
                    let grid_id = point.grid_id();
                    self.timeseries_data
                        .entry(grid_id)
                        .or_default()
                        .push(TimeSeriesEntry {
                            date: date.clone(),
                            value,
                        });
                    count += 1;
                }
            }
        }

        debug!("Processed {} - {} points extracted", filename, count);
        Ok(count)
    }

    pub fn process_cogs_parallel(&self, cog_dir: &Path) -> Result<usize> {
        let cog_files: Vec<PathBuf> = std::fs::read_dir(cog_dir)
            .context("Failed to read COG directory")?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.extension()
                    .map(|ext| ext == "tif")
                    .unwrap_or(false)
                    && p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.contains("snow_depth"))
                        .unwrap_or(false)
            })
            .collect();

        let skip_count = cog_files
            .iter()
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .and_then(extract_date_from_cog_filename)
                    .map(|d| self.existing_dates.contains(&d))
                    .unwrap_or(false)
            })
            .count();

        info!(
            "Found {} COG files ({} already processed, {} to process)",
            cog_files.len(),
            skip_count,
            cog_files.len() - skip_count
        );

        let results: Vec<Result<usize>> = cog_files
            .par_iter()
            .map(|path| self.process_cog(path))
            .collect();

        let mut total = 0;
        let mut errors = 0;
        for result in results {
            match result {
                Ok(count) => total += count,
                Err(e) => {
                    warn!("Error processing COG: {}", e);
                    errors += 1;
                }
            }
        }

        info!(
            "Processed {} new data points ({} errors)",
            total, errors
        );
        Ok(total)
    }

    pub fn write_output(&self, output_dir: &Path) -> Result<Vec<String>> {
        std::fs::create_dir_all(output_dir).context("Failed to create output directory")?;

        let timeseries_dir = output_dir.join("timeseries");
        std::fs::create_dir_all(&timeseries_dir)?;

        let mut filenames = Vec::new();
        let mut date_min: Option<String> = None;
        let mut date_max: Option<String> = None;

        for entry in self.timeseries_data.iter() {
            let grid_id = entry.key();
            let mut data = entry.value().clone();

            data.sort_by(|a, b| a.date.cmp(&b.date));
            data.dedup_by(|a, b| a.date == b.date);

            if let Some(first) = data.first() {
                if date_min.is_none() || first.date < *date_min.as_ref().unwrap() {
                    date_min = Some(first.date.clone());
                }
            }
            if let Some(last) = data.last() {
                if date_max.is_none() || last.date > *date_max.as_ref().unwrap() {
                    date_max = Some(last.date.clone());
                }
            }

            let parts: Vec<&str> = grid_id.split('_').collect();
            if parts.len() != 2 {
                continue;
            }
            let lat: f64 = parts[0].parse().unwrap_or(0.0);
            let lng: f64 = parts[1].parse().unwrap_or(0.0);

            let timeseries = GridTimeSeries { lat, lng, data };

            let filename = format!("grid_{}.json", grid_id);
            let filepath = timeseries_dir.join(&filename);

            let json = serde_json::to_string(&timeseries)?;
            std::fs::write(&filepath, json)?;
            filenames.push(format!("timeseries/{}", filename));
        }

        let index = GridIndex {
            resolution: self.resolution,
            bounds: GridBounds {
                west: BBOX_POST_2013.west,
                east: BBOX_POST_2013.east,
                north: BBOX_POST_2013.north,
                south: BBOX_POST_2013.south,
            },
            cell_count: self.timeseries_data.len(),
            date_range: DateRange {
                start: date_min.unwrap_or_default(),
                end: date_max.unwrap_or_default(),
            },
        };

        let index_path = output_dir.join("timeseries/index.json");
        let index_json = serde_json::to_string_pretty(&index)?;
        std::fs::write(&index_path, index_json)?;
        filenames.push("timeseries/index.json".to_string());

        info!(
            "Wrote {} grid files + index to {}",
            self.timeseries_data.len(),
            timeseries_dir.display()
        );

        Ok(filenames)
    }

    pub fn grid_point_count(&self) -> usize {
        self.grid_points.len()
    }

    pub fn data_point_count(&self) -> usize {
        self.timeseries_data.iter().map(|e| e.value().len()).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_generation() {
        let extractor = TimeSeriesExtractor::new(1.0);
        assert!(extractor.grid_point_count() > 0);
    }

    #[test]
    fn test_grid_id() {
        let point = GridPoint {
            lat: 40.5,
            lng: -105.5,
        };
        assert_eq!(point.grid_id(), "40.5_-105.5");
    }

}
