import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
});

import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  minioClient,
  BUCKET_NAME,
} from "./minio.js";

const APPLY = process.argv.includes("--apply");

const SUPABASE_BUCKET = process.env.SUPABASE_S3_BUCKET;

const supabaseClient = new S3Client({
  region: process.env.SUPABASE_S3_REGION,
  endpoint: process.env.SUPABASE_S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
  },
});

function hashBuffer(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

async function getBuffer(client, bucket, key) {
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  return Buffer.from(
    await result.Body.transformToByteArray()
  );
}

function isNotFound(error) {
  return (
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.name === "NoSuchBucket" && false ||
    error.$metadata?.httpStatusCode === 404
  );
}

async function listAllLocalObjects() {
  const objects = [];
  let token;

  do {
    const result = await minioClient.send(
      new (await import("@aws-sdk/client-s3")).ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );

    objects.push(...(result.Contents || []));

    token = result.IsTruncated
      ? result.NextContinuationToken
      : undefined;

  } while (token);

  return objects;
}

async function main() {
  console.log("\n======================================");
  console.log(" MINIO TO SUPABASE STORAGE MIGRATION");
  console.log("======================================");

  console.log("Mode:", APPLY ? "APPLY" : "DRY RUN");
  console.log("Source bucket:", BUCKET_NAME);
  console.log("Destination bucket:", SUPABASE_BUCKET);

  if (
    !SUPABASE_BUCKET ||
    !process.env.SUPABASE_S3_ENDPOINT ||
    !process.env.SUPABASE_S3_ACCESS_KEY ||
    !process.env.SUPABASE_S3_SECRET_KEY
  ) {
    throw new Error("Supabase S3 configuration is incomplete.");
  }

  // Verify both storage connections
  await minioClient.send(
    new HeadBucketCommand({
      Bucket: BUCKET_NAME,
    })
  );

  await supabaseClient.send(
    new HeadBucketCommand({
      Bucket: SUPABASE_BUCKET,
    })
  );

  console.log("\nBoth storage connections verified.");

  // List local MinIO objects
  const objects = await listAllLocalObjects();

  console.log("\nLocal MinIO objects:", objects.length);

  const plan = [];
  const conflicts = [];

  let alreadyPresent = 0;
  let missing = 0;
  let totalBytes = 0;

  // Phase 1: Read-only verification
  console.log("\n========== PREFLIGHT ==========");

  for (const object of objects) {
    if (!object.Key) continue;

    const key = object.Key;

    console.log("\nChecking:", key);

    const sourceBuffer = await getBuffer(
      minioClient,
      BUCKET_NAME,
      key
    );

    const sourceHash = hashBuffer(sourceBuffer);

    totalBytes += sourceBuffer.length;

    let destinationExists = false;

    try {
      await supabaseClient.send(
        new HeadObjectCommand({
          Bucket: SUPABASE_BUCKET,
          Key: key,
        })
      );

      destinationExists = true;

    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    if (destinationExists) {
      const destinationBuffer = await getBuffer(
        supabaseClient,
        SUPABASE_BUCKET,
        key
      );

      const destinationHash = hashBuffer(destinationBuffer);

      if (sourceHash !== destinationHash) {
        console.log("CONFLICT: Existing destination differs.");

        conflicts.push(key);
        continue;
      }

      console.log("ALREADY PRESENT: SHA-256 matches.");

      alreadyPresent++;
      continue;
    }

    console.log("MISSING IN SUPABASE:", key);

    plan.push({
      key,
      sha256: sourceHash,
      size: sourceBuffer.length,
    });

    missing++;
  }

  console.log("\n========== PREFLIGHT SUMMARY ==========");
  console.log("Local objects:", objects.length);
  console.log("Already present and verified:", alreadyPresent);
  console.log("Missing from Supabase:", missing);
  console.log("Conflicting objects:", conflicts.length);
  console.log("Total source size:", totalBytes, "bytes");

  if (conflicts.length > 0) {
    console.log("\nMIGRATION STOPPED.");
    console.log("The following objects have different contents:");

    conflicts.forEach((key) => console.log(key));

    throw new Error(
      "Resolve destination conflicts before migrating."
    );
  }

  if (!APPLY) {
    console.log("\nDRY RUN COMPLETE.");
    console.log("No files were uploaded, modified or deleted.");
    console.log("\nTo execute after reviewing the results:");
    console.log("node server/migrate-minio-to-supabase.js --apply");
    return;
  }

  // Phase 2: Upload missing objects
  console.log("\n========== UPLOADING ==========");

  let uploaded = 0;

  for (const item of plan) {
    console.log("\nUploading:", item.key);

    const sourceBuffer = await getBuffer(
      minioClient,
      BUCKET_NAME,
      item.key
    );

    if (hashBuffer(sourceBuffer) !== item.sha256) {
      throw new Error(
        `Source changed after preflight: ${item.key}`
      );
    }

    const sourceMetadata = await minioClient.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.key,
      })
    );

    await supabaseClient.send(
      new PutObjectCommand({
        Bucket: SUPABASE_BUCKET,
        Key: item.key,
        Body: sourceBuffer,
        ContentType:
          sourceMetadata.ContentType ||
          "application/octet-stream",
      })
    );

    // Verify uploaded file
    const destinationBuffer = await getBuffer(
      supabaseClient,
      SUPABASE_BUCKET,
      item.key
    );

    const destinationHash = hashBuffer(destinationBuffer);

    if (destinationHash !== item.sha256) {
      throw new Error(
        `SHA-256 verification failed: ${item.key}`
      );
    }

    console.log("UPLOAD VERIFIED:", item.key);

    uploaded++;
  }

  console.log("\n======================================");
  console.log(" MIGRATION SUMMARY");
  console.log("======================================");

  console.log("Source objects:", objects.length);
  console.log("Previously present:", alreadyPresent);
  console.log("Newly uploaded:", uploaded);
  console.log("Total verified:", alreadyPresent + uploaded);
  console.log("Conflicts:", conflicts.length);

  console.log("\nMigration completed successfully.");
  console.log("Local MinIO files were not deleted.");
  console.log("Neon database was not modified.");
}

main()
  .catch((error) => {
    console.error("\nMIGRATION ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    minioClient.destroy();
    supabaseClient.destroy();
  });
