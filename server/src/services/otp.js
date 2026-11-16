import crypto from "node:crypto";
import { config } from "../config.js";
import { HttpError, badRequest } from "../errors.js";
import { Otp } from "../models/index.js";
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
  const recent = await Otp.findOne({ purpose, channel, target }).sort({ createdAt: -1 });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_AFTER_MS) {
    throw new HttpError(429, "Please wait 30 seconds before asking for another OTP.");
  }
  const code = config.otpDevMode ? DEV_CODE : String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await deliver(purpose, channel, target, code);
  await Otp.deleteMany({ purpose, channel, target });
  await Otp.create({ purpose, channel, target, codeHash: hash(code), expiresAt: new Date(Date.now() + TTL_MS) });
}

// Throws unless the code is right. A code works once.
export async function verifyOtp(purpose, channel, target, code) {
  const otp = await Otp.findOneAndUpdate(
    { purpose, channel, target, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
  if (!otp) throw badRequest("This OTP has expired. Please request a new one.", { code: "Expired." });
  if (otp.attempts > MAX_ATTEMPTS) {
    await otp.deleteOne();
    throw badRequest("Too many wrong tries. Please request a new OTP.", { code: "Too many tries." });
  }
  const ok = /^\d{6}$/.test(String(code)) && crypto.timingSafeEqual(Buffer.from(hash(String(code))), Buffer.from(otp.codeHash));
  if (!ok) throw badRequest("Incorrect OTP. Please try again.", { code: "Incorrect." });
  await otp.deleteOne();
}
