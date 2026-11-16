import { CITIES, PRODUCTS } from "../catalog.js";
import { badRequest } from "../errors.js";
import { Rate } from "../models/index.js";

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 366;

// Mandi days follow Indian time
export const dayKey = (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const dayStart = (key) => new Date(`${key}T00:00:00+05:30`);

const round2 = (n) => Math.round(n * 100) / 100;

// Current rate as the Explore page shows it
export function publicRate(r) {
  const closes = (r.history || []).map((c) => c.c);
  return {
    product: r.product,
    city: r.city,
    price: r.today,
    yesterday: r.yesterday,
    change: r.yesterday ? round2(((r.today - r.yesterday) / r.yesterday) * 100) : 0,
    min: r.low,
    max: r.high,
    arrivals: r.arrivals,
    trend: closes.length ? closes.slice(-7) : [r.today],
    day: r.day,
    updatedAt: r.updatedAt,
  };
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

  const rate = await Rate.findOne({ product, city });
  if (!rate) throw badRequest("Unknown product or city.");

  const key = dayKey();
  if (rate.day !== key) {
    rate.yesterday = rate.today;
    rate.day = key;
    rate.history.push({ t: dayStart(key), o: rate.yesterday, h: Math.max(high, rate.yesterday), l: Math.min(low, rate.yesterday), c: today, v: arrivals });
    if (rate.history.length > HISTORY_DAYS + 30) rate.history.splice(0, rate.history.length - HISTORY_DAYS);
  } else {
    const last = rate.history.at(-1);
    if (last) Object.assign(last, { h: Math.max(high, last.o), l: Math.min(low, last.o), c: today, v: arrivals });
  }
  Object.assign(rate, { today, low, high, arrivals });
  await rate.save();
  return rate;
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
      t: new Date(todayStart - (closes.length - 1 - i) * DAY),
      o: round2(o),
      h: round2(last ? Math.max(r.high, o) : Math.max(o, c) * (1 + rnd() * 0.012)),
      l: round2(last ? Math.min(r.low, o) : Math.min(o, c) * (1 - rnd() * 0.012)),
      c: round2(c),
      v: last ? r.arrivals : Math.round(r.arrivals * (0.5 + rnd())),
    };
  });
}

export async function seedRates({ force = false } = {}) {
  if (!force && (await Rate.estimatedDocumentCount()) > 0) return 0;
  if (force) await Rate.deleteMany({});
  const day = dayKey();
  const docs = [];
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
      r = { product: p.key, city: c.name, day, ...r };
      r.history = buildHistory(r, `${p.key}|${c.name}|history`);
      docs.push(r);
    }
  }
  await Rate.insertMany(docs);
  return docs.length;
}
