use anyhow::{Context, Result};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::config::{Credentials, Region};
use std::path::Path;
use tracing::{debug, info};

pub struct R2Uploader {
    client: S3Client,
    bucket: String,
    prefix: String,
}

impl R2Uploader {
    pub async fn new(bucket: String, prefix: String) -> Result<Self> {
        let account_id = std::env::var("R2_ACCOUNT_ID").context("R2_ACCOUNT_ID required")?;
        let access_key = std::env::var("R2_ACCESS_KEY_ID").context("R2_ACCESS_KEY_ID required")?;
        let secret_key =
            std::env::var("R2_SECRET_ACCESS_KEY").context("R2_SECRET_ACCESS_KEY required")?;

        let credentials = Credentials::new(access_key, secret_key, None, None, "r2");
        let config = aws_sdk_s3::Config::builder()
            .region(Region::new("auto"))
            .endpoint_url(format!("https://{}.r2.cloudflarestorage.com", account_id))
            .credentials_provider(credentials)
            .build();
        let client = S3Client::from_conf(config);

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
            .context("Failed to upload to R2")?;

        let url = format!("r2://{}/{}", self.bucket, key);
        info!("Uploaded {} to {}", local_path.display(), url);

        Ok(url)
    }

    pub async fn download_file(&self, key: &str, local_path: &Path) -> Result<()> {
        let full_key = if self.prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}/{}", self.prefix.trim_end_matches('/'), key)
        };

        debug!("Downloading r2://{}/{} to {}", self.bucket, full_key, local_path.display());

        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .send()
            .await
            .context(format!("Failed to download {} from R2", full_key))?;

        let bytes = resp
            .body
            .collect()
            .await
            .context("Failed to read response body")?
            .into_bytes();

        if let Some(parent) = local_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(local_path, &bytes)?;

        Ok(())
    }

    pub async fn download_bytes(&self, key: &str) -> Result<Vec<u8>> {
        let full_key = if self.prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}/{}", self.prefix.trim_end_matches('/'), key)
        };

        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .send()
            .await
            .context(format!("Failed to download {} from R2", full_key))?;

        let bytes = resp
            .body
            .collect()
            .await
            .context("Failed to read response body")?
            .into_bytes();

        Ok(bytes.to_vec())
    }

    pub async fn list_prefix(&self, prefix: &str) -> Result<Vec<String>> {
        let full_prefix = if self.prefix.is_empty() {
            prefix.to_string()
        } else {
            format!("{}/{}", self.prefix.trim_end_matches('/'), prefix)
        };

        let mut keys = Vec::new();
        let mut continuation_token: Option<String> = None;

        loop {
            let mut req = self
                .client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(&full_prefix);

            if let Some(token) = &continuation_token {
                req = req.continuation_token(token);
            }

            let resp = req.send().await.context("Failed to list objects")?;

            if let Some(contents) = resp.contents {
                for obj in contents {
                    if let Some(key) = obj.key {
                        let relative_key = if self.prefix.is_empty() {
                            key
                        } else {
                            key.strip_prefix(&format!("{}/", self.prefix.trim_end_matches('/')))
                                .unwrap_or(&key)
                                .to_string()
                        };
                        keys.push(relative_key);
                    }
                }
            }

            if resp.is_truncated == Some(true) {
                continuation_token = resp.next_continuation_token;
            } else {
                break;
            }
        }

        Ok(keys)
    }

    pub async fn upload_bytes(&self, key: &str, data: Vec<u8>, content_type: &str) -> Result<()> {
        let full_key = if self.prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}/{}", self.prefix.trim_end_matches('/'), key)
        };

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .body(ByteStream::from(data))
            .content_type(content_type)
            .send()
            .await
            .context("Failed to upload to R2")?;

        debug!("Uploaded {} bytes to r2://{}/{}", full_key.len(), self.bucket, full_key);
        Ok(())
    }

    pub fn bucket(&self) -> &str {
        &self.bucket
    }

    pub fn prefix(&self) -> &str {
        &self.prefix
    }
}

pub enum OutputDestination {
    Local(std::path::PathBuf),
    R2 { bucket: String, prefix: String },
}

impl OutputDestination {
    pub fn from_str(s: &str) -> Result<Self> {
        if s.starts_with("r2://") {
            let path = s.strip_prefix("r2://").unwrap();
            let parts: Vec<&str> = path.splitn(2, '/').collect();
            let bucket = parts[0].to_string();
            let prefix = parts.get(1).unwrap_or(&"").to_string();
            Ok(Self::R2 { bucket, prefix })
        } else {
            Ok(Self::Local(std::path::PathBuf::from(s)))
        }
    }
}
