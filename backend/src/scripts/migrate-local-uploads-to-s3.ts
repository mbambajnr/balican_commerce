import fs from "fs";
import path from "path";
import { config } from "../config";
import { pool, query } from "../config/db";
import { importExistingStorageObject } from "../services/storage";

interface ObjectRecord {
  storage_key: string;
  mime_type: string;
}

async function migrateObjects(records: ObjectRecord[], isPrivate: boolean): Promise<number> {
  let migrated = 0;
  const unique = new Map(records.map((record) => [record.storage_key, record]));

  for (const record of unique.values()) {
    const sourcePath = path.resolve(
      config.upload.dir,
      ...(isPrivate ? ["private"] : []),
      record.storage_key
    );
    let contents: Buffer;
    try {
      contents = await fs.promises.readFile(sourcePath);
    } catch {
      throw new Error(`Local upload is missing: ${sourcePath}`);
    }
    await importExistingStorageObject(
      record.storage_key,
      contents,
      record.mime_type || "application/octet-stream",
      isPrivate
    );
    migrated += 1;
  }

  return migrated;
}

async function run(): Promise<void> {
  if (config.upload.driver !== "s3") {
    throw new Error("UPLOAD_STORAGE_DRIVER must be s3 for upload migration");
  }

  const publicRecords = await query(
    `SELECT storage_key, mime_type
     FROM product_attachments
     WHERE media_type = 'image' AND storage_key IS NOT NULL`
  );
  const privateRecords = await query(
    `SELECT storage_key, mime_type FROM vetting_documents
     UNION
     SELECT storage_key, mime_type FROM verification_documents
     UNION
     SELECT storage_key, mime_type FROM offering_documents`
  );

  const publicCount = await migrateObjects(publicRecords.rows, false);
  const privateCount = await migrateObjects(privateRecords.rows, true);

  await query(
    `UPDATE product_attachments
     SET url = $1 || '/' || storage_key
     WHERE media_type = 'image' AND storage_key IS NOT NULL`,
    [config.upload.publicBaseUrl.replace(/\/+$/, "")]
  );

  console.log(`S3 upload migration complete: public=${publicCount}, private=${privateCount}`);
}

run()
  .catch((error) => {
    console.error("S3 upload migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
