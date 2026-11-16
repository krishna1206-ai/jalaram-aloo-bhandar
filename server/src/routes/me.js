import { Router } from "express";
import rateLimit from "express-rate-limit";
import { productByKey } from "../catalog.js";
import { config } from "../config.js";
import { HttpError, badRequest, validator } from "../errors.js";
import { requireUser } from "../middleware/auth.js";
import { quoteInRupees, toRupees } from "../money.js";
import { Holding, Order, Rate, Transaction, User } from "../models/index.js";
import { deleteFiles } from "../services/files.js";
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
  keyGenerator: (req) => String(req.user._id),
  message: { error: "Too many attempts. Please wait 15 minutes." },
});

async function requirePassword(user, password) {
  if (!(await checkSecret(password, user.passwordHash))) {
    throw badRequest("Your current password is wrong.", { currentPassword: "Wrong password." });
  }
}

const fresh = (req) => User.findById(req.user._id);

router.get("/", (req, res) => {
  res.json({ user: meView(req.user) });
});

/* ---------- Settings and security ---------- */

// Body: { marketing?, twoFactor?, password (needed to change twoFactor) }
router.patch("/settings", secretLimit, async (req, res) => {
  const { marketing, twoFactor, password } = req.body || {};
  const set = {};
  if (marketing !== undefined) {
    if (typeof marketing !== "boolean") throw badRequest("marketing must be true or false.");
    set["consents.marketing"] = marketing;
  }
  if (twoFactor !== undefined) {
    if (typeof twoFactor !== "boolean") throw badRequest("twoFactor must be true or false.");
    await requirePassword(req.user, password);
    set.twoFactor = twoFactor;
  }
  if (!Object.keys(set).length) throw badRequest("Nothing to change.");
  await User.updateOne({ _id: req.user._id }, { $set: set });
  res.json({ user: meView(await fresh(req)) });
});

// Body: { currentPassword, newPassword }. Signs out other devices; returns a new token for this one.
router.post("/password", secretLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  await requirePassword(req.user, currentPassword);
  const problem = passwordProblem(newPassword);
  if (problem) throw badRequest(problem, { newPassword: problem });
  if (await checkSecret(newPassword, req.user.passwordHash)) throw badRequest("Choose a password you haven't used here.", { newPassword: "Same as before." });
  req.user.passwordHash = await hashSecret(newPassword);
  req.user.tokenVersion = (req.user.tokenVersion ?? 0) + 1;
  await req.user.save();
  res.json({ token: userToken(req.user), user: sessionUser(req.user) });
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
  await User.updateOne({ _id: req.user._id }, { pinHash: await hashSecret(pin), pinFailures: 0, $unset: { pinLockedUntil: 1 } });
  res.json({ reset: true });
});

// Signs out every device, including this one
router.post("/logout-all", async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.json({ loggedOut: true });
});

/* ---------- KYC re-upload (after a rejection, or while under review) ---------- */

router.post("/kyc/documents", kycUpload, async (req, res) => {
  if (req.user.kyc?.status === "verified") throw new HttpError(409, "Your KYC is already verified.");
  const v = validator();
  const keys = checkDocs(req.files, v, { required: false });
  v.done();
  if (!keys.length) throw badRequest("Choose at least one document to upload.");

  const { documents } = await storeDocs(req.files, keys, req.user.mobile);
  const replaced = req.user.documents.filter((d) => keys.includes(d.key));
  req.user.documents = [...req.user.documents.filter((d) => !keys.includes(d.key)), ...documents];
  req.user.kyc = { status: "pending", note: "", reviewedAt: undefined };
  await req.user.save();
  await deleteFiles(replaced.map((d) => d.fileId));
  res.json({ user: meView(req.user) });
});

// "My godown": bags held, valued at today's mandi rate
router.get("/holdings", async (req, res) => {
  const holdings = await Holding.find({ user: req.user._id, bags: { $gt: 0 } }).sort({ updatedAt: -1 }).lean();
  if (!holdings.length) return res.json({ holdings: [] });
  const rates = await Rate.find(
    { $or: holdings.map((h) => ({ product: h.product, city: h.city })) },
    { product: 1, city: 1, today: 1, yesterday: 1 }
  )
    .slice("history", -7)
    .lean();
  const rateOf = (h) => rates.find((r) => r.product === h.product && r.city === h.city);

  res.json({
    holdings: holdings.map((h) => {
      const p = productByKey(h.product);
      const r = rateOf(h);
      return {
        id: `${h.city}|${h.product}`,
        product: h.product,
        name: p?.name ?? h.product,
        pack: p?.pack ?? "",
        city: h.city,
        bags: h.bags,
        avgCost: toRupees(h.avgCostPaise),
        ltp: r?.today ?? toRupees(h.avgCostPaise),
        prev: r?.yesterday ?? r?.today ?? toRupees(h.avgCostPaise),
        trend: r?.history?.length ? r.history.map((c) => c.c) : [r?.today ?? toRupees(h.avgCostPaise)],
      };
    }),
  });
});

// Passbook, newest first: GET /api/me/transactions?limit=100
router.get("/transactions", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const txns = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  res.json({ transactions: txns.map(txnView) });
});

router.get("/orders", async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ orders: orders.map((o) => orderView(o, req.user)) });
});

// Body: { side: "Buy"|"Sell", product, city, bags, pin }
router.post("/orders", async (req, res) => {
  const { order, bill } = await placeOrder(req.user, req.body || {});
  const fresh = await req.user.constructor.findById(req.user._id);
  res.status(201).json({ order: orderView(order, req.user), bill: quoteInRupees(bill), wallet: walletView(fresh) });
});

// Body: { amount, method: "UPI"|"Bank transfer", upiApp, upiId, utr }
router.post("/wallet/deposits", async (req, res) => {
  const { request, txn } = await requestDeposit(req.user, req.body || {});
  res.status(201).json({ requestId: request.reqId, transaction: txnView(txn), wallet: walletView(req.user) });
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
  const fresh = await req.user.constructor.findById(req.user._id);
  res.status(201).json({ requestId: request.reqId, transaction: txnView(txn), wallet: walletView(fresh) });
});

export default router;
