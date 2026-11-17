import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError, badRequest } from "../errors.js";
import { sendEmail, sendSms } from "./notify.js";

const DEV_CODE = "123456";
const TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

const PURPOSE_TEXT = {
  register: "to verify your account",
  login: "to log in",
  "reset-password": "to reset your password",
  "reset-pin": "to reset your transaction PIN",
};

const hash = (code) => crypto.createHmac("sha256", config.jwtSecret).update(code).digest("hex");

export const normalizeTarget = (channel, value) => {
  const v = String(value ?? "").trim();
  return channel === "email" ? v.toLowerCase() : v.replace(/\D/g, "");
};

export function checkTarget(channel, target) {
  if (channel !== "mobile" && channel !== "email") throw badRequest("channel must be mobile or email.");
  if (channel === "mobile" && !/^[6-9]\d{9}$/.test(target)) throw badRequest("Enter a valid 10-digit mobile number.");
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) throw badRequest("Enter a valid email address.");
}

async function deliver(purpose, channel, target, code) {
  if (config.otpDevMode) {
    if (!config.isTest) console.log(`[dev OTP] ${purpose} ${channel} ${target}: ${code}`);
    return;
  }
  const text = `${code} is your ${config.appName} OTP ${PURPOSE_TEXT[purpose] || ""}. It is valid for 10 minutes. Never share it with anyone.`;
  if (channel === "email") await sendEmail(target, `Your ${config.appName} OTP`, text);
  else await sendSms(target, text, { otp: code });
}

export async function sendOtp(purpose, channel, target) {
  await db.query("DELETE FROM otps WHERE expires_at < now()");
  const { rows } = await db.query(
    "SELECT created_at FROM otps WHERE purpose = $1 AND channel = $2 AND target = $3 ORDER BY created_at DESC LIMIT 1",
    [purpose, channel, target]
  );
  if (rows[0] && Date.now() - new Date(rows[0].created_at).getTime() < RESEND_AFTER_MS) {
    throw new HttpError(429, "Please wait 30 seconds before asking for another OTP.");
  }
  const code = config.otpDevMode ? DEV_CODE : String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await deliver(purpose, channel, target, code);
  await db.query("DELETE FROM otps WHERE purpose = $1 AND channel = $2 AND target = $3", [purpose, channel, target]);
  await db.query(
    "INSERT INTO otps (purpose, channel, target, code_hash, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [purpose, channel, target, hash(code), new Date(Date.now() + TTL_MS)]
  );
}

// Throws unless the code is right. A code works once.
export async function verifyOtp(purpose, channel, target, code) {
  const { rows } = await db.query(
    `UPDATE otps SET attempts = attempts + 1
     WHERE id = (SELECT id FROM otps WHERE purpose = $1 AND channel = $2 AND target = $3 AND expires_at > now()
                 ORDER BY created_at DESC LIMIT 1)
     RETURNING id, attempts, code_hash`,
    [purpose, channel, target]
  );
  const otp = rows[0];
  if (!otp) throw badRequest("This OTP has expired. Please request a new one.", { code: "Expired." });
  if (otp.attempts > MAX_ATTEMPTS) {
    await db.query("DELETE FROM otps WHERE id = $1", [otp.id]);
    throw badRequest("Too many wrong tries. Please request a new OTP.", { code: "Too many tries." });
  }
  const ok = /^\d{6}$/.test(String(code)) && crypto.timingSafeEqual(Buffer.from(hash(String(code))), Buffer.from(otp.code_hash));
  if (!ok) throw badRequest("Incorrect OTP. Please try again.", { code: "Incorrect." });
  await db.query("DELETE FROM otps WHERE id = $1", [otp.id]);
}
