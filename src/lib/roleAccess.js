import {
  Activity,
  ClipboardCheck,
  FileSearch,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Settings,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";

export const ROLE_LABELS = {
  Admin: "Administrator",
  "Investigating Officer": "Investigating Officer",
  Supervisor: "Supervisor",
  "Read-only Reviewer": "Read-only Reviewer",
};

export const DASHBOARD_DETAILS = {
  Admin: {
    title: "Admin Center",
    description: "System health, user access, role permissions, and audit activity.",
  },
  "Investigating Officer": {
    title: "My Dashboard",
    description: "Your assigned cases, evidence upload shortcuts, and recent activity.",
  },
  Supervisor: {
    title: "Supervisor Overview",
    description: "Officer workload, cases awaiting review, and investigation monitoring.",
  },
  "Read-only Reviewer": {
    title: "Reviewer Portal",
    description: "Review authorized cases, evidence previews, reports, and activity history.",
  },
};

export const ROLE_NAVIGATION = {
  "Investigating Officer": [
    { label: "My Dashboard", to: "/", icon: LayoutDashboard },
    { label: "My Assigned Cases", to: "/cases", icon: FolderOpen, permission: "cases.view" },
    { label: "Create Case", to: "/cases/new", icon: ClipboardCheck, permission: "cases.create" },
    { label: "Documents", to: "/documents", icon: FileText, permission: "docs.view" },
    { label: "Upload Evidence", to: "/documents/upload", icon: Upload, permission: "docs.upload" },
    { label: "Integrity Verification", to: "/security/integrity", icon: ShieldCheck, permission: "integrity.verify" },
    { label: "My Reports", to: "/reports", icon: FileSearch, permission: "reports.generate" },
    { label: "Profile & Settings", to: "/settings", icon: Settings },
  ],
  Supervisor: [
    { label: "Supervisor Overview", to: "/", icon: LayoutDashboard },
    { label: "Team / Officers", to: "/team/officers", icon: Users, permission: "cases.edit" },
    { label: "Case Monitoring", to: "/cases?view=monitoring", icon: FolderOpen, permission: "cases.view" },
    { label: "Review Cases", to: "/supervisor/review", icon: ClipboardCheck, permission: "cases.view" },
    { label: "Pending Approvals", to: "/supervisor/pending", icon: ClipboardCheck, permission: "cases.view" },
    { label: "Evidence Review", to: "/documents?view=evidence", icon: FileText, permission: "docs.view" },
    { label: "Reports", to: "/reports", icon: FileSearch, permission: "reports.generate" },
    { label: "Profile & Settings", to: "/settings", icon: Settings },
  ],
  Admin: [
  { label: "Admin Center", to: "/", icon: LayoutDashboard },
  { label: "User Management", to: "/admin/users", icon: Users, permission: "admin.users", section: "Administration" },
  { label: "Roles & Permissions", to: "/admin/roles", icon: Lock, permission: "admin.users", section: "Administration" },
  { label: "System Config", to: "/settings?section=system", icon: Settings, permission: "admin.users", section: "Administration" },
  { label: "System-wide Audit Logs", to: "/security/audit", icon: Activity, permission: "audit.view", section: "Administration" },
  { label: "Feedbacks", to: "/admin/feedback", icon: MessageSquare, permission: "admin.users", section: "Administration" },
  { label: "Profile & Settings", to: "/settings", icon: Settings, section: "Account" },
],
  "Read-only Reviewer": [
    { label: "Reviewer Portal", to: "/", icon: LayoutDashboard },
    { label: "Assigned Cases", to: "/cases", icon: FolderOpen, permission: "cases.view" },
    { label: "View Documents", to: "/documents", icon: FileText, permission: "docs.view" },
    { label: "View Evidence", to: "/documents?view=evidence", icon: ShieldCheck, permission: "docs.view" },
    { label: "View Reports", to: "/reports", icon: FileSearch, permission: "reports.view" },
    { label: "Activity History", to: "/security/audit", icon: Activity, permission: "audit.view" },
    { label: "Profile & Settings", to: "/settings", icon: Settings },
  ],
};

export function hasPermission(user, permission) {
  return Boolean(user && permission && user.permissions?.includes(permission));
}

export function hasAnyPermission(user, permissions) {
  return permissions.some((permission) => hasPermission(user, permission));
}
