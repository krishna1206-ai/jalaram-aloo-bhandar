import "./Navbar.css";
import { Link, useNavigate } from "react-router-dom";
import { getUser, logout } from "../auth.js";
import AccountMenu from "./AccountMenu";
import CurrencySwitch from "./CurrencySwitch";

function Navbar() {
  const navigate = useNavigate();
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
        <CurrencySwitch />

        {user ? (
          <AccountMenu user={user} onLogout={handleLogout} />
        ) : (
          <Link to="/login" className="login-link">Login</Link>
        )}
      </div>
    </header>
  );
}

export default Navbar;