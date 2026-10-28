import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getUser, logout, initialsOf } from "../auth.js";
import potatoImg from "../assets/images/potatoes.jpg";
import garlicImg from "../assets/images/garlic.jpg";
import onionImg from "../assets/images/onions.jpg";
import gpayIcon from "../assets/images/googlepay.svg";
import phonepeIcon from "../assets/images/phonepe.svg";
import bhimIcon from "../assets/images/bhim.svg";
import "./Account.css";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "holdings", label: "My godown" },
  { key: "transactions", label: "Transactions" },
  { key: "profile", label: "Profile & security" },
];

const holdingsData = [
  { id: "h1", name: "Potato", city: "Ahmedabad", pack: "20 kg bag", bags: 40, avgCost: 405, ltp: 430, prev: 424, trend: [398, 404, 410, 407, 415, 424, 430], image: potatoImg },
  { id: "h2", name: "Onion", city: "Nashik", pack: "20 kg bag", bags: 25, avgCost: 520, ltp: 548, prev: 541, trend: [512, 518, 530, 526, 535, 541, 548], image: onionImg },
  { id: "h3", name: "Garlic", city: "Indore", pack: "5 kg bag", bags: 30, avgCost: 700, ltp: 672, prev: 681, trend: [712, 705, 698, 690, 688, 681, 672], image: garlicImg },
];

const initialTxns = [
  { id: "TXN100245", type: "Bought", desc: "10 bags potato · Ahmedabad", amount: -4318.6, date: "2026-10-26T11:20:00", status: "Completed" },
  { id: "TXN100244", type: "Added money", desc: "UPI · Google Pay", amount: 10000, date: "2026-10-26T10:05:00", status: "Completed" },
  { id: "TXN100243", type: "Charges", desc: "Storage charges · October", amount: -186.5, date: "2026-10-25T18:00:00", status: "Completed" },
  { id: "TXN100242", type: "Sold", desc: "5 bags onion · Nashik", amount: 2712.4, date: "2026-10-24T15:42:00", status: "Completed" },
  { id: "TXN100241", type: "Withdrawal", desc: "To HDFC Bank ••••4521", amount: -5000, date: "2026-10-23T09:30:00", status: "Completed" },
  { id: "TXN100240", type: "Bought", desc: "30 bags garlic · Indore", amount: -21142.8, date: "2026-10-20T12:10:00", status: "Completed" },
  { id: "TXN100239", type: "Added money", desc: "Bank transfer · NEFT", amount: 40000, date: "2026-10-19T16:45:00", status: "Completed" },
];

const filters = [
  { key: "all", label: "All" },
  { key: "money", label: "Money in / out" },
  { key: "trades", label: "Buy / Sell" },
  { key: "charges", label: "Charges" },
];

const methods = ["UPI", "Debit card", "Credit card", "Bank transfer"];
const upiApps = [
  { name: "Google Pay", icon: gpayIcon, placeholder: "yourname@okaxis" },
  { name: "PhonePe", icon: phonepeIcon, placeholder: "yourname@ybl" },
  { name: "BHIM", icon: bhimIcon, placeholder: "yourname@upi" },
];
const collectAccount = {
  name: "Jalaram Aloo Bhandar Collections",
  number: "50200012345678",
  ifsc: "HDFC0001234",
  bank: "HDFC Bank",
};

const quickAmounts = [500, 1000, 5000, 10000];

/* ---------- Helpers ---------- */
const inr = (v, decimals = 0) =>
  "₹" + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// Same markup as her <app-money>
function Money({ value, decimals = 0, signed = false, hide = false }) {
  let text;
  if (hide) text = "₹ ••••";
  else if (signed) text = (value >= 0 ? "+" : "−") + inr(value, decimals);
  else text = (value < 0 ? "−" : "") + inr(value, decimals);
  return (
    <span className="m">
      <span className="m-main">{text}</span>
    </span>
  );
}

const pct = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
const value = (h) => h.bags * h.ltp;
const cost = (h) => h.bags * h.avgCost;
const pnl = (h) => value(h) - cost(h);
const pnlPct = (h) => (pnl(h) / cost(h)) * 100;
const dayChange = (h) => ((h.ltp - h.prev) / h.prev) * 100;

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

function cardBrandOf(num) {
  if (/^4/.test(num)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(num)) return "Mastercard";
  if (/^3[47]/.test(num)) return "Amex";
  if (/^(60|65|81|82|508)/.test(num)) return "RuPay";
  return "";
}

