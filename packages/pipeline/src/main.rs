mod convert;
mod download;
mod extract;
mod snodas;
mod storage;
mod timeseries;
mod zarr_builder;

use anyhow::{Context, Result};
use chrono::NaiveDate;
use clap::{Parser, Subcommand};
use indicatif::{ProgressBar, ProgressStyle};
use std::path::{Path, PathBuf};
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use convert::BatchConverter;
use download::{generate_date_range, Downloader};
use extract::extract_tar;
use snodas::parse_product_ids;
use storage::{OutputDestination, R2Uploader};
use timeseries::TimeSeriesExtractor;
use zarr_builder::ZarrBuilder;

#[derive(Parser)]
#[command(name = "snodas-pipeline")]
#[command(about = "Convert SNODAS snow data to Cloud-Optimized GeoTIFFs")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Backfill {
        #[arg(long)]
        start: String,

        #[arg(long)]
        end: String,

        #[arg(long, default_value = "1034,1036")]
        products: String,

        #[arg(long, default_value = "./output")]
        output: String,

        #[arg(long, default_value = "4")]
        concurrency: usize,
    },

    Daily {
        #[arg(long)]
        date: Option<String>,

        #[arg(long, default_value = "1034,1036")]
        products: String,

        #[arg(long, default_value = "./output")]
        output: String,
    },

    ExtractTimeseries {
        #[arg(long, help = "Directory containing COG files")]
        cog_dir: String,

        #[arg(long, default_value = "./output", help = "Output directory for timeseries JSON files")]
        output: String,

        #[arg(long, default_value = "0.1", help = "Grid resolution in degrees")]
        resolution: f64,

        #[arg(long, help = "Append mode: load existing data and only process new dates")]
        append: bool,
    },

    BuildZarr {
        #[arg(long, help = "Directory containing COG files")]
        cog_dir: String,

        #[arg(long, default_value = "./zarr-output", help = "Output directory for Zarr store (local path or r2://bucket/prefix)")]
        output: String,

        #[arg(long, help = "Append mode: add new dates to existing Zarr store")]
        append: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Backfill {
            start,
            end,
            products,
            output,
            concurrency,
        } => {
            run_backfill(&start, &end, &products, &output, concurrency).await?;
        }
        Commands::Daily {
            date,
            products,
            output,
        } => {
            run_daily(date.as_deref(), &products, &output).await?;
        }
        Commands::ExtractTimeseries {
            cog_dir,
            output,
            resolution,
            append,
        } => {
            run_extract_timeseries(&cog_dir, &output, resolution, append).await?;
        }
        Commands::BuildZarr {
            cog_dir,
            output,
            append,
        } => {
            run_build_zarr(&cog_dir, &output, append).await?;
        }
    }

    Ok(())
}

async fn run_backfill(
    start: &str,
    end: &str,
    products: &str,
    output: &str,
    concurrency: usize,
) -> Result<()> {
    let start_date =
        NaiveDate::parse_from_str(start, "%Y-%m-%d").context("Invalid start date format")?;
    let end_date =
        NaiveDate::parse_from_str(end, "%Y-%m-%d").context("Invalid end date format")?;
    let product_ids = parse_product_ids(products);

    info!(
        "Backfill: {} to {} ({} days)",
        start_date,
        end_date,
        (end_date - start_date).num_days() + 1
    );
    info!(
        "Products: {:?}",
        product_ids.iter().map(|p| p.name()).collect::<Vec<_>>()
    );

    let dates = generate_date_range(start_date, end_date);
    let total_dates = dates.len();

    let progress = ProgressBar::new(total_dates as u64);
    progress.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta})")
            .unwrap()
            .progress_chars("#>-"),
    );

    let destination = OutputDestination::from_str(output)?;
    let local_output = match &destination {
        OutputDestination::Local(path) => path.clone(),
        OutputDestination::R2 { .. } => PathBuf::from("./temp_output"),
    };

    std::fs::create_dir_all(&local_output).context("Failed to create output directory")?;

    let downloader = Downloader::new(concurrency)?;
    let batch_converter = BatchConverter::new(&local_output);

    let r2_uploader = match &destination {
        OutputDestination::R2 { bucket, prefix } => {
            Some(R2Uploader::new(bucket.clone(), prefix.clone()).await?)
        }
        OutputDestination::Local(_) => None,
    };

    for chunk in dates.chunks(concurrency * 2) {
        let download_results = downloader.download_dates(chunk.to_vec()).await;

        for (date, result) in download_results {
            match result {
                Ok(tar_bytes) => {
                    match extract_tar(tar_bytes, Some(&product_ids)) {
                        Ok(extracted) => {
                            if extracted.is_empty() {
                                info!("No matching products for {}", date);
                            } else {
                                match batch_converter.convert_batch(extracted) {
                                    Ok(filenames) => {
                                        if let Some(uploader) = &r2_uploader {
                                            for filename in &filenames {
                                                let local_path = local_output.join(filename);
                                                if let Err(e) =
                                                    uploader.upload_file(&local_path, filename).await
                                                {
                                                    error!("Upload failed for {}: {}", filename, e);
                                                }
                                                std::fs::remove_file(&local_path).ok();
                                            }
                                        }
                                        info!(
                                            "Processed {}: {} files",
                                            date,
                                            filenames.len()
                                        );
                                    }
                                    Err(e) => error!("Conversion failed for {}: {}", date, e),
                                }
                            }
                        }
                        Err(e) => error!("Extraction failed for {}: {}", date, e),
                    }
                }
                Err(e) => error!("Download failed for {}: {}", date, e),
            }
            progress.inc(1);
        }
    }

    progress.finish_with_message("Backfill complete");
    Ok(())
}

async fn run_daily(date: Option<&str>, products: &str, output: &str) -> Result<()> {
    let target_date = match date {
        Some(d) if d == "today" => chrono::Local::now().date_naive(),
        Some(d) if d == "yesterday" => chrono::Local::now()
            .date_naive()
            .pred_opt()
            .context("Invalid date")?,
        Some(d) => NaiveDate::parse_from_str(d, "%Y-%m-%d").context("Invalid date format")?,
        None => chrono::Local::now()
            .date_naive()
            .pred_opt()
            .context("Invalid date")?,
    };

    let product_ids = parse_product_ids(products);

    info!("Daily run for: {}", target_date);
    info!(
        "Products: {:?}",
        product_ids.iter().map(|p| p.name()).collect::<Vec<_>>()
    );

    let destination = OutputDestination::from_str(output)?;
    let local_output = match &destination {
        OutputDestination::Local(path) => path.clone(),
        OutputDestination::R2 { .. } => PathBuf::from("./temp_output"),
    };

    std::fs::create_dir_all(&local_output).context("Failed to create output directory")?;

    let downloader = Downloader::new(1)?;
    let batch_converter = BatchConverter::new(&local_output);

    let tar_bytes = downloader.download_date(target_date).await?;
    let extracted = extract_tar(tar_bytes, Some(&product_ids))?;

    if extracted.is_empty() {
        info!("No matching products for {}", target_date);
        return Ok(());
    }

    let filenames = batch_converter.convert_batch(extracted)?;

    if let OutputDestination::R2 { bucket, prefix } = &destination {
        let uploader = R2Uploader::new(bucket.clone(), prefix.clone()).await?;
        for filename in &filenames {
            let local_path = local_output.join(filename);
            uploader.upload_file(&local_path, filename).await?;
            std::fs::remove_file(&local_path).ok();
        }
    }

    info!("Daily run complete: {} files processed", filenames.len());
    Ok(())
}

async fn run_extract_timeseries(
    cog_dir: &str,
    output: &str,
    resolution: f64,
    append: bool,
) -> Result<()> {
    let cog_path = PathBuf::from(cog_dir);
    let output_path = PathBuf::from(output);

    info!(
        "Extract timeseries: resolution={:.2}°, append={}",
        resolution, append
    );

    let mut extractor = TimeSeriesExtractor::new(resolution);
    info!("Grid has {} points", extractor.grid_point_count());

    if append {
        let existing_count = extractor.load_existing(&output_path)?;
        info!("Loaded {} existing dates", existing_count);
    }

    let new_points = extractor.process_cogs_parallel(&cog_path)?;
    info!("Extracted {} new data points", new_points);

    let destination = OutputDestination::from_str(output)?;

    match &destination {
        OutputDestination::Local(_) => {
            let files = extractor.write_output(&output_path)?;
            info!("Wrote {} files to {}", files.len(), output_path.display());
        }
        OutputDestination::R2 { bucket, prefix } => {
            let temp_dir = PathBuf::from("./temp_timeseries");
            let files = extractor.write_output(&temp_dir)?;

            let uploader = R2Uploader::new(bucket.clone(), prefix.clone()).await?;
            for filename in &files {
                let local_path = temp_dir.join(filename);
                uploader.upload_file(&local_path, filename).await?;
            }
            std::fs::remove_dir_all(&temp_dir).ok();
            info!("Uploaded {} files to s3://{}/{}", files.len(), bucket, prefix);
        }
    }

    info!(
        "Complete: {} grid cells, {} total data points",
        extractor.grid_point_count(),
        extractor.data_point_count()
    );

    Ok(())
}

