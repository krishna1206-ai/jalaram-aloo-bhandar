import { db } from "../db.js";

// Records an admin action (approve, reject, block, rate change...). Never fails the request.
export function audit(req, action, target, detail) {
  return db
    .query("INSERT INTO audit_logs (admin_id, admin_name, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5, $6)", [
      req.admin?.id ?? null,
      req.admin?.username ?? null,
      action,
      target,
      detail === undefined ? null : JSON.stringify(detail),
      req.ip,
    ])
    .catch((err) => console.error("audit log failed", err.message));
}
