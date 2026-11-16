import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import { logout, saveSession } from "../../auth.js";

// Password, PIN, two-step login, marketing emails, sign out everywhere
export default function SecurityPanel({ user, onUser, onToast }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(null); // "password" | "pin" | "twoFactor"
  const [f, setF] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinOtpSent, setPinOtpSent] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const field = (k, props = {}) => ({
    id: `sec-${k}`,
    value: f[k] || "",
    onChange: (e) => {
      setF((x) => ({ ...x, [k]: props.inputMode === "numeric" ? e.target.value.replace(/\D/g, "") : e.target.value }));
      setError("");
    },
    ...props,
  });

  const show = (name) => {
    setOpen(open === name ? null : name);
    setF({});
    setError("");
    setPinOtpSent(false);
  };

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = () =>
    run(async () => {
      if (f.newPassword !== f.confirmPassword) throw new Error("New passwords do not match.");
      const { token, user: summary } = await api("/me/password", {
        method: "POST",
        body: { currentPassword: f.currentPassword, newPassword: f.newPassword },
      });
      saveSession(token, summary); // this device stays signed in; others are signed out
      setOpen(null);
      onToast("Password changed. Other devices have been signed out.");
    });

  const sendPinOtp = () =>
    run(async () => {
      const res = await api("/me/pin/otp", { method: "POST" });
      setDevMode(Boolean(res.devMode));
      setPinOtpSent(true);
    });

  const resetPin = () =>
    run(async () => {
      if (f.pin !== f.confirmPin) throw new Error("PINs do not match.");
      await api("/me/pin", { method: "POST", body: { password: f.password, code: f.code, pin: f.pin } });
      setOpen(null);
      onToast("Transaction PIN changed.");
      onUser({ ...user, pinLocked: false });
    });

  const setTwoFactor = () =>
    run(async () => {
      const res = await api("/me/settings", { method: "PATCH", body: { twoFactor: !user.twoFactor, password: f.password } });
      onUser(res.user);
      setOpen(null);
      onToast(res.user.twoFactor ? "Two-step login is on. You'll get an OTP on your mobile when you log in." : "Two-step login is off.");
    });

  const setMarketing = (on) =>
    api("/me/settings", { method: "PATCH", body: { marketing: on } })
      .then((res) => onUser(res.user))
      .catch((err) => onToast(err.message));

  const logoutAll = () =>
    run(async () => {
      await api("/me/logout-all", { method: "POST" });
      logout();
      navigate("/login", { replace: true });
    });

  const actions = (label, onClick) => (
    <>
      {error && <span className="error">{error}</span>}
      <div className="panel-actions">
        <button type="button" className="btn solid" onClick={onClick} disabled={busy}>{busy ? "Please wait…" : label}</button>
        <button type="button" className="btn outline" onClick={() => setOpen(null)}>Cancel</button>
      </div>
    </>
  );

  return (
    <article className="info-card wide">
      <h3>Security</h3>
      <dl>
        <div>
          <dt>Password</dt>
          <dd>•••••••••• <button type="button" className="text-btn" onClick={() => show("password")}>Change</button></dd>
        </div>
        <div>
          <dt>Transaction PIN</dt>
          <dd>
            {user.pinLocked ? "Locked for a few minutes (too many wrong tries)" : "Set"}{" "}
            <button type="button" className="text-btn" onClick={() => show("pin")}>Reset</button>
          </dd>
        </div>
        <div><dt>Last login</dt><dd>{user.lastLogin}</dd></div>
        <div>
          <dt>Two-step login</dt>
          <dd>
            {user.twoFactor ? "On · OTP to your mobile at every login" : "Off"}{" "}
            <button type="button" className="text-btn" onClick={() => show("twoFactor")}>{user.twoFactor ? "Turn off" : "Turn on"}</button>
          </dd>
        </div>
        <div>
          <dt>Price alerts & updates</dt>
          <dd>
            <label className="switch">
              <input type="checkbox" checked={user.marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <i></i>
              <span>{user.marketing ? "On" : "Off"}</span>
            </label>
          </dd>
        </div>
        <div>
          <dt>Devices</dt>
          <dd><button type="button" className="text-btn" onClick={logoutAll} disabled={busy}>Log out on all devices</button></dd>
        </div>
      </dl>

      {open === "password" && (
        <div className="money-panel">
          <label htmlFor="sec-currentPassword">Current password</label>
          <input type="password" autoComplete="current-password" {...field("currentPassword")} />
          <label htmlFor="sec-newPassword">New password</label>
          <input type="password" autoComplete="new-password" placeholder="8+ characters with A-z, 0-9 and a symbol" {...field("newPassword")} />
          <label htmlFor="sec-confirmPassword">Confirm new password</label>
          <input type="password" autoComplete="new-password" {...field("confirmPassword")} />
          {actions("Change password", changePassword)}
        </div>
      )}

      {open === "pin" && (
        <div className="money-panel">
          {!pinOtpSent ? (
            <>
              <p className="muted small">We'll send an OTP to your registered mobile ({user.mobile}).</p>
              {error && <span className="error">{error}</span>}
              <div className="panel-actions">
                <button type="button" className="btn solid" onClick={sendPinOtp} disabled={busy}>{busy ? "Sending…" : "Send OTP"}</button>
                <button type="button" className="btn outline" onClick={() => setOpen(null)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="sec-code">OTP</label>
              <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" {...field("code", { inputMode: "numeric" })} />
              {devMode && <span className="field-hint">Dev mode: use OTP 123456.</span>}
              <label htmlFor="sec-password">Your password</label>
              <input type="password" autoComplete="current-password" {...field("password")} />
              <label htmlFor="sec-pin">New 6-digit PIN</label>
              <input type="password" maxLength={6} autoComplete="off" {...field("pin", { inputMode: "numeric" })} />
              <label htmlFor="sec-confirmPin">Confirm new PIN</label>
              <input type="password" maxLength={6} autoComplete="off" {...field("confirmPin", { inputMode: "numeric" })} />
              {actions("Change PIN", resetPin)}
            </>
          )}
        </div>
      )}

      {open === "twoFactor" && (
        <div className="money-panel">
          <p className="muted small">
            {user.twoFactor
              ? "Turning this off means your password alone can open your account."
              : `After your password, we'll send an OTP to ${user.mobile} every time you log in.`}
          </p>
          <label htmlFor="sec-password">Confirm with your password</label>
          <input type="password" autoComplete="current-password" {...field("password")} />
          {actions(user.twoFactor ? "Turn off" : "Turn on", setTwoFactor)}
        </div>
      )}
    </article>
  );
}
