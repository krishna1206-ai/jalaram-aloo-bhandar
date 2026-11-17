import { Router } from "express";
import { PRODUCTS, cityByName, productByKey } from "../catalog.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError, badRequest } from "../errors.js";
import { requireAdmin } from "../middleware/auth.js";
import { toRupees } from "../money.js";
import { documentsOf, getUser, userFromRow } from "../records.js";
import { seedDemoData } from "../seed.js";
import { audit } from "../services/audit.js";
import { notifyUser } from "../services/notify.js";
import { setRate } from "../services/rates.js";
import { checkSecret, hashSecret } from "../services/security.js";
import { adminToken } from "../services/tokens.js";
import { decideRequest } from "../services/wallet.js";
import { adminUserDetail, adminUserView, orderView, requestView } from "../services/views.js";

const router = Router();
router.use(requireAdmin);

const rateView = (r) => ({ city: r.city, today: r.today, yesterday: r.yesterday, low: r.low, high: r.high, arrivals: r.arrivals, updatedAt: r.updated_at });

// Everything the admin panel shows, in one call
router.get("/overview", async (req, res) => {
  const [users, requests, orders, rates] = await Promise.all([
    db.query("SELECT * FROM users ORDER BY created_at DESC LIMIT 2000"),
    db.query(
      `SELECT w.*, u.client_id FROM wallet_requests w JOIN users u ON u.id = w.user_id
       ORDER BY w.created_at DESC, w.id DESC LIMIT 1000`
    ),
    db.query(
      `SELECT o.*, u.client_id FROM orders o JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC, o.id DESC LIMIT 1000`
    ),
    db.query("SELECT * FROM rates ORDER BY city"),
  ]);
  const shown = new Set(users.rows.map((u) => u.id));
  // Requests/orders of users beyond the first 2000 still need a name in the tables
  const missing = [...new Set([...requests.rows, ...orders.rows].map((x) => x.user_id).filter((id) => !shown.has(id)))];
  const extra = missing.length ? (await db.query("SELECT * FROM users WHERE id = ANY($1)", [missing])).rows : [];

  res.json({
    users: users.rows.map((r) => adminUserView(userFromRow(r))),
    extraUsers: extra.map((r) => adminUserView(userFromRow(r))),
    walletRequests: requests.rows.map((r) => requestView(r)),
    orders: orders.rows.map((o) => orderView(o)),
    rates: Object.fromEntries(PRODUCTS.map((p) => [p.key, rates.rows.filter((r) => r.product === p.key).map(rateView)])),
    demoMode: config.seedDemo,
  });
});

/* ---------- Users and KYC ---------- */

const userByClientId = (clientId) => getUser(db, "client_id = $1", [String(clientId)]);

router.get("/users/:clientId", async (req, res) => {
  const user = await userByClientId(req.params.clientId);
  if (!user) throw new HttpError(404, "User not found.");
  res.json({ user: adminUserDetail(user, await documentsOf(db, user.id)) });
});

// Body: { kyc?: "verified"|"rejected"|"pending", note?: string (reason for rejection), blocked?: boolean }
router.patch("/users/:clientId", async (req, res) => {
  const { kyc, note, blocked } = req.body || {};
  const sets = [];
  const params = [String(req.params.clientId)];
  const add = (sql, value) => {
    params.push(value);
    sets.push(sql.replace("?", `$${params.length}`));
  };
  let reason = "";
  if (kyc !== undefined) {
    if (!["pending", "verified", "rejected"].includes(kyc)) throw badRequest("kyc must be pending, verified or rejected.");
    reason = String(note ?? "").trim().slice(0, 300);
    if (kyc === "rejected" && !reason) throw badRequest("Give a reason so the user knows what to fix.", { note: "Required." });
    add("kyc_status = ?", kyc);
    add("kyc_note = ?", kyc === "rejected" ? reason : null);
    sets.push("kyc_reviewed_at = now()");
  }
  if (blocked !== undefined) {
    if (typeof blocked !== "boolean") throw badRequest("blocked must be true or false.");
    add("blocked = ?", blocked);
  }
  if (!sets.length) throw badRequest("Nothing to change.");
  const { rows } = await db.query(`UPDATE users SET ${sets.join(", ")} WHERE client_id = $1 RETURNING *`, params);
  const user = userFromRow(rows[0]);
  if (!user) throw new HttpError(404, "User not found.");

  if (kyc !== undefined) {
    audit(req, `kyc.${kyc}`, user.clientId, kyc === "rejected" ? { note: reason } : undefined);
    if (kyc === "verified") notifyUser(user, "Your KYC is approved", "Your account is verified. You can now add money and start trading.");
    if (kyc === "rejected") {
      notifyUser(user, "Your KYC needs attention", `We couldn't verify your KYC: ${reason}\n\nPlease log in and upload the corrected documents from My account.`);
    }
  }
  if (blocked !== undefined) audit(req, blocked ? "user.block" : "user.unblock", user.clientId);
  res.json({ user: adminUserView(user) });
});

