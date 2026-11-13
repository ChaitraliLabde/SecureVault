import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ROLE_LABELS } from "../lib/roleAccess";

export default function LoginTransition({ user, onComplete }) {
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const workspaceTimer = window.setTimeout(() => setLoadingWorkspace(true), 550);
    const fadeTimer = window.setTimeout(() => setFadingOut(true), 1120);
    const finishTimer = window.setTimeout(onComplete, 1550);
    return () => {
      window.clearTimeout(workspaceTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onComplete]);

  const role = ROLE_LABELS[user?.role] || user?.role || "SecureVault";

  return (
    <div className={`login-transition ${fadingOut ? "is-fading" : ""}`} role="status" aria-live="polite">
      <div className="login-transition-content">
        <div className="login-transition-mark"><ShieldCheck size={42} /></div>
        <strong className="login-transition-brand">SecureVault</strong>
        <div className="login-transition-spinner" aria-hidden="true" />
        <p>{loadingWorkspace ? `Loading ${role} Workspace…` : "Authenticating Credentials…"}</p>
      </div>
    </div>
  );
}
