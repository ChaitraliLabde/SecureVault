import { ClipboardList, FilePlus, FileSearch, FolderPlus, Shield, Upload, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import Badge from "../components/Badge";
import { useApp } from "../context/AppContext";
import { DASHBOARD_DETAILS, hasPermission, ROLE_LABELS } from "../lib/roleAccess";

const FORMS_CATALOG = [
  {
    key: "case.create",
    permission: "cases.create",
    icon: FolderPlus,
    title: "New Case Registration Form",
    subtitle: "Register a new criminal case",
    description: "File a new case with full details including: Case type, FIR No, Incident date, Assigned officer, Location, Description, Suspects, Witnesses, and Evidence items.",
    route: "/cases/new",
    color: "#2563eb",
  },
  {
    key: "case.edit",
    permission: "cases.edit",
    icon: FolderPlus,
    title: "Update Case Records",
    subtitle: "Edit an existing case",
    description: "Modify case status, assignment, description, suspects, witnesses, or evidence on an existing case record.",
    route: "/cases",
    color: "#7c3aed",
  },
  {
    key: "doc.upload",
    permission: "docs.upload",
    icon: Upload,
    title: "Upload Case Document",
    subtitle: "Attach document to a case",
    description: "Upload FIR, Witness Statement, Investigation Report, Forensic Report, Charge Sheet, Digital Evidence, or Court Document. Files are SHA-256 hashed and version-controlled.",
    route: "/documents/upload",
    color: "#059669",
  },
  {
    key: "doc.search",
    permission: "docs.view",
    icon: FileSearch,
    title: "Search / Browse Documents",
    subtitle: "Find existing case documents",
    description: "Search through all documents you are authorized to access. Filter by case, type, or keyword.",
    route: "/documents",
    color: "#0891b2",
  },
  {
    key: "report.gen",
    permission: "reports.generate",
    icon: FilePlus,
    title: "Generate Case Report",
    subtitle: "Export a case dossier",
    description: "Generate a printable report for any case — includes case details, document list, version history, and the audit trail. Used for court submissions and internal reviews.",
    route: "/reports",
    color: "#d97706",
  },
  {
    key: "integrity",
    permission: "integrity.verify",
    icon: Shield,
    title: "Integrity Verification",
    subtitle: "Verify SHA-256 file hashes",
    description: "Verify that stored evidence documents have not been tampered with by recalculating and comparing their SHA-256 hash against the recorded value at upload time.",
    route: "/security/integrity",
    color: "#dc2626",
  },
  {
    key: "users",
    permission: "admin.users",
    icon: Users,
    title: "Add / Manage Users",
    subtitle: "User & role administration",
    description: "Create officer accounts, assign roles (Administrator, Investigating Officer, Supervisor, Read-only Reviewer), and activate or deactivate users.",
    route: "/admin/users",
    color: "#0f172a",
  },
];

export default function Dashboard() {
  const { user, meta } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [formsOpen, setFormsOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState(null);

  useEffect(() => {
    api("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const dashboardDetails = DASHBOARD_DETAILS[user.role] || {
    title: "Dashboard",
    description: "Your secure case and document workspace.",
  };
  const availableForms = FORMS_CATALOG.filter((form) =>
    form.permission === "reports.generate"
      ? hasPermission(user, "reports.generate")
      : hasPermission(user, form.permission)
  );
  const quickActionsByRole = {
    "Investigating Officer": [
      { label: "Create New Case", route: "/cases/new", icon: FolderPlus, permission: "cases.create" },
      { label: "Upload Evidence", route: "/documents/upload", icon: Upload, permission: "docs.upload" },
      { label: "Search Documents", route: "/documents", icon: FileSearch, permission: "docs.view" },
      { label: "My Reports", route: "/reports", icon: FilePlus, permission: "reports.generate" },
    ],
    Supervisor: [
      { label: "Team / Officers", route: "/team/officers", icon: Users, permission: "cases.edit" },
      { label: "Monitor Cases", route: "/cases", icon: FolderPlus, permission: "cases.view" },
      { label: "Pending Approvals", route: "/supervisor/pending", icon: ClipboardList, permission: "cases.view" },
      { label: "Review Evidence", route: "/documents", icon: FileSearch, permission: "docs.view" },
      { label: "Reports", route: "/reports", icon: FilePlus, permission: "reports.generate" },
    ],
    Admin: [
      { label: "Manage Users", route: "/admin/users", icon: Users, permission: "admin.users" },
      { label: "Roles & Permissions", route: "/admin/roles", icon: Shield, permission: "admin.users" },
      { label: "System Audit", route: "/security/audit", icon: ClipboardList, permission: "audit.view" },
      { label: "Review Cases", route: "/cases", icon: FolderPlus, permission: "cases.view" },
    ],
    "Read-only Reviewer": [
      { label: "Assigned Cases", route: "/cases", icon: FolderPlus, permission: "cases.view" },
      { label: "Preview Documents", route: "/documents", icon: FileSearch, permission: "docs.view" },
      { label: "View Reports", route: "/reports", icon: FilePlus, permission: "reports.view" },
      { label: "Activity History", route: "/security/audit", icon: ClipboardList, permission: "audit.view" },
    ],
  };
  const quickActions = (quickActionsByRole[user.role] || []).filter(({ permission }) =>
    hasPermission(user, permission)
  );
  const teamTotals = (data?.teamWorkload || []).reduce(
    (totals, officer) => ({
      total: totals.total + officer.total,
      active: totals.active + officer.active,
    }),
    { total: 0, active: 0 }
  );
  const dashboardCases = user.role === "Investigating Officer"
    ? (data?.priorityCases || data?.recentCases || [])
    : (data?.recentCases || []);
  const stats = user.role === "Admin"
    ? [
      { label: "Total Users", value: data?.adminSummary?.totalUsers ?? "—", note: "Registered accounts" },
      { label: "Active Users", value: data?.adminSummary?.activeUsers ?? "—", note: "Approved and active" },
      { label: "Pending Approvals", value: data?.adminSummary?.pendingUsers ?? "—", note: "Awaiting administrator action" },
      { label: "Audit Volume", value: data?.adminSummary?.auditVolume ?? "—", note: "Recorded audit events" },
    ]
    : user.role === "Supervisor"
      ? [
        { label: "Officer Team", value: data?.teamWorkload?.length ?? "—", note: "Active Investigating Officers" },
        { label: "Team Case Load", value: data ? teamTotals.total : "—", note: "Cases assigned to officers" },
        { label: "Active Cases", value: data ? teamTotals.active : "—", note: "Across the officer team" },
        { label: "Pending Approvals", value: data?.stats?.pendingApprovals ?? "—", note: "Cases On Hold, Pending Review, or Pending Closure" },
      ]
      : user.role === "Read-only Reviewer"
        ? [
          { label: "Authorized Cases", value: data?.stats?.totalCases ?? "—", note: "Cases assigned to your account" },
          { label: "Documents", value: data?.stats?.documents ?? "—", note: "Available for preview" },
          { label: "Recent Activity", value: data?.stats?.activity ?? "—", note: "Activity in your permitted scope" },
        ]
        : [
          { label: "My Assigned Cases", value: data?.stats?.assigned ?? "—", note: "Assigned to your account" },
          { label: "Active Cases", value: data?.stats?.active ?? "—", note: "Of your assigned cases" },
          { label: "Documents", value: data?.stats?.documents ?? "—", note: "Hashed and versioned" },
          { label: "Recent Activity", value: data?.stats?.activity ?? "—", note: "From the protected audit trail" },
        ];

  if (error) return <div className="card empty">{error}</div>;
  if (!data) return <div className="empty">Loading workspace…</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{dashboardDetails.title}</h1>
          <p>Welcome, {user.name}. {dashboardDetails.description}</p>
        </div>
        {availableForms.length ? (
          <button className="btn btn-primary" onClick={() => { setFormsOpen(true); setSelectedForm(null); }}>
            <ClipboardList size={16} /> Forms
          </button>
        ) : null}
      </div>
      {location.state?.accessDenied ? (
        <div className="warn-banner card card-pad" role="alert" style={{ marginBottom: 16 }}>
          <strong>Access restricted.</strong> You are not authorized to open{" "}
          <code>{location.state.attemptedPath}</code>. You have been returned to your role dashboard.
          <button
            className="btn btn-ghost"
            style={{ marginLeft: 12 }}
            onClick={() => navigate("/", { replace: true, state: null })}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid-4" style={{ marginBottom: 16 }}>
        {stats.map((item) => (
          <div className="card stat" key={item.label}>
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
            <div className="stat-sub">{item.note}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-pad" style={{ display: "flex", justifyContent: "space-between" }}>
            <div className="card-title" style={{ margin: 0 }}>
              {user.role === "Read-only Reviewer"
                ? "Authorized Cases"
                : user.role === "Investigating Officer" ? "My Priority Cases" : "Recent Cases"}
            </div>
            <Link to="/cases" style={{ color: "var(--blue)", fontWeight: 600, fontSize: 13 }}>View All Cases</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Title</th>
                  {user.role === "Investigating Officer" ? <th>Priority</th> : null}
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {dashboardCases.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} style={{ cursor: "pointer" }}>
                    <td className="linkish">{c.id}</td>
                    <td>{c.title}</td>
                    {user.role === "Investigating Officer" ? <td><Badge status={c.priority} /></td> : null}
                    <td><Badge status={c.status} /></td>
                    <td>{c.createdOnLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="card-title">Quick Actions</div>
            <div className="quick-grid">
              {quickActions.map(({ label, route, icon: Icon }) => (
                <button key={route} className="quick-action" onClick={() => navigate(route)}>
                  <span className="qa-icon"><Icon size={18} /></span>
                  <strong>{label}</strong>
                </button>
              ))}
            </div>
          </div>

          {user.role === "Supervisor" ? (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="card-title">Team Workload</div>
              {(data.teamWorkload || []).length ? data.teamWorkload.map((officer) => (
                <div className="doc-item" key={officer.id}>
                  <div>
                    <strong>{officer.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {officer.active} active · {officer.pending} pending review
                    </div>
                  </div>
                  <Link to={`/cases?officer=${encodeURIComponent(officer.id)}&view=monitoring`}>
                    {officer.total} cases
                  </Link>
                </div>
              )) : <p className="muted">No active Investigating Officers are available.</p>}
            </div>
          ) : null}

          {user.role === "Supervisor" ? (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="card-title">Cases Awaiting Review</div>
                <Link to="/supervisor/pending">View queue</Link>
              </div>
              {(data.pendingCases || []).length ? data.pendingCases.map((item) => (
                <Link className="doc-item" key={item.id} to={`/cases/${item.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <div>
                    <strong>{item.id} · {item.title}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{item.assignedName}</div>
                  </div>
                  <Badge status={item.status} />
                </Link>
              )) : <p className="muted">No cases are awaiting supervisor action.</p>}
            </div>
          ) : null}

          {user.role === "Read-only Reviewer" ? (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="card-title">Document Preview Queue</div>
              {data.recentDocuments.length ? data.recentDocuments.map((doc) => (
                <Link
                  className="doc-item"
                  key={doc.id}
                  to={`/documents/${doc.id}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div>
                    <strong>{doc.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{doc.caseId} · {doc.type}</div>
                  </div>
                  <span className="linkish">Preview</span>
                </Link>
              )) : <p className="muted">No authorized documents are waiting for review.</p>}
            </div>
          ) : null}

          {user.role === "Admin" ? (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="card-title">System Overview</div>
              <p><strong>Application health:</strong> {data.adminSummary.systemHealth}</p>
              <p><strong>Role matrix:</strong></p>
              {Object.entries(data.adminSummary.roleMatrix || {}).map(([role, permissions]) => (
                <div className="doc-item" key={role}>
                  <details>
                    <summary>                    <strong>{ROLE_LABELS[role] || role}</strong> · {permissions.length} permissions</summary>
                    <p className="muted">
                      {permissions.map((permission) =>
                        meta.permissions.find((item) => item.key === permission)?.label || permission
                      ).join(", ")}
                    </p>
                  </details>
                </div>
              ))}
            </div>
          ) : null}

          <div className="card card-pad">
            <div className="card-title">Recent Activity</div>
            {data.activity.length ? (
              data.activity.map((a) => (
                <div className="doc-item" key={a.id}>
                  <div>
                    <strong>{a.action}</strong>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{a.document} · {a.caseId}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{a.timestampLabel}</span>
                </div>
              ))
            ) : (
              <p style={{ color: "var(--muted)" }}>No recent activity.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Forms Modal ── */}
      {formsOpen ? (
        <div className="modal-backdrop" onClick={() => setFormsOpen(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: selectedForm ? 520 : 680, width: "95vw" }}
          >
            {selectedForm ? (
              /* Form Detail View */
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginBottom: 12, fontSize: 13 }}
                  onClick={() => setSelectedForm(null)}
                >
                  ← Back to Forms
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: selectedForm.color + "18", display: "grid", placeItems: "center" }}>
                    <selectedForm.icon size={22} color={selectedForm.color} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 18, marginBottom: 2 }}>{selectedForm.title}</h2>
                    <p style={{ color: "var(--muted)", fontSize: 13 }}>{selectedForm.subtitle}</p>
                  </div>
                </div>
                <div style={{ background: "var(--bg)", borderRadius: 10, padding: "14px 16px", marginBottom: 20, fontSize: 14, lineHeight: 1.7, color: "var(--ink)" }}>
                  {selectedForm.description}
                </div>
                <div style={{ background: "var(--blue-50)", border: "1px solid var(--blue-100)", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 13, color: "var(--ink)" }}>
                  <strong>Access:</strong> This action follows your role permissions. Case and document information remains limited to your authorized scope.
                </div>
                <div className="actions-row">
                  <button className="btn btn-ghost" onClick={() => setFormsOpen(false)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    onClick={() => { setFormsOpen(false); navigate(selectedForm.route); }}
                  >
                    Open Form →
                  </button>
                </div>
              </>
            ) : (
              /* Forms List View */
              <>
                <h2 style={{ marginBottom: 4 }}>Available Forms</h2>
                <p className="muted" style={{ marginBottom: 20, fontSize: 13 }}>
                  Only forms permitted for your role are listed. Case and document data remains restricted to your authorized scope.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {availableForms.map((f) => {
                    const Icon = f.icon;
                    return (
                      <div
                        key={f.key}
                        role="button"
                        tabIndex={0}
                        aria-label={f.title}
                        style={{
                          display: "flex", alignItems: "center", gap: 14,
                          border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px",
                          cursor: "pointer", transition: "box-shadow .15s",
                        }}
                        onClick={() => setSelectedForm(f)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedForm(f);
                          }
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = "var(--shadow)"}
                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}
                      >
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: f.color + "18", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <Icon size={20} color={f.color} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{f.title}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>{f.subtitle}</div>
                        </div>
                        <span style={{ color: "var(--muted)", fontSize: 18 }}>
                          ›
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 16, textAlign: "right" }}>
                  <button className="btn btn-ghost" onClick={() => setFormsOpen(false)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
