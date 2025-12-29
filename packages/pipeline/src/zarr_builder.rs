use anyhow::{Context, Result};
use gdal::Dataset;
use rayon::prelude::*;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{debug, info, warn};
use zarrs::array::codec::GzipCodec;
use zarrs::array::{Array, ArrayBuilder, DataType, FillValue};
use zarrs::filesystem::FilesystemStore;
use zarrs::group::GroupBuilder;
use zarrs::storage::ReadableWritableListableStorage;

use crate::snodas::{BBOX_POST_2013, MASKED_COLS, MASKED_ROWS, NODATA_VALUE};

const CHUNK_TIME: u64 = 365;
const CHUNK_Y: u64 = 256;
const CHUNK_X: u64 = 256;

pub struct ZarrBuilder {
    store: Arc<FilesystemStore>,
    output_path: PathBuf,
    dates: Vec<String>,
}

impl ZarrBuilder {
    pub fn new(output_path: &Path) -> Result<Self> {
        std::fs::create_dir_all(output_path)?;

        let store = Arc::new(FilesystemStore::new(output_path)?);

        let dyn_store: ReadableWritableListableStorage = store.clone();
        GroupBuilder::new()
            .build(dyn_store, "/")?
            .store_metadata()?;

        Ok(Self {
            store,
            output_path: output_path.to_path_buf(),
            dates: Vec::new(),
        })
    }

    pub fn load_existing(output_path: &Path) -> Result<Self> {
        let store = Arc::new(FilesystemStore::new(output_path)?);
        let dates = Self::load_dates_from_metadata(output_path)?;

        Ok(Self {
            store,
            output_path: output_path.to_path_buf(),
            dates,
        })
    }

    fn load_dates_from_metadata(output_path: &Path) -> Result<Vec<String>> {
        let metadata_path = output_path.join("dates.json");
        if metadata_path.exists() {
            let content = std::fs::read_to_string(&metadata_path)?;
            let dates: Vec<String> = serde_json::from_str(&content)?;
            Ok(dates)
        } else {
            Ok(Vec::new())
        }
    }

    fn save_dates_metadata(&self) -> Result<()> {
        let metadata_path = self.output_path.join("dates.json");
        let content = serde_json::to_string(&self.dates)?;
        std::fs::write(&metadata_path, content)?;
        Ok(())
    }

    pub fn get_existing_dates(&self) -> &[String] {
        &self.dates
    }

    fn create_array(&self, num_dates: u64) -> Result<Array<FilesystemStore>> {
        let mut attrs = serde_json::Map::new();
        attrs.insert("units".to_string(), serde_json::json!("mm"));
        attrs.insert("nodata".to_string(), serde_json::json!(NODATA_VALUE));
        attrs.insert(
            "bounds".to_string(),
            serde_json::json!({
                "west": BBOX_POST_2013.west,
                "east": BBOX_POST_2013.east,
                "north": BBOX_POST_2013.north,
                "south": BBOX_POST_2013.south
            }),
        );
        attrs.insert("crs".to_string(), serde_json::json!("EPSG:4326"));

        let array = ArrayBuilder::new(
            vec![num_dates, MASKED_ROWS as u64, MASKED_COLS as u64],
            vec![CHUNK_TIME, CHUNK_Y, CHUNK_X],
            DataType::Int16,
            FillValue::from(0i16),
        )
        .dimension_names(["time", "y", "x"].into())
        .bytes_to_bytes_codecs(vec![Arc::new(GzipCodec::new(6)?)])
        .attributes(attrs)
        .build(self.store.clone(), "/snow_depth")?;

        array.store_metadata()?;
        Ok(array)
    }

    fn open_array(&self) -> Result<Array<FilesystemStore>> {
        Ok(Array::open(self.store.clone(), "/snow_depth")?)
    }

