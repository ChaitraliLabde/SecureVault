import { LockKeyhole, ShieldCheck } from "lucide-react";

export default function AuthShell({ children }) {
  return (
    <div className="login-screen">
      <section className="login-hero">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <ShieldCheck size={25} />
          </div>
          <div>
            <div className="auth-brand-name">SecureVault</div>
            <div className="auth-brand-tagline">
              Secure Digital Document Management
              <br />
              for Legal &amp; Investigation Documents
            </div>
          </div>
        </div>
        <div className="auth-hero-footer">
          <span><LockKeyhole size={14} /> Secure</span>
          <span>Organized</span>
          <span>Accountable</span>
        </div>
      </section>
      <div className="login-form-wrap">{children}</div>
    </div>
  );
}
