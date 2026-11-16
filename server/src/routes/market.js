import { Router } from "express";
import { PRODUCTS, cityByName, productByKey, publicCatalog } from "../catalog.js";
import { HttpError } from "../errors.js";
import { CHARGES, MAX_BAGS } from "../money.js";
import { Rate } from "../models/index.js";
import { publicRate } from "../services/rates.js";

// Public price data: no login needed
const router = Router();

router.get("/catalog", (req, res) => {
  res.json({ ...publicCatalog(), charges: CHARGES, maxBags: MAX_BAGS });
});

// GET /api/market/rates?city=Ahmedabad  or  ?product=potato  (both optional)
router.get("/rates", async (req, res) => {
  const filter = {};
  if (req.query.city) {
    if (!cityByName(req.query.city)) throw new HttpError(404, "Unknown city.");
    filter.city = req.query.city;
  }
  if (req.query.product) {
    if (!productByKey(req.query.product)) throw new HttpError(404, "Unknown product.");
    filter.product = req.query.product;
  }
  const rates = await Rate.find(filter).slice("history", -7).lean();
  res.json({ rates: rates.map(publicRate) });
});

// Daily candles for the price chart: GET /api/market/history?city=Ahmedabad&product=potato
router.get("/history", async (req, res) => {
  const { city, product } = req.query;
  const rate = await Rate.findOne({ city: String(city), product: String(product) }, { history: 1 }).lean();
  if (!rate) throw new HttpError(404, "No price history for that city and product.");
  res.json({
    candles: rate.history.map((c) => ({ t: new Date(c.t).getTime(), o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })),
  });
});

// National average per product, for the home page watchlist
router.get("/summary", async (req, res) => {
  const rows = await Rate.aggregate([
    { $group: { _id: "$product", today: { $avg: "$today" }, yesterday: { $avg: "$yesterday" }, cities: { $sum: 1 }, updatedAt: { $max: "$updatedAt" } } },
  ]);
  const byKey = Object.fromEntries(rows.map((r) => [r._id, r]));
  res.json({
    summary: PRODUCTS.filter((p) => byKey[p.key]).map((p) => {
      const r = byKey[p.key];
      return {
        product: p.key,
        price: Math.round(r.today),
        change: Math.round(((r.today - r.yesterday) / r.yesterday) * 1000) / 10,
        cities: r.cities,
        updatedAt: r.updatedAt,
      };
    }),
  });
});

export default router;
