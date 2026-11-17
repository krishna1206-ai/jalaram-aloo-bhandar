import { CITIES, PRODUCTS } from "../catalog.js";
import { db, withTransaction } from "../db.js";
import { badRequest } from "../errors.js";

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 366;

// Mandi days follow Indian time
export const dayKey = (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const dayStart = (key) => new Date(`${key}T00:00:00+05:30`);

const round2 = (n) => Math.round(n * 100) / 100;

// Current rate as the Explore page shows it. `trend` = last closing prices, oldest first.
export function publicRate(r) {
  const trend = (r.trend || []).map(Number);
  return {
    product: r.product,
    city: r.city,
    price: r.today,
    yesterday: r.yesterday,
    change: r.yesterday ? round2(((r.today - r.yesterday) / r.yesterday) * 100) : 0,
    min: r.low,
    max: r.high,
    arrivals: r.arrivals,
    trend: trend.length ? trend : [r.today],
    day: r.day,
    updatedAt: r.updated_at,
  };
}

// Rates (optionally for one city and/or product) with their last 7 closing prices
export async function listRates({ city = null, product = null } = {}) {
  const { rows } = await db.query(
    `SELECT r.*,
            ARRAY(SELECT c FROM (SELECT c, day FROM rate_history h WHERE h.rate_id = r.id ORDER BY day DESC LIMIT 7) x ORDER BY day) AS trend
     FROM rates r
     WHERE ($1::text IS NULL OR r.city = $1) AND ($2::text IS NULL OR r.product = $2)
     ORDER BY r.product, r.city`,
    [city, product]
  );
  return rows;
}

export async function historyOf(product, city) {
  const { rows } = await db.query(
    `SELECT h.day, h.o, h.h, h.l, h.c, h.v FROM rate_history h JOIN rates r ON r.id = h.rate_id
     WHERE r.product = $1 AND r.city = $2 ORDER BY h.day`,
    [product, city]
  );
  return rows;
}

// Admin sets today's rate for one product in one city. A new day rolls today → yesterday.
export async function setRate(product, city, input) {
  const today = Number(input.today);
  const low = Number(input.low);
  const high = Number(input.high);
  const arrivals = Number(input.arrivals);
  const valid = (n) => Number.isFinite(n) && n > 0 && n < 1_000_000;
  if (![today, low, high].every(valid)) throw badRequest("Rates must be positive amounts in rupees.");
  if (!(low <= today && today <= high)) throw badRequest("Today's rate must be between the low and the high.");
  if (!Number.isInteger(arrivals) || arrivals < 0) throw badRequest("Arrivals must be a whole number of bags.");

  return withTransaction(async (tx) => {
    const { rows } = await tx.query("SELECT * FROM rates WHERE product = $1 AND city = $2 FOR UPDATE", [product, city]);
    const rate = rows[0];
    if (!rate) throw badRequest("Unknown product or city.");

    const key = dayKey();
    const newDay = rate.day !== key;
    const yesterday = newDay ? rate.today : rate.yesterday;
    // Today's candle opens at yesterday's close
    await tx.query(
      `INSERT INTO rate_history (rate_id, day, o, h, l, c, v) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (rate_id, day) DO UPDATE SET h = EXCLUDED.h, l = EXCLUDED.l, c = EXCLUDED.c, v = EXCLUDED.v`,
      [rate.id, key, yesterday, Math.max(high, yesterday), Math.min(low, yesterday), today, arrivals]
    );
    await tx.query("DELETE FROM rate_history WHERE rate_id = $1 AND day < $2::date - $3::int", [rate.id, key, HISTORY_DAYS]);
    const updated = await tx.query(
      `UPDATE rates SET today = $2, yesterday = $3, low = $4, high = $5, arrivals = $6, day = $7, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [rate.id, today, yesterday, low, high, arrivals, key]
    );
    return updated.rows[0];
  });
}

/* ---------- Seeding ---------- */

// Potato rates from the original admin page: [today, % vs yesterday, low, high, arrivals]
const POTATO_RATES = {
  Ahmedabad: [389, -1.8, 357, 426, 3092],
  Rajkot: [400, 0.0, 372, 439, 1350],
  Surat: [416, 1.7, 377, 447, 1686],
  Deesa: [332, -2.1, 301, 355, 1678],
  Mumbai: [458, -0.7, 428, 493, 4382],
  Pune: [435, 1.4, 394, 477, 3556],
  Nashik: [462, 2.2, 434, 502, 3518],
  Delhi: [412, -0.7, 376, 440, 4296],
  Agra: [344, 1.2, 320, 363, 2813],
  Lucknow: [396, 1.5, 362, 432, 3839],
  Indore: [391, -1.3, 359, 429, 3100],
  Mandsaur: [392, 0.0, 362, 421, 2302],
  Jaipur: [437, 0.5, 407, 474, 2164],
  Kolkata: [363, -0.5, 329, 391, 2039],
  Bengaluru: [480, 1.3, 439, 521, 1880],
  Hyderabad: [457, -0.7, 424, 499, 3723],
  Chennai: [447, 2.1, 407, 485, 2190],
};

function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A year of plausible daily candles that ends exactly at yesterday's and today's rate
function buildHistory(r, seed) {
  const rnd = seededRandom(seed);
  const closes = [r.today, r.yesterday];
  while (closes.length < HISTORY_DAYS) closes.push(closes.at(-1) / (1 + (rnd() - 0.485) * 0.035));
  closes.reverse();
  const todayStart = dayStart(r.day).getTime();
  return closes.map((c, i) => {
    const last = i === closes.length - 1;
    const o = i ? closes[i - 1] : c;
    return {
      day: dayKey(new Date(todayStart - (closes.length - 1 - i) * DAY + 6 * 60 * 60 * 1000)),
      o: round2(o),
      h: round2(last ? Math.max(r.high, o) : Math.max(o, c) * (1 + rnd() * 0.012)),
      l: round2(last ? Math.min(r.low, o) : Math.min(o, c) * (1 - rnd() * 0.012)),
      c: round2(c),
      v: last ? r.arrivals : Math.round(r.arrivals * (0.5 + rnd())),
    };
  });
}

// Starting rates so the site isn't empty. Admins replace them with real rates every day.
export async function seedRates({ force = false } = {}) {
  if (!force && (await db.query("SELECT 1 FROM rates LIMIT 1")).rowCount) return 0;
  const day = dayKey();
  return withTransaction(async (tx) => {
    if (force) await tx.query("DELETE FROM rates");
    let count = 0;
    for (const p of PRODUCTS) {
      for (const c of CITIES) {
        const rnd = seededRandom(`${p.key}|${c.name}|today`);
        let r;
        const fixed = p.key === "potato" && POTATO_RATES[c.name];
        if (fixed) {
          const [today, change, low, high, arrivals] = fixed;
          r = { today, yesterday: Math.round(today / (1 + change / 100)), low, high, arrivals };
        } else {
          const today = Math.round(p.base * c.f * (0.96 + rnd() * 0.08));
          r = {
            today,
            yesterday: Math.round(today / (1 + (rnd() - 0.5) * 0.05)),
            low: Math.round(today * (0.9 + rnd() * 0.03)),
            high: Math.round(today * (1.06 + rnd() * 0.04)),
            arrivals: Math.round(1300 + rnd() * 3100),
          };
        }
        r.day = day;
        const { rows } = await tx.query(
          `INSERT INTO rates (product, city, today, yesterday, low, high, arrivals, day)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [p.key, c.name, r.today, r.yesterday, r.low, r.high, r.arrivals, day]
        );
        const candles = buildHistory(r, `${p.key}|${c.name}|history`);
        // One multi-row insert per rate (366 rows)
        const values = [];
        const params = [rows[0].id];
        for (const k of candles) {
          const b = params.length;
          values.push(`($1, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
          params.push(k.day, k.o, k.h, k.l, k.c, k.v);
        }
        await tx.query(`INSERT INTO rate_history (rate_id, day, o, h, l, c, v) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`, params);
        count++;
      }
    }
    return count;
  });
}
