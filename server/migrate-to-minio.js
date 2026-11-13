import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  pool,
  loadDb,
  STORAGE_DIR,
} from "./db.js";

import {
  uploadToMinio,
  downloadFromMinio,
} from "./minio.js";

const APPLY = process.argv.includes("--apply");

function calculateHash(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function safeName(name) {
  return path.basename(name).replace(/[^\w.\-]+/g, "_");
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();

  const types = {
    ".pdf": "application/pdf",
    ".webm": "video/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
  };

  return types[ext] || "application/octet-stream";
}

async function main() {
  console.log("\n================================");
  console.log(" SECUREVAULT MINIO MIGRATION");
  console.log("================================");

  console.log("Mode:", APPLY ? "APPLY" : "DRY RUN");

  const db = await loadDb();

  const updates = [];
  const errors = [];

  let alreadyMigrated = 0;
  let verified = 0;

  console.log("\nTotal documents:", db.documents.length);

  for (const doc of db.documents) {
    console.log("\n--------------------------------");
    console.log("Document:", doc.name);
    console.log("ID:", doc.id);

    for (let index = 0; index < (doc.versions || []).length; index++) {
      const version = doc.versions[index];

      try {
        const versionNumber = version.version || `v${index + 1}`;

        // Already stored in MinIO
        if (version.storageBackend === "minio") {
          if (!version.objectKey) {
            throw new Error("MinIO object key is missing");
          }

          const storedBuffer = await downloadFromMinio(
            version.objectKey
          );

          const actualHash = calculateHash(storedBuffer);

          if (
            version.sha256 &&
            actualHash !== version.sha256
          ) {
            throw new Error("Existing MinIO SHA-256 mismatch");
          }

          alreadyMigrated++;

          console.log("ALREADY IN MINIO:", version.objectKey);
          console.log("Existing object verified.");

          continue;
        }

        if (!version.filename) {
          throw new Error("Local filename is missing");
        }

        // Prevent directory traversal
        const documentDirectory = path.resolve(
          STORAGE_DIR,
          doc.id
        );

        const localPath = path.resolve(
          documentDirectory,
          version.filename
        );

        if (!localPath.startsWith(documentDirectory + path.sep)) {
          throw new Error("Invalid local file path");
        }

        const buffer = await fs.readFile(localPath);

        // Verify original SHA-256
        const originalHash = calculateHash(buffer);

        if (
          version.sha256 &&
          originalHash !== version.sha256
        ) {
          throw new Error(
            `Local SHA-256 mismatch. Expected: ${version.sha256}, Actual: ${originalHash}`
          );
        }

        if (!version.sha256) {
          throw new Error("Original SHA-256 is missing");
        }

        const originalName =
          version.originalName ||
          doc.name ||
          version.filename;

        const objectKey =
          `cases/${doc.caseId}/documents/${doc.id}/${versionNumber}/${safeName(originalName)}`;

        console.log("Local file:", localPath);
        console.log("SHA-256:", originalHash);
        console.log("Target:", objectKey);

        if (APPLY) {
          // Upload original file
          await uploadToMinio(
            objectKey,
            buffer,
            getContentType(originalName)
          );

          // Download and verify uploaded file
          const downloaded = await downloadFromMinio(objectKey);

          const uploadedHash = calculateHash(downloaded);

          if (uploadedHash !== originalHash) {
            throw new Error("Uploaded file SHA-256 mismatch");
          }

          updates.push({
            docId: doc.id,
            versionIndex: index,
            objectKey,
          });

          console.log("UPLOAD VERIFIED");
        } else {
          console.log("DRY RUN: No upload performed.");
        }

        verified++;
      } catch (error) {
        errors.push({
          document: doc.name,
          version: version.version,
          error: error.message,
        });

        console.error("ERROR:", error.message);
      }
    }
  }

  // Update PostgreSQL only after every required file is verified
  if (APPLY && errors.length === 0) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const update of updates) {
        const doc = db.documents.find(
          (item) => item.id === update.docId
        );

        const version = doc.versions[update.versionIndex];

        const updatedVersions = doc.versions.map((item, index) => {
          if (index !== update.versionIndex) {
            return item;
          }

          return {
            ...item,
            storageBackend: "minio",
            objectKey: update.objectKey,
          };
        });

        const updatedDoc = {
          ...doc,
          versions: updatedVersions,
        };

        await client.query(
          `UPDATE documents
           SET data = $2::jsonb
           WHERE id = $1`,
          [
            doc.id,
            JSON.stringify(updatedDoc),
          ]
        );
      }

      await client.query("COMMIT");

      console.log("\nPostgreSQL updated successfully.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log("\n================================");
  console.log(" MIGRATION SUMMARY");
  console.log("================================");

  console.log("Documents:", db.documents.length);
  console.log("New versions verified:", verified);
  console.log("Already in MinIO:", alreadyMigrated);
  console.log("Errors:", errors.length);

  if (errors.length) {
    console.log("\nFailed items:");

    for (const item of errors) {
      console.log(item);
    }
  }

  if (!APPLY) {
    console.log("\nDRY RUN COMPLETE.");
    console.log("No files or database records were changed.");
  } else if (errors.length) {
    console.log("\nMIGRATION NOT COMMITTED.");
    console.log("PostgreSQL records were not updated.");
  } else {
    console.log("\nMIGRATION COMPLETED SUCCESSFULLY.");
  }

  if (errors.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("\nMIGRATION FAILED:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });