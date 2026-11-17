import { Router } from "express";
import rateLimit from "express-rate-limit";
import { productByKey } from "../catalog.js";
import { config } from "../config.js";
import { db, withTransaction } from "../db.js";
import { HttpError, badRequest, validator } from "../errors.js";
import { requireUser } from "../middleware/auth.js";
import { quoteInRupees, toRupees } from "../money.js";
import { documentsOf, getUserById } from "../records.js";
import { checkDocs, kycUpload, storeDocs } from "../services/kyc.js";
import { sendOtp, verifyOtp } from "../services/otp.js";
import { createPaymentOrder, verifyCheckout } from "../services/payments.js";
import { checkSecret, hashSecret, passwordProblem } from "../services/security.js";
import { userToken } from "../services/tokens.js";
import { placeOrder } from "../services/trade.js";
import { requestDeposit, requestWithdrawal } from "../services/wallet.js";
import { meView, orderView, sessionUser, txnView, walletView } from "../services/views.js";

// Everything about the logged-in user: GET /api/me, wallet, holdings, orders, security
const router = Router();
router.use(requireUser);

const secretLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { error: "Too many attempts. Please wait 15 minutes." },
});

async function requirePassword(user, password) {
  if (!(await checkSecret(password, user.passwordHash))) {
    throw badRequest("Your current password is wrong.", { currentPassword: "Wrong password." });
  }
}

const fresh = (req) => getUserById(db, req.user.id);
const docKeys = async (userId) => (await documentsOf(db, userId)).map((d) => d.key);

router.get("/", async (req, res) => {
  res.json({ user: meView(req.user, await docKeys(req.user.id)) });
});

/* ---------- Settings and security ---------- */

// Body: { marketing?, twoFactor?, password (needed to change twoFactor) }
router.patch("/settings", secretLimit, async (req, res) => {
  const { marketing, twoFactor, password } = req.body || {};
  if (marketing === undefined && twoFactor === undefined) throw badRequest("Nothing to change.");
  if (marketing !== undefined) {
    if (typeof marketing !== "boolean") throw badRequest("marketing must be true or false.");
    await db.query("UPDATE users SET consent_marketing = $2 WHERE id = $1", [req.user.id, marketing]);
  }
  if (twoFactor !== undefined) {
    if (typeof twoFactor !== "boolean") throw badRequest("twoFactor must be true or false.");
    await requirePassword(req.user, password);
    await db.query("UPDATE users SET two_factor = $2 WHERE id = $1", [req.user.id, twoFactor]);
  }
  res.json({ user: meView(await fresh(req), await docKeys(req.user.id)) });
});

// Body: { currentPassword, newPassword }. Signs out other devices; returns a new token for this one.
router.post("/password", secretLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  await requirePassword(req.user, currentPassword);
  const problem = passwordProblem(newPassword);
  if (problem) throw badRequest(problem, { newPassword: problem });
  if (await checkSecret(newPassword, req.user.passwordHash)) throw badRequest("Choose a password you haven't used here.", { newPassword: "Same as before." });
  await db.query("UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1", [req.user.id, await hashSecret(newPassword)]);
  const user = await fresh(req);
  res.json({ token: userToken(user), user: sessionUser(user) });
});

// Step 1 of a PIN reset: OTP to the registered mobile
router.post("/pin/otp", secretLimit, async (req, res) => {
  await sendOtp("reset-pin", "mobile", req.user.mobile);
  res.json({ sent: true, ...(config.otpDevMode && { devMode: true }) });
});

// Step 2. Body: { password, code, pin }
router.post("/pin", secretLimit, async (req, res) => {
  const { password, code, pin } = req.body || {};
  await requirePassword(req.user, password);
  if (!/^\d{6}$/.test(String(pin ?? ""))) throw badRequest("Your new PIN must be 6 digits.", { pin: "6 digits." });
  await verifyOtp("reset-pin", "mobile", req.user.mobile, code);
  await db.query("UPDATE users SET pin_hash = $2, pin_failures = 0, pin_locked_until = NULL WHERE id = $1", [req.user.id, await hashSecret(pin)]);
  res.json({ reset: true });
});

