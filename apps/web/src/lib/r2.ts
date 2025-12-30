import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const BUCKET = "gnarmap-historical";
export const PRESIGNED_URL_EXPIRY = 3600;

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${getRequiredEnvVar("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: getRequiredEnvVar("R2_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnvVar("R2_SECRET_ACCESS_KEY"),
  },
});

export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

export async function getPresignedUrl(key: string): Promise<string> {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn: PRESIGNED_URL_EXPIRY });
}

export async function getR2Object(key: string): Promise<string | undefined> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  const response = await r2Client.send(command);
  return response.Body?.transformToString();
}
