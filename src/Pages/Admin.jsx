import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import potatoImg from "../assets/images/potatoes.jpg";
import onionImg from "../assets/images/onions.jpg";
import garlicImg from "../assets/images/garlic.jpg";
import './Adminlogin.css'
const STORAGE_KEY = "jab-admin-v2"; 
const AUTH_KEY = "jab-admin-auth";

// Demo login only. Anyone can read this in the browser, so replace it with a real backend check before going live.
const DEMO_ADMIN = { username: "admin", password: "admin@123" };

const isAdminLoggedIn = () => {
  try {
    return sessionStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
};

/* ---------- Demo data ---------- */
const PRODUCTS = [
  { key: "potato", name: "Potato", pack: "20 kg bag", base: 415, image: potatoImg },
  { key: "onion", name: "Onion", pack: "20 kg bag", base: 565, image: onionImg },
  { key: "garlic", name: "Garlic", pack: "5 kg bag", base: 676, image: garlicImg },
];

const CITIES = [
  ["Ahmedabad", "Gujarat", "Jamalpur APMC", 1.02],
  ["Rajkot", "Gujarat", "Rajkot APMC", 0.99],
  ["Surat", "Gujarat", "Sardar Market APMC", 1.07],
  ["Deesa", "Gujarat", "Deesa APMC", 0.8],
  ["Mumbai", "Maharashtra", "Vashi APMC", 1.15],
  ["Pune", "Maharashtra", "Gultekdi Market Yard", 0.98],
  ["Nashik", "Maharashtra", "Lasalgaon APMC", 0.95],
  ["Delhi", "Delhi", "Azadpur Mandi", 1.11],
  ["Agra", "Uttar Pradesh", "Agra Mandi", 0.83],
  ["Lucknow", "Uttar Pradesh", "Dubagga Mandi", 0.93],
  ["Indore", "Madhya Pradesh", "Devi Ahilya Bai APMC", 0.93],
  ["Mandsaur", "Madhya Pradesh", "Mandsaur APMC", 0.96],
  ["Jaipur", "Rajasthan", "Muhana Mandi", 1.04],
  ["Kolkata", "West Bengal", "Posta Bazar", 0.92],
  ["Bengaluru", "Karnataka", "Yeshwanthpur APMC", 1.0],
  ["Hyderabad", "Telangana", "Bowenpally Market", 1.12],
  ["Chennai", "Tamil Nadu", "Koyambedu Market", 1.08],
].map(([name, state, mandi, f]) => ({ name, state, mandi, f }));

// Potato rates from the live site: [today, % vs yesterday, low, high, arrivals]
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

// Time helper: days ago + "HH:MM" -> timestamp
function at(daysAgo, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function seedData() {
  const users = [
    { id: "JAB-2026-004821", name: "Rakesh Patel", mobile: "98250 41120", city: "Ahmedabad", kyc: "verified", blocked: false, balance: 48250.75, joined: at(40, "11:00") },
    { id: "JAB-2026-004822", name: "Meena Shah", mobile: "99090 23415", city: "Surat", kyc: "verified", blocked: false, balance: 62400, joined: at(38, "16:20") },
    { id: "JAB-2026-004827", name: "Arjun Mehta", mobile: "97277 80913", city: "Rajkot", kyc: "verified", blocked: true, balance: 15200, joined: at(35, "10:05") },
    { id: "JAB-2026-004830", name: "Imran Qureshi", mobile: "98980 55107", city: "Mumbai", kyc: "pending", blocked: false, balance: 0, joined: at(1, "14:45") },
    { id: "JAB-2026-004833", name: "Sunita Yadav", mobile: "94140 77231", city: "Agra", kyc: "verified", blocked: false, balance: 21486.25, joined: at(30, "09:30") },
    { id: "JAB-2026-004836", name: "Neha Desai", mobile: "90990 61882", city: "Vadodara", kyc: "verified", blocked: false, balance: 54800, joined: at(25, "18:10") },
    { id: "JAB-2026-004841", name: "Priya Nair", mobile: "98470 31266", city: "Bengaluru", kyc: "pending", blocked: false, balance: 9000, joined: at(2, "12:00") },
    { id: "JAB-2026-004845", name: "Vikram Singh", mobile: "98110 44590", city: "Delhi", kyc: "verified", blocked: false, balance: 71000, joined: at(20, "15:15") },
    { id: "JAB-2026-004852", name: "Mohit Agarwal", mobile: "98310 20984", city: "Kolkata", kyc: "verified", blocked: false, balance: 38000, joined: at(12, "11:40") },
    { id: "JAB-2026-004858", name: "Kavita Joshi", mobile: "96010 88342", city: "Indore", kyc: "pending", blocked: false, balance: 0, joined: at(0, "08:05") },
  ];

  const walletRequests = [
    { id: "WR9012", userId: "JAB-2026-004822", type: "out", amount: 20000, method: "Bank · HDFC ••4410", time: at(0, "09:40"), status: "pending" },
    { id: "WR9011", userId: "JAB-2026-004841", type: "in", amount: 15000, method: "UPI · priya@okaxis", time: at(0, "08:15"), status: "pending" },
    { id: "WR9008", userId: "JAB-2026-004845", type: "out", amount: 12500, method: "Bank · SBI ••7782", time: at(1, "17:02"), status: "pending" },
    { id: "WR9006", userId: "JAB-2026-004833", type: "in", amount: 8000, method: "UPI · sunita@ybl", time: at(1, "11:30"), status: "pending" },
    { id: "WR8990", userId: "JAB-2026-004821", type: "out", amount: 5000, method: "Bank · ICICI ••2209", time: at(6, "14:10"), status: "pending" },
    { id: "WR8975", userId: "JAB-2026-004836", type: "in", amount: 25000, method: "UPI · neha@okhdfc", time: at(8, "10:20"), status: "approved" },
    { id: "WR8961", userId: "JAB-2026-004852", type: "in", amount: 10000, method: "Bank transfer", time: at(10, "13:05"), status: "approved" },
    { id: "WR8944", userId: "JAB-2026-004827", type: "out", amount: 30000, method: "Bank · Axis ••5531", time: at(14, "16:40"), status: "rejected" },
  ];

  const orders = [
    { id: "OR55120", userId: "JAB-2026-004822", side: "Buy", item: "onion", city: "Nashik", bags: 40, rate: 472, time: at(0, "10:12") },
    { id: "OR55118", userId: "JAB-2026-004845", side: "Buy", item: "potato", city: "Agra", bags: 60, rate: 346, time: at(0, "09:58") },
    { id: "OR55111", userId: "JAB-2026-004821", side: "Buy", item: "garlic", city: "Mandsaur", bags: 8, rate: 541, time: at(0, "09:20") },
    { id: "OR55104", userId: "JAB-2026-004833", side: "Sell", item: "potato", city: "Agra", bags: 15, rate: 351, time: at(1, "15:44") },
    { id: "OR55097", userId: "JAB-2026-004852", side: "Buy", item: "potato", city: "Kolkata", bags: 25, rate: 382, time: at(1, "12:31") },
    { id: "OR55083", userId: "JAB-2026-004836", side: "Buy", item: "onion", city: "Surat", bags: 30, rate: 598, time: at(3, "11:02") },
    { id: "OR55071", userId: "JAB-2026-004821", side: "Sell", item: "potato", city: "Ahmedabad", bags: 10, rate: 421, time: at(5, "16:18") },
    { id: "OR55060", userId: "JAB-2026-004845", side: "Buy", item: "garlic", city: "Delhi", bags: 12, rate: 752, time: at(7, "10:47") },
  ];

  // Mandi rates per city (₹ per bag): today, yesterday, low, high, arrivals
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rates = {};
  PRODUCTS.forEach((p) => {
    rates[p.key] = CITIES.map((c) => {
      const fixed = p.key === "potato" && POTATO_RATES[c.name];
      if (fixed) {
        const [today, change, low, high, arrivals] = fixed;
        return { city: c.name, today, yesterday: today / (1 + change / 100), low, high, arrivals };
      }
      const today = Math.round(p.base * c.f * (0.96 + rnd() * 0.08));
      const yesterday = Math.round(today / (1 + (rnd() - 0.5) * 0.05));
      const low = Math.round(today * (0.9 + rnd() * 0.03));
      const high = Math.round(today * (1.06 + rnd() * 0.04));
      const arrivals = Math.round(1300 + rnd() * 3100);
      return { city: c.name, today, yesterday, low, high, arrivals };
    });
  });

  return { users, walletRequests, orders, rates };
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.users && saved.rates) return saved;
  } catch {
    /* ignore */
  }
  return seedData();
}

