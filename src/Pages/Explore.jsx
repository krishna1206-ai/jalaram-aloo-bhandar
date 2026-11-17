import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Explore.css";
import PriceChart from "./Pricechart.jsx";
import Money from "../Components/Money";
import CurrencySwitch from "../Components/CurrencySwitch";
import { useMoney } from "../CurrencyContext";
import { PRODUCT_IMAGES, api } from "../api.js";
import { getUser, isLoggedIn, updateUser } from "../auth.js";

const quickBags = [1, 5, 10, 25];
const popular = ["Ahmedabad", "Mumbai", "Delhi", "Indore", "Rajkot"];

/* ---------- Helpers ---------- */
const pct = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
const perKg = (p) => p.price / p.commodity.kgPerBag;
const weekChange = (p) => ((p.trend.at(-1) - p.trend[0]) / p.trend[0]) * 100;

function spark(trend) {
  if (trend.length < 2) return "0,15 100,15";
  const lo = Math.min(...trend);
  const hi = Math.max(...trend);
  const range = hi - lo || 1;
  return trend
    .map((v, i) => `${((i / (trend.length - 1)) * 100).toFixed(1)},${(28 - ((v - lo) / range) * 26).toFixed(1)}`)
    .join(" ");
}

// Same formula as the server (server/src/money.js). The server's bill is the one that is charged.
function quoteFor(price, bags, charges) {
  const value = price * bags;
  const brokerage = value * charges.brokerageRate;
  const platformFee = charges.platformFee;
  const gst = (brokerage + platformFee) * charges.gstRate;
  return { value, brokerage, platformFee, gst, total: value + brokerage + platformFee + gst };
}

async function fetchMarket() {
  const [catalog, { rates }] = await Promise.all([
    api("/market/catalog", { as: "none" }),
    api("/market/rates", { as: "none" }),
  ]);
  return { ...catalog, rates };
}

async function fetchAccount() {
  const [{ user }, { holdings }] = await Promise.all([api("/me"), api("/me/holdings")]);
  return { user, holdings };
}

