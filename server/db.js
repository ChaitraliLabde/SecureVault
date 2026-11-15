import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";
import { DEFAULT_MATRIX } from "./permissions.js";

// PostgreSQL connection
dotenv.config({ path: "server/.env" });

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "data");
export const STORAGE_DIR = path.join(__dirname, "storage");
const DB_PATH = path.join(DATA_DIR, "db.json");

function now() {
  return new Date().toISOString();
}

function prettyDate(iso = now()) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export { prettyDate, now };

// Converts dates safely for PostgreSQL
function dateValue(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Converts values to JSON for JSONB columns
function jsonValue(value) {
  return JSON.stringify(value ?? {});
}

async function seed() {
  const passwordHash = await bcrypt.hash("password", 10);

  const users = [
    {
      id: "u1",
      name: "Amit Desai",
      email: "admin@securecase.local",
      username: "admin",
      role: "Admin",
      status: "Active",
      initials: "AD",
      passwordHash,
    },
    {
      id: "u2",
      name: "Chaitrali Lokde",
      email: "chaitrali@securecase.local",
      username: "chaitrali",
      role: "Investigating Officer",
      status: "Active",
      initials: "CL",
      passwordHash,
    },
    {
      id: "u3",
      name: "Rahul Mehta",
      email: "rahul@securecase.local",
      username: "rahul",
      role: "Supervisor",
      status: "Active",
      initials: "RM",
      passwordHash,
    },
    {
      id: "u4",
      name: "Neha Kulkarni",
      email: "neha@securecase.local",
      username: "neha",
      role: "Read-only Reviewer",
      status: "Active",
      initials: "NK",
      passwordHash,
    },
    {
      id: "u5",
      name: "Priya Sharma",
      email: "priya@securecase.local",
      username: "priya",
      role: "Investigating Officer",
      status: "Active",
      initials: "PS",
      passwordHash,
    },
  ];

  const cases = [
    {
      id: "CS-001",
      title: "Cyber Fraud Investigation",
      type: "Cyber Crime",
      status: "Active",
      assignedTo: "u2",
      createdBy: "u1",
      createdOn: "2025-04-13T09:00:00.000Z",
      incidentDate: "2025-04-12",
      reportedOn: "2025-04-13",
      priority: "High",
      location: "Mumbai, Maharashtra",
      firNo: "MU-2341",
      fileNumber: "124/2025",
      description:
        "Investigation of online fraud involving fake e-commerce websites.",
    },
    {
      id: "CS-002",
      title: "Theft Case - City Mall",
      type: "Property Crime",
      status: "Active",
      assignedTo: "u3",
      createdBy: "u1",
      createdOn: "2025-04-11T10:00:00.000Z",
      incidentDate: "2025-04-10",
      reportedOn: "2025-04-11",
      priority: "Medium",
      location: "Pune, Maharashtra",
      firNo: "PN-8812",
      fileNumber: "118/2025",
      description: "Theft of high-value goods from City Mall storage.",
    },
    {
      id: "CS-003",
      title: "Murder Investigation",
      type: "Homicide",
      status: "Active",
      assignedTo: "u5",
      createdBy: "u1",
      createdOn: "2025-04-10T11:20:00.000Z",
      incidentDate: "2025-04-09",
      reportedOn: "2025-04-10",
      priority: "High",
      location: "Nagpur, Maharashtra",
      firNo: "NG-4421",
      fileNumber: "109/2025",
      description: "Homicide investigation with digital and forensic evidence.",
    },
    {
      id: "CS-004",
      title: "Financial Scam",
      type: "Economic Offense",
      status: "On Hold",
      assignedTo: "u2",
      createdBy: "u1",
      createdOn: "2025-04-09T08:40:00.000Z",
      incidentDate: "2025-04-07",
      reportedOn: "2025-04-09",
      priority: "Medium",
      location: "Thane, Maharashtra",
      firNo: "TH-1902",
      fileNumber: "097/2025",
      description: "Investment scam involving unauthorized bank transfers.",
    },
    {
      id: "CS-005",
      title: "Drug Trafficking",
      type: "Narcotics",
      status: "Active",
      assignedTo: "u5",
      createdBy: "u1",
      createdOn: "2025-04-08T14:00:00.000Z",
      incidentDate: "2025-04-06",
      reportedOn: "2025-04-08",
      priority: "High",
      location: "Nashik, Maharashtra",
      firNo: "NS-3310",
      fileNumber: "088/2025",
      description: "Interstate narcotics trafficking network.",
    },
    {
      id: "CS-006",
      title: "Murder Investigation",
      type: "Homicide",
      status: "Closed",
      assignedTo: "u3",
      createdBy: "u1",
      createdOn: "2025-04-07T16:10:00.000Z",
      incidentDate: "2025-04-03",
      reportedOn: "2025-04-07",
      priority: "High",
      location: "Aurangabad, Maharashtra",
      firNo: "AU-2201",
      fileNumber: "076/2025",
      description: "Closed homicide file pending court proceedings.",
    },
    {
      id: "CS-007",
      title: "Cyber Harassment",
      type: "Cyber Crime",
      status: "Active",
      assignedTo: "u2",
      createdBy: "u1",
      createdOn: "2025-03-16T09:30:00.000Z",
      incidentDate: "2025-03-15",
      reportedOn: "2025-03-16",
      priority: "Low",
      location: "Mumbai, Maharashtra",
      firNo: "MU-1188",
      fileNumber: "061/2025",
      description: "Online harassment and identity impersonation.",
    },
    {
      id: "CS-008",
      title: "Assault Case",
      type: "Violent Crime",
      status: "Closed",
      assignedTo: "u4",
      createdBy: "u1",
      createdOn: "2025-03-12T12:00:00.000Z",
      incidentDate: "2025-03-11",
      reportedOn: "2025-03-12",
      priority: "Medium",
      location: "Kolhapur, Maharashtra",
      firNo: "KL-0904",
      fileNumber: "054/2025",
      description: "Assault case with CCTV and medical evidence.",
    },
  ];

  return {
    users,
    cases,
    documents: [],
    verifications: [],
    audits: [
      {
        id: "a-seed-1",
        timestamp: "2025-04-14T09:02:00.000Z",
        userId: "u2",
        user: "Chaitrali Lokde",
        action: "Login",
        caseId: "—",
        document: "—",
        ip: "192.168.1.24",
        status: "Success",
      },
    ],
    resetTokens: [],
    notifications: [
      {
        id: "n1",
        title: "Integrity policy reminder",
        body: "Verify SHA-256 hashes before producing documents in court.",
        createdAt: now(),
        read: false,
      },
    ],
    roleMatrix: DEFAULT_MATRIX,
    settings: {
      org: "SecureVault Investigation Unit · NCRB / MHA",
      retention: "7 years",
      encryption: "AES-256 at rest (storage volume)",
      mfa: true,
      watermark: true,
    },
    custodyEvents: [],
    feedback: [],
  };
}

function miniPdf(title) {
  const text = title.replace(/[()]/g, " ");
  const stream = `BT /F1 16 Tf 72 720 Td (${text}) Tj ET`;

  return Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj\n4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF`
  );
}

function ensureDemoDocuments(db) {
  if (db.documents?.length) return db;

  db.verifications = db.verifications || [];
  db.custodyEvents = db.custodyEvents || [];

  const samples = [
    {
      id: "d1",
      name: "FIR_Case001.pdf",
      type: "FIR",
      caseId: "CS-001",
      uploadedBy: "u2",
      title: "FIR",
      description: "First information report for CS-001.",
    },
    {
      id: "d2",
      name: "Witness_Statement.pdf",
      type: "Witness Statement",
      caseId: "CS-001",
      uploadedBy: "u2",
      title: "Witness statement",
      description: "Statement of the complainant.",
    },
    {
      id: "d3",
      name: "Investigation_Report.pdf",
      type: "Investigation Report",
      caseId: "CS-001",
      uploadedBy: "u2",
      title: "Investigation Report - Phase 1",
      description: "Initial findings and evidence index.",
    },
    {
      id: "d4",
      name: "Forensic_Report.pdf",
      type: "Forensic Report",
      caseId: "CS-001",
      uploadedBy: "u5",
      title: "Forensic report",
      description: "Device and log analysis.",
    },
    {
      id: "d5",
      name: "ChargeSheet_Draft.pdf",
      type: "Charge Sheet",
      caseId: "CS-001",
      uploadedBy: "u3",
      title: "Charge sheet draft",
      description: "Draft charge sheet pending review.",
    },
    {
      id: "d6",
      name: "Lab_Report.pdf",
      type: "Forensic Report",
      caseId: "CS-003",
      uploadedBy: "u5",
      title: "Lab report",
      description: "Forensic lab findings.",
    },
    {
      id: "d7",
      name: "Court_Order.pdf",
      type: "Court Document",
      caseId: "CS-006",
      uploadedBy: "u1",
      title: "Court order",
      description: "Committed case court order.",
    },
  ];

  db.documents = samples.map((sample, index) => {
    const buffer = miniPdf(`${sample.caseId} ${sample.title}`);
    const sha256 = hashBuffer(buffer);
    const dir = path.join(STORAGE_DIR, sample.id);

    fs.mkdirSync(dir, { recursive: true });

    const filename = `v1-${sample.name}`;

    fs.writeFileSync(path.join(dir, filename), buffer);

    return {
      ...sample,
      uploadedOn: new Date(
        Date.UTC(2025, 3, 13 + index, 9, 10)
      ).toISOString(),
      size: `${Math.max(1, Math.round(buffer.length / 1024))} KB`,
      encrypted: true,
      versions: [
        {
          version: "v1",
          uploadedBy: sample.uploadedBy,
          uploadedByName: db.users.find(
            (u) => u.id === sample.uploadedBy
          )?.name,
          date: new Date(
            Date.UTC(2025, 3, 13 + index, 9, 10)
          ).toISOString(),
          size: `${Math.max(1, Math.round(buffer.length / 1024))} KB`,
          sha256,
          filename,
        },
      ],
    };
  });

  return db;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Load all application data from PostgreSQL
// Load all application data from PostgreSQL
export async function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  const client = await pool.connect();

  try {
    // Execute queries sequentially using the same client
    const users = await client.query("SELECT data FROM users");
    const cases = await client.query("SELECT data FROM cases");
    const documents = await client.query("SELECT data FROM documents");
    const caseReviewers = await client.query(
    "SELECT id, case_id, reviewer_id, assigned_by, assigned_at FROM case_reviewers"
    );
    const audits = await client.query(
      "SELECT data FROM audits ORDER BY audit_timestamp"
    );
    const resetTokens = await client.query(
      "SELECT data FROM reset_tokens"
    );
    const notifications = await client.query(
      "SELECT data FROM notifications"
    );
    const roleMatrix = await client.query(
      "SELECT role, permissions FROM role_matrix"
    );
    const settings = await client.query(
      "SELECT setting_key, setting_value FROM app_settings"
    );
    const verifications = await client.query(
      "SELECT data FROM verifications"
    );
    const custodyEvents = await client.query(
      "SELECT data FROM custody_events ORDER BY event_timestamp"
    );
    const feedback = await client.query(
      "SELECT data FROM feedback"
    );

    let db = {
      users: users.rows.map((row) => row.data),
      cases: cases.rows.map((row) => row.data),
      caseReviewers: caseReviewers.rows,
      documents: documents.rows.map((row) => row.data),
      audits: audits.rows.map((row) => row.data),
      resetTokens: resetTokens.rows.map((row) => row.data),
      notifications: notifications.rows.map((row) => row.data),

      roleMatrix: Object.fromEntries(
        roleMatrix.rows.map((row) => [
          row.role,
          row.permissions,
        ])
      ),

      settings: Object.fromEntries(
        settings.rows.map((row) => [
          row.setting_key,
          row.setting_value,
        ])
      ),

      verifications: verifications.rows.map((row) => row.data),
      custodyEvents: custodyEvents.rows.map((row) => row.data),
      feedback: feedback.rows.map((row) => row.data),
    };

    db.verifications ||= [];
    db.custodyEvents ||= [];
    db.feedback ||= [];

    // Seed only if the PostgreSQL database is completely empty
    if (db.users.length === 0 && db.cases.length === 0) {
      db = await seed();
      db = ensureDemoDocuments(db);
      await saveDb(db);
    }

    return db;
  } catch (error) {
    console.error("PostgreSQL load failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}
function enqueueWrite(task) {
  const operation = writeChain.catch(() => {}).then(task);
  writeChain = operation;
  return operation;
}

// Save application data to PostgreSQL

let writeChain = Promise.resolve();

// Execute multiple INSERT/UPSERT operations in batches
async function bulkUpsert(client, table, columns, rows, updateColumns) {
const BATCH_SIZE = 500;

for (let start = 0; start < rows.length; start += BATCH_SIZE) {
const batch = rows.slice(start, start + BATCH_SIZE);

if (!batch.length) continue;
const values = [];
const placeholders = [];
batch.forEach((row, rowIndex) => {
  const rowPlaceholders = row.map((value, columnIndex) => {
    values.push(value);
    return `$${values.length}`;
  });
  placeholders.push(`(${rowPlaceholders.join(", ")})`);
});
const updates = updateColumns
  .map((column) => `${column} = EXCLUDED.${column}`)
  .join(", ");
const sql = `
  INSERT INTO ${table} (${columns.join(", ")})
  VALUES ${placeholders.join(", ")}
  ON CONFLICT (${columns[0]}) DO UPDATE SET
  ${updates}
`;
await client.query(sql, values);

}
}

export function saveDb(db) {
  return enqueueWrite(async () => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // USERS
      await bulkUpsert(
        client,
        "users",
        ["id", "email", "username", "role", "status", "data"],
        (db.users || []).map(user => [
          user.id,
          user.email || null,
          user.username || null,
          user.role || null,
          user.status || null,
          jsonValue(user)
        ]),
        ["email", "username", "role", "status", "data"]
      );

            
      // CASE REVIEWERS
await bulkUpsert(
  client,
  "case_reviewers",
  ["id", "case_id", "reviewer_id", "assigned_by", "assigned_at"],
  (db.caseReviewers || []).map(item => [
    item.id,
    item.caseId || item.case_id,
    item.reviewerId || item.reviewer_id,
    item.assignedBy || item.assigned_by || null,
    dateValue(item.assignedAt || item.assigned_at)
  ]),
  ["case_id", "reviewer_id", "assigned_by", "assigned_at"]
);

      // CASES
      await bulkUpsert(
        client,
        "cases",
        ["id", "assigned_to", "created_by", "status", "created_on", "data"],
        (db.cases || []).map(item => [
          item.id,
          item.assignedTo || null,
          item.createdBy || null,
          item.status || null,
          dateValue(item.createdOn),
          jsonValue(item)
        ]),
        ["assigned_to", "created_by", "status", "created_on", "data"]
      );

      // DOCUMENTS
      await bulkUpsert(
        client,
        "documents",
        [
          "id", "case_id", "uploaded_by", "name",
          "document_type", "uploaded_on", "original_sha256", "data"
        ],
        (db.documents || []).map(doc => [
          doc.id,
          doc.caseId || null,
          doc.uploadedBy || null,
          doc.name || null,
          doc.type || doc.documentType || null,
          dateValue(doc.uploadedOn),
          doc.originalSha256 ||
            doc.original_sha256 ||
            doc.versions?.[0]?.sha256 ||
            null,
          jsonValue(doc)
        ]),
        [
          "case_id", "uploaded_by", "name",
          "document_type", "uploaded_on", "original_sha256", "data"
        ]
      );

      // AUDITS
      await bulkUpsert(
        client,
        "audits",
        ["id", "user_id", "case_id", "audit_timestamp", "action", "data"],
        (db.audits || []).map(audit => [
          audit.id,
          audit.userId || null,
          audit.caseId || null,
          dateValue(audit.timestamp),
          audit.action || null,
          jsonValue(audit)
        ]),
        ["user_id", "case_id", "audit_timestamp", "action", "data"]
      );

      // RESET TOKENS
      await bulkUpsert(
        client,
        "reset_tokens",
        ["id", "data"],
        (db.resetTokens || []).map(token => [
          token.id,
          jsonValue(token)
        ]),
        ["data"]
      );

      // NOTIFICATIONS
      await bulkUpsert(
        client,
        "notifications",
        ["id", "case_id", "data"],
        (db.notifications || []).map(notification => [
          notification.id,
          notification.caseId || null,
          jsonValue(notification)
        ]),
        ["case_id", "data"]
      );

      // ROLE MATRIX
      await bulkUpsert(
        client,
        "role_matrix",
        ["role", "permissions"],
        Object.entries(db.roleMatrix || {}).map(([role, permissions]) => [
          role,
          jsonValue(permissions)
        ]),
        ["permissions"]
      );

      // APPLICATION SETTINGS
      await bulkUpsert(
        client,
        "app_settings",
        ["setting_key", "setting_value"],
        Object.entries(db.settings || {}).map(([key, value]) => [
          key,
          jsonValue(value)
        ]),
        ["setting_value"]
      );

      // VERIFICATIONS
      await bulkUpsert(
        client,
        "verifications",
        ["id", "user_id", "document_id", "case_id", "verified_at", "data"],
        (db.verifications || []).map(verification => [
          verification.id,
          verification.userId || null,
          verification.documentId || null,
          verification.caseId || null,
          dateValue(verification.verifiedAt || verification.timestamp),
          jsonValue(verification)
        ]),
        ["user_id", "document_id", "case_id", "verified_at", "data"]
      );

      // CUSTODY EVENTS
      await bulkUpsert(
        client,
        "custody_events",
        [
          "id", "document_id", "case_id",
          "handler_id", "event_timestamp", "data"
        ],
        (db.custodyEvents || []).map(event => [
          event.id,
          event.documentId || null,
          event.caseId || null,
          event.handlerId || event.userId || null,
          dateValue(
            event.timestamp ||
            event.eventTimestamp ||
            event.createdAt
          ),
          jsonValue(event)
        ]),
        [
          "document_id", "case_id",
          "handler_id", "event_timestamp", "data"
        ]
      );

      // FEEDBACK
      await bulkUpsert(
        client,
        "feedback",
        ["id", "user_id", "data"],
        (db.feedback || []).map(item => [
          item.id,
          item.userId || null,
          jsonValue(item)
        ]),
        ["user_id", "data"]
      );

      // DELETE MISSING RECORDS
      const deleteMissing = async (table, column, values) => {
        const ids = values.map(item => item.id).filter(Boolean);

        await client.query(
          `DELETE FROM ${table}
           WHERE NOT (${column} = ANY($1::text[]))`,
          [ids]
        );
      };

      await deleteMissing("verifications", "id", db.verifications || []);
      await deleteMissing("custody_events", "id", db.custodyEvents || []);
      await deleteMissing("documents", "id", db.documents || []);
      await deleteMissing("case_reviewers", "id", db.caseReviewers || []);
      await deleteMissing("feedback", "id", db.feedback || []);
      await deleteMissing("reset_tokens", "id", db.resetTokens || []);
      await deleteMissing("notifications", "id", db.notifications || []);
      await deleteMissing("audits", "id", db.audits || []);
      await deleteMissing("cases", "id", db.cases || []);
      await deleteMissing("users", "id", db.users || []);

      // ROLE MATRIX DELETION
      const roles = Object.keys(db.roleMatrix || {});

      await client.query(
        `DELETE FROM role_matrix
         WHERE NOT (role = ANY($1::text[]))`,
        [roles]
      );

      // SETTINGS DELETION
      const settingKeys = Object.keys(db.settings || {});

      await client.query(
        `DELETE FROM app_settings
         WHERE NOT (setting_key = ANY($1::text[]))`,
        [settingKeys]
      );

      await client.query("COMMIT");

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("PostgreSQL save failed:", error.message);
      throw error;

    } finally {
      client.release();
    }
  });
}

// Existing helper functions - unchanged

export function publicUser(user, matrix) {
  if (!user) return null;

  const permissions = new Set(
    matrix?.[user.role] || DEFAULT_MATRIX[user.role] || []
  );

  if (user.role === "Supervisor") permissions.add("cases.create");
  if (permissions.has("reports.generate")) permissions.add("reports.view");

  if (user.role === "Read-only Reviewer") {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      supervisorId: user.supervisorId || null,
      status: user.status,
      initials: user.initials,
      avatar: user.avatar || "",
      mfaEnabled: Boolean(user.mfa_enabled),
      mfaRecoveryCodesRemaining: user.mfa_recovery_codes?.length || 0,
      permissions: [
        "cases.view",
        "docs.view",
        "audit.view",
        "reports.view",
      ],
    };
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    supervisorId: user.supervisorId || null,
    status: user.status,
    initials: user.initials,
    avatar: user.avatar || "",
    mfaEnabled: Boolean(user.mfa_enabled),
    mfaRecoveryCodesRemaining: user.mfa_recovery_codes?.length || 0,
    permissions: [...permissions],
  };
}

export function effectiveRoleMatrix(matrix) {
  const roles = Object.keys(matrix || DEFAULT_MATRIX);

  return Object.fromEntries(
    roles.map((role) => [
      role,
      publicUser({ role }, matrix).permissions,
    ])
  );
}

export function enrichCase(c, db) {
  const assigned = db.users.find((u) => u.id === c.assignedTo);
  const created = db.users.find((u) => u.id === c.createdBy);
  const docs = db.documents.filter((d) => d.caseId === c.id);

  return {
    ...c,
    assignedName: assigned?.name || "Unassigned",
    createdByName: created?.name || "System",
    documentCount: docs.length,
    createdOnLabel: prettyDate(c.createdOn).split(",")[0],
    incidentDateLabel: c.incidentDate
      ? prettyDate(`${c.incidentDate}T00:00:00.000Z`).split(",")[0]
      : "",
    reportedOnLabel: c.reportedOn
      ? prettyDate(`${c.reportedOn}T00:00:00.000Z`).split(",")[0]
      : "",
  };
}

export function enrichDoc(d, db) {
  const uploader = db.users.find((u) => u.id === d.uploadedBy);

  return {
    ...d,
    uploadedByName: uploader?.name || "Unknown",
    uploadedOnLabel: prettyDate(d.uploadedOn).split(",")[0],
    currentVersion: d.versions?.[d.versions.length - 1] || null,
  };
}

export function canAccessCase(
  user,
  c,
  users = [],
  caseReviewers = []
) {
  if (!user || !c) return false;

  // Admin can access every case
  if (user.role === "Admin") return true;

  // Supervisor can access their own cases
  // and cases assigned to their Investigating Officers
  if (user.role === "Supervisor") {
    if (c.assignedTo === user.id) return true;

    const assignedOfficer = users.find(
      (item) => item.id === c.assignedTo
    );

    return (
      assignedOfficer?.role === "Investigating Officer" &&
      assignedOfficer?.supervisorId === user.id
    );
  }

  // Read-only Reviewer can access only
  // cases explicitly assigned to them
  if (user.role === "Read-only Reviewer") {
  return caseReviewers.some(
    (assignment) =>
      (assignment.caseId || assignment.case_id) === c.id &&
      (assignment.reviewerId || assignment.reviewer_id) === user.id
  );
}

  // Investigating Officers can access
  // only cases assigned to themselves
  return c.assignedTo === user.id;
}