// Signs out every device, including this one
router.post("/logout-all", async (req, res) => {
  await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [req.user.id]);
  res.json({ loggedOut: true });
});

/* ---------- KYC re-upload (after a rejection, or while under review) ---------- */

router.post("/kyc/documents", kycUpload, async (req, res) => {
  if (req.user.kyc?.status === "verified") throw new HttpError(409, "Your KYC is already verified.");
  const v = validator();
  const keys = checkDocs(req.files, v, { required: false });
  v.done();
  if (!keys.length) throw badRequest("Choose at least one document to upload.");

  await withTransaction(async (tx) => {
    await storeDocs(tx, req.user.id, req.files, keys);
    await tx.query("UPDATE users SET kyc_status = 'pending', kyc_note = NULL, kyc_reviewed_at = NULL WHERE id = $1", [req.user.id]);
  });
  res.json({ user: meView(await fresh(req), await docKeys(req.user.id)) });
});

/* ---------- Godown, passbook, orders ---------- */

// "My godown": bags held, valued at today's mandi rate
router.get("/holdings", async (req, res) => {
  const { rows } = await db.query(
    `SELECT h.product, h.city, h.bags, h.avg_cost_paise, r.today, r.yesterday,
            ARRAY(SELECT c FROM (SELECT c, day FROM rate_history x WHERE x.rate_id = r.id ORDER BY day DESC LIMIT 7) t ORDER BY day) AS trend
     FROM holdings h
     LEFT JOIN rates r ON r.product = h.product AND r.city = h.city
     WHERE h.user_id = $1 AND h.bags > 0
     ORDER BY h.updated_at DESC`,
    [req.user.id]
  );
  res.json({
    holdings: rows.map((h) => {
      const p = productByKey(h.product);
      const avg = toRupees(h.avg_cost_paise);
      const ltp = h.today ?? avg;
      return {
        id: `${h.city}|${h.product}`,
        product: h.product,
        name: p?.name ?? h.product,
        pack: p?.pack ?? "",
        city: h.city,
        bags: h.bags,
        avgCost: avg,
        ltp,
        prev: h.yesterday ?? ltp,
        trend: h.trend?.length ? h.trend.map(Number) : [ltp],
      };
    }),
  });
});

// Passbook, newest first: GET /api/me/transactions?limit=100
router.get("/transactions", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const { rows } = await db.query(
    "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2",
    [req.user.id, limit]
  );
  res.json({ transactions: rows.map(txnView) });
});

router.get("/orders", async (req, res) => {
  const { rows } = await db.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200", [req.user.id]);
  res.json({ orders: rows.map((o) => orderView(o, req.user.clientId)) });
});

// Body: { side: "Buy"|"Sell", product, city, bags, pin }
router.post("/orders", async (req, res) => {
  const { order, bill } = await placeOrder(req.user, req.body || {});
  res.status(201).json({ order: orderView(order, req.user.clientId), bill: quoteInRupees(bill), wallet: walletView(await fresh(req)) });
});

/* ---------- Wallet ---------- */

// Body: { amount, method: "UPI"|"Bank transfer", upiApp, upiId, utr }
router.post("/wallet/deposits", async (req, res) => {
  const { request, txn } = await requestDeposit(req.user, req.body || {});
  res.status(201).json({ requestId: request.req_id, transaction: txnView(txn), wallet: walletView(await fresh(req)) });
});

// Online payment, step 1. Body: { amount }. Returns what Razorpay Checkout needs.
router.post("/wallet/payments", async (req, res) => {
  res.status(201).json({ checkout: await createPaymentOrder(req.user, req.body?.amount) });
});

// Online payment, step 2. Body: { orderId, paymentId, signature } from Razorpay Checkout
router.post("/wallet/payments/verify", async (req, res) => {
  const { status, txn } = await verifyCheckout(req.user, req.body || {});
  res.json({ status, transaction: txn ? txnView(txn) : null, wallet: walletView(await fresh(req)) });
});

// Body: { amount, pin }
router.post("/wallet/withdrawals", async (req, res) => {
  const { request, txn } = await requestWithdrawal(req.user, req.body || {});
  res.status(201).json({ requestId: request.req_id, transaction: txnView(txn), wallet: walletView(await fresh(req)) });
});

export default router;
