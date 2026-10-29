import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Money from "./Money";
import { initialsOf } from "../auth.js";

// Account dropdown (converted from the Angular version).
// Usage: <AccountMenu user={user} currency={currency} onLogout={handleLogout} />
export default function AccountMenu({ user, currency = "inr", onLogout = () => {} }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();
  const initials = initialsOf(user?.name);

  // close menu when page or tab changes
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  // close menu on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar-sm">{initials}</span>
        <span className="acc-name">Account</span>
        <i className={`caret ${open ? "up" : ""}`}></i>
      </button>

      {open && (
        <div role="menu" className="account-dropdown">
          <div className="dd-head">
            <span className="avatar-sm lg">{initials}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.clientId}</small>
            </div>
          </div>

          <div className="dd-wallet">
            <small>Wallet balance</small>
            <strong>
              <Money value={user.balance} currency={currency} />
            </strong>
          </div>

          <Link to="/account" role="menuitem">My account</Link>
          <Link to="/account?tab=holdings" role="menuitem">My godown</Link>
          <Link to="/account?tab=transactions" role="menuitem">Transactions</Link>
          <Link to="/account?tab=profile" role="menuitem">Profile &amp; security</Link>
          <button
            type="button"
            role="menuitem"
            className="dd-logout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}