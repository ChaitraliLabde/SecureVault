import {
  Bell,
  Lock,
  LogOut,
  MessageSquare,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { hasPermission, ROLE_LABELS, ROLE_NAVIGATION } from "../lib/roleAccess";
import Modal from "./Modal";
import ProfileAvatar from "./ProfileAvatar";

export default function Layout() {
  const { user, logout, theme, setTheme, notify } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [openNotes, setOpenNotes] = useState(false);
  const unreadCount = notes.filter((n) => !n.read).length;
  const unreadNotes = notes.filter((n) => !n.read);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState({ category: "Suggestion", subject: "", description: "" });
  const [feedbackError, setFeedbackError] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const profileMenuRef = useRef(null);
  const markNotificationRead = async (notification) => {
  if (notification.read) return;

  try {
    await api(`/api/notifications/${notification.id}/read`, {
      method: "PATCH",
    });

    setNotes((previous) =>
      previous.map((n) =>
        n.id === notification.id ? { ...n, read: true } : n
      )
    );
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
  }
};

const markAllNotificationsRead = async () => {
  try {
    const result = await api("/api/notifications/read-all", {
      method: "PATCH",
    });

    if (result.success) {
  setNotes((previous) =>
    previous.map((n) => ({ ...n, read: true }))
  );
}
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
  }
};

const handleNotificationClick = async (notification) => {
  await markNotificationRead(notification);

  setOpenNotes(false);

  if (notification.caseId) {
    navigate(`/cases/${notification.caseId}`);
  }
};    

  useEffect(() => {
    setMobileNavOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setFeedbackOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const refreshNotifications = async () => {
  try {
    const result = await api("/api/notifications");
    setNotes(result.notifications || []);
  } catch (error) {
    console.error("Failed to refresh notifications:", error);
  }
};

useEffect(() => {
  refreshNotifications();

  const handleRefresh = () => {
    refreshNotifications();
  };

  window.addEventListener(
    "securevault:notifications-refresh",
    handleRefresh
  );

  return () => {
    window.removeEventListener(
      "securevault:notifications-refresh",
      handleRefresh
    );
  };
}, [location.pathname]);

  const labels = {
    cases: "Cases",
    documents: "Documents",
    security: "Security Centre",
    integrity: "Integrity Verification",
    audit: "Audit Logs",
    reports: "Reports",
    admin: "Administration",
    users: "Users",
    roles: "Roles & Permissions",
    settings: "Profile & Settings",
    feedback: "Feedbacks",
    upload: "Upload",
    new: "Create Case",
    edit: "Edit Case",
    versions: "Version History",
  };
  const navigation = (ROLE_NAVIGATION[user.role] || []).filter(
    (item) => !item.permission || hasPermission(user, item.permission)
  );
  const queryParams = new URLSearchParams(location.search);
  const activeQueryNavigationItem = navigation.find((item) => {
    const [targetPath, targetQuery] = item.to.split("?");
    return targetQuery
      && targetPath === location.pathname
      && [...new URLSearchParams(targetQuery)].every(
        ([key, value]) => queryParams.get(key) === value
      );
  });
  const activeNavigationItem = activeQueryNavigationItem || navigation
    .map((item, index) => ({ item, index, path: item.to.split("?")[0] }))
    .filter(({ item, path }) => (
      !item.to.includes("?")
      && location.pathname === path
    ))
    .sort((left, right) => right.path.length - left.path.length || left.index - right.index)[0]?.item;
  const navigationSections = navigation.reduce((sections, item) => {
    const section = item.section || (item.to === "/settings" ? "Account" : "Workspace");
    const last = sections[sections.length - 1];
    if (!last || last.title !== section) sections.push({ title: section, items: [item] });
    else last.items.push(item);
    return sections;
  }, []);
  const parts = location.pathname.split("/").filter(Boolean);
  const crumbs = parts.map((part, index) => ({
    label: labels[part] || part.toUpperCase(),
    to: "/" + parts.slice(0, index + 1).join("/"),
  }));

  return (
    <div className="app-shell">
      {mobileNavOpen ? (
        <button
          className="mobile-nav-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <aside id="primary-navigation" className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Lock size={16} />
          </div>
          <div>
            <div className="brand-name">SecureVault</div>
            <div className="brand-sub">SIH26190</div>
          </div>
        </div>
        {navigationSections.map(({ title, items }) => (
          <div key={title}>
            <div className="nav-section">{title}</div>
            {items.map((item) => {
              const { label, to, icon: Icon } = item;
              const active = item === activeNavigationItem;
              return (
                <NavLink
                  key={`${label}-${to}`}
                  to={to}
                  end
                  className={() => `nav-link ${active ? "active" : ""}`}
                >
                  <Icon size={16} /> {label}
                </NavLink>
              );
            })}
          </div>
        ))}
        <div className="nav-link" aria-label="Current account role">
          <Lock size={16} /> {ROLE_LABELS[user.role] || user.role}
        </div>
        <div className="sidebar-spacer" />
        <button className="nav-link sidebar-signout" onClick={logout} style={{ marginBottom: 16 }}>
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <section className="main">
        <header className="topbar">
          <button
            className="icon-btn mobile-nav-toggle"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileNavOpen((isOpen) => !isOpen)}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="crumb">
            <Link to="/">SecureVault</Link>
            {crumbs.length ? (
              crumbs.map((c, i) => (
                <span key={c.to}>
                  {" / "}
                  {i === crumbs.length - 1 ? <strong>{c.label}</strong> : <Link to={c.to}>{c.label}</Link>}
                </span>
              ))
            ) : (
              <>
                {" / "}
                <strong>Dashboard</strong>
              </>
            )}
          </div>
          <div className="user-chip">
            <button
              className="theme-toggle icon-btn"
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              <span className="theme-toggle-label">{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
            </button>
            <button
              className="icon-btn notification-trigger"
              onClick={() => setOpenNotes((v) => !v)}
              title="Notifications"
              aria-label={`Notifications, ${unreadCount} unread`}
            >
              <Bell size={18} />

              {unreadCount > 0 && (
                <span className="notification-badge">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            {openNotes ? (
  <div className="notes-panel">

    <div className="notes-header">
      <strong>Notifications</strong>

      {unreadCount > 0 && (
        <button
          type="button"
          onClick={markAllNotificationsRead}
        >
          Mark all as read
        </button>
      )}
    </div>

    {unreadNotes.length ? (
      unreadNotes.map((n) => (
        <div
          key={n.id}
          className="note-item unread"
          onClick={() => handleNotificationClick(n)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleNotificationClick(n);
            }
          }}
        >
          <div className="note-title">
            <strong>{n.title}</strong>
            <span className="unread-dot" />
          </div>

          <p>{n.body}</p>

          <small>
            {n.createdAt
              ? new Date(n.createdAt).toLocaleString()
              : ""}
          </small>
        </div>
      ))
    ) : (
      <div className="note-item">
        No unread notifications
      </div>
    )}

    <button
      type="button"
      className="notes-footer"
      onClick={() => {
        setOpenNotes(false);
        navigate("/notifications");
      }}
    >
      View All Notifications
      <span>→</span>
    </button>

  </div>
) : null}
            <div className="topbar-user-details">
              <strong>{user.name}</strong>
              <small>{ROLE_LABELS[user.role] || user.role}</small>
            </div>
            <div className="profile-menu-anchor" ref={profileMenuRef}>
              <button
                type="button"
                className="profile-menu-trigger"
                aria-label="Open user profile menu"
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((isOpen) => !isOpen)}
              >
                <ProfileAvatar user={user} />
              </button>
              {profileMenuOpen ? (
                <div className="profile-dropdown" role="menu">
                  <div className="profile-dropdown-heading">
                    <ProfileAvatar user={user} />
                    <div><strong>{user.name}</strong><small>{ROLE_LABELS[user.role] || user.role}</small></div>
                  </div>
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); navigate("/settings"); }}>
                    <Lock size={16} /> Profile &amp; Settings
                  </button>
                  <button type="button" role="menuitem" onClick={() => {
                    setProfileMenuOpen(false);
                    setFeedbackError("");
                    setFeedback({ category: "Suggestion", subject: "", description: "" });
                    setFeedbackOpen(true);
                  }}>
                    <MessageSquare size={16} /> Send Feedback
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); logout(); }}>
                    <LogOut size={16} /> Log Out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </section>
      {feedbackOpen ? (
        <Modal title="Send Feedback" onClose={() => setFeedbackOpen(false)}>
          <form onSubmit={async (event) => {
            event.preventDefault();
            setFeedbackError("");
            setSendingFeedback(true);
            try {
              await api("/api/feedback", { method: "POST", body: feedback });
              setFeedbackOpen(false);
              notify("Feedback submitted. Thank you.");
            } catch (error) {
              setFeedbackError(error.message);
            } finally {
              setSendingFeedback(false);
            }
          }}>
            {feedbackError ? <p className="form-error" role="alert">{feedbackError}</p> : null}
            <div className="field">
              <label htmlFor="feedback-category">Category / Type</label>
              <select id="feedback-category" className="select" value={feedback.category} onChange={(event) => setFeedback({ ...feedback, category: event.target.value })}>
                <option>Suggestion</option>
                <option>Bug/Issue</option>
                <option>Software Improvement</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="feedback-subject">Subject</label>
              <input id="feedback-subject" className="input" required maxLength={120} value={feedback.subject} onChange={(event) => setFeedback({ ...feedback, subject: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="feedback-description">Detailed Description</label>
              <textarea id="feedback-description" className="textarea" required rows={5} maxLength={5000} value={feedback.description} onChange={(event) => setFeedback({ ...feedback, description: event.target.value })} />
            </div>
            <div className="actions-row">
              <button className="btn btn-ghost" type="button" onClick={() => setFeedbackOpen(false)} disabled={sendingFeedback}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={sendingFeedback}>{sendingFeedback ? "Sending…" : "Submit Feedback"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
