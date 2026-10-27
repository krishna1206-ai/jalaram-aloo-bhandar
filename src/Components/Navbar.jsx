import "./Navbar.css";
import { Link } from "react-router-dom";

function Navbar() {
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark">JA</span>
        <span className="brand-text">
          <strong>Jalaram Aloo Bhandar</strong>
          <small>COMMODITY MARKET</small>
        </span>
      </Link>
      <Link to="/login" className="login-link">Login</Link>
    </header>
  );
}

export default Navbar;