async fn run_build_zarr(cog_dir: &str, output: &str, append: bool) -> Result<()> {
    let cog_path = PathBuf::from(cog_dir);
    let destination = OutputDestination::from_str(output)?;

    info!("Build Zarr: append={}", append);

    match destination {
        OutputDestination::Local(output_path) => {
            let mut builder = if append && output_path.exists() {
                info!("Loading existing Zarr store...");
                let b = ZarrBuilder::load_existing(&output_path)?;
                info!("Found {} existing dates", b.get_existing_dates().len());
                b
            } else {
                ZarrBuilder::new(&output_path)?
            };

            let processed = builder.process_cogs(&cog_path, append)?;

            info!(
                "Complete: {} dates processed, {} total dates in store",
                processed,
                builder.dates_count()
            );
        }
        OutputDestination::R2 { bucket, prefix } => {
            let r2 = R2Uploader::new(bucket.clone(), prefix.clone()).await?;
            let temp_dir = PathBuf::from("./temp_zarr");

            if append {
                info!("Fetching existing Zarr metadata from R2...");
                match r2.download_bytes("dates.json").await {
                    Ok(bytes) => {
                        std::fs::create_dir_all(&temp_dir)?;
                        std::fs::write(temp_dir.join("dates.json"), &bytes)?;

                        let dates: Vec<String> = serde_json::from_slice(&bytes)?;
                        info!("Found {} existing dates in R2", dates.len());

                        let new_cog_dates = get_cog_dates(&cog_path)?;
                        let existing_set: std::collections::BTreeSet<_> = dates.iter().collect();
                        let new_dates: Vec<_> = new_cog_dates
                            .iter()
                            .filter(|d| !existing_set.contains(d))
                            .collect();

                        if new_dates.is_empty() {
                            info!("No new dates to process");
                            return Ok(());
                        }

                        info!("Will append {} new dates", new_dates.len());

                        let affected_chunks = get_affected_time_chunks(&dates, &new_dates);
                        info!("Downloading {} affected time chunks from R2...", affected_chunks.len());

                        for chunk_idx in &affected_chunks {
                            let chunk_prefix = format!("snow_depth/c/{}/", chunk_idx);
                            let keys = r2.list_prefix(&chunk_prefix).await?;
                            for key in keys {
                                let local_path = temp_dir.join(&key);
                                r2.download_file(&key, &local_path).await?;
                            }
                        }

                        let zarr_meta_keys = ["zarr.json", "snow_depth/zarr.json"];
                        for key in zarr_meta_keys {
                            if let Ok(bytes) = r2.download_bytes(key).await {
                                let local_path = temp_dir.join(key);
                                if let Some(parent) = local_path.parent() {
                                    std::fs::create_dir_all(parent)?;
                                }
                                std::fs::write(&local_path, &bytes)?;
                            }
                        }
                    }
                    Err(_) => {
                        info!("No existing Zarr found in R2, creating new store");
                    }
                }
            }

            let mut builder = if append && temp_dir.join("dates.json").exists() {
                ZarrBuilder::load_existing(&temp_dir)?
            } else {
                std::fs::create_dir_all(&temp_dir)?;
                ZarrBuilder::new(&temp_dir)?
            };

            let processed = builder.process_cogs(&cog_path, append)?;

            info!("Uploading modified chunks to R2...");
            upload_zarr_to_r2(&r2, &temp_dir).await?;

            std::fs::remove_dir_all(&temp_dir).ok();

            info!(
                "Complete: {} dates processed, {} total dates in store",
                processed,
                builder.dates_count()
            );
        }
    }

    Ok(())
}

fn get_cog_dates(cog_dir: &Path) -> Result<Vec<String>> {
    use crate::snodas::extract_date_from_cog_filename;

    let mut dates = Vec::new();
    for entry in std::fs::read_dir(cog_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map(|e| e == "tif").unwrap_or(false) {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.contains("snow_depth") {
                    if let Some(date) = extract_date_from_cog_filename(name) {
                        dates.push(date);
                    }
                }
            }
        }
    }
    dates.sort();
    Ok(dates)
}

fn get_affected_time_chunks(existing_dates: &[String], new_dates: &[&String]) -> Vec<u64> {
    const CHUNK_TIME: u64 = 365;

    let mut all_dates: Vec<String> = existing_dates.to_vec();
    for d in new_dates {
        all_dates.push((*d).clone());
    }
    all_dates.sort();

    let mut chunks = std::collections::BTreeSet::new();
    for new_date in new_dates {
        if let Some(idx) = all_dates.iter().position(|d| d == *new_date) {
            chunks.insert(idx as u64 / CHUNK_TIME);
        }
    }

    chunks.into_iter().collect()
}

async fn upload_zarr_to_r2(r2: &R2Uploader, local_dir: &Path) -> Result<()> {
    use walkdir::WalkDir;

    for entry in WalkDir::new(local_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let relative = path.strip_prefix(local_dir)?;
            let key = relative.to_string_lossy().to_string();

            let data = std::fs::read(path)?;
            let content_type = if key.ends_with(".json") {
                "application/json"
            } else {
                "application/octet-stream"
            };

            r2.upload_bytes(&key, data, content_type).await?;
        }
    }

    Ok(())
}