/* ---------- Format helpers ---------- */
const inr = (v) => "₹" + Math.round(v).toLocaleString("en-IN");
const inr2 = (v) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pct = (v) => (v > 0 ? "+" : "") + v.toFixed(1) + "%";
const when = (t) =>
  new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const dateOnly = (t) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const isToday = (t) => new Date(t).toDateString() === new Date().toDateString();

/* ---------- Icons ---------- */
const ICONS = {
  dashboard: "M4 13h6V4H4zm10 7h6V11h-6zM4 20h6v-3H4zm10-13h6V4h-6z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0m1-9a3 3 0 0 0 0-6m2 15a6 6 0 0 0-3-5.2",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm13 7h.01",
  rates: "M3 20h18M6 16v-5m4 5V8m4 8v-3m4 3V5",
  orders: "M6 3h12l2 4H4zM4 7v13h16V7M9 12h6",
};

const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "wallet", label: "Wallet requests" },
  { key: "rates", label: "Mandi rates" },
  { key: "orders", label: "Orders" },
];

/* =========================================================
   Page: login first, then the panel
   ========================================================= */
function Admin() {
  const [loggedIn, setLoggedIn] = useState(isAdminLoggedIn);

  const login = () => {
    try {
      sessionStorage.setItem(AUTH_KEY, "1");
    } catch {
      /* ignore */
    }
    setLoggedIn(true);
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setLoggedIn(false);
  };

  return loggedIn ? <AdminPanel onLogout={logout} /> : <AdminLogin onLogin={login} />;
}

