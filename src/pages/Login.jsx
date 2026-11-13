import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { useApp } from "../context/AppContext";

export default function Login() {
  const { login, theme, setTheme, beginEntranceTransition } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password, mfaRequired ? mfaCode.trim() : undefined);
      beginEntranceTransition();
      navigate("/", { replace: true });
    } catch (err) {
      if (err.code === "MFA_REQUIRED" || err.code === "MFA_INVALID") setMfaRequired(true);
      setError(err.message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-head">
            <div>
              <h2>Welcome Back</h2>
              <p>Sign in to access your cases and documents</p>
            </div>
            <button
              className="login-theme-toggle"
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              <span>{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
            </button>
          </div>
          <div className="field">
            <label>Username or Email</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username or email"
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <div className="pw-wrap">
              <input
                className="input"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShow((v) => !v)}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {mfaRequired ? (
            <div className="field">
              <label htmlFor="mfa-code">Authenticator or recovery code</label>
              <input
                id="mfa-code"
                className="input"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="6-digit code or recovery code"
                autoComplete="one-time-code"
                autoFocus
                required
              />
              <span className="muted" style={{ fontSize: 12 }}>Enter your current authenticator code or an unused recovery code.</span>
            </div>
          ) : null}
          <div className="login-meta">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-primary full-btn" type="submit" disabled={loading}>
            {loading ? "Verifying…" : mfaRequired ? "Verify and sign in" : "Login"}
          </button>
          <p className="auth-switch">
            New to SecureVault? <Link to="/signup">Create an account</Link>
          </p>
        
          
          <div className="footer-copy">SecureVault © 2026 · SIH26190</div>
        </form>
    </AuthShell>
  );
}
