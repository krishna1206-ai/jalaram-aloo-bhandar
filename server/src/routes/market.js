import { Router } from "express";
import { PRODUCTS, cityByName, productByKey, publicCatalog } from "../catalog.js";
import { db } from "../db.js";
import { HttpError } from "../errors.js";
import { CHARGES, MAX_BAGS } from "../money.js";
import { dayStart, historyOf, listRates, publicRate } from "../services/rates.js";

// Public price data: no login needed
const router = Router();

router.get("/catalog", (req, res) => {
  res.json({ ...publicCatalog(), charges: CHARGES, maxBags: MAX_BAGS });
});

// GET /api/market/rates?city=Ahmedabad  or  ?product=potato  (both optional)
router.get("/rates", async (req, res) => {
  const city = req.query.city ? String(req.query.city) : null;
  const product = req.query.product ? String(req.query.product) : null;
  if (city && !cityByName(city)) throw new HttpError(404, "Unknown city.");
  if (product && !productByKey(product)) throw new HttpError(404, "Unknown product.");
  res.json({ rates: (await listRates({ city, product })).map(publicRate) });
});

// Daily candles for the price chart: GET /api/market/history?city=Ahmedabad&product=potato
router.get("/history", async (req, res) => {
  const rows = await historyOf(String(req.query.product), String(req.query.city));
  if (!rows.length) throw new HttpError(404, "No price history for that city and product.");
  res.json({ candles: rows.map((c) => ({ t: dayStart(c.day).getTime(), o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })) });
});

// National average per product, for the home page watchlist
router.get("/summary", async (req, res) => {
  const { rows } = await db.query(
    `SELECT product, AVG(today) AS today, AVG(yesterday) AS yesterday, COUNT(*)::int AS cities, MAX(updated_at) AS updated_at
     FROM rates GROUP BY product`
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.product, r]));
  res.json({
    summary: PRODUCTS.filter((p) => byKey[p.key]).map((p) => {
      const r = byKey[p.key];
      return {
        product: p.key,
        price: Math.round(r.today),
        change: Math.round(((r.today - r.yesterday) / r.yesterday) * 1000) / 10,
        cities: r.cities,
        updatedAt: r.updated_at,
      };
    }),
  });
});

export default router;