/* =========================================================
   Admin sign in (React version of her login page)
   ========================================================= */
function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    if (username.trim().toLowerCase() !== DEMO_ADMIN.username || password !== DEMO_ADMIN.password) {
      setError("Wrong username or password.");
      return;
    }
    setError("");
    onLogin();
  };

  return (
    <main className="al">
      <form className="al-card" noValidate onSubmit={submit}>
        <div className="al-brand">
          <span className="brand-mark">JA</span>
          <div>
            <strong>Jalaram Aloo Bhandar</strong>
            <small>ADMIN PANEL</small>
          </div>
        </div>

        <h1>Admin sign in</h1>
        <p className="muted">For staff who manage users, wallet requests and mandi rates.</p>

        <label htmlFor="au">Username</label>
        <input
          id="au"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck="false"
          required
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError("");
          }}
        />

        <label htmlFor="ap">Password</label>
        <div className="al-pass">
          <input
            id="ap"
            name="password"
            type={showPass ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
          />
          <button type="button" onClick={() => setShowPass((v) => !v)}>
            {showPass ? "Hide" : "Show"}
          </button>
        </div>

        {error && (
          <p className="al-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="al-submit">Sign in</button>

        <p className="al-demo">
          Demo login: <b>admin</b> / <b>admin@123</b>
        </p>
        <Link to="/" className="al-back">← Back to the app</Link>
      </form>
    </main>
  );
}

/* =========================================================
   Admin panel
   ========================================================= */
function AdminPanel({ onLogout }) {
  const navigate = useNavigate();
  const [data, setData] = useState(loadData);
  const [section, setSection] = useState("dashboard");
  const [toast, setToast] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  // Save every change in this browser
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data]);

  // Hide toast after a few seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const { users, walletRequests, orders, rates } = data;
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const productByKey = (k) => PRODUCTS.find((p) => p.key === k);

  const kycPending = users.filter((u) => u.kyc === "pending");
  const pendingRequests = walletRequests.filter((r) => r.status === "pending").sort((a, b) => b.time - a.time);

  const go = (key) => {
    setSection(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---------- Actions ---------- */
  const updateUser = (id, changes, message) => {
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, ...changes } : u)) }));
    if (message) setToast(message);
  };

  const decideRequest = (req, approve) => {
    const user = userById[req.userId];
    if (approve && req.type === "out" && user.balance < req.amount) {
      setToast(`Can't approve: ${user.name} has only ${inr2(user.balance)} in the wallet.`);
      return;
    }
    setData((d) => ({
      ...d,
      walletRequests: d.walletRequests.map((r) => (r.id === req.id ? { ...r, status: approve ? "approved" : "rejected" } : r)),
      users: approve
        ? d.users.map((u) =>
            u.id === req.userId ? { ...u, balance: u.balance + (req.type === "in" ? req.amount : -req.amount) } : u
          )
        : d.users,
    }));
    setToast(
      `${req.type === "in" ? "Deposit" : "Withdrawal"} of ${inr(req.amount)} for ${user.name} ${approve ? "approved" : "rejected"}.`
    );
  };

  const resetDemo = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setData(seedData());
    setConfirmReset(false);
    setSection("dashboard");
    setToast("Demo data has been reset.");
  };

  const logout = () => {
    onLogout(); // back to the sign-in screen
    navigate("/admin");
  };

  const counts = { users: kycPending.length, wallet: pendingRequests.length };
  const title = SECTIONS.find((s) => s.key === section).label;

  return (
    <div className="ad">
      {/* ---------- Sidebar ---------- */}
      <aside className="ad-side">
        <Link to="/admin" className="ad-brand" onClick={() => go("dashboard")}>
          <span className="brand-mark">JA</span>
          <span>
            <strong>Jalaram Aloo Bhandar</strong>
            <small>ADMIN PANEL</small>
          </span>
        </Link>

        <nav className="ad-nav" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={section === s.key ? "on" : ""}
              aria-current={section === s.key ? "page" : undefined}
              onClick={() => go(s.key)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={ICONS[s.key]} />
              </svg>
              <span>{s.label}</span>
              {counts[s.key] > 0 && <em>{counts[s.key]}</em>}
            </button>
          ))}
        </nav>

        <div className="ad-side-foot">
          <Link to="/">↗ Open the app</Link>
          <button type="button" onClick={resetDemo}>
            {confirmReset ? "Click again to reset" : "Reset demo data"}
          </button>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="ad-body">
        <header className="ad-top">
          <h1>{title}</h1>
          <div className="ad-top-right">
            <span className="ad-who">
              <span className="avatar">AD</span>
              <span>Admin</span>
            </span>
            <button type="button" className="ad-logout" onClick={logout}>Logout</button>
          </div>
        </header>

        <main className="ad-main">
          {toast && (
            <div className="ad-toast" role="status">
              {toast}
            </div>
          )}

          {section === "dashboard" && (
            <Dashboard
              users={users}
              kycPending={kycPending}
              pendingRequests={pendingRequests}
              orders={orders}
              rates={rates}
              userById={userById}
              productByKey={productByKey}
              go={go}
            />
          )}
          {section === "users" && <Users users={users} updateUser={updateUser} />}
          {section === "wallet" && <WalletRequests requests={walletRequests} userById={userById} decide={decideRequest} />}
          {section === "rates" && <Rates rates={rates} />}
          {section === "orders" && <Orders orders={orders} userById={userById} productByKey={productByKey} />}

          <p className="disclaimer">
            Demo admin panel with sample data. Changes are saved in this browser only. Connect it to your backend before real use.
          </p>
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   Dashboard
   ========================================================= */
