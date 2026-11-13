import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
});
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.MINIO_ENDPOINT || "http://127.0.0.1:9000";

export const minioClient = new S3Client({
  region: "us-east-1",
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
});

export const BUCKET_NAME =
  process.env.MINIO_BUCKET || "securevault-documents";

export async function checkBucket() {
  await minioClient.send(
    new HeadBucketCommand({
      Bucket: BUCKET_NAME,
    })
  );

  console.log(`MinIO connected. Bucket: ${BUCKET_NAME}`);
}

export async function uploadToMinio(key, buffer, contentType) {
  await minioClient.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  );

  return key;
}

export async function downloadFromMinio(key) {
  const result = await minioClient.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );

  return Buffer.from(await result.Body.transformToByteArray());
}

export async function deleteFromMinio(key) {
  await minioClient.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );
}
