import jwt from "jsonwebtoken";
import { config } from "../config.js";

const sign = (payload, expiresIn) => jwt.sign(payload, config.jwtSecret, { expiresIn, algorithm: "HS256" });

// `v` is the account's tokenVersion: bumping it signs out every device
export const userToken = (user) => sign({ sub: String(user._id), role: "user", v: user.tokenVersion ?? 0 }, config.userTokenTtl);
export const adminToken = (admin) => sign({ sub: String(admin._id), role: "admin", v: admin.tokenVersion ?? 0 }, config.adminTokenTtl);

// Proves that a mobile number or email passed OTP. Used once, at registration.
export const verifiedToken = (channel, target) => sign({ role: "verified", channel, target }, "30m");

// Password was right, OTP still needed (two-step login)
export const loginChallenge = (user) => sign({ sub: String(user._id), role: "login-challenge", v: user.tokenVersion ?? 0 }, "10m");

export function readToken(token, role) {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    return payload.role === role ? payload : null;
  } catch {
    return null;
  }
}
