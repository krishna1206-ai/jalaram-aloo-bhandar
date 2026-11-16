import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { getUser, isLoggedIn, updateUser } from "../auth.js";
import { PRODUCT_IMAGES, api } from "../api.js";
import gpayIcon from "../assets/images/googlepay.svg";
import phonepeIcon from "../assets/images/phonepe.svg";
import bhimIcon from "../assets/images/bhim.svg";
import "./Account.css";
import Money from "../Components/Money";
import Navbar from "../Components/Navbar";
import { useMoney } from "../CurrencyContext";
import { payOnline } from "../razorpay.js";
import SellPanel from "./account/SellPanel.jsx";
import SecurityPanel from "./account/SecurityPanel.jsx";
import KycUpload from "./account/KycUpload.jsx";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "holdings", label: "My godown" },
  { key: "transactions", label: "Transactions" },
  { key: "profile", label: "Profile & security" },
];

const KYC_BADGE = {
  verified: { cls: "ok", label: "✓ Verified" },
  pending: { cls: "", label: "Under review" },
  rejected: { cls: "", label: "Rejected" },
};

const filters = [
  { key: "all", label: "All" },
  { key: "money", label: "Money in / out" },
  { key: "trades", label: "Buy / Sell" },
  { key: "charges", label: "Charges" },
];

// "Pay online" (Razorpay Checkout: UPI, cards, net banking) appears only when the server has it set up
const ONLINE = "Pay online";
const upiApps = [
  { name: "Google Pay", icon: gpayIcon, placeholder: "yourname@okaxis" },
  { name: "PhonePe", icon: phonepeIcon, placeholder: "yourname@ybl" },
  { name: "BHIM", icon: bhimIcon, placeholder: "yourname@upi" },
];

const quickAmounts = [500, 1000, 5000, 10000];

/* ---------- Helpers ---------- */
const inr = (v, decimals = 0) =>
  "₹" + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const pct = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
const value = (h) => h.bags * h.ltp;
const cost = (h) => h.bags * h.avgCost;
const pnl = (h) => value(h) - cost(h);
const pnlPct = (h) => (cost(h) ? (pnl(h) / cost(h)) * 100 : 0);
const dayChange = (h) => (h.prev ? ((h.ltp - h.prev) / h.prev) * 100 : 0);