    pub fn process_cogs(&mut self, cog_dir: &Path, append: bool) -> Result<usize> {
        let cog_files: Vec<PathBuf> = std::fs::read_dir(cog_dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.extension().map(|ext| ext == "tif").unwrap_or(false)
                    && p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.contains("snow_depth"))
                        .unwrap_or(false)
            })
            .collect();

        let mut all_dates: BTreeSet<String> = BTreeSet::new();
        for path in &cog_files {
            if let Some(date) = Self::extract_date_from_filename(
                path.file_name().and_then(|n| n.to_str()).unwrap_or(""),
            ) {
                all_dates.insert(date);
            }
        }

        let existing_dates: BTreeSet<String> = self.dates.iter().cloned().collect();
        let new_dates: Vec<String> = if append {
            all_dates.difference(&existing_dates).cloned().collect()
        } else {
            all_dates.iter().cloned().collect()
        };

        if new_dates.is_empty() {
            info!("No new dates to process");
            return Ok(0);
        }

        info!(
            "Processing {} new dates (total will be {})",
            new_dates.len(),
            if append {
                self.dates.len() + new_dates.len()
            } else {
                new_dates.len()
            }
        );

        let mut combined_dates: Vec<String> = if append {
            let mut d = self.dates.clone();
            d.extend(new_dates.clone());
            d.sort();
            d
        } else {
            new_dates.clone()
        };
        combined_dates.sort();

        let array = if !append || self.dates.is_empty() {
            self.create_array(combined_dates.len() as u64)?
        } else {
            let mut arr = self.open_array()?;
            let current_shape = arr.shape();
            if current_shape[0] < combined_dates.len() as u64 {
                let new_shape = vec![
                    combined_dates.len() as u64,
                    current_shape[1],
                    current_shape[2],
                ];
                arr.set_shape(new_shape)?;
                arr.store_metadata()?;
            }
            arr
        };

        let date_to_index: std::collections::HashMap<String, usize> = combined_dates
            .iter()
            .enumerate()
            .map(|(i, d)| (d.clone(), i))
            .collect();

        let files_to_process: Vec<(PathBuf, String, usize)> = cog_files
            .into_iter()
            .filter_map(|path| {
                let date = Self::extract_date_from_filename(
                    path.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                )?;
                if new_dates.contains(&date) {
                    let idx = *date_to_index.get(&date)?;
                    Some((path, date, idx))
                } else {
                    None
                }
            })
            .collect();

        let array_ref = &array;
        let processed: Vec<Result<(String, usize)>> = files_to_process
            .par_iter()
            .map(|(path, date, time_idx)| {
                let count = Self::process_single_cog(array_ref, path, *time_idx)?;
                Ok((date.clone(), count))
            })
            .collect();

        let mut total_nonzero = 0;
        let mut success_count = 0;
        for result in processed {
            match result {
                Ok((date, count)) => {
                    total_nonzero += count;
                    success_count += 1;
                    debug!("Processed {} with {} non-zero chunks", date, count);
                }
                Err(e) => {
                    warn!("Error processing COG: {}", e);
                }
            }
        }

        self.dates = combined_dates;
        self.save_dates_metadata()?;

        info!(
            "Processed {} files, {} total non-zero chunks written",
            success_count, total_nonzero
        );

        Ok(success_count)
    }

    fn process_single_cog(
        array: &Array<FilesystemStore>,
        cog_path: &Path,
        time_idx: usize,
    ) -> Result<usize> {
        let dataset = Dataset::open(cog_path).context("Failed to open COG")?;
        let band = dataset.rasterband(1)?;

        let width = dataset.raster_size().0;
        let height = dataset.raster_size().1;

        let mut nonzero_chunks = 0;

        let num_chunks_y = (height as u64 + CHUNK_Y - 1) / CHUNK_Y;
        let num_chunks_x = (width as u64 + CHUNK_X - 1) / CHUNK_X;

        for chunk_y in 0..num_chunks_y {
            for chunk_x in 0..num_chunks_x {
                let start_y = (chunk_y * CHUNK_Y) as isize;
                let start_x = (chunk_x * CHUNK_X) as isize;

                let read_height = std::cmp::min(CHUNK_Y as usize, height - start_y as usize);
                let read_width = std::cmp::min(CHUNK_X as usize, width - start_x as usize);

                let mut buffer = vec![0i16; read_height * read_width];
                band.read_into_slice::<i16>(
                    (start_x, start_y),
                    (read_width, read_height),
                    (read_width, read_height),
                    &mut buffer,
                    None,
                )?;

                for v in &mut buffer {
                    if *v == NODATA_VALUE {
                        *v = 0;
                    }
                }

                let has_data = buffer.iter().any(|&v| v > 0);
                if !has_data {
                    continue;
                }

                let time_chunk = time_idx as u64 / CHUNK_TIME;
                let time_offset = time_idx as u64 % CHUNK_TIME;

                let mut chunk_data = vec![0i16; (CHUNK_TIME * CHUNK_Y * CHUNK_X) as usize];

                for (row_idx, row) in buffer.chunks(read_width).enumerate() {
                    let dest_offset = (time_offset * CHUNK_Y * CHUNK_X
                        + (row_idx as u64) * CHUNK_X) as usize;
                    chunk_data[dest_offset..dest_offset + row.len()].copy_from_slice(row);
                }

                let chunk_indices = vec![time_chunk, chunk_y, chunk_x];

                if let Ok(existing) = array.retrieve_chunk_elements::<i16>(&chunk_indices) {
                    for (i, v) in existing.iter().enumerate() {
                        if chunk_data[i] == 0 {
                            chunk_data[i] = *v;
                        }
                    }
                }

                array.store_chunk_elements(&chunk_indices, &chunk_data)?;
                nonzero_chunks += 1;
            }
        }

        Ok(nonzero_chunks)
    }

    fn extract_date_from_filename(filename: &str) -> Option<String> {
        filename
            .strip_prefix("snodas_snow_depth_")?
            .strip_suffix(".tif")
            .map(|s| s.to_string())
    }

    pub fn dates_count(&self) -> usize {
        self.dates.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_date_extraction() {
        let date = ZarrBuilder::extract_date_from_filename("snodas_snow_depth_20231201.tif");
        assert_eq!(date, Some("20231201".to_string()));
    }
}