/* ---------- Page ---------- */
function Account() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authUser = getUser();

  const [hidden, setHidden] = useState(false);
  const [hideGodown, setHideGodown] = useState(false);
  const [available, setAvailable] = useState(authUser?.balance ?? 25000);
  const [onHold] = useState(3200);
  const [txns, setTxns] = useState(initialTxns);
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("all");
  const [twoFactor, setTwoFactor] = useState(true);

  // Add / withdraw panel
  const [panel, setPanel] = useState(null); // "add" | "withdraw" | null
  const [amount, setAmountState] = useState("");
  const [method, setMethod] = useState("UPI");
  const [upiApp, setUpiApp] = useState("Google Pay");
  const [upiId, setUpiId] = useState("");
  const [utr, setUtr] = useState("");
  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [panelError, setPanelError] = useState("");

  // Not logged in → go to login
  if (!authUser) return <Navigate to="/login" replace />;

  const user = {
    ...authUser,
    mobile: "+91 98•••••210",
    pan: "ABCDE••••F",
    bank: "HDFC Bank ••••4521",
    ifsc: "HDFC0001234",
    nominee: "Not added",
    memberSince: "October 2026",
    lastLogin: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
  };
  const firstName = user.name.split(" ")[0];
  const initials = initialsOf(user.name);

  /* Tabs (kept in the URL: /account?tab=holdings) */
  const tabParam = searchParams.get("tab");
  const tab = tabs.some((t) => t.key === tabParam) ? tabParam : "overview";
  const selectTab = (key) => setSearchParams(key === "overview" ? {} : { tab: key });

  /* Totals */
  const holdings = holdingsData;
  const balance = available + onHold;
  const godownValue = holdings.reduce((s, h) => s + value(h), 0);
  const invested = holdings.reduce((s, h) => s + cost(h), 0);
  const totalPnl = godownValue - invested;
  const totalPnlPct = (totalPnl / invested) * 100;
  const totalBags = holdings.reduce((s, h) => s + h.bags, 0);
  const cityCount = new Set(holdings.map((h) => h.city)).size;
  const todayChange = holdings.reduce((s, h) => s + h.bags * (h.ltp - h.prev), 0);
  const share = (h) => (value(h) / godownValue) * 100;

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
    setCard({ number: "", name: "", expiry: "", cvv: "" });
  };
  const closePanel = () => setPanel(null);
  const setAmount = (v) => {
    setAmountState(v);
    setPanelError("");
  };

  const cardBrand = cardBrandOf(card.number.replace(/\s/g, ""));
  const formatCardNumber = (v) => {
    const digits = v.replace(/\D/g, "").slice(0, 19);
    setCard((c) => ({ ...c, number: digits.replace(/(.{4})/g, "$1 ").trim() }));
    setPanelError("");
  };
  const formatExpiry = (v) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setCard((c) => ({ ...c, expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits }));
    setPanelError("");
  };

  const selectedUpi = upiApps.find((a) => a.name === upiApp);

  const addTxn = (txn) =>
    setTxns((list) => [{ id: "TXN" + Date.now().toString().slice(-6), date: new Date().toISOString(), ...txn }, ...list]);

  const confirmPanel = () => {
    const amt = Number(amount);
    if (!amt || amt < 100) return setPanelError("Enter an amount of at least ₹100.");

    if (panel === "withdraw") {
      if (amt > available) return setPanelError("You can't withdraw more than your available balance.");
      setAvailable((a) => a - amt);
      addTxn({ type: "Withdrawal", desc: `To ${user.bank}`, amount: -amt, status: "Pending" });
      setToast(`Withdrawal of ${inr(amt)} requested. It will reach your bank in 1 business day.`);
      return closePanel();
    }

    if (amt > 200000) return setPanelError("You can add up to ₹2,00,000 at a time.");
    if (method === "UPI" && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim()))
      return setPanelError("Enter a valid UPI ID, like name@bank.");
    if (method === "Debit card" || method === "Credit card") {
      if (card.number.replace(/\s/g, "").length < 12) return setPanelError("Enter a valid card number.");
      if (!card.name.trim()) return setPanelError("Enter the name on the card.");
      if (!/^\d{2}\/\d{2}$/.test(card.expiry)) return setPanelError("Enter the expiry as MM/YY.");
      if (card.cvv.length < 3) return setPanelError("Enter the CVV.");
    }
    if (method === "Bank transfer" && utr.trim().length < 6)
      return setPanelError("Enter the UTR / reference number of your transfer.");

    const pending = method === "Bank transfer";
    if (!pending) setAvailable((a) => a + amt);
    addTxn({
      type: "Added money",
      desc: method === "UPI" ? `UPI · ${upiApp}` : method,
      amount: amt,
      status: pending ? "Pending" : "Completed",
    });
    setToast(
      pending
        ? `We'll add ${inr(amt)} once your bank transfer reaches us.`
        : `${inr(amt)} added to your wallet.`
    );
    closePanel();
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const cardForm = (
    <>
      <label htmlFor="cardno">Card number</label>
      <div className="card-input">
        <input
          id="cardno"
          type="text"
          inputMode="numeric"
          placeholder="1234 5678 9012 3456"
          autoComplete="cc-number"
          value={card.number}
          onChange={(e) => formatCardNumber(e.target.value)}
        />
        {cardBrand && <span className="card-brand">{cardBrand}</span>}
      </div>

      <label htmlFor="cardname">Name on card</label>
      <input
        id="cardname"
        type="text"
        placeholder="As printed on the card"
        autoComplete="cc-name"
        value={card.name}
        onChange={(e) => {
          setCard((c) => ({ ...c, name: e.target.value }));
          setPanelError("");
        }}
      />

      <div className="card-row">
        <div>
          <label htmlFor="cardexp">Expiry</label>
          <input
            id="cardexp"
            type="text"
            inputMode="numeric"
            placeholder="MM/YY"
            autoComplete="cc-exp"
            value={card.expiry}
            onChange={(e) => formatExpiry(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cardcvv">CVV</label>
          <input
            id="cardcvv"
            type="password"
            inputMode="numeric"
            maxLength={cardBrand === "Amex" ? 4 : 3}
            placeholder="•••"
            autoComplete="cc-csc"
            value={card.cvv}
            onChange={(e) => {
              setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, "") }));
              setPanelError("");
            }}
          />
        </div>
      </div>
      <span className="field-hint">
        {method === "Credit card" && "Your card issuer may treat this as a cash or wallet load and add charges. "}
        You will confirm with an OTP from your bank. Card details are not saved.
      </span>
    </>
  );

  return (
    <div className="acc-page">
      <header className="acc-top">
        <Link className="acc-brand" to="/">
          <span className="brand-mark">JA</span>
          <span className="acc-brand-text">
            <strong>Jalaram Aloo Bhandar</strong>
            <small>COMMODITY MARKET</small>
          </span>
        </Link>
        <div className="acc-user">
          <div className="acc-hello">
            <small>Welcome back</small>
            <strong>{firstName}</strong>
          </div>
          <span className="avatar">{initials}</span>
          <button type="button" className="logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="acc-main">
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
                      A payment request will be sent to your UPI app. Approve it there to finish.
                    </span>
                  </>
                )}

                {(method === "Debit card" || method === "Credit card") && cardForm}

                {method === "Bank transfer" && (
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
              <p className="muted small">
                To: {user.bank} · Withdrawable now: <strong>{inr(available, 2)}</strong>. Money reaches your bank in 1
                business day.
              </p>
            )}

            {panelError && <span className="error">{panelError}</span>}

            <div className="panel-actions">
              <button type="button" className="btn solid" onClick={confirmPanel}>
                {panel === "withdraw"
                  ? "Request withdrawal"
                  : method === "Bank transfer"
                  ? "I have sent the money"
                  : "Add money"}
              </button>
              <button type="button" className="btn outline" onClick={closePanel}>Cancel</button>
            </div>
            <p className="muted small">Demo only. No real payment is made. Wallet transactions are settled in INR.</p>
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
                <span className="muted small">Illustrative · Prices in INR</span>
              </div>
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
                <div><dt>Status</dt><dd><span className="badge ok">Active</span></dd></div>
              </dl>
            </article>

            <article className="info-card">
              <h3>KYC &amp; Bank</h3>
              <dl>
                <div><dt>KYC status</dt><dd><span className="badge ok">✓ Verified</span></dd></div>
                <div><dt>PAN</dt><dd>{user.pan}</dd></div>
                <div><dt>Bank account</dt><dd>{user.bank}</dd></div>
                <div><dt>IFSC</dt><dd>{user.ifsc}</dd></div>
                <div><dt>Nominee</dt><dd>{user.nominee}</dd></div>
              </dl>
            </article>

            <article className="info-card wide">
              <h3>Security</h3>
              <dl>
                <div>
                  <dt>Password</dt>
                  <dd>•••••••••• <button type="button" className="text-btn">Change</button></dd>
                </div>
                <div>
                  <dt>Transaction PIN</dt>
                  <dd>Set <button type="button" className="text-btn">Reset</button></dd>
                </div>
                <div><dt>Last login</dt><dd>{user.lastLogin}</dd></div>
                <div>
                  <dt>Two-step verification</dt>
                  <dd>
                    <label className="switch">
                      <input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} />
                      <i></i>
                      <span>{twoFactor ? "On" : "Off"}</span>
                    </label>
                  </dd>
                </div>
              </dl>
            </article>
          </section>
        )}

        <p className="disclaimer">
          Demo dashboard with sample data. Prices and balances are illustrative, not live rates or investment advice.
          Your wallet and orders are settled in INR.
        </p>
      </main>
    </div>
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