// KYC document uploads, shared by registration and re-upload after a rejection.
import multer from "multer";
import { deleteFiles, saveFile, sniffType } from "./files.js";

const ANY = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const IMAGE = ["image/jpeg", "image/png", "image/webp"];

export const DOCS = { panCard: ANY, aadhaarFront: ANY, selfie: IMAGE, signature: IMAGE, cheque: ANY };
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

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

// Saves the files to GridFS. If anything fails, the files saved so far are removed again.
export async function storeDocs(files, keys, owner) {
  const savedIds = [];
  try {
    const documents = [];
    for (const key of keys) {
      const file = files[key][0];
      const fileId = await saveFile(file.buffer, {
        filename: `${key}.${EXT[file.detectedType]}`,
        contentType: file.detectedType,
        metadata: { owner, key },
      });
      savedIds.push(fileId);
      documents.push({ key, fileId, filename: file.originalname.slice(0, 120), contentType: file.detectedType, size: file.size, uploadedAt: new Date() });
    }
    return { documents, savedIds };
  } catch (err) {
    await deleteFiles(savedIds);
    throw err;
  }
}
