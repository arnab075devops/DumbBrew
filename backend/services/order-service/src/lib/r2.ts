import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

// Cloudflare R2 is S3-compatible — this is the only write path to it in the
// repo (everywhere else just reads pre-uploaded objects via the public
// R2_BASE URL in gateway/public/config.js). We never touch the file bytes
// ourselves: the client PUTs directly to R2 using a short-lived presigned
// URL this mints, then tells us the object key it used.
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2AccessKeyId,
    secretAccessKey: config.r2SecretAccessKey
  }
});

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

export async function createUploadUrl(
  prefix: string,
  fileName: string,
  contentType: string
): Promise<{ uploadUrl: string; imageKey: string }> {
  const imageKey = `${prefix}/${randomUUID()}-${safeFileName(fileName)}`;
  const command = new PutObjectCommand({ Bucket: config.r2Bucket, Key: imageKey, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { uploadUrl, imageKey };
}

// The seller-applications bucket has no public r2.dev domain (unlike
// R2_BASE, which serves the site's already-approved media) — an applicant's
// photos shouldn't be world-readable before an admin has even looked at
// them. So admin-sellers.html gets a short-lived signed GET URL per image
// instead of a public one.
export async function createDownloadUrl(imageKey: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: config.r2Bucket, Key: imageKey });
  return getSignedUrl(s3, command, { expiresIn: 600 });
}
