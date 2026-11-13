export const ROLES = [
  "Admin",
  "Investigating Officer",
  "Supervisor",
  "Read-only Reviewer",
];

export const PERMISSIONS = [
  { key: "cases.view", label: "View permitted cases" },
  { key: "cases.create", label: "Create cases" },
  { key: "cases.edit", label: "Edit cases" },
  { key: "docs.view", label: "View documents" },
  { key: "docs.upload", label: "Upload documents" },
  { key: "docs.download", label: "Download documents" },
  { key: "integrity.verify", label: "Verify integrity" },
  { key: "audit.view", label: "View audit logs" },
  { key: "reports.view", label: "View reports" },
  { key: "reports.generate", label: "Generate reports" },
  { key: "admin.users", label: "Manage users and roles" },
];

export const DEFAULT_MATRIX = {
  Admin: PERMISSIONS.map((p) => p.key),
  "Investigating Officer": [
    "cases.view",
    "cases.create",
    "cases.edit",
    "docs.view",
    "docs.upload",
    "docs.download",
    "integrity.verify",
    "reports.view",
    "reports.generate",
  ],
  Supervisor: [
    "cases.view",
    "cases.create",
    "cases.edit",
    "docs.view",
    "docs.download",
    "integrity.verify",
    "audit.view",
    "reports.view",
    "reports.generate",
  ],
  "Read-only Reviewer": ["cases.view", "docs.view", "audit.view", "reports.view"],
};

export function can(user, permission) {
  return Boolean(user && permission && user.permissions?.includes(permission));
}
