import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import potatoImg from "../assets/images/potatoes.jpg";
import garlicImg from "../assets/images/garlic.jpg";
import onionImg from "../assets/images/onions.jpg";
import "./Explore.css";
import PriceChart from "./Pricechart.jsx";

/* ---------- Demo data ---------- */
const firstName = "Guest";
const DEMO_PIN = "123456";
const START_WALLET = 25000;
const MAX_BAGS = 500;
const quickBags = [1, 5, 10, 25];

// Charges (demo values)
const BROKERAGE_RATE = 0.005; // 0.5% of order value
const PLATFORM_FEE = 10; // ₹ per order
const GST_RATE = 0.18; // 18% GST on charges

const commodities = [
  { key: "potato", name: "Potato", pack: "20 kg bag", kgPerBag: 20, base: 420, image: potatoImg },
  { key: "onion", name: "Onion", pack: "20 kg bag", kgPerBag: 20, base: 560, image: onionImg },
  { key: "garlic", name: "Garlic", pack: "5 kg bag", kgPerBag: 5, base: 680, image: garlicImg },
];

const cities = [
  { name: "Ahmedabad", state: "Gujarat", mandi: "Jamalpur APMC" },
  { name: "Rajkot", state: "Gujarat", mandi: "Rajkot APMC" },
  { name: "Surat", state: "Gujarat", mandi: "Sardar Market APMC" },
  { name: "Vadodara", state: "Gujarat", mandi: "Vadodara APMC" },
  { name: "Mumbai", state: "Maharashtra", mandi: "Vashi APMC" },
  { name: "Pune", state: "Maharashtra", mandi: "Gultekdi Market Yard" },
  { name: "Nashik", state: "Maharashtra", mandi: "Lasalgaon APMC" },
  { name: "Indore", state: "Madhya Pradesh", mandi: "Devi Ahilya Bai Holkar Mandi" },
  { name: "Delhi", state: "Delhi", mandi: "Azadpur Mandi" },
  { name: "Agra", state: "Uttar Pradesh", mandi: "Agra Mandi" },
  { name: "Jaipur", state: "Rajasthan", mandi: "Muhana Mandi" },
  { name: "Kolkata", state: "West Bengal", mandi: "Posta Bazar" },
  { name: "Bengaluru", state: "Karnataka", mandi: "Yeshwanthpur APMC" },
  { name: "Chennai", state: "Tamil Nadu", mandi: "Koyambedu Market" },
];

const states = [...new Set(cities.map((c) => c.state))];
const citiesIn = (state) => cities.filter((c) => c.state === state);
const popular = ["Ahmedabad", "Mumbai", "Delhi", "Indore", "Rajkot"];

/* ---------- Helpers ---------- */

// Same city + commodity always gives the same "random" numbers
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

function priceFor(city, commodity) {
  const r = seededRandom(city.name + commodity.key);
  const price = Math.round((commodity.base * (0.88 + r() * 0.24)) / 5) * 5;
  const change = Math.round((r() * 8 - 3) * 10) / 10;

  // 7-day trend ending at today's price
  const trend = [price];
  for (let i = 0; i < 6; i++) {
    trend.unshift(Math.round(trend[0] * (1 + (r() - 0.5) * 0.06)));
  }

  return {
    city,
    commodity,
    price,
    change,
    trend,
    min: Math.round((price * (0.9 + r() * 0.04)) / 5) * 5,
    max: Math.round((price * (1.05 + r() * 0.05)) / 5) * 5,
    arrivals: Math.round(500 + r() * 4500),
  };
}

const formatINR = (v, decimals = 0) =>
  "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// Same markup as her <app-money>: <span class="m"><span class="m-main">
function Money({ value, decimals = 0 }) {
  return (
    <span className="m">
      <span className="m-main">{formatINR(value, decimals)}</span>
    </span>
  );
}

const pct = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
const perKg = (p) => p.price / p.commodity.kgPerBag;
const weekChange = (p) => ((p.trend[6] - p.trend[0]) / p.trend[0]) * 100;

function spark(trend) {
  const lo = Math.min(...trend);
  const hi = Math.max(...trend);
  const range = hi - lo || 1;
  return trend
    .map((v, i) => `${((i / (trend.length - 1)) * 100).toFixed(1)},${(28 - ((v - lo) / range) * 26).toFixed(1)}`)
    .join(" ");
}

