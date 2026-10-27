import "./Login.css";
import { Link } from "react-router-dom";

function Login() {
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

        <form>
          <label htmlFor="username">Mobile number or email</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="Enter mobile or email"
          />

          <label htmlFor="password">Password</label>
          <div className="password-wrap">
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
            />
            <button type="button" className="toggle">Show</button>
          </div>

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