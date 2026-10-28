import "./Navbar.css";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getUser, logout, initialsOf } from "../auth.js";

const USD_RATE = 95.27; // 1 USD = ₹95.27

const currencyOptions = [
  { value: "inr", symbol: "₹", label: " INR" },
  { value: "usd", symbol: "$", label: " USD" },
  { value: "both", symbol: "₹ / $", label: " " },
];

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currency, setCurrency] = useState("both");
  const menuRef = useRef(null);

  const user = getUser();
  const initials = initialsOf(user?.name);

  // close menu when page changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark">JA</span>
        <span className="brand-text">
          <strong>Jalaram Aloo Bhandar</strong>
          <small>COMMODITY MARKET</small>
        </span>
      </Link>

      <div className="topbar-right">
        {/* Currency switch */}
        <div className="cs" role="group" aria-label="Display currency" title={`1 USD = ₹${USD_RATE} (live rate)`}>
          {currencyOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={currency === o.value ? "on" : ""}
              aria-pressed={currency === o.value}
              onClick={() => setCurrency(o.value)}
            >
              {o.symbol}
              <span className="full">{o.label}</span>
            </button>
          ))}
        </div>

        {user ? (
          <div className="account-menu" ref={menuRef}>
            <button type="button" className="account-trigger" onClick={() => setMenuOpen(!menuOpen)}>
              <span className="avatar-sm">{initials}</span>
              <span className="acc-name">Account</span>
              <i className={`caret ${menuOpen ? "up" : ""}`}></i>
            </button>

            {menuOpen && (
              <div className="account-dropdown">
                <div className="dd-head">
                  <span className="avatar-sm lg">{initials}</span>
                  <div>
                    <strong>{user.name}</strong>
                    <small>{user.clientId}</small>
                  </div>
                </div>

                <div className="dd-wallet">
                  <small>Wallet balance</small>
                  <strong>₹{user.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                </div>

                <Link to="/account">My account</Link>
                <Link to="/account?tab=holdings">My godown</Link>
                <Link to="/account?tab=transactions">Transactions</Link>
                <Link to="/account?tab=profile">Profile &amp; security</Link>
                <button type="button" className="dd-logout" onClick={handleLogout}>Logout</button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="login-link">Login</Link>
        )}
      </div>
    </header>
  );
}

export default Navbar;