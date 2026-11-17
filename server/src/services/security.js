import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { HttpError, badRequest } from "../errors.js";

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
  if (user.pinLockedUntil && new Date(user.pinLockedUntil) > new Date()) {
    const mins = Math.ceil((new Date(user.pinLockedUntil) - Date.now()) / 60000);
    throw new HttpError(423, `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
  if (!/^\d{6}$/.test(String(pin ?? ""))) throw badRequest("Enter your 6-digit transaction PIN.", { pin: "Required." });

  if (await checkSecret(pin, user.pinHash)) {
    if (user.pinFailures) await db.query("UPDATE users SET pin_failures = 0, pin_locked_until = NULL WHERE id = $1", [user.id]);
    return;
  }
  const { rows } = await db.query("UPDATE users SET pin_failures = pin_failures + 1 WHERE id = $1 RETURNING pin_failures", [user.id]);
  const failures = rows[0].pin_failures;
  if (failures >= MAX_PIN_FAILURES) {
    await db.query("UPDATE users SET pin_failures = 0, pin_locked_until = $2 WHERE id = $1", [user.id, new Date(Date.now() + PIN_LOCK_MS)]);
    throw new HttpError(423, "Too many wrong PINs. Your PIN is locked for 15 minutes.");
  }
  const left = MAX_PIN_FAILURES - failures;
  throw badRequest(`Incorrect PIN. ${left} ${left === 1 ? "try" : "tries"} left.`, { pin: "Incorrect PIN." });
}

// Only verified, unblocked users can move money or trade.
export function assertCanTransact(user) {
  if (user.blocked) throw new HttpError(403, "Your account is blocked. Please contact support.");
  if (user.kyc?.status === "pending") throw new HttpError(403, "Your KYC is still under review. You can trade once it is approved.");
  if (user.kyc?.status === "rejected") throw new HttpError(403, "Your KYC was rejected. Please contact support.");
}
