import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { hasPermission, ROLE_LABELS } from "../lib/roleAccess";
import ProfileAvatar from "../components/ProfileAvatar";

export default function Settings() {
  const {
    user,
    notify,
    logout,
    refreshUser,
    updateUser,
    theme,
    setTheme,
  } = useApp();

  const isAdmin = user?.role === "Admin";

  const canManageSystemSettings = hasPermission(user, "admin.users");

  const [settings, setSettings] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [pw, setPw] = useState({
    current: "",
    password: "",
    confirm: "",
  });

  const [error, setError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaEnrollment, setMfaEnrollment] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [mfaError, setMfaError] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [disableMfa, setDisableMfa] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const avatarInputRef = useRef(null);

  const mfaQrUri = [
    mfaEnrollment?.otpauthUri,
    mfaEnrollment?.otpauth,
    mfaEnrollment?.qrCode,
    mfaEnrollment?.qrCodeUrl,
  ].find(
    (value) =>
      typeof value === "string" &&
      value.startsWith("otpauth://")
  );

  const mfaQrImage = [
    mfaEnrollment?.qrCode,
    mfaEnrollment?.qrCodeUrl,
  ].find(
    (value) =>
      typeof value === "string" &&
      value.startsWith("data:image/")
  );

  // PROFILE PICTURE

  const updateAvatar = async (file) => {
    setAvatarError("");

    if (!file) return;

    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setAvatarError(
        "Choose a JPEG or PNG image no larger than 5 MB."
      );
      return;
    }

    setAvatarBusy(true);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const result = await api("/api/profile/avatar", {
        method: "PATCH",
        form: formData,
      });

      if (!result.user) {
        throw new Error(
          "The server did not return the updated user profile."
        );
      }

      updateUser(result.user);
      notify("Profile picture updated");
    } catch (uploadError) {
      console.error(
        uploadError.response?.data?.message ||
          uploadError.message
      );

      setAvatarError(uploadError.message);
    } finally {
      setAvatarBusy(false);

      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    setAvatarError("");

    try {
      const result = await api("/api/profile/avatar", {
        method: "PATCH",
        body: { avatar: null },
      });

      if (!result.user) {
        throw new Error(
          "The server did not return the updated user profile."
        );
      }

      updateUser(result.user);
      notify("Profile picture removed");
    } catch (removeError) {
      console.error(
        removeError.response?.data?.message ||
          removeError.message
      );

      setAvatarError(removeError.message);
    } finally {
      setAvatarBusy(false);
    }
  };

  // PERSONAL MFA

  const startMfaEnrollment = async (e) => {
    e.preventDefault();

    setMfaError("");
    setMfaBusy(true);

    try {
      const result = await api("/api/profile/mfa/enroll", {
        method: "POST",
        body: { password: mfaPassword },
      });

      setMfaEnrollment(result);
      setMfaCode("");
      setMfaPassword("");
    } catch (err) {
      setMfaError(err.message);
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmMfaEnrollment = async (e) => {
    e.preventDefault();

    setMfaError("");
    setMfaBusy(true);

    try {
      const result = await api("/api/profile/mfa/confirm", {
        method: "POST",
        body: { code: mfaCode.trim() },
      });

      setRecoveryCodes(result.recoveryCodes);
      setMfaEnrollment(null);
      setMfaCode("");

      await refreshUser();

      notify("Multi-factor authentication enabled");
    } catch (err) {
      setMfaError(err.message);
    } finally {
      setMfaBusy(false);
    }
  };

  const disableMfaForSelf = async (e) => {
    e.preventDefault();

    setMfaError("");
    setMfaBusy(true);

    try {
      await api("/api/profile/mfa/disable", {
        method: "POST",
        body: {
          password: mfaPassword,
          code: mfaCode.trim(),
        },
      });

      setMfaPassword("");
      setMfaCode("");
      setDisableMfa(false);

      await refreshUser();

      notify("Multi-factor authentication disabled");
    } catch (err) {
      setMfaError(err.message);
    } finally {
      setMfaBusy(false);
    }
  };

  // LOAD SYSTEM SETTINGS

  useEffect(() => {
    api("/api/settings")
      .then((d) => setSettings(d.settings))
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  // SAVE SYSTEM SETTINGS

  const saveSettings = async (e, successMessage) => {
    e.preventDefault();

    setError("");
    setSavingSettings(true);

    try {
      await api("/api/settings", {
        method: "PATCH",
        body: { settings },
      });

      notify(successMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  if (!loaded) {
    return <div className="empty">Loading settings…</div>;
  }

  if (error && !settings) {
    return (
      <div className="card empty" role="alert">
        {error}
      </div>
    );
  }

  // PAGE

  return (
    <div>
      <div className="page-head">
  <div>
    <h1>Profile & Settings</h1>
    <p>Account security and system settings for the shared workspace.</p>
  </div>
</div>

      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid-2">

        {/* PROFILE SETTINGS */}

        {true && (
          <>
            {/* PROFILE PICTURE AND APPEARANCE */}

            <section
              className="card card-pad profile-preferences"
              aria-label="Profile picture and appearance"
            >
              <div className="card-title">
                Profile picture
              </div>

              <div className="profile-picture-preview">
                <ProfileAvatar
                  user={user}
                  className="profile-avatar-large"
                />

                <div>
                  <strong>{user.name}</strong>

                  <p className="muted">
                    {user.avatar
                      ? "Custom profile picture"
                      : "Showing initials avatar"}
                  </p>
                </div>
              </div>

              {avatarError ? (
                <p className="form-error" role="alert">
                  {avatarError}
                </p>
              ) : null}

              <input
                ref={avatarInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png"
                aria-label="Choose JPEG or PNG profile picture"
                onChange={(event) =>
                  updateAvatar(event.target.files?.[0])
                }
              />

              <div className="actions-row">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={avatarBusy}
                  onClick={() =>
                    avatarInputRef.current?.click()
                  }
                >
                  {avatarBusy
                    ? "Saving…"
                    : "Upload Profile Picture"}
                </button>

                {user.avatar ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={avatarBusy}
                    onClick={removeAvatar}
                  >
                    Remove / Delete PFP
                  </button>
                ) : null}
              </div>

              <div className="theme-preference">
                <div>
                  <strong>Appearance</strong>

                  <p className="muted">
                    Choose a display theme for this browser.
                  </p>
                </div>

                <button
                  className={`theme-switch ${
                    theme === "dark" ? "is-dark" : ""
                  }`}
                  type="button"
                  role="switch"
                  aria-checked={theme === "dark"}
                  onClick={() =>
                    setTheme(
                      theme === "dark" ? "light" : "dark"
                    )
                  }
                >
                  <span className="theme-switch-knob" />

                  {theme === "dark"
                    ? "Dark Mode"
                    : "Light Mode"}
                </button>
              </div>
            </section>

            {/* PASSWORD MANAGEMENT */}

            <form
              className="card card-pad"
              onSubmit={async (e) => {
                e.preventDefault();

                setError("");

                if (pw.password !== pw.confirm) {
                  setError("New passwords do not match.");
                  return;
                }

                if (pw.password.length < 8) {
                  setError(
                    "New password must be at least 8 characters."
                  );
                  return;
                }

                setSavingPassword(true);

                try {
                  await api("/api/profile/password", {
                    method: "PATCH",
                    body: pw,
                  });

                  notify("Password changed");

                  setPw({
                    current: "",
                    password: "",
                    confirm: "",
                  });
                } catch (err) {
                  setError(err.message);
                } finally {
                  setSavingPassword(false);
                }
              }}
            >
              <div className="card-title">
                Profile
              </div>

              <p>
                <strong>{user.name}</strong>
                <br />
                {user.email} · {ROLE_LABELS[user.role] || user.role}
              </p>

              <div className="field">
                <label>Current password</label>

                <input
                  className="input"
                  type="password"
                  value={pw.current}
                  onChange={(e) =>
                    setPw({ ...pw, current: e.target.value })
                  }
                />
              </div>

              <div className="field">
                <label>New password</label>

                <input
                  className="input"
                  type="password"
                  value={pw.password}
                  onChange={(e) =>
                    setPw({ ...pw, password: e.target.value })
                  }
                />
              </div>

              <div className="field">
                <label>Confirm password</label>

                <input
                  className="input"
                  type="password"
                  value={pw.confirm}
                  onChange={(e) =>
                    setPw({ ...pw, confirm: e.target.value })
                  }
                />
              </div>

              <div className="actions-row">
                <button
                  className="btn btn-ghost settings-end-session"
                  type="button"
                  onClick={logout}
                >
                  End session
                </button>

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={savingPassword}
                >
                  {savingPassword
                    ? "Changing…"
                    : "Change password"}
                </button>
              </div>
            </form>

            {/* PERSONAL MULTI-FACTOR AUTHENTICATION */}

            <section
              className="card card-pad"
              aria-label="Multi-factor authentication"
            >
              <div className="card-title">
                Multi-factor authentication
              </div>

              <p>
                Status:{" "}
                <strong>
                  {user.mfaEnabled ? "Enabled" : "Disabled"}
                </strong>

                {user.mfaEnabled
                  ? ` · ${user.mfaRecoveryCodesRemaining} recovery codes remaining`
                  : ""}
              </p>

              {mfaError ? (
                <p className="form-error" role="alert">
                  {mfaError}
                </p>
              ) : null}

              {recoveryCodes.length ? (
                <div
                  className="warn-banner card card-pad"
                  role="alert"
                  style={{ marginBottom: 16 }}
                >
                  <strong>
                    Save these recovery codes now.
                  </strong>

                  <p>
                    Each code works once. They will not be shown again.
                  </p>

                  <ul>
                    {recoveryCodes.map((code) => (
                      <li key={code}>
                        <code>{code}</code>
                      </li>
                    ))}
                  </ul>

                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setRecoveryCodes([])}
                  >
                    I saved these codes
                  </button>
                </div>
              ) : null}

              {!user.mfaEnabled && !mfaEnrollment ? (
                <form onSubmit={startMfaEnrollment}>
                  <p className="muted">
                    Add an authenticator app such as Google
                    Authenticator or Authy. Enrollment requires
                    your current password.
                  </p>

                  <div className="field">
                    <label htmlFor="mfa-enroll-password">
                      Current password
                    </label>

                    <input
                      id="mfa-enroll-password"
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={mfaPassword}
                      onChange={(e) =>
                        setMfaPassword(e.target.value)
                      }
                    />
                  </div>

                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={mfaBusy}
                  >
                    {mfaBusy
                      ? "Starting…"
                      : "Enable Multi-Factor Authentication"}
                  </button>
                </form>
              ) : null}

              {mfaEnrollment ? (
                <form onSubmit={confirmMfaEnrollment}>
                  <p>
                    In your authenticator app, add a new account
                    using this setup key:
                  </p>

                  {mfaQrUri || mfaQrImage ? (
                    <div className="mfa-qr-container">
                      {mfaQrImage ? (
                        <img
                          src={mfaQrImage}
                          alt="Scan this QR code with your authenticator app"
                        />
                      ) : (
                        <QRCodeSVG
                          value={mfaQrUri}
                          size={192}
                          level="M"
                          title="Authenticator setup QR code"
                        />
                      )}
                    </div>
                  ) : null}

                  <div className="field">
                    <label htmlFor="mfa-setup-key">
                      Setup key
                    </label>

                    <input
                      id="mfa-setup-key"
                      className="input"
                      value={mfaEnrollment.secret}
                      readOnly
                      onFocus={(e) => e.target.select()}
                    />
                  </div>

                  <p
                    className="muted"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    Or open this authenticator link on a device
                    with an authenticator app:{" "}
                    <a href={mfaEnrollment.otpauthUri}>
                      {mfaEnrollment.otpauthUri}
                    </a>
                  </p>

                  <p className="muted">
                    Setup expires in 10 minutes. Enter the current
                    six-digit code to confirm enrollment.
                  </p>

                  <div className="field">
                    <label htmlFor="mfa-confirm-code">
                      Authenticator code
                    </label>

                    <input
                      id="mfa-confirm-code"
                      className="input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={mfaCode}
                      onChange={(e) =>
                        setMfaCode(e.target.value)
                      }
                    />
                  </div>

                  <div className="actions-row">
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={mfaBusy}
                      onClick={() => {
                        setMfaEnrollment(null);
                        setMfaCode("");
                      }}
                    >
                      Cancel setup
                    </button>

                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={mfaBusy}
                    >
                      {mfaBusy
                        ? "Verifying…"
                        : "Verify and enable"}
                    </button>
                  </div>
                </form>
              ) : null}

              {user.mfaEnabled && !disableMfa ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setMfaError("");
                    setDisableMfa(true);
                  }}
                >
                  Disable MFA
                </button>
              ) : null}

              {user.mfaEnabled && disableMfa ? (
                <form onSubmit={disableMfaForSelf}>
                  <p className="muted">
                    Enter your password and a current authenticator
                    code or unused recovery code to disable MFA.
                  </p>

                  <div className="field">
                    <label htmlFor="mfa-disable-password">
                      Current password
                    </label>

                    <input
                      id="mfa-disable-password"
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={mfaPassword}
                      onChange={(e) =>
                        setMfaPassword(e.target.value)
                      }
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="mfa-disable-code">
                      Authenticator or recovery code
                    </label>

                    <input
                      id="mfa-disable-code"
                      className="input"
                      autoComplete="one-time-code"
                      required
                      value={mfaCode}
                      onChange={(e) =>
                        setMfaCode(e.target.value)
                      }
                    />
                  </div>

                  <div className="actions-row">
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={mfaBusy}
                      onClick={() => setDisableMfa(false)}
                    >
                      Cancel
                    </button>

                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={mfaBusy}
                    >
                      {mfaBusy
                        ? "Disabling…"
                        : "Confirm disable"}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          </>
        )}

        {/* SYSTEM CONFIGURATION - ADMIN ONLY */}

       {isAdmin &&
  canManageSystemSettings &&
  settings && (
            <form
              className="card card-pad"
              onSubmit={(e) =>
                saveSettings(e, "System settings saved")
              }
            >
              <div className="card-title">
                System Configuration
              </div>

              <div className="field">
                <label>Organization</label>

                <input
                  className="input"
                  value={settings.org}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      org: e.target.value,
                    })
                  }
                />
              </div>

              <div className="field">
                <label>Document retention</label>

                <select
                  className="select"
                  value={settings.retention}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retention: e.target.value,
                    })
                  }
                >
                  <option>5 years</option>
                  <option>7 years</option>
                  <option>10 years</option>
                </select>
              </div>

              <div className="field">
                <label>Encryption</label>

                <input
                  className="input"
                  value={settings.encryption}
                  readOnly
                />
              </div>

                        {/* SECURITY POLICIES */}

          <div className="card-title" style={{ marginTop: "20px" }}>
            Security Policies
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={settings.mfa}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  mfa: e.target.checked,
                })
              }
            />

            Require multi-factor authentication
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={settings.watermark}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  watermark: e.target.checked,
                })
              }
            />

            Apply confidential watermark on downloads
          </label>

          <div className="actions-row">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={savingSettings}
            >
              {savingSettings
                ? "Saving…"
                : "Save system settings"}
            </button>
          </div>
                      </form>
                    )}
      </div>
    </div>
  );
}