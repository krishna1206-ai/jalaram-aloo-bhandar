// KYC document uploads, shared by registration and re-upload after a rejection.
// Files are stored in the kyc_documents table (BYTEA).
import multer from "multer";
import { sniffType } from "./files.js";

const ANY = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const IMAGE = ["image/jpeg", "image/png", "image/webp"];

export const DOCS = { panCard: ANY, aadhaarFront: ANY, selfie: IMAGE, signature: IMAGE, cheque: ANY };

export const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5, fields: 60, fieldSize: 10 * 1024 },
}).fields(Object.keys(DOCS).map((name) => ({ name, maxCount: 1 })));

// Validates uploaded files with the validator `v`. Checks the real type from the bytes.
// Returns the keys that were uploaded and are valid.
export function checkDocs(files, v, { required = true } = {}) {
  const ok = [];
  for (const [key, allowed] of Object.entries(DOCS)) {
    const file = files?.[key]?.[0];
    if (!file) {
      if (required) v.check(false, key, "Upload this document.");
      continue;
    }
    const type = sniffType(file.buffer);
    const msg = allowed.includes("application/pdf") ? "Upload a JPG, PNG, WebP or PDF file." : "Upload a JPG, PNG or WebP image.";
    if (v.check(type && allowed.includes(type), key, msg)) {
      file.detectedType = type;
      ok.push(key);
    }
  }
  return ok;
}

// Saves (or replaces) the user's documents. Pass the transaction client so it commits with the rest.
export async function storeDocs(db, userId, files, keys) {
  for (const key of keys) {
    const file = files[key][0];
    await db.query(
      `INSERT INTO kyc_documents (user_id, doc_key, filename, content_type, size, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, doc_key) DO UPDATE
         SET filename = EXCLUDED.filename, content_type = EXCLUDED.content_type,
             size = EXCLUDED.size, data = EXCLUDED.data, uploaded_at = now()`,
      [userId, key, file.originalname.slice(0, 120), file.detectedType, file.size, file.buffer]
    );
  }
}