function quoteFor(price, bags) {
  const value = price * bags;
  const brokerage = value * BROKERAGE_RATE;
  const platformFee = PLATFORM_FEE;
  const gst = (brokerage + platformFee) * GST_RATE;
  return { value, brokerage, platformFee, gst, total: value + brokerage + platformFee + gst };
}

/* ---------- Page ---------- */
function Explore() {
  const [cityName, setCityName] = useState("Ahmedabad");
  const [compareKey, setCompareKey] = useState("potato");
  const [sortAsc, setSortAsc] = useState(true);

  const [wallet, setWallet] = useState(START_WALLET);
  const [holdings, setHoldings] = useState({}); // { "Ahmedabad|potato": { bags, avgCost } }
  const [toast, setToast] = useState("");

  const [investFor, setInvestFor] = useState(null);
  const [bags, setBagsState] = useState(1);
  const [pin, setPin] = useState("");
  const [investError, setInvestError] = useState("");

  const city = cities.find((c) => c.name === cityName);
  const prices = commodities.map((c) => priceFor(city, c));

  const updatedAt = useMemo(
    () => new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    []
  );

  /* City */
  const selectCity = (name) => {
    setCityName(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Compare table */
  const compareCommodity = commodities.find((c) => c.key === compareKey);
  const compareRows = cities
    .map((c) => priceFor(c, compareCommodity))
    .sort((a, b) => (sortAsc ? a.price - b.price : b.price - a.price));
  const byPrice = [...compareRows].sort((a, b) => a.price - b.price);
  const cheapest = byPrice[0].city.name;
  const dearest = byPrice[byPrice.length - 1].city.name;
  const myComparePrice = priceFor(city, compareCommodity).price;
  const diffPct = (r) => ((r.price - myComparePrice) / myComparePrice) * 100;

  /* Invest dialog */
  const setBags = (n) => {
    const num = Math.floor(Number(n)) || 1;
    setBagsState(Math.min(MAX_BAGS, Math.max(1, num)));
  };

  const openInvest = (p, e) => {
    if (e) e.stopPropagation(); // don't trigger the table-row click
    setInvestFor(p);
    setBagsState(1);
    setPin("");
    setInvestError("");
  };
  const closeInvest = () => setInvestFor(null);

  // Close the dialog with the Esc key
  useEffect(() => {
    if (!investFor) return;
    const onKey = (e) => e.key === "Escape" && closeInvest();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [investFor]);

  const holdKey = investFor ? `${investFor.city.name}|${investFor.commodity.key}` : "";
  const existing = holdings[holdKey];
  const quote = investFor ? quoteFor(investFor.price, bags) : null;
  const shortfall = quote ? Math.max(0, quote.total - wallet) : 0;

  const maxAffordable = useMemo(() => {
    if (!investFor) return 0;
    let n = Math.floor(wallet / investFor.price);
    while (n > 0 && quoteFor(investFor.price, n).total > wallet) n--;
    return Math.min(n, MAX_BAGS);
  }, [investFor, wallet]);

  const confirmInvest = () => {
    if (shortfall > 0) {
      setInvestError("Not enough money in your wallet.");
      return;
    }
    if (pin !== DEMO_PIN) {
      setInvestError("Incorrect PIN. Please try again.");
      return;
    }
    const p = investFor;
    setWallet((w) => w - quote.total);
    setHoldings((h) => {
      const old = h[holdKey] || { bags: 0, avgCost: 0 };
      const totalBags = old.bags + bags;
      const avgCost = Math.round((old.bags * old.avgCost + bags * p.price) / totalBags);
      return { ...h, [holdKey]: { bags: totalBags, avgCost } };
    });
    setToast(`Bought ${bags} ${bags === 1 ? "bag" : "bags"} of ${p.commodity.name.toLowerCase()} in ${p.city.name}.`);
    closeInvest();
  };

  return (
    <div className="cp-page">
      <header className="cp-top">
        <Link className="cp-brand" to="/">
          <span className="brand-mark">JA</span>
          <span className="cp-brand-text">
            <strong>Jalaram Aloo Bhandar</strong>
            <small>COMMODITY MARKET</small>
          </span>
        </Link>
        <div className="cp-user">
          <Link className="cp-link" to="/account">My account</Link>
        </div>
      </header>

      <section className="cp-hero">
        <div className="cp-hero-text">
          <span className="kicker">CITY MANDI RATES</span>
          <h1>
            Prices in <span>{city.name}</span>
          </h1>
          <p>
            Hi {firstName}, see today's potato, onion and garlic rates at your nearest mandi and compare them with
            other cities.
          </p>
        </div>

        <div className="cp-picker">
          <label htmlFor="city">Choose your city</label>
          <select id="city" value={cityName} onChange={(e) => selectCity(e.target.value)}>
            {states.map((s) => (
              <optgroup key={s} label={s}>
                {citiesIn(s).map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="cp-popular">
            {popular.map((p) => (
              <button key={p} type="button" className={cityName === p ? "on" : ""} onClick={() => selectCity(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="cp-main">
        {toast && (
          <div className="cp-toast" role="status">
            ✓ {toast}
            <Link to="/account?tab=holdings">View in My Godown →</Link>
          </div>
        )}

        <div className="cp-meta">
          <span>📍 {city.mandi}, {city.name}, {city.state}</span>
          <span className="cp-wallet">
            Wallet available: <strong><Money value={wallet} decimals={2} /></strong>
          </span>
        </div>
        <p className="muted cp-note">Updated {updatedAt} · Illustrative · Prices in INR</p>

        {/* TODAY'S RATES IN THE SELECTED CITY */}
        <section className="cp-grid">
          {prices.map((p) => (
            <article className="cp-card" key={p.commodity.key}>
              <img src={p.commodity.image} alt={`Fresh ${p.commodity.name}`} />
              <div className="cp-card-body">
                <div className="cp-card-top">
                  <div>
                    <strong>{p.commodity.name}</strong>
                    <small>Per {p.commodity.pack}</small>
                  </div>
                  <span className={`chg ${p.change >= 0 ? "pos" : "neg"}`}>
                    {p.change >= 0 ? "↗︎" : "↘︎"} {pct(p.change)}
                  </span>
                </div>

                <div className="cp-price"><Money value={p.price} /></div>
                <div className="cp-kg">≈ <Money value={perKg(p)} decimals={2} /> per kg</div>

                <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={spark(p.trend)} className={weekChange(p) >= 0 ? "pos" : "neg"} />
                </svg>
                <small className="muted">7 days: {pct(weekChange(p))}</small>

                <dl className="cp-stats">
                  <div><dt>Min</dt><dd><Money value={p.min} /></dd></div>
                  <div><dt>Max</dt><dd><Money value={p.max} /></dd></div>
                  <div><dt>Arrivals</dt><dd>{p.arrivals.toLocaleString("en-IN")} bags</dd></div>
                </dl>

                <button type="button" className="cp-invest" onClick={() => openInvest(p)}>
                  Invest in {p.city.name} ↗
                </button>
              </div>
            </article>
          ))}
        </section>

        {/* PRICE CHART */}
        <PriceChart city={city} commodities={commodities} priceFor={priceFor} />

        {/* COMPARE ACROSS CITIES */}
        <section className="cp-block">
          <div className="cp-block-head">
            <div>
              <span className="kicker dark">COMPARE CITIES</span>
              <h2>Where is {compareCommodity.name.toLowerCase()} cheapest today?</h2>
            </div>
            <div className="cp-pills">
              {commodities.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={compareKey === c.key ? "on" : ""}
                  onClick={() => setCompareKey(c.key)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>City</th>
                  <th className="hide-sm">Mandi</th>
                  <th className="num">
                    <button type="button" className="sort" onClick={() => setSortAsc(!sortAsc)}>
                      Rate / bag {sortAsc ? "▲" : "▼"}
                    </button>
                  </th>
                  <th className="num">Today</th>
                  <th className="num">vs {city.name}</th>
                  <th><span className="sr-only">Invest</span></th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => {
                  const mine = r.city.name === cityName;
                  const diff = diffPct(r);
                  return (
                    <tr
                      key={r.city.name}
                      className={mine ? "mine" : ""}
                      onClick={() => selectCity(r.city.name)}
                      title={`Show prices for ${r.city.name}`}
                    >
                      <td>
                        <strong>{r.city.name}</strong>
                        {r.city.name === cheapest && <span className="tag low">Lowest</span>}
                        {r.city.name === dearest && <span className="tag high">Highest</span>}
                        {mine && <span className="tag you">Your city</span>}
                        <small>{r.city.state}</small>
                      </td>
                      <td className="hide-sm muted">{r.city.mandi}</td>
                      <td className="num"><Money value={r.price} /></td>
                      <td className="num">
                        <span className={r.change >= 0 ? "pos" : "neg"}>{pct(r.change)}</span>
                      </td>
                      <td className="num">
                        {mine ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className={diff < 0 ? "pos" : diff > 0 ? "neg" : ""}>{pct(diff)}</span>
                        )}
                      </td>
                      <td className="num">
                        <button type="button" className="cp-invest sm" onClick={(e) => openInvest(r, e)}>
                          Invest
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Tap a city to see all its rates, or Invest to buy bags there. "vs" shows how much dearer (red) or cheaper
            (green) that city is than {city.name}.
          </p>
        </section>

        {/* INVEST DIALOG */}
        {investFor && (
          <div className="cp-overlay" onClick={closeInvest}>
            <section
              className="cp-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inv-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inv-head">
                <img src={investFor.commodity.image} alt="" />
                <div>
                  <span className="kicker dark">BUY · {investFor.city.mandi}</span>
                  <h3 id="inv-title">{investFor.commodity.name} in {investFor.city.name}</h3>
                  <small className="muted">
                    {investFor.commodity.pack} · rate today <Money value={investFor.price} />
                  </small>
                </div>
                <button type="button" className="close" onClick={closeInvest} aria-label="Close">✕</button>
              </div>

              {existing && (
                <p className="inv-have">
                  You already hold {existing.bags} bags here at an average of <Money value={existing.avgCost} /> per
                  bag. New bags will be added to them.
                </p>
              )}

              <label htmlFor="bags">Number of bags</label>
              <div className="stepper">
                <button type="button" onClick={() => setBags(bags - 1)} disabled={bags <= 1} aria-label="One bag less">
                  −
                </button>
                <input
                  id="bags"
                  type="number"
                  min="1"
                  max={MAX_BAGS}
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setBags(bags + 1)}
                  disabled={bags >= MAX_BAGS}
                  aria-label="One bag more"
                >
                  ＋
                </button>
                <span className="muted">= {(bags * investFor.commodity.kgPerBag).toLocaleString("en-IN")} kg</span>
              </div>
              <div className="quick-bags">
                {quickBags.map((q) => (
                  <button key={q} type="button" className={bags === q ? "on" : ""} onClick={() => setBags(q)}>
                    {q} bags
                  </button>
                ))}
                {maxAffordable > 0 && (
                  <button
                    type="button"
                    className={bags === maxAffordable ? "on" : ""}
                    onClick={() => setBags(maxAffordable)}
                  >
                    Max ({maxAffordable})
                  </button>
                )}
              </div>

              <dl className="inv-bill">
                <div>
                  <dt>Order value ({bags} × <Money value={investFor.price} />)</dt>
                  <dd><Money value={quote.value} decimals={2} /></dd>
                </div>
                <div><dt>Brokerage</dt><dd><Money value={quote.brokerage} decimals={2} /></dd></div>
                <div><dt>Platform fee</dt><dd><Money value={quote.platformFee} decimals={2} /></dd></div>
                <div><dt>GST on charges</dt><dd><Money value={quote.gst} decimals={2} /></dd></div>
                <div className="total"><dt>Total payable</dt><dd><Money value={quote.total} decimals={2} /></dd></div>
              </dl>

              <div className={`inv-wallet ${shortfall > 0 ? "short" : ""}`}>
                <span>Wallet available: <strong><Money value={wallet} decimals={2} /></strong></span>
                {shortfall > 0 && (
                  <span>
                    Short by <strong><Money value={shortfall} decimals={2} /></strong> ·{" "}
                    <Link to="/account">Add money</Link>
                  </span>
                )}
              </div>

              <label htmlFor="pin">Transaction PIN</label>
              <input
                id="pin"
                className="pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                placeholder="••••••"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ""));
                  setInvestError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && confirmInvest()}
              />
              <span className="muted small">Demo PIN: {DEMO_PIN}</span>

              {investError && <p className="error">{investError}</p>}

              <p className="inv-risk">
                Prices can fall and stored produce can lose weight or quality over time. A confirmed order cannot be
                cancelled. By investing you agree to the{" "}
                <Link to="/terms" target="_blank" rel="noopener">terms and conditions</Link>.
              </p>

              <div className="inv-actions">
                <button type="button" className="btn-solid" onClick={confirmInvest} disabled={shortfall > 0}>
                  Pay {formatINR(quote.total, 2)} &amp; invest
                </button>
                <button type="button" className="btn-outline" onClick={closeInvest}>Cancel</button>
              </div>
            </section>
          </div>
        )}

        <p className="disclaimer">
          Demo data. Rates are illustrative modal prices per bag, not live mandi rates or investment advice. Actual
          prices vary with quality, grade and time of day. All trades are settled in INR.
        </p>
      </main>
    </div>
  );
}

export default Explore;