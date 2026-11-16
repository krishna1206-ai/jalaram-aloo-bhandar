// Field encryption for sensitive numbers (PAN, bank account) with AES-256-GCM.
// Stored as "v1:<iv>:<tag>:<ciphertext>" in base64. A keyed hash allows exact-match lookups
// (e.g. "is this PAN already registered?") without decrypting.
import crypto from "node:crypto";
import { config } from "../config.js";

const key = config.dataKey
  ? Buffer.from(config.dataKey, "hex")
  : crypto.createHash("sha256").update(`dev-data-key|${config.jwtSecret}`).digest(); // development only

export function encrypt(plain) {
  if (plain === undefined || plain === null || plain === "") return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(stored) {
  if (!stored) return "";
  const [v, iv, tag, data] = String(stored).split(":");
  if (v !== "v1") return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export const lookupHash = (value) =>
  crypto.createHmac("sha256", key).update(String(value).trim().toUpperCase()).digest("hex");
