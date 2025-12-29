use anyhow::{Context, Result};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;
use std::path::Path;
use tracing::info;

pub struct S3Uploader {
    client: S3Client,
    bucket: String,
    prefix: String,
}

impl S3Uploader {
    pub async fn new(bucket: String, prefix: String) -> Result<Self> {
        let config = aws_config::load_from_env().await;
        let client = S3Client::new(&config);

        Ok(Self {
            client,
            bucket,
            prefix,
        })
    }

    pub async fn upload_file(&self, local_path: &Path, key_suffix: &str) -> Result<String> {
        let key = if self.prefix.is_empty() {
            key_suffix.to_string()
        } else {
            format!("{}/{}", self.prefix.trim_end_matches('/'), key_suffix)
        };

        let body = ByteStream::from_path(local_path)
            .await
            .context("Failed to read file for upload")?;

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(body)
            .content_type("image/tiff")
            .send()
            .await
            .context("Failed to upload to S3")?;

        let url = format!("s3://{}/{}", self.bucket, key);
        info!("Uploaded {} to {}", local_path.display(), url);

        Ok(url)
    }

    pub async fn upload_batch(&self, files: &[(impl AsRef<Path>, &str)]) -> Result<Vec<String>> {
        let mut urls = Vec::new();
        for (local_path, key_suffix) in files {
            let url = self.upload_file(local_path.as_ref(), key_suffix).await?;
            urls.push(url);
        }
        Ok(urls)
    }
}

pub enum OutputDestination {
    Local(std::path::PathBuf),
    S3 { bucket: String, prefix: String },
}

impl OutputDestination {
    pub fn from_str(s: &str) -> Result<Self> {
        if s.starts_with("s3://") {
            let path = s.strip_prefix("s3://").unwrap();
            let parts: Vec<&str> = path.splitn(2, '/').collect();
            let bucket = parts[0].to_string();
            let prefix = parts.get(1).unwrap_or(&"").to_string();
            Ok(Self::S3 { bucket, prefix })
        } else {
            Ok(Self::Local(std::path::PathBuf::from(s)))
        }
    }
}
