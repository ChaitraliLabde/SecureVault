import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import AuthShell from "../components/AuthShell";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/reset", { method: "POST", body: { token, password, confirm } });
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <form className="login-card" onSubmit={submit}>
        <h2>Choose a new password</h2>
        <p>Use the single-use token from your reset request. Tokens expire after 30 minutes.</p>
        <div className="field">
          <label>Reset token</label>
          <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
        </div>
        <div className="field">
          <label>New password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="field">
          <label>Confirm password</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary full-btn" type="submit" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </button>
        <p className="footer-copy">
          <Link to="/login">Back to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
