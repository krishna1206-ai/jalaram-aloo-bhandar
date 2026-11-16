import bcrypt from "bcryptjs";
import { HttpError, badRequest } from "../errors.js";
import { User } from "../models/index.js";

const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

export const hashSecret = (value) => bcrypt.hash(value, 12);
export const checkSecret = (value, hash) => bcrypt.compare(String(value ?? ""), hash);

export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 128) return "Password is too long.";
  if (!/[A-Z]/.test(pw)) return "Password needs an uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password needs a lowercase letter.";
  if (!/\d/.test(pw)) return "Password needs a number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password needs a special character.";
  return null;
}

// Checks the 6-digit transaction PIN. Five wrong tries lock it for 15 minutes.
export async function verifyPin(user, pin) {
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    const mins = Math.ceil((user.pinLockedUntil - Date.now()) / 60000);
    throw new HttpError(423, `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
  if (!/^\d{6}$/.test(String(pin ?? ""))) throw badRequest("Enter your 6-digit transaction PIN.", { pin: "Required." });

  if (await checkSecret(pin, user.pinHash)) {
    if (user.pinFailures) await User.updateOne({ _id: user._id }, { pinFailures: 0, $unset: { pinLockedUntil: 1 } });
    return;
  }
  const updated = await User.findOneAndUpdate({ _id: user._id }, { $inc: { pinFailures: 1 } }, { returnDocument: "after" });
  if (updated.pinFailures >= MAX_PIN_FAILURES) {
    await User.updateOne({ _id: user._id }, { pinFailures: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) });
    throw new HttpError(423, "Too many wrong PINs. Your PIN is locked for 15 minutes.");
  }
  const left = MAX_PIN_FAILURES - updated.pinFailures;
  throw badRequest(`Incorrect PIN. ${left} ${left === 1 ? "try" : "tries"} left.`, { pin: "Incorrect PIN." });
}

// Only verified, unblocked users can move money or trade.
export function assertCanTransact(user) {
  if (user.blocked) throw new HttpError(403, "Your account is blocked. Please contact support.");
  if (user.kyc?.status === "pending") throw new HttpError(403, "Your KYC is still under review. You can trade once it is approved.");
  if (user.kyc?.status === "rejected") throw new HttpError(403, "Your KYC was rejected. Please contact support.");
}
