import "./Navbar.css";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, logout } from "../auth.js";
import AccountMenu from "./AccountMenu";
import { USD_RATE } from "./Money";

const currencyOptions = [
  { value: "inr", symbol: "₹", label: " INR" },
  { value: "usd", symbol: "$", label: " USD" },
  { value: "both", symbol: "₹ / $", label: " " },
];

function Navbar() {
  const navigate = useNavigate();
  const [currency, setCurrency] = useState("both");
  const user = getUser();

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
          <AccountMenu user={user} currency={currency} onLogout={handleLogout} />
        ) : (
          <Link to="/login" className="login-link">Login</Link>
        )}
      </div>
    </header>
  );
}

export default Navbar;