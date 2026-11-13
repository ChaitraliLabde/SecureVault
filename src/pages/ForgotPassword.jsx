import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import AuthShell from "../components/AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/auth/forgot", { method: "POST", body: { email } });
      setSent(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <form className="login-card" onSubmit={submit}>
        <h2>Forgot password</h2>
        <p>
          Enter your registered email. Reset tokens expire in 30 minutes and can be used only once.
        </p>
        <div className="field">
          <label>Registered email</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="chaitrali@securecase.local"
          />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary full-btn" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset request"}
        </button>
        {sent ? (
          <div className="hint">
            {sent.message}
            {sent.demoToken ? (
              <p style={{ marginTop: 8 }}>
                Demo token (shown only in this local prototype):{" "}
                <code>{sent.demoToken}</code>
                <br />
                <Link to={`/reset-password?token=${sent.demoToken}`}>Open reset form</Link>
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="footer-copy">
          <Link to="/login">Back to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