// One KYC document: GET /api/admin/users/JAB-2026-004901/documents/panCard
router.get("/users/:clientId/documents/:key", async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.content_type, d.data FROM kyc_documents d JOIN users u ON u.id = d.user_id
     WHERE u.client_id = $1 AND d.doc_key = $2`,
    [String(req.params.clientId), String(req.params.key)]
  );
  if (!rows[0]) throw new HttpError(404, "Document not found.");
  res.set({
    "Content-Type": rows[0].content_type,
    "Content-Disposition": `inline; filename="${String(req.params.key).replace(/[^\w]/g, "")}"`,
    "Cache-Control": "private, no-store",
  });
  res.send(rows[0].data);
});

/* ---------- Wallet requests ---------- */

// Body: { approve: boolean }
router.post("/wallet-requests/:reqId/decision", async (req, res) => {
  if (typeof req.body?.approve !== "boolean") throw badRequest("approve must be true or false.");
  const approve = req.body.approve;
  const { request, user } = await decideRequest(req.admin, String(req.params.reqId), approve);
  const rupees = toRupees(request.amount_paise);
  audit(req, `wallet.${approve ? "approve" : "reject"}`, request.req_id, { user: user.clientId, type: request.type, amount: rupees });

  const what = `${request.type === "in" ? "deposit" : "withdrawal"} of ₹${rupees.toLocaleString("en-IN")}`;
  notifyUser(
    user,
    `Your ${request.type === "in" ? "deposit" : "withdrawal"} was ${approve ? "approved" : "rejected"}`,
    approve
      ? request.type === "in" ? `Your ${what} has been added to your wallet.` : `Your ${what} has been sent to your bank account.`
      : `Your ${what} was not approved.${request.type === "out" ? " The money is back in your wallet." : ""} Contact support if you have questions.`
  );
  res.json({ request: requestView(request, user.clientId), user: adminUserView(user) });
});

/* ---------- Mandi rates ---------- */

// Body: { today, low, high, arrivals }
router.put("/rates/:product/:city", async (req, res) => {
  if (!productByKey(req.params.product) || !cityByName(req.params.city)) throw new HttpError(404, "Unknown product or city.");
  const r = await setRate(req.params.product, req.params.city, req.body || {});
  audit(req, "rate.update", `${r.product}/${r.city}`, { today: r.today, low: r.low, high: r.high, arrivals: r.arrivals });
  res.json({ rate: rateView(r) });
});

/* ---------- Demo ---------- */

router.post("/reset-demo", async (req, res) => {
  if (!config.seedDemo) throw new HttpError(403, "Demo reset is turned off on this server.");
  await seedDemoData({ reset: true });
  audit(req, "demo.reset", "all");
  res.json({ reset: true });
});

/* ---------- Audit log and admin account ---------- */

router.get("/audit", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const { rows } = await db.query("SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1", [limit]);
  res.json({
    entries: rows.map((r) => ({
      id: String(r.id),
      admin: r.admin_name,
      action: r.action,
      target: r.target,
      detail: r.detail,
      time: new Date(r.created_at).getTime(),
    })),
  });
});

// Body: { currentPassword, newPassword }. Signs out other admin sessions.
router.post("/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!(await checkSecret(currentPassword, req.admin.password_hash))) throw badRequest("Your current password is wrong.", { currentPassword: "Wrong." });
  if (typeof newPassword !== "string" || newPassword.length < 10) throw badRequest("Use at least 10 characters.", { newPassword: "Too short." });
  const { rows } = await db.query(
    "UPDATE admins SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING *",
    [req.admin.id, await hashSecret(newPassword)]
  );
  audit(req, "admin.password", req.admin.username);
  res.json({ token: adminToken(rows[0]) });
});

export default router;