/* ---------- Page ---------- */
function Explore() {
  const { fmt } = useMoney();
  const navigate = useNavigate();
  const loggedIn = isLoggedIn();
  const firstName = (getUser()?.name || "there").split(" ")[0];

  const [market, setMarket] = useState(null); // { products, cities, charges, maxBags, rates }
  const [loadError, setLoadError] = useState("");
  const [cityName, setCityName] = useState("Ahmedabad");
  const [compareKey, setCompareKey] = useState("potato");
  const [sortAsc, setSortAsc] = useState(true);

  const [wallet, setWallet] = useState(null); // { available, onHold }
  const [holdings, setHoldings] = useState({}); // { "Ahmedabad|potato": { bags, avgCost } }
  const [toast, setToast] = useState("");

  const [investFor, setInvestFor] = useState(null);
  const [bags, setBagsState] = useState(1);
  const [pin, setPin] = useState("");
  const [investError, setInvestError] = useState("");
  const [investBusy, setInvestBusy] = useState(false);

  /* Load prices (public) and, when logged in, wallet + holdings */
  const applyAccount = useCallback(({ user, holdings: list }) => {
    setWallet(user.wallet);
    updateUser({ balance: user.wallet.available, kyc: user.kyc });
    setHoldings(Object.fromEntries(list.map((h) => [`${h.city}|${h.product}`, { bags: h.bags, avgCost: h.avgCost }])));
  }, []);
  const loadMarket = useCallback(() => fetchMarket().then(setMarket).catch((err) => setLoadError(err.message)), []);
  const loadAccount = useCallback(() => {
    if (isLoggedIn()) fetchAccount().then(applyAccount).catch(() => {});
  }, [applyAccount]);

  useEffect(() => {
    let alive = true;
    fetchMarket()
      .then((m) => alive && setMarket(m))
      .catch((err) => alive && setLoadError(err.message));
    if (isLoggedIn()) {
      fetchAccount()
        .then((a) => alive && applyAccount(a))
        .catch(() => {}); // not fatal: prices still show
    }
    return () => {
      alive = false;
    };
  }, [applyAccount]);

  const commodities = useMemo(
    () => (market?.products || []).map((p) => ({ ...p, image: PRODUCT_IMAGES[p.key] })),
    [market]
  );
  const cities = market?.cities || [];
  const states = [...new Set(cities.map((c) => c.state))];
  const citiesIn = (state) => cities.filter((c) => c.state === state);

  const priceFor = useCallback(
    (city, commodity) => {
      const r = market?.rates.find((x) => x.city === city.name && x.product === commodity.key);
      if (!r) return null;
      return { city, commodity, price: r.price, change: r.change, trend: r.trend, min: r.min, max: r.max, arrivals: r.arrivals, updatedAt: r.updatedAt };
    },
    [market]
  );

  const city = cities.find((c) => c.name === cityName) || cities[0];
  const prices = city ? commodities.map((c) => priceFor(city, c)).filter(Boolean) : [];

  const updatedAt = useMemo(() => {
    const latest = Math.max(0, ...(market?.rates || []).map((r) => new Date(r.updatedAt).getTime()));
    return latest ? new Date(latest).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
  }, [market]);

  /* City */
  const selectCity = (name) => {
    setCityName(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Invest dialog */
  const maxBags = market?.maxBags ?? 500;
  const setBags = (n) => {
    const num = Math.floor(Number(n)) || 1;
    setBagsState(Math.min(maxBags, Math.max(1, num)));
  };

  const openInvest = (p, e) => {
    if (e) e.stopPropagation(); // don't trigger the table-row click
    if (!loggedIn) {
      navigate("/login");
      return;
    }
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

  const available = wallet?.available ?? 0;
  const holdKey = investFor ? `${investFor.city.name}|${investFor.commodity.key}` : "";
  const existing = holdings[holdKey];
  const quote = investFor ? quoteFor(investFor.price, bags, market.charges) : null;
  const shortfall = quote ? Math.max(0, Math.round((quote.total - available) * 100) / 100) : 0;

  const maxAffordable = useMemo(() => {
    if (!investFor) return 0;
    let n = Math.min(Math.floor(available / investFor.price), maxBags);
    while (n > 0 && quoteFor(investFor.price, n, market.charges).total > available) n--;
    return n;
  }, [investFor, available, maxBags, market]);

  const confirmInvest = async () => {
    if (investBusy) return;
    if (shortfall > 0) {
      setInvestError("Not enough money in your wallet.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setInvestError("Enter your 6-digit transaction PIN.");
      return;
    }
    const p = investFor;
    setInvestBusy(true);
    try {
      const res = await api("/me/orders", {
        method: "POST",
        body: { side: "Buy", product: p.commodity.key, city: p.city.name, bags, pin },
      });
      setWallet(res.wallet);
      updateUser({ balance: res.wallet.available });
      setToast(`Bought ${bags} ${bags === 1 ? "bag" : "bags"} of ${p.commodity.name.toLowerCase()} in ${p.city.name}.`);
      closeInvest();
      loadAccount();
    } catch (err) {
      if (err.status === 401) navigate("/login");
      setInvestError(err.message);
      setPin("");
    } finally {
      setInvestBusy(false);
    }
  };

  /* Loading / error states */
  if (!market || !city) {
    return (
      <div className="cp-page">
        <main className="cp-main">
          {loadError ? (
            <p className="error">
              {loadError}{" "}
              <button
                type="button"
                className="cp-invest sm"
                onClick={() => {
                  setLoadError("");
                  loadMarket();
                }}
              >
                Try again
              </button>
            </p>
          ) : (
            <p className="muted">Loading today's mandi rates…</p>
          )}
        </main>
      </div>
    );
  }

  /* Compare table */
  const compareCommodity = commodities.find((c) => c.key === compareKey) || commodities[0];
  const compareRows = cities
    .map((c) => priceFor(c, compareCommodity))
    .filter(Boolean)
    .sort((a, b) => (sortAsc ? a.price - b.price : b.price - a.price));
  const byPrice = [...compareRows].sort((a, b) => a.price - b.price);
  const cheapest = byPrice[0]?.city.name;
  const dearest = byPrice[byPrice.length - 1]?.city.name;
  const myComparePrice = priceFor(city, compareCommodity)?.price ?? 0;
  const diffPct = (r) => (myComparePrice ? ((r.price - myComparePrice) / myComparePrice) * 100 : 0);

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
        <div className="cp-user" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CurrencySwitch />
          {loggedIn ? (
            <Link className="cp-link" to="/account">My account</Link>
          ) : (
            <Link className="cp-link" to="/login">Login</Link>
          )}
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
          <select id="city" value={city.name} onChange={(e) => selectCity(e.target.value)}>
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
              <button key={p} type="button" className={city.name === p ? "on" : ""} onClick={() => selectCity(p)}>
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
          {wallet && (
            <span className="cp-wallet">
              Wallet available: <strong><Money value={available} decimals={2} /></strong>
            </span>
          )}
        </div>
        {updatedAt && <p className="muted cp-note">Updated {updatedAt}</p>}

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
                  {loggedIn ? `Invest in ${p.city.name} ↗` : "Login to invest ↗"}
                </button>
              </div>
            </article>
          ))}
        </section>

        {/* PRICE CHART */}
        <PriceChart city={city} commodities={commodities} />

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
                  className={compareCommodity.key === c.key ? "on" : ""}
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
                  const mine = r.city.name === city.name;
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
                  max={maxBags}
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setBags(bags + 1)}
                  disabled={bags >= maxBags}
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
                <span>Wallet available: <strong><Money value={available} decimals={2} /></strong></span>
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

              {investError && <p className="error">{investError}</p>}

              <p className="inv-risk">
                Prices can fall and stored produce can lose weight or quality over time. A confirmed order cannot be
                cancelled. By investing you agree to the{" "}
                <Link to="/terms" target="_blank" rel="noopener">terms and conditions</Link>.
              </p>

              <div className="inv-actions">
                <button type="button" className="btn-solid" onClick={confirmInvest} disabled={shortfall > 0 || investBusy}>
                  {investBusy ? "Placing order…" : <>Pay {fmt(quote.total, 2)} &amp; invest</>}
                </button>
                <button type="button" className="btn-outline" onClick={closeInvest}>Cancel</button>
              </div>
            </section>
          </div>
        )}

        <p className="disclaimer">
          Rates are modal prices per bag at each mandi, not investment advice. Actual prices vary with quality, grade
          and time of day. All trades are settled in INR.
        </p>
      </main>
    </div>
  );
}

export default Explore;
