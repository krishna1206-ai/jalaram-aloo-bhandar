import crypto from "node:crypto";
import { config } from "../config.js";
import { HttpError, badRequest } from "../errors.js";
import { Otp } from "../models/index.js";
import { verifiedToken } from "./tokens.js";

const DEV_CODE = "123456";
const TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

const hash = (code) => crypto.createHmac("sha256", config.jwtSecret).update(code).digest("hex");

export const normalizeTarget = (channel, value) => {
  const v = String(value ?? "").trim();
  return channel === "email" ? v.toLowerCase() : v.replace(/\D/g, "");
};

export function checkTarget(channel, target) {
  if (channel === "mobile" && !/^[6-9]\d{9}$/.test(target)) throw badRequest("Enter a valid 10-digit mobile number.");
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) throw badRequest("Enter a valid email address.");
  if (channel !== "mobile" && channel !== "email") throw badRequest("channel must be mobile or email.");
}

// Plug your SMS (MSG91, Twilio, Gupshup) and email (SES, Resend, SendGrid) providers in here.
async function deliver(channel, target, code) {
  if (config.otpDevMode) {
    if (!config.isTest) console.log(`[dev OTP] ${channel} ${target}: ${code}`);
    return;
  }
  throw new HttpError(503, `Sending OTPs by ${channel} is not set up on this server yet.`);
}

export async function sendOtp(channel, target) {
  const recent = await Otp.findOne({ channel, target }).sort({ createdAt: -1 });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_AFTER_MS) {
    throw new HttpError(429, "Please wait 30 seconds before asking for another OTP.");
  }
  const code = config.otpDevMode ? DEV_CODE : String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await deliver(channel, target, code);
  await Otp.deleteMany({ channel, target });
  await Otp.create({ channel, target, codeHash: hash(code), expiresAt: new Date(Date.now() + TTL_MS) });
}

export async function verifyOtp(channel, target, code) {
  const otp = await Otp.findOneAndUpdate(
    { channel, target, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
  if (!otp) throw badRequest("This OTP has expired. Please request a new one.");
  if (otp.attempts > MAX_ATTEMPTS) {
    await otp.deleteOne();
    throw badRequest("Too many wrong tries. Please request a new OTP.");
  }
  const ok = /^\d{6}$/.test(String(code)) && crypto.timingSafeEqual(Buffer.from(hash(String(code))), Buffer.from(otp.codeHash));
  if (!ok) throw badRequest("Incorrect OTP. Please try again.");
  await otp.deleteOne();
  return verifiedToken(channel, target);
}
