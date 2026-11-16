import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import potatoImg from "../assets/images/potatoes.jpg";
import onionImg from "../assets/images/onions.jpg";
import garlicImg from "../assets/images/garlic.jpg";
import "./Admin.css";
import { isAdminLoggedIn, adminLogout } from "./AdminLogin.jsx";
import { adminSession, api, apiBlob } from "../api.js";

/* =========================================================
   Admin panel, backed by /api/admin on the server
   ========================================================= */

const PRODUCTS = [
  { key: "potato", name: "Potato", pack: "20 kg bag", image: potatoImg },
  { key: "onion", name: "Onion", pack: "20 kg bag", image: onionImg },
  { key: "garlic", name: "Garlic", pack: "5 kg bag", image: garlicImg },
];

const DOC_LABELS = {
  panCard: "PAN card",
  aadhaarFront: "Aadhaar (front)",
  selfie: "Selfie",
  signature: "Signature",
  cheque: "Cancelled cheque",
};

const adminApi = (path, options = {}) => api(path, { ...options, as: "admin" });

async function fetchPanel() {
  const [overview, catalog] = await Promise.all([adminApi("/admin/overview"), api("/market/catalog", { as: "none" })]);
  return { ...overview, cities: catalog.cities };
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
  activity: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "wallet", label: "Wallet requests" },
  { key: "rates", label: "Mandi rates" },
  { key: "orders", label: "Orders" },
  { key: "activity", label: "Activity log" },
];

/* =========================================================
   Page
   ========================================================= */
