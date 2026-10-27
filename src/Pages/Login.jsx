import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../auth";
import "./Register.css";

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    if (login(username, password)) {
      navigate("/explore");
    } else {
      setError("Wrong email or password. Use the demo login below.");
    }
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

        <h1>Welcome back</h1>
        <p className="sub">Sign in to view prices and manage your account</p>

        <form onSubmit={onSubmit}>
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

          {error && <span className="error">{error}</span>}

          <button type="submit" className="btn-primary submit">
            Login <span>↗</span>
          </button>

          <p className="demo-hint">
            Demo Login <strong>test@gmail.com</strong> / <strong>123456</strong>
          </p>

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