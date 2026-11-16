import mongoose from "mongoose";
import { Readable } from "node:stream";

// KYC documents live in MongoDB GridFS (bucket "kyc"), so no separate file storage is needed.
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "kyc" });

// Work out the real file type from its first bytes. The browser-supplied type is not trusted.
export function sniffType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

export function saveFile(buffer, { filename, contentType, metadata }) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { metadata: { ...metadata, contentType } });
    Readable.from(buffer).pipe(upload).on("error", reject).on("finish", () => resolve(upload.id));
  });
}

export const openFile = (id) => bucket().openDownloadStream(new mongoose.Types.ObjectId(id));

export async function deleteFiles(ids) {
  await Promise.all(ids.map((id) => bucket().delete(new mongoose.Types.ObjectId(id)).catch(() => {})));
}