function spark(trend) {
  const lo = Math.min(...trend);
  const hi = Math.max(...trend);
  const range = hi - lo || 1;
  return trend
    .map((v, i) => `${((i / (trend.length - 1)) * 100).toFixed(1)},${(28 - ((v - lo) / range) * 26).toFixed(1)}`)
    .join(" ");
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const txnIcon = (t) =>
  ({ "Added money": "＋", Withdrawal: "↑", Bought: "↓", Sold: "↗", Charges: "₹" })[t.type] || "•";

/* ---------- Page ---------- */
async function fetchAccount() {
  const [{ user }, { holdings }, { transactions }, config, { charges }] = await Promise.all([
    api("/me"),
    api("/me/holdings"),
    api("/me/transactions"),
    api("/config", { as: "none" }),
    api("/market/catalog", { as: "none" }),
  ]);
  return { user, holdings, transactions, config, charges };
}

function Account() {
  const [searchParams, setSearchParams] = useSearchParams();
  const authUser = getUser();
  const { fmt } = useMoney();

  const [hidden, setHidden] = useState(false);
  const [hideGodown, setHideGodown] = useState(false);
  const [me, setMe] = useState(null); // profile + wallet from GET /api/me
  const [holdings, setHoldings] = useState([]);
  const [txns, setTxns] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("all");
  const [appConfig, setAppConfig] = useState(null); // GET /api/config
  const [charges, setCharges] = useState(null);
  const [selling, setSelling] = useState(null); // holding being sold

  // Add / withdraw panel
  const [panel, setPanel] = useState(null); // "add" | "withdraw" | null
  const [amount, setAmountState] = useState("");
  const [method, setMethod] = useState("UPI");
  const [upiApp, setUpiApp] = useState("Google Pay");
  const [upiId, setUpiId] = useState("");
  const [utr, setUtr] = useState("");
  const [panelError, setPanelError] = useState("");

  const applyHoldings = (list) => setHoldings(list.map((h) => ({ ...h, image: PRODUCT_IMAGES[h.product] })));
  const apply = useCallback(({ user, holdings: list, transactions, config, charges: c }) => {
    setMe(user);
    setHoldings(list.map((h) => ({ ...h, image: PRODUCT_IMAGES[h.product] })));
    setTxns(transactions);
    setAppConfig(config);
    setCharges(c);
    if (config.razorpayKeyId) setMethod(ONLINE);
    updateUser({ name: user.name, balance: user.wallet.available, kyc: user.kyc });
  }, []);
  const load = useCallback(
    () => fetchAccount().then(apply).catch((err) => setLoadError(err.message)),
    [apply]
  );

  useEffect(() => {
    if (!isLoggedIn()) return;
    let alive = true;
    fetchAccount()
      .then((data) => alive && apply(data))
      .catch((err) => alive && setLoadError(err.message));
    return () => {
      alive = false;
    };
  }, [apply]);

  // Not logged in (or the session expired) → go to login
  if (!authUser || !isLoggedIn()) return <Navigate to="/login" replace />;

  if (!me) {
    return (
      <>
        <Navbar />
        <div className="acc-page">
          <main className="acc-main">
            {loadError ? (
              <p className="error">
                {loadError}{" "}
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    setLoadError("");
                    load();
                  }}
                >
                  Try again
                </button>
              </p>
            ) : (
              <p className="muted">Loading your account…</p>
            )}
          </main>
        </div>
      </>
    );
  }

  const dateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "First login");
  const user = {
    ...me,
    memberSince: new Date(me.memberSince).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    lastLogin: dateTime(me.lastLogin),
  };
  const kycBadge = KYC_BADGE[me.kyc] || KYC_BADGE.pending;
  const { available, onHold } = me.wallet;

  /* Tabs (kept in the URL: /account?tab=holdings) */
  const tabParam = searchParams.get("tab");
  const tab = tabs.some((t) => t.key === tabParam) ? tabParam : "overview";
  const selectTab = (key) => setSearchParams(key === "overview" ? {} : { tab: key });

  /* Totals */
  const balance = available + onHold;
  const godownValue = holdings.reduce((s, h) => s + value(h), 0);
  const invested = holdings.reduce((s, h) => s + cost(h), 0);
  const totalPnl = godownValue - invested;
  const totalPnlPct = invested ? (totalPnl / invested) * 100 : 0;
  const totalBags = holdings.reduce((s, h) => s + h.bags, 0);
  const cityCount = new Set(holdings.map((h) => h.city)).size;
  const todayChange = holdings.reduce((s, h) => s + h.bags * (h.ltp - h.prev), 0);
  const share = (h) => (godownValue ? (value(h) / godownValue) * 100 : 0);

  const recentTxns = txns.slice(0, 4);
  const filteredTxns = txns.filter((t) => {
    if (filter === "money") return t.type === "Added money" || t.type === "Withdrawal";
    if (filter === "trades") return t.type === "Bought" || t.type === "Sold";
    if (filter === "charges") return t.type === "Charges";
    return true;
  });

  /* Panel helpers */
  const openPanel = (type) => {
    setPanel(type);
    setAmountState("");
    setPanelError("");
    setUpiId("");
    setUtr("");
    setPin("");
    setSelling(null);
  };
  const closePanel = () => setPanel(null);
  const setAmount = (v) => {
    setAmountState(v);
    setPanelError("");
  };

  const selectedUpi = upiApps.find((a) => a.name === upiApp);
  const onlineEnabled = Boolean(appConfig?.razorpayKeyId);
  const methods = onlineEnabled ? [ONLINE, "UPI", "Bank transfer"] : ["UPI", "Bank transfer"];
  const collectAccount = appConfig?.collectAccount;

  // Refresh holdings + passbook after a sale
  const onSold = async (res, message) => {
    setSelling(null);
    setMe((m) => ({ ...m, wallet: res.wallet }));
    updateUser({ balance: res.wallet.available });
    setToast(message);
    const [{ holdings: list }, { transactions }] = await Promise.all([api("/me/holdings"), api("/me/transactions")]);
    applyHoldings(list);
    setTxns(transactions);
  };

  const payByGateway = async (amt) => {
    setBusy(true);
    try {
      const res = await payOnline(amt);
      setMe((m) => ({ ...m, wallet: res.wallet }));
      updateUser({ balance: res.wallet.available });
      if (res.transaction) setTxns((list) => [res.transaction, ...list]);
      setToast(
        res.status === "paid"
          ? `${inr(amt)} added to your wallet.`
          : `Payment received. ${inr(amt)} will show in your wallet in a minute.`
      );
      closePanel();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Send the request to the API, then refresh wallet and passbook
  const submit = async (path, body, message) => {
    setBusy(true);
    try {
      const res = await api(path, { method: "POST", body });
      setMe((m) => ({ ...m, wallet: res.wallet }));
      setTxns((list) => [res.transaction, ...list]);
      updateUser({ balance: res.wallet.available });
      setToast(message);
      closePanel();
    } catch (err) {
      setPanelError(err.message);
      if (panel === "withdraw") setPin("");
    } finally {
      setBusy(false);
    }
  };

  const confirmPanel = () => {
    if (busy) return;
    const amt = Number(amount);
    if (!amt || amt < 100) return setPanelError("Enter an amount of at least ₹100.");

    if (panel === "withdraw") {
      if (amt > available) return setPanelError("You can't withdraw more than your available balance.");
      if (!/^\d{6}$/.test(pin)) return setPanelError("Enter your 6-digit transaction PIN.");
      return submit(
        "/me/wallet/withdrawals",
        { amount: amt, pin },
        `Withdrawal of ${inr(amt)} requested. It will reach your bank in 1 business day after approval.`
      );
    }

    if (amt > 200000) return setPanelError("You can add up to ₹2,00,000 at a time.");
    if (method === ONLINE) return payByGateway(amt);
    if (method === "UPI" && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim()))
      return setPanelError("Enter a valid UPI ID, like name@bank.");
    if (method === "Bank transfer" && utr.trim().length < 6)
      return setPanelError("Enter the UTR / reference number of your transfer.");

    submit(
      "/me/wallet/deposits",
      { amount: amt, method, upiApp, upiId: upiId.trim(), utr: utr.trim() },
      method === "Bank transfer"
        ? `We'll add ${inr(amt)} once your bank transfer reaches us.`
        : `Request sent. ${inr(amt)} will be added once your UPI payment is confirmed.`
    );
  };

  return (
    <>
  
    
      <Navbar />
      <div className="acc-page">

      <main className="acc-main">
        {me.kyc !== "verified" && (
          <div className="toast">
            {me.kyc === "rejected"
              ? "Your KYC was rejected. See the reason below and upload corrected documents."
              : "Your KYC is under review. You can add money and trade once it is approved."}
          </div>
        )}
        {me.kyc === "rejected" && <KycUpload user={me} onUser={setMe} onToast={setToast} />}
        {toast && (
          <div className="toast">
            ✓ {toast}
            <button type="button" className="toast-x" onClick={() => setToast("")} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* WALLET + GODOWN SUMMARY */}
        <section className="top-grid">
          <article className="wallet">
            <div className="wallet-head">
              <span className="wallet-label">MANDI WALLET</span>
              <button type="button" className="eye" onClick={() => setHidden(!hidden)}>
                {hidden ? "Show" : "Hide"}
              </button>
            </div>

            <div className="wallet-balance">
              <small>Total balance</small>
              <h1><Money value={balance} decimals={2} hide={hidden} /></h1>
              <span className={`today ${todayChange >= 0 ? "pos" : "neg"}`}>
                {!hidden && (
                  <>
                    <span>{todayChange >= 0 ? "▲" : "▼"}</span>
                    <Money value={todayChange} decimals={2} signed />
                    <span>today</span>
                  </>
                )}
              </span>
            </div>

            <div className="wallet-split">
              <div>
                <small>Available to use</small>
                <strong><Money value={available} decimals={2} hide={hidden} /></strong>
              </div>
              <div>
                <small>On hold (open orders)</small>
                <strong><Money value={onHold} decimals={2} hide={hidden} /></strong>
              </div>
            </div>

            <div className="wallet-actions">
              <button type="button" className="btn lime" onClick={() => openPanel("add")}>＋ Add money</button>
              <button type="button" className="btn ghost" onClick={() => openPanel("withdraw")}>↑ Withdraw</button>
            </div>
          </article>

          <article className="godown-card">
            <div className="godown-head">
              <span className="kicker">YOUR GODOWN</span>
              <button type="button" className="eye light" onClick={() => setHideGodown(!hideGodown)}>
                {hideGodown ? "Show" : "Hide"}
              </button>
            </div>
            <h2><Money value={godownValue} hide={hideGodown} /></h2>
            <p className="muted">
              {totalBags} bags · {holdings.length} holdings in {cityCount} {cityCount === 1 ? "city" : "cities"}
            </p>

            <div className="godown-rows">
              <div>
                <span>Invested</span>
                <strong><Money value={invested} hide={hideGodown} /></strong>
              </div>
              <div>
                <span>Overall P&amp;L</span>
                <strong className={`pnl ${totalPnl >= 0 ? "pos" : "neg"}`}>
                  <Money value={totalPnl} signed hide={hideGodown} />
                  {!hideGodown && <em>{pct(totalPnlPct)}</em>}
                </strong>
              </div>
            </div>

            <div className="share-bar">
              {holdings.map((h) => (
                <i key={h.id} style={{ width: `${share(h)}%` }} data-c={h.name} title={`${h.name}, ${h.city}`}></i>
              ))}
            </div>
            <div className="share-legend">
              {holdings.map((h) => (
                <span key={h.id}>
                  <b data-c={h.name}></b>
                  {h.name} · {h.city} {share(h).toFixed(0)}%
                </span>
              ))}
            </div>
          </article>
        </section>

        {/* ADD / WITHDRAW PANEL */}
        {panel && (
          <section className="money-panel">
            <div className="panel-head">
              <h3>{panel === "add" ? "Add money to wallet" : "Withdraw to bank"}</h3>
              <button type="button" className="close" onClick={closePanel} aria-label="Close">✕</button>
            </div>

            <label htmlFor="amt">Amount (₹ INR)</label>
            <input
              id="amt"
              type="number"
              min="100"
              placeholder="Enter amount in rupees"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <div className="quick">
              {quickAmounts.map((q) => (
                <button key={q} type="button" className={Number(amount) === q ? "on" : ""} onClick={() => setAmount(String(q))}>
                  {inr(q)}
                </button>
              ))}
              {panel === "withdraw" && (
                <button
                  type="button"
                  className={Number(amount) === available ? "on" : ""}
                  onClick={() => setAmount(String(available))}
                >
                  Max
                </button>
              )}
            </div>

            {panel === "add" ? (
              <>
                <label>Pay using</label>
                <div className="methods">
                  {methods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={method === m ? "on" : ""}
                      onClick={() => {
                        setMethod(m);
                        setPanelError("");
                      }}
                    >
                      {m}
                      {m === "UPI" && (
                        <span className="upi-mini" aria-hidden="true">
                          {upiApps.map((a) => (
                            <img key={a.name} src={a.icon} alt="" />
                          ))}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {method === "UPI" && (
                  <>
                    <label>Choose your UPI app</label>
                    <div className="upi-apps">
                      {upiApps.map((a) => (
                        <button
                          key={a.name}
                          type="button"
                          className={upiApp === a.name ? "on" : ""}
                          aria-pressed={upiApp === a.name}
                          onClick={() => setUpiApp(a.name)}
                        >
                          <img src={a.icon} alt="" width="22" height="22" />
                          <span>{a.name}</span>
                        </button>
                      ))}
                    </div>

                    <label htmlFor="upi">UPI ID</label>
                    <input
                      id="upi"
                      type="text"
                      placeholder={selectedUpi.placeholder}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      value={upiId}
                      onChange={(e) => {
                        setUpiId(e.target.value);
                        setPanelError("");
                      }}
                    />
                    <span className="field-hint">
                      Pay this amount to {collectAccount?.upi ? <strong>{collectAccount.upi}</strong> : "our UPI ID"} from
                      this app. We'll add it once we confirm it reached us.
                    </span>
                  </>
                )}

                {method === ONLINE && (
                  <span className="field-hint">
                    Pay with any UPI app, debit or credit card, or net banking in Razorpay's secure window. Money is
                    added to your wallet as soon as the payment succeeds. We never see your card details.
                  </span>
                )}

                {method === "Bank transfer" && collectAccount && (
                  <>
                    <div className="transfer-box">
                      <span className="kicker">SEND NEFT / RTGS / IMPS TO</span>
                      <dl>
                        <div><dt>Account name</dt><dd>{collectAccount.name}</dd></div>
                        <div><dt>Account number</dt><dd>{collectAccount.number}</dd></div>
                        <div><dt>IFSC</dt><dd>{collectAccount.ifsc}</dd></div>
                        <div><dt>Bank</dt><dd>{collectAccount.bank}</dd></div>
                      </dl>
                      <span className="field-hint">Send only from your registered account ({user.bank}).</span>
                    </div>
                    <label htmlFor="utr">UTR / reference number</label>
                    <input
                      id="utr"
                      type="text"
                      placeholder="e.g. HDFCN52026102612345"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck="false"
                      value={utr}
                      onChange={(e) => {
                        setUtr(e.target.value.toUpperCase());
                        setPanelError("");
                      }}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <p className="muted small">
                  To: {user.bank} · Withdrawable now: <strong>{fmt(available, 2)}</strong>. Money reaches your bank in 1
                  business day after approval.
                </p>
                <label htmlFor="wpin">Transaction PIN</label>
                <input
                  id="wpin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ""));
                    setPanelError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && confirmPanel()}
                />
              </>
            )}

            {panelError && <span className="error">{panelError}</span>}

            <div className="panel-actions">
              <button type="button" className="btn solid" onClick={confirmPanel} disabled={busy}>
                {busy
                  ? "Please wait…"
                  : panel === "withdraw"
                  ? "Request withdrawal"
                  : method === "Bank transfer"
                  ? "I have sent the money"
                  : method === ONLINE
                  ? "Pay now"
                  : "Add money"}
              </button>
              <button type="button" className="btn outline" onClick={closePanel}>Cancel</button>
            </div>
            <p className="muted small">
              {method === ONLINE && panel === "add"
                ? "Online payments are added instantly. Wallet transactions are settled in INR."
                : "Manual deposits are added after our team confirms the payment. Wallet transactions are settled in INR."}
            </p>
          </section>
        )}

        {/* TABS */}
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => selectTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            <section className="block">
              <div className="block-head">
                <div>
                  <span className="kicker">TODAY'S MANDI RATES</span>
                  <h2>What your bags are worth now</h2>
                </div>
              </div>
              {holdings.length === 0 && <p className="empty">Buy bags on the Prices page to track their value here.</p>}
              <div className="rate-grid">
                {holdings.map((h) => (
                  <article className="rate-card" key={h.id}>
                    <img className="rate-img" src={h.image} alt={`Fresh ${h.name}`} />
                    <div className="rate-body">
                      <div className="rate-top">
                        <div>
                          <strong>{h.name}</strong>
                          <small>{h.city} · {h.pack}</small>
                        </div>
                        <span className={`chg ${dayChange(h) >= 0 ? "pos" : "neg"}`}>{pct(dayChange(h))}</span>
                      </div>
                      <div className="rate-price"><Money value={h.ltp} /></div>
                      <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                        <polyline points={spark(h.trend)} className={dayChange(h) >= 0 ? "pos" : "neg"} />
                      </svg>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="block">
              <div className="block-head">
                <div>
                  <span className="kicker">RECENT ACTIVITY</span>
                  <h2>Latest transactions</h2>
                </div>
                <button type="button" className="text-btn" onClick={() => selectTab("transactions")}>View all →</button>
              </div>
              <TxnList list={recentTxns} hidden={hidden} />
            </section>
          </>
        )}

        {/* MY GODOWN */}
        {tab === "holdings" && (
          <section className="block">
            <div className="block-head">
              <div>
                <span className="kicker">MY GODOWN</span>
                <h2>Bags you currently hold</h2>
              </div>
              <Link className="text-btn" to="/explore">＋ Invest in any city →</Link>
            </div>
            {holdings.length === 0 && (
              <p className="empty">Your godown is empty. <Link to="/explore">Buy your first bags →</Link></p>
            )}
            <div className="hold-list">
              {holdings.map((h) => (
                <article className="hold-card" key={h.id}>
                  <div className="hold-title">
                    <img className="hold-img" src={h.image} alt={h.name} />
                    <div>
                      <strong>{h.name}</strong>
                      <small>📍 {h.city} · {h.bags} bags · {h.pack}</small>
                    </div>
                    <span className={`chg ${pnl(h) >= 0 ? "pos" : "neg"}`}>{pct(pnlPct(h))}</span>
                  </div>
                  <div className="hold-stats">
                    <div><span>Avg. buy</span><strong><Money value={h.avgCost} /></strong></div>
                    <div><span>Current rate</span><strong><Money value={h.ltp} /></strong></div>
                    <div><span>Invested</span><strong><Money value={cost(h)} hide={hideGodown} /></strong></div>
                    <div><span>Current value</span><strong><Money value={value(h)} hide={hideGodown} /></strong></div>
                    <div>
                      <span>P&amp;L</span>
                      <strong className={pnl(h) >= 0 ? "pos" : "neg"}>
                        <Money value={pnl(h)} signed hide={hideGodown} />
                      </strong>
                    </div>
                  </div>
                  <div className="share-bar thin">
                    <i style={{ width: `${share(h)}%` }} data-c={h.name}></i>
                  </div>
                  <small className="muted">{share(h).toFixed(0)}% of your godown value</small>
                  {me.kyc === "verified" && charges && (
                    <div className="panel-actions">
                      <button type="button" className="btn outline" onClick={() => { closePanel(); setSelling(h); }}>
                        Sell bags
                      </button>
                    </div>
                  )}
                  {selling?.id === h.id && (
                    <SellPanel holding={h} charges={charges} onClose={() => setSelling(null)} onSold={onSold} />
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* TRANSACTIONS */}
        {tab === "transactions" && (
          <section className="block">
            <div className="block-head">
              <div>
                <span className="kicker">PASSBOOK</span>
                <h2>All transactions</h2>
              </div>
            </div>
            <div className="pills">
              {filters.map((f) => (
                <button key={f.key} type="button" className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            {filteredTxns.length ? (
              <TxnList list={filteredTxns} hidden={hidden} full />
            ) : (
              <p className="empty">No transactions in this view.</p>
            )}
          </section>
        )}

        {/* PROFILE & SECURITY */}
        {tab === "profile" && (
          <section className="profile-grid">
            <article className="info-card">
              <h3>Account</h3>
              <dl>
                <div><dt>Name</dt><dd>{user.name}</dd></div>
                <div><dt>Client ID</dt><dd>{user.clientId}</dd></div>
                <div><dt>Mobile</dt><dd>{user.mobile}</dd></div>
                <div><dt>Email</dt><dd>{user.email}</dd></div>
                <div><dt>Member since</dt><dd>{user.memberSince}</dd></div>
                <div><dt>Status</dt><dd><span className={`badge ${user.blocked ? "" : "ok"}`}>{user.blocked ? "Blocked" : "Active"}</span></dd></div>
              </dl>
            </article>

            <article className="info-card">
              <h3>KYC &amp; Bank</h3>
              <dl>
                <div><dt>KYC status</dt><dd><span className={`badge ${kycBadge.cls}`}>{kycBadge.label}</span></dd></div>
                <div><dt>PAN</dt><dd>{user.pan}</dd></div>
                <div><dt>Bank account</dt><dd>{user.bank}</dd></div>
                <div><dt>IFSC</dt><dd>{user.ifsc}</dd></div>
                <div><dt>Nominee</dt><dd>{user.nominee}</dd></div>
              </dl>
            </article>
            {me.kyc === "pending" && <KycUpload user={me} onUser={setMe} onToast={setToast} />}

            <SecurityPanel user={user} onUser={setMe} onToast={setToast} />
          </section>
        )}

        <p className="disclaimer">
          Values use today's mandi rates and are not investment advice. Your wallet and orders are settled in INR.
        </p>
      </main>
    </div>
      </>
  );
}

/* Transaction list, used on Overview and Transactions tabs */
function TxnList({ list, hidden, full = false }) {
  return (
    <ul className="txn-list">
      {list.map((t) => (
        <li key={t.id}>
          <span className="t-ico" data-t={t.type}>{txnIcon(t)}</span>
          <div className="t-main">
            <strong>{t.type}</strong>
            <small>
              {t.desc}
              {full && ` · ${t.id}`}
            </small>
          </div>
          <div className="t-side">
            <strong className={t.amount > 0 ? "pos" : t.amount < 0 ? "neg" : ""}>
              <Money value={t.amount} decimals={2} signed hide={hidden} />
            </strong>
            <small>
              {fmtDate(t.date)}
              {full && <em className={`status ${t.status === "Pending" ? "pending" : ""}`}>{t.status}</em>}
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default Account;