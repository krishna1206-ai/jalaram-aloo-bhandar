import { HttpError } from "../errors.js";
import { Admin, User } from "../models/index.js";
import { readToken } from "../services/tokens.js";

const bearer = (req) => {
  const h = req.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
};

export async function requireUser(req, res, next) {
  const payload = readToken(bearer(req), "user");
  if (!payload) throw new HttpError(401, "Please log in again.");
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, "Please log in again.");
  if (user.blocked) throw new HttpError(403, "Your account is blocked. Please contact support.");
  req.user = user;
  next();
}

export async function requireAdmin(req, res, next) {
  const payload = readToken(bearer(req), "admin");
  if (!payload) throw new HttpError(401, "Please sign in to the admin panel again.");
  const admin = await Admin.findById(payload.sub);
  if (!admin) throw new HttpError(401, "Please sign in to the admin panel again.");
  req.admin = admin;
  next();
}
