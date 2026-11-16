import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, verifyLogin } from "../auth.js";
import { api } from "../api.js";
import "./Register.css";

// Steps: "login" → (two-step) "otp"; or "forgot" → "reset" → back to "login"
function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null); // { challenge, sentTo, devMode }
  const [newPassword, setNewPassword] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

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

  const go = (next) => {
    setStep(next);
    setError("");
    setCode("");
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (step === "login") {
      if (!username.trim() || !password) return setError("Enter your mobile or email and password.");
      return run(async () => {
        const res = await login(username.trim(), password);
        if (res.twoFactor) {
          setChallenge(res);
          setNotice("");
          go("otp");
        } else navigate("/explore");
      });
    }
    if (step === "otp") {
      return run(async () => {
        await verifyLogin(challenge.challenge, code);
        navigate("/explore");
      });
    }
    if (step === "forgot") {
      if (!username.trim()) return setError("Enter your mobile or email.");
      return run(async () => {
        const res = await api("/auth/password/forgot", { method: "POST", body: { identifier: username.trim() }, as: "none" });
        setDevMode(Boolean(res.devMode));
        setNotice(res.message);
        go("reset");
      });
    }
    if (step === "reset") {
      return run(async () => {
        await api("/auth/password/reset", { method: "POST", body: { identifier: username.trim(), code, password: newPassword }, as: "none" });
        setPassword("");
        setNewPassword("");
        setNotice("Password changed. Log in with your new password.");
        go("login");
      });
    }
  };

  const otpInput = (
    <>
      <label htmlFor="code">OTP</label>
      <input
        id="code"
        type="text"
        inputMode="numeric"
        maxLength={6}
        autoComplete="one-time-code"
        placeholder="6-digit OTP"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ""));
          setError("");
        }}
      />
    </>
  );

  const titles = {
    login: ["Welcome back", "Sign in to view prices and manage your account"],
    otp: ["Enter the OTP", `We sent a code to ${challenge?.sentTo || "your mobile"}.`],
    forgot: ["Forgot password", "We'll send an OTP to your registered mobile number."],
    reset: ["Set a new password", "Enter the OTP and choose a new password."],
  };

  return (
    <div className="login-page">
      <Link to="/" className="back-link">← Back to home</Link>

      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">JA</span>
          <div>
            <strong>Jalaram Aloo Bhandar</strong>
            <small>COMMODITY MARKET</small>
          </div>
        </div>

        <h1>{titles[step][0]}</h1>
        <p className="sub">{titles[step][1]}</p>

        <form onSubmit={onSubmit}>
          {notice && <p className="success">{notice}</p>}

          {(step === "login" || step === "forgot") && (
            <>
              <label htmlFor="username">Mobile number or email</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Enter mobile or email"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
              />
            </>
          )}

          {step === "login" && (
            <>
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                />
                <button type="button" className="toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <button type="button" className="link" onClick={() => { setNotice(""); go("forgot"); }}>
                Forgot password?
              </button>
            </>
          )}

          {step === "otp" && (
            <>
              {otpInput}
              {challenge?.devMode && <p className="hint">Dev mode: use OTP <strong>123456</strong>.</p>}
            </>
          )}

          {step === "reset" && (
            <>
              {otpInput}
              {devMode && <p className="hint">Dev mode: use OTP <strong>123456</strong>.</p>}
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="8+ characters with A-z, 0-9 and a symbol"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError("");
                }}
              />
            </>
          )}

          {error && <span className="error">{error}</span>}

          <button type="submit" className="btn-primary submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : { login: <>Login <span>↗</span></>, otp: "Verify and log in", forgot: "Send OTP", reset: "Change password" }[step]}
          </button>

          {step !== "login" && (
            <button type="button" className="link" onClick={() => { setNotice(""); go("login"); }}>
              ← Back to login
            </button>
          )}

          {import.meta.env.DEV && step === "login" && (
            <p className="demo-hint">
              Demo Login <strong>test@gmail.com</strong> / <strong>123456</strong>
            </p>
          )}

          <div className="register-link">
            <span>Don't have an Account?</span>
            <Link to="/register">Register yourself</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
