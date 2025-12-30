import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const BUCKET = "gnarmap-historical";
export const PRESIGNED_URL_EXPIRY = 3600;

let _r2Client: S3Client | null = null;

export const getR2Client = (): S3Client => {
  if (!_r2Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("Missing required R2 environment variables");
    }

    _r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _r2Client;
};

export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

export const getPresignedUrl = async (key: string): Promise<string> => {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: PRESIGNED_URL_EXPIRY });
};

export const getR2Object = async (key: string): Promise<string | undefined> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  const response = await getR2Client().send(command);
  return response.Body?.transformToString();
};
