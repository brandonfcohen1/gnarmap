use anyhow::{Context, Result};
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;
use tracing::{debug, info};

use crate::extract::ExtractedData;
use crate::snodas::{get_bbox_for_date, MASKED_COLS, MASKED_ROWS, NODATA_VALUE};

pub struct CogConverter {
    temp_dir: TempDir,
}

impl CogConverter {
    pub fn new() -> Result<Self> {
        let temp_dir = TempDir::new().context("Failed to create temp directory")?;
        Ok(Self { temp_dir })
    }

    pub fn convert_to_cog(&self, extracted: &ExtractedData, output_path: &Path) -> Result<()> {
        let bbox = get_bbox_for_date(extracted.snodas_file.date);

        let envi_path = self.temp_dir.path().join(format!(
            "{}_{}.dat",
            extracted.snodas_file.product_id.name(),
            extracted.snodas_file.date.format("%Y%m%d")
        ));

        std::fs::write(&envi_path, &extracted.data).context("Failed to write ENVI data")?;

        let hdr_path = envi_path.with_extension("hdr");
        let hdr_content = generate_envi_header(&bbox);
        std::fs::write(&hdr_path, &hdr_content).context("Failed to write ENVI header")?;

        debug!("Created ENVI files at {:?}", envi_path);

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).context("Failed to create output directory")?;
        }

        let status = Command::new("gdal_translate")
            .args([
                "-of", "COG",
                "-co", "COMPRESS=DEFLATE",
                "-co", "LEVEL=9",
                "-co", "PREDICTOR=YES",
                "-co", "OVERVIEW_RESAMPLING=NEAREST",
                "-co", "NUM_THREADS=ALL_CPUS",
                "-co", "BIGTIFF=IF_SAFER",
            ])
            .arg(&envi_path)
            .arg(output_path)
            .status()
            .context("Failed to run gdal_translate")?;

        if !status.success() {
            anyhow::bail!("gdal_translate failed with exit code: {:?}", status.code());
        }

        info!(
            "Created COG: {} ({} bytes)",
            output_path.display(),
            std::fs::metadata(output_path)
                .map(|m| m.len())
                .unwrap_or(0)
        );

        std::fs::remove_file(&envi_path).ok();
        std::fs::remove_file(&hdr_path).ok();

        Ok(())
    }
}

fn generate_envi_header(bbox: &crate::snodas::BoundingBox) -> String {
    format!(
        r#"ENVI
samples = {}
lines = {}
bands = 1
header offset = 0
file type = ENVI Standard
data type = 2
interleave = bsq
byte order = 1
map info = {{Geographic Lat/Lon, 1, 1, {}, {}, {}, {}, WGS-84}}
coordinate system string = GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]
data ignore value = {}
"#,
        MASKED_COLS,
        MASKED_ROWS,
        bbox.west,
        bbox.north,
        bbox.pixel_size_x().abs(),
        bbox.pixel_size_y().abs(),
        NODATA_VALUE
    )
}

pub struct BatchConverter {
    output_dir: std::path::PathBuf,
}

impl BatchConverter {
    pub fn new(output_dir: impl AsRef<Path>) -> Self {
        Self {
            output_dir: output_dir.as_ref().to_path_buf(),
        }
    }

    pub fn convert_batch(&self, extracted_files: Vec<ExtractedData>) -> Result<Vec<String>> {
        use rayon::prelude::*;

        let results: Vec<Result<String>> = extracted_files
            .into_par_iter()
            .map(|extracted| {
                let converter = CogConverter::new()?;
                let output_filename = extracted.snodas_file.output_filename();
                let output_path = self.output_dir.join(&output_filename);
                converter.convert_to_cog(&extracted, &output_path)?;
                Ok(output_filename)
            })
            .collect();

        let mut successes = Vec::new();
        for result in results {
            match result {
                Ok(filename) => successes.push(filename),
                Err(e) => tracing::error!("Conversion failed: {}", e),
            }
        }

        Ok(successes)
    }
}
