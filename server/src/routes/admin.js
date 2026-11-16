import { Router } from "express";
import { PRODUCTS, cityByName, productByKey } from "../catalog.js";
import { config } from "../config.js";
import { HttpError, badRequest } from "../errors.js";
import { requireAdmin } from "../middleware/auth.js";
import { Order, Rate, User, WalletRequest } from "../models/index.js";
import { seedDemoData } from "../seed.js";
import { openFile } from "../services/files.js";
import { setRate } from "../services/rates.js";
import { decideRequest } from "../services/wallet.js";
import { adminUserDetail, adminUserView, orderView, requestView } from "../services/views.js";

const router = Router();
router.use(requireAdmin);

const ratesByProduct = async () => {
  const rates = await Rate.find({}, { history: 0 }).lean();
  return Object.fromEntries(
    PRODUCTS.map((p) => [
      p.key,
      rates
        .filter((r) => r.product === p.key)
        .map(({ city, today, yesterday, low, high, arrivals, updatedAt }) => ({ city, today, yesterday, low, high, arrivals, updatedAt })),
    ])
  );
};

// Everything the admin panel shows, in one call
router.get("/overview", async (req, res) => {
  const [users, requests, orders, rates] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).limit(2000).lean(),
    WalletRequest.find({}).sort({ createdAt: -1 }).limit(1000).lean(),
    Order.find({}).sort({ createdAt: -1 }).limit(1000).lean(),
    ratesByProduct(),
  ]);
  const byId = new Map(users.map((u) => [String(u._id), u]));
  // Requests/orders of users beyond the first 2000 still need a name
  const missing = [...new Set([...requests, ...orders].map((x) => String(x.user)).filter((id) => !byId.has(id)))];
  if (missing.length) (await User.find({ _id: { $in: missing } }).lean()).forEach((u) => byId.set(String(u._id), u));
  const userOf = (x) => byId.get(String(x.user));

  res.json({
    users: users.map(adminUserView),
    extraUsers: missing.map((id) => byId.get(id)).filter(Boolean).map(adminUserView),
    walletRequests: requests.map((r) => requestView(r, userOf(r))),
    orders: orders.map((o) => orderView(o, userOf(o))),
    rates,
    demoMode: config.seedDemo,
  });
});

/* ---------- Users and KYC ---------- */

router.get("/users/:clientId", async (req, res) => {
  const user = await User.findOne({ clientId: req.params.clientId }).lean();
  if (!user) throw new HttpError(404, "User not found.");
  res.json({ user: adminUserDetail(user) });
});

// Body: { kyc?: "verified"|"rejected"|"pending", blocked?: boolean }
router.patch("/users/:clientId", async (req, res) => {
  const changes = {};
  const { kyc, blocked } = req.body || {};
  if (kyc !== undefined) {
    if (!["pending", "verified", "rejected"].includes(kyc)) throw badRequest("kyc must be pending, verified or rejected.");
    changes["kyc.status"] = kyc;
    changes["kyc.reviewedAt"] = new Date();
  }
  if (blocked !== undefined) {
    if (typeof blocked !== "boolean") throw badRequest("blocked must be true or false.");
    changes.blocked = blocked;
  }
  if (!Object.keys(changes).length) throw badRequest("Nothing to change.");
  const user = await User.findOneAndUpdate({ clientId: req.params.clientId }, { $set: changes }, { returnDocument: "after" }).lean();
  if (!user) throw new HttpError(404, "User not found.");
  res.json({ user: adminUserView(user) });
});

// Streams one KYC document: GET /api/admin/users/JAB-2026-004901/documents/panCard
router.get("/users/:clientId/documents/:key", async (req, res) => {
  const user = await User.findOne({ clientId: req.params.clientId }, { documents: 1 }).lean();
  const doc = user?.documents?.find((d) => d.key === req.params.key);
  if (!doc) throw new HttpError(404, "Document not found.");
  res.set({
    "Content-Type": doc.contentType,
    "Content-Disposition": `inline; filename="${doc.key}"`,
    "Cache-Control": "private, no-store",
  });
  await new Promise((resolve, reject) => {
    openFile(doc.fileId).on("error", reject).pipe(res).on("finish", resolve).on("error", reject);
  });
});

/* ---------- Wallet requests ---------- */

// Body: { approve: boolean }
router.post("/wallet-requests/:reqId/decision", async (req, res) => {
  if (typeof req.body?.approve !== "boolean") throw badRequest("approve must be true or false.");
  const { request, user } = await decideRequest(req.admin, req.params.reqId, req.body.approve);
  const fresh = await User.findById(user._id).lean();
  res.json({ request: requestView(request, fresh), user: adminUserView(fresh) });
});

/* ---------- Mandi rates ---------- */

// Body: { today, low, high, arrivals }
router.put("/rates/:product/:city", async (req, res) => {
  if (!productByKey(req.params.product) || !cityByName(req.params.city)) throw new HttpError(404, "Unknown product or city.");
  const r = await setRate(req.params.product, req.params.city, req.body || {});
  res.json({ rate: { city: r.city, today: r.today, yesterday: r.yesterday, low: r.low, high: r.high, arrivals: r.arrivals, updatedAt: r.updatedAt } });
});

/* ---------- Demo ---------- */

router.post("/reset-demo", async (req, res) => {
  if (!config.seedDemo) throw new HttpError(403, "Demo reset is turned off on this server.");
  await seedDemoData({ reset: true });
  res.json({ reset: true });
});

export default router;
