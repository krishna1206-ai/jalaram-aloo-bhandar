import { db } from "../db.js";
import { HttpError } from "../errors.js";
import { getUserById } from "../records.js";
import { readToken } from "../services/tokens.js";

const bearer = (req) => {
  const h = req.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
};

const asId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);

export async function requireUser(req, res, next) {
  const payload = readToken(bearer(req), "user");
  const id = asId(payload?.sub);
  if (!id) throw new HttpError(401, "Please log in again.");
  const user = await getUserById(db, id);
  if (!user || (payload.v ?? 0) !== user.tokenVersion) throw new HttpError(401, "Please log in again.");
  if (user.blocked) throw new HttpError(403, "Your account is blocked. Please contact support.");
  req.user = user;
  next();
}

export async function requireAdmin(req, res, next) {
  const payload = readToken(bearer(req), "admin");
  const id = asId(payload?.sub);
  if (!id) throw new HttpError(401, "Please sign in to the admin panel again.");
  const { rows } = await db.query("SELECT * FROM admins WHERE id = $1", [id]);
  const admin = rows[0];
  if (!admin || (payload.v ?? 0) !== admin.token_version) throw new HttpError(401, "Please sign in to the admin panel again.");
  req.admin = admin;
  next();
}