function Dashboard({ users, kycPending, pendingRequests, orders, rates, userById, productByKey, go }) {
  const blocked = users.filter((u) => u.blocked).length;
  const walletTotal = users.reduce((s, u) => s + u.balance, 0);
  const inTotal = pendingRequests.filter((r) => r.type === "in").reduce((s, r) => s + r.amount, 0);
  const outTotal = pendingRequests.filter((r) => r.type === "out").reduce((s, r) => s + r.amount, 0);
  const todayOrders = orders.filter((o) => isToday(o.time));
  const todayValue = todayOrders.reduce((s, o) => s + o.bags * o.rate, 0);
  const latest = [...orders].sort((a, b) => b.time - a.time).slice(0, 5);

  return (
    <>
      <section className="kpis">
        <article className="kpi">
          <small>Users</small>
          <strong>{users.length}</strong>
          <span>{users.length - blocked} active · {blocked} blocked</span>
        </article>
        <article className="kpi">
          <small>KYC waiting</small>
          <strong className={kycPending.length ? "warn" : ""}>{kycPending.length}</strong>
          <button type="button" className="link" onClick={() => go("users")}>Review →</button>
        </article>
        <article className="kpi">
          <small>Money in user wallets</small>
          <strong>{inr(walletTotal)}</strong>
          <span>Across all users</span>
        </article>
        <article className="kpi">
          <small>Wallet requests waiting</small>
          <strong className={pendingRequests.length ? "warn" : ""}>{pendingRequests.length}</strong>
          <span>In {inr(inTotal)} · Out {inr(outTotal)}</span>
        </article>
        <article className="kpi">
          <small>Orders today</small>
          <strong>{todayOrders.length}</strong>
          <span>{inr(todayValue)} traded</span>
        </article>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Needs your attention</h2>
          </div>
          {pendingRequests.length + kycPending.length === 0 ? (
            <p className="empty">All caught up. Nothing is waiting for review.</p>
          ) : (
            <ul className="todo">
              {pendingRequests.map((r) => (
                <li key={r.id}>
                  <span className={`dot ${r.type}`}>{r.type === "in" ? "↓" : "↑"}</span>
                  <div>
                    <strong>{r.type === "in" ? "Deposit" : "Withdrawal"} · {inr(r.amount)}</strong>
                    <small>{userById[r.userId]?.name} · {when(r.time)}</small>
                  </div>
                  <button type="button" className="btn sm" onClick={() => go("wallet")}>Review</button>
                </li>
              ))}
              {kycPending.map((u) => (
                <li key={u.id}>
                  <span className="dot kyc">ID</span>
                  <div>
                    <strong>KYC check · {u.name}</strong>
                    <small>{u.id} · joined {dateOnly(u.joined)}</small>
                  </div>
                  <button type="button" className="btn sm" onClick={() => go("users")}>Review</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Today's average rates</h2>
            <button type="button" className="link" onClick={() => go("rates")}>All cities →</button>
          </div>
          <ul className="snap">
            {PRODUCTS.map((p) => {
              const list = rates[p.key];
              const avgToday = list.reduce((s, r) => s + r.today, 0) / list.length;
              const avgYest = list.reduce((s, r) => s + r.yesterday, 0) / list.length;
              const change = ((avgToday - avgYest) / avgYest) * 100;
              return (
                <li key={p.key}>
                  <img alt="" src={p.image} />
                  <div>
                    <strong>{p.name}</strong>
                    <small>per {p.pack} · average of {list.length} cities</small>
                  </div>
                  <div className="num">
                    <strong>{inr(avgToday)}</strong>
                    <small className={change >= 0 ? "pos" : "neg"}>{pct(change)} vs yesterday</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Latest orders</h2>
          <button type="button" className="link" onClick={() => go("orders")}>All orders →</button>
        </div>
        <OrdersTable orders={latest} userById={userById} productByKey={productByKey} />
      </section>
    </>
  );
}

/* =========================================================
   Users
   ========================================================= */
function Users({ users, updateUser }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const shown = users.filter((u) => {
    const text = `${u.name} ${u.id} ${u.mobile} ${u.city}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (filter === "kyc") return u.kyc === "pending";
    if (filter === "active") return !u.blocked;
    if (filter === "blocked") return u.blocked;
    return true;
  });

  return (
    <section className="card">
      <div className="card-head wrap">
        <h2>All users</h2>
        <div className="tools">
          <input type="search" placeholder="Search name, ID, mobile or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
          <div className="seg" role="group" aria-label="Filter users">
            {[
              ["all", "All"],
              ["kyc", "KYC waiting"],
              ["active", "Active"],
              ["blocked", "Blocked"],
            ].map(([k, label]) => (
              <button key={k} type="button" className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Mobile</th>
              <th>City</th>
              <th>KYC</th>
              <th>Status</th>
              <th className="num">Wallet</th>
              <th>Joined</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small className="block">{u.id}</small>
                </td>
                <td>{u.mobile}</td>
                <td>{u.city}</td>
                <td>
                  <span className="badge" data-s={u.kyc}>{u.kyc === "verified" ? "Verified" : u.kyc === "pending" ? "Waiting" : "Rejected"}</span>
                </td>
                <td>
                  <span className="badge" data-s={u.blocked ? "blocked" : "active"}>{u.blocked ? "Blocked" : "Active"}</span>
                </td>
                <td className="num">{inr2(u.balance)}</td>
                <td>{dateOnly(u.joined)}</td>
                <td className="actions">
                  {u.kyc === "pending" && (
                    <>
                      <button type="button" className="btn sm ok" onClick={() => updateUser(u.id, { kyc: "verified" }, `KYC approved for ${u.name}.`)}>
                        Approve KYC
                      </button>
                      <button type="button" className="btn sm bad" onClick={() => updateUser(u.id, { kyc: "rejected" }, `KYC rejected for ${u.name}.`)}>
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => updateUser(u.id, { blocked: !u.blocked }, `${u.name} ${u.blocked ? "unblocked" : "blocked"}.`)}
                  >
                    {u.blocked ? "Unblock" : "Block"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="empty">No users match your search.</p>}
      </div>
    </section>
  );
}

/* =========================================================
   Wallet requests
   ========================================================= */
function WalletRequests({ requests, userById, decide }) {
  const [filter, setFilter] = useState("pending");
  const shown = requests
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => b.time - a.time);

  return (
    <section className="card">
      <div className="card-head wrap">
        <h2>Deposits and withdrawals</h2>
        <div className="seg" role="group" aria-label="Filter requests">
          {[
            ["pending", "Waiting"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["all", "All"],
          ].map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>User</th>
              <th>Type</th>
              <th>Method</th>
              <th className="num">Amount</th>
              <th className="num">Wallet now</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const u = userById[r.userId];
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.id}</strong>
                    <small className="block">{when(r.time)}</small>
                  </td>
                  <td>
                    {u?.name}
                    <small className="block">{r.userId}</small>
                  </td>
                  <td>
                    <span className="badge" data-s={r.type === "in" ? "Buy" : "Sell"}>{r.type === "in" ? "Deposit" : "Withdrawal"}</span>
                  </td>
                  <td>{r.method}</td>
                  <td className="num"><strong>{inr(r.amount)}</strong></td>
                  <td className="num">{u ? inr2(u.balance) : "—"}</td>
                  <td>
                    <span className="badge" data-s={r.status}>{r.status === "pending" ? "Waiting" : r.status[0].toUpperCase() + r.status.slice(1)}</span>
                  </td>
                  <td className="actions">
                    {r.status === "pending" && (
                      <>
                        <button type="button" className="btn sm ok" onClick={() => decide(r, true)}>Approve</button>
                        <button type="button" className="btn sm bad" onClick={() => decide(r, false)}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="empty">No requests here.</p>}
      </div>
    </section>
  );
}

/* =========================================================
   Mandi rates
   ========================================================= */
function Rates({ rates }) {
  const [productKey, setProductKey] = useState("potato");
  const list = rates[productKey];
  const cityInfo = (name) => CITIES.find((c) => c.name === name);

  return (
    <section className="card">
      <div className="toolbar">
        <div className="pills">
          {PRODUCTS.map((p) => (
            <button key={p.key} type="button" className={productKey === p.key ? "on" : ""} onClick={() => setProductKey(p.key)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">Today's rates as users see them on the Prices page. Rates come from the live price feed.</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th className="num">Today's rate</th>
              <th className="num">vs yesterday</th>
              <th className="num">Low – High</th>
              <th className="num">Arrivals (bags)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const change = ((r.today - r.yesterday) / r.yesterday) * 100;
              return (
                <tr key={`${productKey}-${r.city}`}>
                  <td>
                    <strong>{r.city}</strong>
                    <small className="block">{cityInfo(r.city)?.mandi}</small>
                  </td>
                  <td className="num">
                    <strong>{inr(r.today)}</strong>
                  </td>
                  <td className={`num ${change >= 0 ? "pos" : "neg"}`}>{pct(change)}</td>
                  <td className="num">
                    {inr(r.low)} – {inr(r.high)}
                  </td>
                  <td className="num">{r.arrivals.toLocaleString("en-IN")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* =========================================================
   Orders
   ========================================================= */
function Orders({ orders, userById, productByKey }) {
  const [q, setQ] = useState("");
  const [side, setSide] = useState("all");
  const shown = [...orders]
    .sort((a, b) => b.time - a.time)
    .filter((o) => side === "all" || o.side === side)
    .filter((o) => {
      if (!q) return true;
      const u = userById[o.userId];
      return `${o.id} ${u?.name} ${o.userId} ${o.city} ${productByKey(o.item)?.name}`.toLowerCase().includes(q.toLowerCase());
    });
  const total = shown.reduce((s, o) => s + o.bags * o.rate, 0);

  return (
    <section className="card">
      <div className="card-head wrap">
        <div>
          <h2>All orders</h2>
          <small className="muted">{shown.length} orders · {inr(total)} total value</small>
        </div>
        <div className="tools">
          <input type="search" placeholder="Search order, user, item or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
          <div className="seg" role="group" aria-label="Filter by side">
            {["all", "Buy", "Sell"].map((k) => (
              <button key={k} type="button" className={side === k ? "on" : ""} aria-pressed={side === k} onClick={() => setSide(k)}>
                {k === "all" ? "All" : k}
              </button>
            ))}
          </div>
        </div>
      </div>
      <OrdersTable orders={shown} userById={userById} productByKey={productByKey} />
    </section>
  );
}

function OrdersTable({ orders, userById, productByKey }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>User</th>
            <th>Side</th>
            <th>Item</th>
            <th className="num">Bags</th>
            <th className="num">Rate</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>{o.id}</strong>
                <small className="block">{when(o.time)}</small>
              </td>
              <td>
                {userById[o.userId]?.name}
                <small className="block">{o.userId}</small>
              </td>
              <td>
                <span className="badge" data-s={o.side}>{o.side}</span>
              </td>
              <td>
                {productByKey(o.item)?.name}
                <small className="block">{o.city}</small>
              </td>
              <td className="num">{o.bags}</td>
              <td className="num">{inr(o.rate)}</td>
              <td className="num"><strong>{inr(o.bags * o.rate)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p className="empty">No orders found.</p>}
    </div>
  );
}

export default Admin;