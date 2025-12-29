use anyhow::{Context, Result};
use bytes::Bytes;
use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use tar::Archive;
use tracing::{debug, trace};

use crate::snodas::{ProductId, SnodasFile};

pub struct ExtractedData {
    pub snodas_file: SnodasFile,
    pub data: Vec<u8>,
}

pub fn extract_tar(
    tar_bytes: Bytes,
    product_filter: Option<&[ProductId]>,
) -> Result<Vec<ExtractedData>> {
    let cursor = Cursor::new(tar_bytes);
    let mut archive = Archive::new(cursor);
    let mut gz_files: HashMap<String, Vec<u8>> = HashMap::new();

    for entry in archive.entries().context("Failed to read outer tar entries")? {
        let mut entry = entry.context("Failed to read outer tar entry")?;
        let path = entry.path().context("Failed to get entry path")?;
        let path_str = path.to_string_lossy().to_string();

        if path_str.ends_with(".tar") {
            let mut inner_tar_bytes = Vec::new();
            entry
                .read_to_end(&mut inner_tar_bytes)
                .context("Failed to read inner tar")?;

            let inner_cursor = Cursor::new(inner_tar_bytes);
            let mut inner_archive = Archive::new(inner_cursor);

            for inner_entry in inner_archive
                .entries()
                .context("Failed to read inner tar entries")?
            {
                let mut inner_entry = inner_entry.context("Failed to read inner tar entry")?;
                let inner_path = inner_entry.path().context("Failed to get inner entry path")?;
                let inner_path_str = inner_path.to_string_lossy().to_string();

                if inner_path_str.ends_with(".gz") {
                    let mut gz_bytes = Vec::new();
                    inner_entry
                        .read_to_end(&mut gz_bytes)
                        .context("Failed to read gz file")?;
                    gz_files.insert(inner_path_str, gz_bytes);
                }
            }
        } else if path_str.ends_with(".gz") {
            let mut gz_bytes = Vec::new();
            entry
                .read_to_end(&mut gz_bytes)
                .context("Failed to read gz file")?;
            gz_files.insert(path_str, gz_bytes);
        }
    }

    let mut results = Vec::new();

    for (filename, gz_bytes) in gz_files {
        if !filename.ends_with(".dat.gz") {
            continue;
        }

        let dat_filename = filename.trim_end_matches(".gz");
        let base_filename = dat_filename
            .rsplit('/')
            .next()
            .unwrap_or(dat_filename);

        let snodas_file = match SnodasFile::parse_filename(base_filename) {
            Some(f) => f,
            None => {
                trace!("Skipping unrecognized file: {}", filename);
                continue;
            }
        };

        if let Some(filter) = product_filter {
            if !filter.contains(&snodas_file.product_id) {
                trace!("Skipping filtered product: {}", snodas_file.product_id);
                continue;
            }
        }

        debug!(
            "Extracting {} (product: {}, date: {})",
            base_filename, snodas_file.product_id, snodas_file.date
        );

        let mut decoder = GzDecoder::new(Cursor::new(gz_bytes));
        let mut data = Vec::new();
        decoder
            .read_to_end(&mut data)
            .context("Failed to decompress gz file")?;

        results.push(ExtractedData { snodas_file, data });
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_product_filter() {
        let filter = vec![ProductId::Swe, ProductId::SnowDepth];
        assert!(filter.contains(&ProductId::Swe));
        assert!(!filter.contains(&ProductId::Precipitation));
    }
}
