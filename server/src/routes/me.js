import { Router } from "express";
import { productByKey } from "../catalog.js";
import { requireUser } from "../middleware/auth.js";
import { quoteInRupees, toRupees } from "../money.js";
import { Holding, Order, Rate, Transaction } from "../models/index.js";
import { placeOrder } from "../services/trade.js";
import { requestDeposit, requestWithdrawal } from "../services/wallet.js";
import { meView, orderView, txnView, walletView } from "../services/views.js";

// Everything about the logged-in user: GET /api/me, wallet, holdings, orders
const router = Router();
router.use(requireUser);

router.get("/", (req, res) => {
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

// Body: { amount, pin }
router.post("/wallet/withdrawals", async (req, res) => {
  const { request, txn } = await requestWithdrawal(req.user, req.body || {});
  const fresh = await req.user.constructor.findById(req.user._id);
  res.status(201).json({ requestId: request.reqId, transaction: txnView(txn), wallet: walletView(fresh) });
});

export default router;