function Admin() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [section, setSection] = useState("dashboard");
  const [toast, setToast] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [signedOut, setSignedOut] = useState(!isAdminLoggedIn());

  // A 401 from any call means the admin token expired
  const fail = useCallback((err) => {
    if (err.status === 401) setSignedOut(true);
    else setToast(err.message);
  }, []);

  const reload = useCallback(() => fetchPanel().then(setData).catch(fail), [fail]);

  useEffect(() => {
    if (!isAdminLoggedIn()) return;
    let alive = true;
    fetchPanel()
      .then((d) => alive && setData(d))
      .catch((err) => {
        if (!alive) return;
        if (err.status === 401) setSignedOut(true);
        else setLoadError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Hide toast after a few seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const users = useMemo(() => data?.users || [], [data]);
  const userById = useMemo(
    () => Object.fromEntries([...users, ...(data?.extraUsers || [])].map((u) => [u.id, u])),
    [users, data]
  );
  const productByKey = (k) => PRODUCTS.find((p) => p.key === k);

  const go = (key) => {
    setSection(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---------- Actions ---------- */
  const replaceUser = (u) => setData((d) => ({ ...d, users: d.users.map((x) => (x.id === u.id ? u : x)) }));

  const updateUser = async (id, changes, message) => {
    try {
      const { user } = await adminApi(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: changes });
      replaceUser(user);
      if (message) setToast(message);
    } catch (err) {
      fail(err);
    }
  };

  const decideRequest = async (req, approve) => {
    try {
      const { request, user } = await adminApi(`/admin/wallet-requests/${encodeURIComponent(req.id)}/decision`, {
        method: "POST",
        body: { approve },
      });
      setData((d) => ({
        ...d,
        walletRequests: d.walletRequests.map((r) => (r.id === request.id ? request : r)),
        users: d.users.map((u) => (u.id === user.id ? user : u)),
      }));
      setToast(
        `${req.type === "in" ? "Deposit" : "Withdrawal"} of ${inr(req.amount)} for ${user.name} ${approve ? "approved" : "rejected"}.`
      );
    } catch (err) {
      fail(err);
      if (err.status === 409) reload();
    }
  };

  const saveRate = async (productKey, city, values) => {
    const { rate } = await adminApi(`/admin/rates/${productKey}/${encodeURIComponent(city)}`, { method: "PUT", body: values });
    setData((d) => ({ ...d, rates: { ...d.rates, [productKey]: d.rates[productKey].map((r) => (r.city === city ? rate : r)) } }));
    setToast(`${productByKey(productKey).name} rate for ${city} updated.`);
  };

  const resetDemo = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    try {
      await adminApi("/admin/reset-demo", { method: "POST" });
      await reload();
      setSection("dashboard");
      setToast("Demo data has been reset.");
    } catch (err) {
      fail(err);
    }
  };

  const logout = () => {
    adminLogout();
    navigate("/admin/login", { replace: true });
  };

  // Not signed in → go to the admin sign-in page
  if (signedOut || !isAdminLoggedIn()) return <Navigate to="/admin/login" replace />;

  if (!data) {
    return (
      <div className="ad">
        <main className="ad-main">
          {loadError ? (
            <p className="empty">
              {loadError}{" "}
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setLoadError("");
                  reload();
                }}
              >
                Try again
              </button>
            </p>
          ) : (
            <p className="empty">Loading admin panel…</p>
          )}
        </main>
      </div>
    );
  }

  const { walletRequests, orders, rates, cities } = data;
  const kycPending = users.filter((u) => u.kyc === "pending");
  const pendingRequests = walletRequests.filter((r) => r.status === "pending").sort((a, b) => b.time - a.time);
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
          <button type="button" onClick={reload}>Refresh data</button>
          {data.demoMode && (
            <button type="button" onClick={resetDemo}>
              {confirmReset ? "Click again to reset" : "Reset demo data"}
            </button>
          )}
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
          {section === "users" && <Users users={users} updateUser={updateUser} onError={fail} />}
          {section === "wallet" && <WalletRequests requests={walletRequests} userById={userById} decide={decideRequest} />}
          {section === "rates" && <Rates rates={rates} cities={cities} saveRate={saveRate} />}
          {section === "orders" && <Orders orders={orders} userById={userById} productByKey={productByKey} />}
          {section === "activity" && <Activity onError={fail} onToast={setToast} />}

          <p className="disclaimer">
            Changes are saved on the server straight away. Approving a deposit adds money to the user's wallet, so
            check that the payment has reached the collection account first.
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
function Users({ users, updateUser, onError }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [viewing, setViewing] = useState(null); // full KYC details of one user

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
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() =>
                      adminApi(`/admin/users/${encodeURIComponent(u.id)}`)
                        .then(({ user }) => setViewing(user))
                        .catch(onError)
                    }
                  >
                    KYC details
                  </button>
                  {u.kyc === "pending" && (
                    <>
                      <button type="button" className="btn sm ok" onClick={() => updateUser(u.id, { kyc: "verified" }, `KYC approved for ${u.name}.`)}>
                        Approve KYC
                      </button>
                      <button type="button" className="btn sm bad" onClick={() => {
                          const note = window.prompt(`Why is the KYC of ${u.name} rejected? The user will see this.`, "Documents are not clear");
                          if (note && note.trim()) updateUser(u.id, { kyc: "rejected", note: note.trim() }, `KYC rejected for ${u.name}.`);
                        }}>
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
      {viewing && <KycDetails user={viewing} onClose={() => setViewing(null)} onError={onError} />}
    </section>
  );
}

/* KYC application of one user, with the uploaded documents */
function KycDetails({ user, onClose, onError }) {
  const [openDoc, setOpenDoc] = useState(null); // { key, url, type }

  useEffect(() => () => openDoc && URL.revokeObjectURL(openDoc.url), [openDoc]);

  // Documents need the admin token, so fetch them as a blob instead of linking directly
  const showDoc = (key) =>
    apiBlob(`/admin/users/${encodeURIComponent(user.id)}/documents/${key}`, { as: "admin" })
      .then((blob) => setOpenDoc({ key, url: URL.createObjectURL(blob), type: blob.type }))
      .catch(onError);

  const p = user.profile || {};
  const a = user.address || {};
  const b = user.bank || {};
  const n = user.nominee || {};
  const day = (d) => (d ? dateOnly(d) : "—");
  const rows = [
    ["Name", user.name],
    ["Client ID", user.id],
    ["Mobile", user.mobileFull],
    ["Email", user.email],
    ["PAN", p.pan],
    ["Date of birth", day(p.dob)],
    ["Gender / marital status", [p.gender, p.maritalStatus].filter(Boolean).join(" · ")],
    ["Father's name", p.fatherName],
    ["Occupation / income", [p.occupation, p.income].filter(Boolean).join(" · ")],
    ["Experience", p.experience],
    ["Politically exposed", p.pep ? "Yes, needs extra checks" : "No"],
    ["Aadhaar", a.aadhaarLast4 ? `•••• •••• ${a.aadhaarLast4}` : "—"],
    ["Address", [a.line, a.city, a.state, a.pincode].filter(Boolean).join(", ")],
    ["Bank", b.accountNumber ? `${b.bankName} · ${b.accountNumber} · ${b.ifsc} · ${b.accountType}` : "—"],
    ["Account holder", b.accountHolder],
    ["UPI", b.upi || "—"],
    ["Nominee", n.name ? `${n.name} (${n.relation}), born ${day(n.dob)}${n.guardianName ? ` · guardian ${n.guardianName}` : ""}` : "Not added"],
  ];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head wrap">
        <h2>KYC · {user.name}</h2>
        <button type="button" className="btn sm ghost" onClick={onClose}>Close</button>
      </div>
      <div className="table-wrap">
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td><strong>{k}</strong></td>
                <td>{v || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {user.documents.length === 0 && <span className="muted">No documents uploaded.</span>}
        {user.documents.map((d) => (
          <button key={d.key} type="button" className={`btn sm ${openDoc?.key === d.key ? "ok" : "ghost"}`} onClick={() => showDoc(d.key)}>
            {DOC_LABELS[d.key] || d.key}
          </button>
        ))}
      </div>
      {openDoc && (
        <div style={{ marginTop: 12 }}>
          {openDoc.type === "application/pdf" ? (
            <iframe title={DOC_LABELS[openDoc.key]} src={openDoc.url} style={{ width: "100%", height: 480, border: 0 }} />
          ) : (
            <img alt={DOC_LABELS[openDoc.key]} src={openDoc.url} style={{ maxWidth: "100%", maxHeight: 480 }} />
          )}
        </div>
      )}
    </div>
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
function Rates({ rates, cities, saveRate }) {
  const [productKey, setProductKey] = useState("potato");
  const [editing, setEditing] = useState(null); // { city, today, low, high, arrivals }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const list = rates[productKey] || [];
  const cityInfo = (name) => cities.find((c) => c.name === name);

  const startEdit = (r) => {
    setError("");
    setEditing({ city: r.city, today: String(r.today), low: String(r.low), high: String(r.high), arrivals: String(r.arrivals) });
  };
  const field = (k) => ({
    value: editing[k],
    onChange: (e) => setEditing((x) => ({ ...x, [k]: e.target.value })),
    inputMode: "decimal",
    style: { width: 90 },
    "aria-label": k,
  });
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveRate(productKey, editing.city, {
        today: Number(editing.today),
        low: Number(editing.low),
        high: Number(editing.high),
        arrivals: Number(editing.arrivals),
      });
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="toolbar">
        <div className="pills">
          {PRODUCTS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={productKey === p.key ? "on" : ""}
              onClick={() => {
                setProductKey(p.key);
                setEditing(null);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Today's rates as users see them on the Prices page (₹ per bag). Orders are filled at today's rate. The first
        edit on a new day moves today's rate to yesterday and adds a new day to the price chart.
      </p>
      {error && <p className="neg" role="alert">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th className="num">Today's rate</th>
              <th className="num">vs yesterday</th>
              <th className="num">Low – High</th>
              <th className="num">Arrivals (bags)</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const change = ((r.today - r.yesterday) / r.yesterday) * 100;
              const isEditing = editing?.city === r.city;
              return (
                <tr key={`${productKey}-${r.city}`}>
                  <td>
                    <strong>{r.city}</strong>
                    <small className="block">{cityInfo(r.city)?.mandi}</small>
                  </td>
                  {isEditing ? (
                    <>
                      <td className="num"><input {...field("today")} /></td>
                      <td className="num muted">—</td>
                      <td className="num">
                        <input {...field("low")} /> – <input {...field("high")} />
                      </td>
                      <td className="num"><input {...field("arrivals")} inputMode="numeric" /></td>
                      <td className="actions">
                        <button type="button" className="btn sm ok" onClick={save} disabled={saving}>
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className="btn sm ghost" onClick={() => setEditing(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="num">
                        <strong>{inr(r.today)}</strong>
                      </td>
                      <td className={`num ${change >= 0 ? "pos" : "neg"}`}>{pct(change)}</td>
                      <td className="num">
                        {inr(r.low)} – {inr(r.high)}
                      </td>
                      <td className="num">{r.arrivals.toLocaleString("en-IN")}</td>
                      <td className="actions">
                        <button type="button" className="btn sm ghost" onClick={() => startEdit(r)}>Edit</button>
                      </td>
                    </>
                  )}
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


/* =========================================================
   Activity log + admin password
   ========================================================= */
const ACTION_LABELS = {
  "wallet.approve": "Approved wallet request",
  "wallet.reject": "Rejected wallet request",
  "kyc.verified": "Approved KYC",
  "kyc.rejected": "Rejected KYC",
  "kyc.pending": "Sent KYC back to review",
  "user.block": "Blocked user",
  "user.unblock": "Unblocked user",
  "rate.update": "Updated mandi rate",
  "demo.reset": "Reset demo data",
  "admin.password": "Changed admin password",
};

function describeDetail(e) {
  const d = e.detail || {};
  if (e.action.startsWith("wallet.")) return `${d.type === "in" ? "Deposit" : "Withdrawal"} ${inr(d.amount || 0)} · ${d.user || ""}`;
  if (e.action === "rate.update") return `Today ${inr(d.today)} · ${inr(d.low)}–${inr(d.high)} · ${d.arrivals} bags`;
  if (e.action === "kyc.rejected") return d.note || "";
  return "";
}

async function fetchAudit() {
  return (await adminApi("/admin/audit")).entries;
}

function Activity({ onError, onToast }) {
  const [entries, setEntries] = useState(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAudit()
      .then((list) => alive && setEntries(list))
      .catch((err) => alive && onError(err));
    return () => {
      alive = false;
    };
  }, [onError]);

  const changePassword = async () => {
    setSaving(true);
    try {
      const { token } = await adminApi("/admin/password", { method: "POST", body: pw });
      adminSession.set(token);
      setPw({ currentPassword: "", newPassword: "" });
      onToast("Admin password changed. Other admin sessions were signed out.");
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Who did what</h2>
          <small className="muted">Every change to money, KYC, users and rates is recorded here.</small>
        </div>
        {!entries ? (
          <p className="empty">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="empty">No admin actions yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>On</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{when(e.time)}</td>
                    <td>{e.admin}</td>
                    <td>{ACTION_LABELS[e.action] || e.action}</td>
                    <td>{e.target}</td>
                    <td className="muted">{describeDetail(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Change admin password</h2>
        </div>
        <div className="tools" style={{ flexWrap: "wrap", gap: 8 }}>
          <input
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            value={pw.currentPassword}
            onChange={(e) => setPw((x) => ({ ...x, currentPassword: e.target.value }))}
            aria-label="Current password"
          />
          <input
            type="password"
            placeholder="New password (10+ characters)"
            autoComplete="new-password"
            value={pw.newPassword}
            onChange={(e) => setPw((x) => ({ ...x, newPassword: e.target.value }))}
            aria-label="New password"
          />
          <button type="button" className="btn sm ok" onClick={changePassword} disabled={saving || !pw.currentPassword || !pw.newPassword}>
            {saving ? "Saving…" : "Change password"}
          </button>
        </div>
      </section>
    </>
  );
}

export default Admin;
