import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import "./AdminLogin.css";

/* =========================================================
   Admin sign in (React version of her admin login page)
   ========================================================= */

const AUTH_KEY = "jab-admin-auth";

// Demo login only. Anyone can read this in the browser,
// so replace it with a real backend check before going live.
const DEMO_ADMIN = { username: "admin", password: "admin@123" };

export function isAdminLoggedIn() {
  try {
    return sessionStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function adminLogin() {
  try {
    sessionStorage.setItem(AUTH_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function adminLogout() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  // Already signed in → straight to the panel
  if (isAdminLoggedIn()) return <Navigate to="/admin" replace />;

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
    adminLogin();
    navigate("/admin", { replace: true });
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

export default AdminLogin;