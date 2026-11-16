import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import "./AdminLogin.css";
import { adminSession, api } from "../api.js";

/* =========================================================
   Admin sign in (checked by the backend)
   ========================================================= */

export function isAdminLoggedIn() {
  return Boolean(adminSession.get());
}

export function adminLogout() {
  adminSession.clear();
}

function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in → straight to the panel
  if (isAdminLoggedIn()) return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      const { token } = await api("/auth/admin/login", { method: "POST", body: { username: username.trim(), password }, as: "none" });
      adminSession.set(token);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
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

        <button type="submit" className="al-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>

        {import.meta.env.DEV && (
          <p className="al-demo">
            Dev login: <b>admin</b> / <b>admin@123</b>
          </p>
        )}
        <Link to="/" className="al-back">← Back to the app</Link>
      </form>
    </main>
  );
}

export default AdminLogin;