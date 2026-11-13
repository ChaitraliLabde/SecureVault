import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import AuthShell from "../components/AuthShell";
import { useApp } from "../context/AppContext";

export default function Signup() {
  const { theme, setTheme } = useApp();
  const [form, setForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          username: form.username.trim(),
          password: form.password,
        },
      });
      setSubmitted(true);
    } catch (err) {
      setError(
        err.message === "Email or username already exists"
          ? "That email or username is already registered. Sign in or choose different details."
          : err.message || "Unable to create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="login-card">
        <div className="login-card-head signup-card-head">
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
        {submitted ? (
          <div className="signup-success" role="status">
            <h2>Request submitted</h2>
            <p>
              Your account is awaiting administrator approval. Once it is activated, you can
              sign in to SecureVault.
            </p>
            <Link className="btn btn-primary full-btn" to="/login">
              Continue to login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2>Create Account</h2>
            <p>Request secure access to the case and document workspace</p>
            <div className="field">
              <label htmlFor="signup-name">Full name</label>
              <input
                id="signup-name"
                className="input"
                value={form.name}
                onChange={update("name")}
                placeholder="Enter your full name"
                autoComplete="name"
                maxLength={100}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="signup-email">Work email</label>
              <input
                id="signup-email"
                className="input"
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="name@organization.gov"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="signup-username">Username</label>
              <input
                id="signup-username"
                className="input"
                value={form.username}
                onChange={update("username")}
                placeholder="Choose a username"
                autoComplete="username"
                maxLength={40}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <div className="pw-wrap">
                <input
                  id="signup-password"
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={update("password")}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="signup-confirm-password">Confirm password</label>
              <input
                id="signup-confirm-password"
                className="input"
                type="password"
                value={form.confirmPassword}
                onChange={update("confirmPassword")}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
              />
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="btn btn-primary full-btn" type="submit" disabled={loading}>
              {loading ? "Submitting…" : "Sign up"}
            </button>
            <p className="auth-switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
            <p className="signup-note">New accounts require administrator approval.</p>
          </form>
        )}
        <div className="footer-copy">SecureVault © 2026 · SIH26190</div>
      </div>
    </AuthShell>
  );
}
