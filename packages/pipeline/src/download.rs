use anyhow::{Context, Result};
use bytes::Bytes;
use chrono::NaiveDate;
use futures::{stream, StreamExt};
use reqwest::Client;
use std::time::Duration;
use tracing::{debug, info, warn};

use crate::snodas::build_nsidc_url;

pub struct Downloader {
    client: Client,
    max_retries: u32,
    concurrent_downloads: usize,
}

impl Downloader {
    pub fn new(concurrent_downloads: usize) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(concurrent_downloads)
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self {
            client,
            max_retries: 3,
            concurrent_downloads,
        })
    }

    pub async fn download_date(&self, date: NaiveDate) -> Result<Bytes> {
        let url = build_nsidc_url(date);
        self.download_with_retry(&url).await
    }

    async fn download_with_retry(&self, url: &str) -> Result<Bytes> {
        let mut last_error = None;

        for attempt in 0..self.max_retries {
            if attempt > 0 {
                let delay = Duration::from_secs(2u64.pow(attempt));
                warn!("Retry attempt {} for {}, waiting {:?}", attempt, url, delay);
                tokio::time::sleep(delay).await;
            }

            match self.download_once(url).await {
                Ok(bytes) => {
                    debug!("Downloaded {} bytes from {}", bytes.len(), url);
                    return Ok(bytes);
                }
                Err(e) => {
                    warn!("Download failed for {}: {}", url, e);
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Download failed with no error")))
    }

    async fn download_once(&self, url: &str) -> Result<Bytes> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .context("Failed to send request")?;

        let status = response.status();
        if !status.is_success() {
            anyhow::bail!("HTTP {} for {}", status, url);
        }

        let bytes = response
            .bytes()
            .await
            .context("Failed to read response body")?;

        Ok(bytes)
    }

    pub async fn download_dates(&self, dates: Vec<NaiveDate>) -> Vec<(NaiveDate, Result<Bytes>)> {
        info!(
            "Downloading {} dates with {} concurrent connections",
            dates.len(),
            self.concurrent_downloads
        );

        stream::iter(dates)
            .map(|date| async move {
                let result = self.download_date(date).await;
                (date, result)
            })
            .buffer_unordered(self.concurrent_downloads)
            .collect()
            .await
    }
}

pub fn generate_date_range(start: NaiveDate, end: NaiveDate) -> Vec<NaiveDate> {
    let mut dates = Vec::new();
    let mut current = start;
    while current <= end {
        dates.push(current);
        current = current.succ_opt().unwrap_or(current);
        if current == start {
            break;
        }
    }
    dates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_date_range() {
        let start = NaiveDate::from_ymd_opt(2023, 12, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2023, 12, 5).unwrap();
        let dates = generate_date_range(start, end);
        assert_eq!(dates.len(), 5);
    }
}
