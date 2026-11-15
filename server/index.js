import cors from "cors";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import {
  checkBucket,
  uploadToMinio,
  downloadFromMinio,
  deleteFromMinio,
} from "./minio.js";
import {
  canAccessCase as checkCaseAccess,
  effectiveRoleMatrix,
  enrichCase,
  enrichDoc,
  loadDb,
  now,
  prettyDate,
  publicUser,
  saveDb,
  STORAGE_DIR,
} from "./db.js";
import { can, PERMISSIONS, ROLES } from "./permissions.js";

const JWT_SECRET = process.env.JWT_SECRET;
const MFA_ENCRYPTION_SECRET = process.env.MFA_ENCRYPTION_KEY;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from server/.env");
}

if (!MFA_ENCRYPTION_SECRET) {
  throw new Error("MFA_ENCRYPTION_KEY is missing from server/.env");
}

if (JWT_SECRET === MFA_ENCRYPTION_SECRET) {
  throw new Error("JWT_SECRET and MFA_ENCRYPTION_KEY must be different.");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MFA_ENCRYPTION_KEY = crypto.scryptSync(
  MFA_ENCRYPTION_SECRET,
  "securevault-mfa-encryption-v1",
  32
);
const PORT = process.env.PORT || 4000;
const ALLOWED = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webm", ".wav", ".txt"];
const MAX_BYTES = 50 * 1024 * 1024;
const AVATAR_DIR = path.join(__dirname, "../uploads/avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (_req, file, callback) => {
      const extension = file.mimetype === "image/png" ? ".png" : ".jpg";
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
      const error = new Error("Upload a JPEG or PNG profile image");
      error.status = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
const uploadsRoot = path.join(__dirname, "../uploads");
app.use("/uploads", express.static(uploadsRoot));
app.use("/api/uploads", express.static(uploadsRoot));

let db = await loadDb();
db.feedback = db.feedback || [];
function canAccessCase(
  user,
  c,
  users = db.users,
  caseReviewers = db.caseReviewers || []
) {
  return checkCaseAccess(
    user,
    c,
    users,
    caseReviewers
  );
}

function persist() {
  return saveDb(db);
}

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Session required" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((u) => u.id === payload.id && u.status === "Active");
    if (!user) return res.status(401).json({ error: "Session expired" });
    req.user = publicUser(user, db.roleMatrix);
    req.ipAddress = req.socket.remoteAddress || req.ip || "127.0.0.1";
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requirePerm(permission) {
  return (req, res, next) => {
    if (!can(req.user, permission)) {
      audit(req, {
        action: "Denied",
        caseId: "—",
        document: "—",
        status: "Failure",
      });
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

function requireAnyPerm(...permissions) {
  return (req, res, next) => {
    if (!permissions.some((permission) => can(req.user, permission))) {
      audit(req, {
        action: "Denied",
        caseId: "—",
        document: "—",
        status: "Failure",
      });
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      audit(req, {
        action: "Denied",
        caseId: req.params.id || "—",
        document: "—",
        status: "Failure",
      });
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

function audit(req, entry) {
  db.audits.unshift({
    id: `a${Date.now()}${Math.floor(Math.random() * 99)}`,
    timestamp: now(),
    userId: req.user?.id || "anon",
    user: req.user?.name || "Anonymous",
    ip: req.ipAddress || "127.0.0.1",
    status: "Success",
    ...entry,
  });
  persist();
}

function recordCustodyEvent(req, { doc, action, sha256, note = "" }) {
  db.custodyEvents = db.custodyEvents || [];
  if (
    doc?.evidenceStatus === "Draft" &&
    ["View", "Download", "Verification Check", "Custody Transfer", "Version Update"].includes(action)
  ) {
    doc.evidenceStatus = "Locked";
  }
  const event = Object.freeze({
    id: `custody-${crypto.randomUUID()}`,
    documentId: doc?.id || null,
    document: doc?.name || "",
    caseId: doc?.caseId || null,
    handlerId: req.user.id,
    handlerName: req.user.name,
    role: req.user.role,
    timestamp: now(),
    action,
    ipAddress: String(req.ipAddress || "127.0.0.1").split(",")[0].trim(),
    sha256: sha256 || "",
    note,
  });
  db.custodyEvents.push(event);
  return persist();
}

function custodyForDocuments(documentIds, caseId = null) {
  const ids = new Set(documentIds);
  return (db.custodyEvents || [])
    .filter((event) => ids.has(event.documentId) || (caseId && event.caseId === caseId))
    .slice()
    .reverse();
}

function findUser(identifier) {
  const key = identifier.trim().toLowerCase();
  return db.users.find(
    (u) => u.email.toLowerCase() === key || u.username.toLowerCase() === key
  );
}

function hashBuffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function encodeBase32(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const char of normalized) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Stored MFA secret is invalid");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function encryptMfaSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MFA_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptMfaSecret(encryptedSecret) {
  const [version, encodedIv, encodedTag, encodedData] = String(encryptedSecret).split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedData) {
    throw new Error("Stored MFA secret is invalid");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", MFA_ENCRYPTION_KEY, Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedData, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function totpAtCounter(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1000000).padStart(6, "0");
}

function matchingTotpCounter(secret, code, lastCounter = -1) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const currentCounter = Math.floor(Date.now() / 30000);
  for (const counter of [currentCounter - 1, currentCounter, currentCounter + 1]) {
    if (counter <= lastCounter) continue;
    const expected = Buffer.from(totpAtCounter(secret, counter));
    const supplied = Buffer.from(code);
    if (crypto.timingSafeEqual(expected, supplied)) return counter;
  }
  return null;
}

function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const value = crypto.randomBytes(8).toString("hex").toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
  });
}

function recoveryCodeHash(code) {
  return crypto.createHash("sha256").update(code.replace(/[^a-z0-9]/gi, "").toUpperCase()).digest("hex");
}

function consumeRecoveryCode(user, code) {
  if (typeof code !== "string" || !Array.isArray(user.mfa_recovery_codes)) return false;
  const candidate = Buffer.from(recoveryCodeHash(code), "hex");
  const index = user.mfa_recovery_codes.findIndex((entry) => {
    const stored = Buffer.from(entry, "hex");
    return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
  });
  if (index < 0) return false;
  user.mfa_recovery_codes.splice(index, 1);
  return true;
}

function clearMfa(user) {
  user.mfa_enabled = false;
  delete user.mfa_secret;
  delete user.mfa_pending_secret;
  delete user.mfa_pending_expires_at;
  delete user.mfa_last_counter;
  user.mfa_recovery_codes = [];
}

function isValidDateOnly(value) {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function writePrivateFile(docId, version, originalName, buffer) {
  const dir = path.join(STORAGE_DIR, docId);
  fs.mkdirSync(dir, { recursive: true });
  const safe = originalName.replace(/[^\w.\-]+/g, "_");
  const filename = `v${version}-${crypto.randomUUID()}-${safe}`;
  const full = path.join(dir, filename);
  fs.writeFileSync(full, buffer, { flag: "wx" });
  return { full, filename, size: buffer.length };
}

// Generate a unique private MinIO object key
function createMinioObjectKey(caseId, docId, version, originalName) {
  const safeName = path.basename(originalName).replace(/[^\w.\-]+/g, "_");

  return `cases/${caseId}/documents/${docId}/v${version}/${crypto.randomUUID()}-${safeName}`;
}

// Upload a new document version to MinIO
async function storeMinioFile(caseId, docId, version, originalName, buffer, contentType) {
  const objectKey = createMinioObjectKey(
    caseId,
    docId,
    version,
    originalName
  );

  await uploadToMinio(
    objectKey,
    buffer,
    contentType || "application/octet-stream"
  );

  return {
    objectKey,
    size: buffer.length,
    storageBackend: "minio",
  };
}

async function readStoredDocument(doc, version) {
  if (version.storageBackend === "minio") {
    if (!version.objectKey) {
      throw new Error("MinIO object key is missing");
    }

    return await downloadFromMinio(version.objectKey);
  }

  // Existing documents continue using local storage
  if (!version.filename) {
    throw new Error("Stored document filename is missing");
  }

  const full = path.join(STORAGE_DIR, doc.id, version.filename);

  return fs.promises.readFile(full);
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, username, password } = req.body || {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!cleanName || !cleanEmail || !cleanUsername || typeof password !== "string") {
    return res.status(400).json({ error: "Name, email, username and password are required" });
  }
  if (cleanName.length > 100 || cleanEmail.length > 254 || cleanUsername.length > 40) {
    return res.status(400).json({ error: "One or more fields exceed the maximum length" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (!/^[a-z0-9._-]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: "Username may contain letters, numbers, dots, hyphens and underscores" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (db.users.some((user) => user.email.toLowerCase() === cleanEmail || user.username.toLowerCase() === cleanUsername)) {
    return res.status(409).json({ error: "Email or username already exists" });
  }

  const user = {
    id: `u${crypto.randomUUID()}`,
    name: cleanName,
    email: cleanEmail,
    username: cleanUsername,
    role: "Read-only Reviewer",
    status: "Inactive",
    initials: cleanName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    passwordHash: await bcrypt.hash(password, 10),
  };
  db.users.push(user);
  await persist();
  res.status(201).json({ message: "Registration submitted for administrator approval" });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password, mfaCode } = req.body || {};
  const user = findUser(username || "");
  const dummy = await bcrypt.hash("invalid", 8);
  const ok = user ? await bcrypt.compare(password || "", user.passwordHash) : await bcrypt.compare("x", dummy);
  req.user = user ? publicUser(user, db.roleMatrix) : null;
  req.ipAddress = req.socket.remoteAddress;
  if (!user || !ok) {
    db.audits.unshift({
      id: `a${Date.now()}`,
      timestamp: now(),
      userId: user?.id || "unknown",
      user: user?.name || username || "Unknown",
      action: "Login",
      caseId: "—",
      document: "—",
      ip: req.ipAddress || "127.0.0.1",
      status: "Failure",
    });
    persist();
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status !== "Active") {
    return res.status(403).json({
      error: "Your account is awaiting administrator approval. Contact an administrator to activate it.",
    });
  }
  if (user.mfa_enabled) {
    let verified = false;
    if (typeof mfaCode === "string" && /^\d{6}$/.test(mfaCode) && user.mfa_secret) {
      try {
        const counter = matchingTotpCounter(
          decryptMfaSecret(user.mfa_secret),
          mfaCode,
          Number.isInteger(user.mfa_last_counter) ? user.mfa_last_counter : -1
        );
        if (counter !== null) {
          user.mfa_last_counter = counter;
          verified = true;
        }
      } catch {
        return res.status(500).json({ error: "MFA configuration is unavailable" });
      }
    }
    if (!verified) verified = consumeRecoveryCode(user, mfaCode);
    if (!verified) {
      audit(req, {
        action: "MFA Login",
        caseId: "—",
        document: "—",
        status: "Failure",
        note: mfaCode ? "Invalid authenticator or recovery code" : "MFA verification code required",
      });
      persist();
      return res.status(401).json({
        error: mfaCode ? "Invalid MFA verification code" : "MFA verification code required",
        code: mfaCode ? "MFA_INVALID" : "MFA_REQUIRED",
      });
    }
    await persist();
  }
  audit(req, { action: "Login", caseId: "—", document: "—" });
  res.json({ token: sign(user), user: publicUser(user, db.roleMatrix) });
});

app.post("/api/auth/forgot", (req, res) => {
  const user = findUser(req.body?.email || "");
  if (!user) {
    return res.json({
      message: "If the account exists, a reset link has been issued.",
    });
  }
  const token = crypto.randomBytes(24).toString("hex");
  db.resetTokens = db.resetTokens.filter((t) => t.userId !== user.id);
  db.resetTokens.push({
    token,
    userId: user.id,
    expiresAt: Date.now() + 30 * 60 * 1000,
    used: false,
  });
  persist();
  res.json({
    message: "If the account exists, a reset link has been issued.",
    demoToken: token,
  });
});

app.post("/api/auth/reset", async (req, res) => {
  const { token, password, confirm } = req.body || {};
  if (!password || password !== confirm || String(password).length < 8) {
    return res.status(400).json({ error: "Passwords must match and be at least 8 characters" });
  }
  const record = db.resetTokens.find((t) => t.token === token && !t.used);
  if (!record || record.expiresAt < Date.now()) {
    return res.status(400).json({ error: "Reset token is invalid or expired" });
  }
  const user = db.users.find((u) => u.id === record.userId);
  user.passwordHash = await bcrypt.hash(password, 10);
  record.used = true;
  persist();
  res.json({ message: "Password updated. You can sign in." });
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/logout", auth, (req, res) => {
  audit(req, { action: "Logout", caseId: "—", document: "—" });
  res.json({ ok: true });
});

app.get("/api/meta", auth, (req, res) => {
  res.json({
    roles: ROLES,
    permissions: PERMISSIONS,
    roleMatrix: effectiveRoleMatrix(db.roleMatrix),
    caseTypes: [
      "Cyber Crime",
      "Property Crime",
      "Homicide",
      "Economic Offense",
      "Narcotics",
      "Violent Crime",
    ],
    docTypes: [
      "FIR",
      "Witness Statement",
      "Investigation Report",
      "Forensic Report",
      "Digital Evidence",
      "Charge Sheet",
      "Court Document",
    ],
  });
});

app.get("/api/dashboard", auth, requirePerm("cases.view"), (req, res) => {
  const visible = db.cases.filter((c) => canAccessCase(req.user, c, db.users)).map((c) => enrichCase(c, db));
  const mine = visible.filter((c) => db.cases.find((x) => x.id === c.id)?.assignedTo === req.user.id);
  const priorityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const docs = db.documents.filter((d) => visible.some((c) => c.id === d.caseId));
  const activity = db.audits
    .filter((a) => {
      if (req.user.role === "Admin") return true;
      if (a.caseId && a.caseId !== "—") {
        return visible.some((c) => c.id === a.caseId);
      }
      return a.userId === req.user.id;
    })
    .slice(0, 8)
    .map((a) => ({ ...a, timestampLabel: prettyDate(a.timestamp) }));
  const visibleIds = new Set(visible.map((c) => c.id));
  const notifications = db.notifications
  .filter((n) => {
    // Only show notifications belonging to this user.
    // Keep older legacy notifications visible for compatibility.
    if (n.userId && n.userId !== req.user.id) {
      return false;
    }

    if (n.userId) {
        return n.userId === req.user.id;
      }

      if (n.caseId) {
        return visibleIds.has(n.caseId);
      }

      return true;
  })
  .sort(
    (a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
  )
  .slice(0, 20);
  const userNotifications = notifications.map((n) => {
  if (!n.userId && !n.caseId) {
    return {
      ...n,
      read: (n.readBy || []).includes(req.user.id),
    };
  }

  return n;
});
  const teamWorkload = req.user.role === "Supervisor"
    ? db.users
      .filter((u) => u.role === "Investigating Officer" && u.status === "Active")
      .map((officer) => {
        const assigned = visible.filter((c) => c.assignedTo === officer.id);
        return {
          id: officer.id,
          name: officer.name,
          total: assigned.length,
          active: assigned.filter((c) => c.status === "Active").length,
          pending: assigned.filter(isReviewPending).length,
        };
      })
    : undefined;
  const adminSummary = req.user.role === "Admin"
    ? {
      totalUsers: db.users.length,
      activeUsers: db.users.filter((u) => u.status === "Active").length,
      pendingUsers: db.users.filter((u) => u.status !== "Active").length,
      auditVolume: db.audits.length,
      roleMatrix: effectiveRoleMatrix(db.roleMatrix),
      systemHealth: "Operational",
    }
    : undefined;
  const recentDocuments = docs
    .slice()
    .sort((a, b) => new Date(b.uploadedOn) - new Date(a.uploadedOn))
    .slice(0, 6)
    .map((doc) => enrichDoc(doc, db));
  res.json({
    stats: {
      totalCases: visible.length,
      assigned: mine.length,
      documents: docs.length,
      activity: activity.length,
      active: visible.filter((c) => c.status === "Active").length,
      closed: visible.filter((c) => c.status === "Closed").length,
      pendingApprovals: visible.filter(isReviewPending).length,
    },
    recentCases: visible.slice(0, 6),
    priorityCases: req.user.role === "Investigating Officer"
      ? mine.slice().sort((a, b) => (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4)).slice(0, 6)
      : undefined,
    pendingCases: req.user.role === "Supervisor"
      ? visible.filter(isReviewPending)
      : undefined,
    recentDocuments,
    teamWorkload,
    adminSummary,
    activity,
    notifications: userNotifications,
  });
});

// GET COMPLETE NOTIFICATION HISTORY FOR CURRENT USER
app.get("/api/notifications", auth, requirePerm("cases.view"), (req, res) => {
  const visibleCases = db.cases
    .filter((c) => canAccessCase(req.user, c, db.users));

  const visibleIds = new Set(visibleCases.map((c) => c.id));

  const notifications = db.notifications
    .filter((n) => {
      if (n.userId && n.userId !== req.user.id) {
        return false;
      }

      if (n.caseId) {
        return visibleIds.has(n.caseId);
      }

      return true;
    })
    .map((n) => {
      if (!n.userId && !n.caseId) {
        return {
          ...n,
          read: (n.readBy || []).includes(req.user.id),
        };
      }

      return n;
    })
    .sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

  res.json({ notifications });
});

// MARK A SINGLE NOTIFICATION AS READ
app.patch("/api/notifications/:id/read", auth, async (req, res) => {
  const notification = db.notifications.find(
    (n) => n.id === req.params.id
  );

if (
  !notification ||
  (notification.userId && notification.userId !== req.user.id)
) {
    return res.status(404).json({
      error: "Notification not found",
    });
  }

  if (notification.caseId) {
    const linkedCase = db.cases.find(
      (c) => c.id === notification.caseId
    );

    if (!linkedCase || !canAccessCase(req.user, linkedCase, db.users)) {
      return res.status(404).json({
        error: "Notification not found",
      });
    }
  }

  if (!notification.userId && !notification.caseId) {
  notification.readBy = Array.isArray(notification.readBy)
    ? notification.readBy
    : [];

  if (!notification.readBy.includes(req.user.id)) {
    notification.readBy.push(req.user.id);
  }
} else {
  notification.read = true;
}

  await persist();

  res.json({
    success: true,
    notification,
  });
});


// MARK ALL USER NOTIFICATIONS AS READ

app.patch("/api/notifications/read-all", auth, async (req, res) => {
  let updated = 0;

  for (const notification of db.notifications) {
  const isOwned =
    notification.userId === req.user.id;

  const isAccessibleLegacyCase =
    !notification.userId &&
    notification.caseId &&
    db.cases.some(
      (c) =>
        c.id === notification.caseId &&
        canAccessCase(req.user, c, db.users)
    );

  const isGlobal =
    !notification.userId &&
    !notification.caseId;

  if (isGlobal) {
    notification.readBy = Array.isArray(notification.readBy)
      ? notification.readBy
      : [];

    if (!notification.readBy.includes(req.user.id)) {
      notification.readBy.push(req.user.id);
      updated++;
    }
  } else if (
    (isOwned || isAccessibleLegacyCase) &&
    notification.read !== true
  ) {
    notification.read = true;
    updated++;
  }
}

  await persist();

  res.json({
    success: true,
    updated,
  });
});

app.get("/api/cases", auth, requirePerm("cases.view"), (req, res) => {
  const { q = "", status = "", type = "", officer = "" } = req.query;
  let rows = db.cases.filter((c) => canAccessCase(req.user, c, db.users)).map((c) => enrichCase(c, db));
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter((c) => `${c.id} ${c.title} ${c.type} ${c.firNo}`.toLowerCase().includes(s));
  }
  if (status) {
    const statuses = String(status).split(",").map((value) => value.trim()).filter(Boolean);
    rows = rows.filter((c) => statuses.includes(c.status));
  }
  if (type) rows = rows.filter((c) => c.type === type);
  if (officer) rows = rows.filter((c) => c.assignedTo === officer);
  res.json({ cases: rows });
});

app.get("/api/cases/:id", auth, requirePerm("cases.view"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || !canAccessCase(req.user, item, db.users)) return res.status(404).json({ error: "Case not found" });
  const docs = db.documents.filter((d) => d.caseId === item.id).map((d) => enrichDoc(d, db));
  const logs = db.audits
    .filter((a) => a.caseId === item.id)
    .map((a) => ({ ...a, timestampLabel: prettyDate(a.timestamp) }));
  res.json({
    case: enrichCase(item, db),
    documents: docs,
    activity: logs,
    custodyEvents: custodyForDocuments(docs.map((doc) => doc.id), item.id),
  });
});

app.post("/api/cases", auth, requirePerm("cases.create"), (req, res) => {
  const body = req.body || {};
  const priority = body.priority || "Medium";
  if (!["Critical", "High", "Medium", "Low"].includes(priority)) {
    return res.status(400).json({ error: "Priority must be Critical, High, Medium, or Low" });
  }
  const canAssign = ["Admin", "Supervisor"].includes(req.user.role);
  const assignedTo = canAssign ? body.assignedTo : req.user.id;
  if (!body.title) return res.status(400).json({ error: "Case title is required" });
  if (canAssign && !assignedTo) {
    return res.status(400).json({ error: "Select an investigating officer for this case" });
  }
  if (assignedTo) {
    const officer = db.users.find((user) => user.id === assignedTo && user.status === "Active");
    if (!officer || officer.role !== "Investigating Officer") {
      return res.status(400).json({ error: "Cases can only be assigned to an active Investigating Officer" });
    }
  }
  if (!isValidDateOnly(body.incidentDate) || !isValidDateOnly(body.reportedOn)) {
    return res.status(400).json({ error: "Enter valid incident and report dates" });
  }
  const seq = String(db.cases.length + 1).padStart(3, "0");
  const item = {
    id: `CS-${seq}`,
    title: body.title,
    type: body.type || "Cyber Crime",
    status: "Active",
    assignedTo,
    createdBy: req.user.id,
    createdOn: now(),
    incidentDate: body.incidentDate || "",
    reportedOn: body.reportedOn || "",
    priority,
    location: body.location || "",
    firNo: body.firNo || "",
    fileNumber: body.fileNumber || "",
    description: body.description || "",
    suspects: Array.isArray(body.suspects) ? body.suspects : [],
    witnesses: Array.isArray(body.witnesses) ? body.witnesses : [],
    evidence: Array.isArray(body.evidence) ? body.evidence : [],
  };
  db.cases.unshift(item);
  audit(req, { action: "Create Case", caseId: item.id, document: "—" });
  db.notifications.unshift({
  id: `n${crypto.randomUUID()}`,
  userId: assignedTo || req.user.id,
  title: `New case ${item.id}`,
  body: item.title,
  caseId: item.id,
  createdAt: now(),
  read: false,
});
  persist();
  res.status(201).json({ case: enrichCase(item, db) });
});

app.patch("/api/cases/:id", auth, requirePerm("cases.edit"), (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || !canAccessCase(req.user, item, db.users)) return res.status(404).json({ error: "Case not found" });
  const body = req.body || {};
  const validPriorities = ["Critical", "High", "Medium", "Low"];
  if (body.status !== undefined && body.status !== item.status) {
    return res.status(400).json({ error: "Use the case submission or supervisor review action to change status" });
  }
  if (body.priority !== undefined && !validPriorities.includes(body.priority)) {
    return res.status(400).json({ error: "Priority must be Critical, High, Medium, or Low" });
  }
  if (body.priority !== undefined && body.priority !== item.priority && !["Investigating Officer", "Supervisor", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "You cannot update case priority" });
  }
  if (body.assignedTo !== undefined && body.assignedTo !== item.assignedTo) {
    if (!["Admin", "Supervisor"].includes(req.user.role)) {
      return res.status(403).json({ error: "Only supervisors and administrators can assign cases" });
    }
    const officer = db.users.find((user) => user.id === body.assignedTo && user.status === "Active");
    if (!officer || officer.role !== "Investigating Officer") {
      return res.status(400).json({ error: "Cases can only be assigned to an active Investigating Officer" });
    }
  }
  if (!isValidDateOnly(body.incidentDate) || !isValidDateOnly(body.reportedOn)) {
    return res.status(400).json({ error: "Enter valid incident and report dates" });
  }

  const previousAssigneeId = item.assignedTo;
  const previousPriority = item.priority || "Medium";
  Object.assign(item, {
    title: body.title ?? item.title,
    type: body.type ?? item.type,
    status: body.status ?? item.status,
    assignedTo: body.assignedTo ?? item.assignedTo,
    priority: body.priority ?? item.priority,
    location: body.location ?? item.location,
    firNo: body.firNo ?? item.firNo,
    fileNumber: body.fileNumber ?? item.fileNumber,
    description: body.description ?? item.description,
    incidentDate: body.incidentDate ?? item.incidentDate ?? "",
    reportedOn: body.reportedOn ?? item.reportedOn ?? "",
    suspects: Array.isArray(body.suspects) ? body.suspects : (item.suspects || []),
    witnesses: Array.isArray(body.witnesses) ? body.witnesses : (item.witnesses || []),
    evidence: Array.isArray(body.evidence) ? body.evidence : (item.evidence || []),
  });
  audit(req, {
    action: body.priority !== undefined && body.priority !== previousPriority ? "Update Case Priority" : "Update Case",
    caseId: item.id,
    document: "—",
    ...(body.priority !== undefined && body.priority !== previousPriority
      ? { note: `Priority changed from ${previousPriority} to ${body.priority}` }
      : {}),
  });
  persist();
// Notify newly assigned officer
  if (
    body.assignedTo !== undefined &&
    previousAssigneeId !== item.assignedTo
  ) {
    db.notifications.unshift({
      id: `n${crypto.randomUUID()}`,
      userId: item.assignedTo,
      title: "New Case Assigned",
      body: `You have been assigned to Case ${item.id}: ${item.title}.`,
      caseId: item.id,
      createdAt: now(),
      read: false,
    });
  }
  if (
    previousAssigneeId &&
    previousAssigneeId !== item.assignedTo
  ) {
    db.notifications.unshift({
      id: `n${crypto.randomUUID()}`,
      userId: previousAssigneeId,
      title: "Case Reassigned",
      body: `Case ${item.id} has been reassigned to another Investigating Officer by the Supervisor.`,
      caseId: item.id,
      createdAt: now(),
      read: false,
    });
}
  res.json({ case: enrichCase(item, db) });
});

app.patch("/api/cases/:id/priority", auth, requireRole("Investigating Officer", "Supervisor", "Admin"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || !canAccessCase(req.user, item, db.users)) {
    return res.status(404).json({ error: "Case not found" });
  }
  const priority = req.body?.priority;
  if (!["Critical", "High", "Medium", "Low"].includes(priority)) {
    return res.status(400).json({ error: "Priority must be Critical, High, Medium, or Low" });
  }
  const previousPriority = item.priority || "Medium";
  if (previousPriority !== priority) {
    item.priority = priority;
    item.priorityUpdatedAt = now();
    item.priorityUpdatedBy = req.user.id;
    audit(req, {
      action: "Update Case Priority",
      caseId: item.id,
      document: "—",
      note: `Priority changed from ${previousPriority} to ${priority}`,
    });
    await persist();
  }
  res.json({ case: enrichCase(item, db) });
});

app.patch("/api/cases/:id/assignment", auth, requireRole("Supervisor", "Admin"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || !canAccessCase(req.user, item, db.users)) {
    return res.status(404).json({ error: "Case not found" });
  }
  const assignedTo = req.body?.assignedTo;
  const officer = db.users.find((user) => user.id === assignedTo && user.status === "Active");
  if (!officer || officer.role !== "Investigating Officer") {
    return res.status(400).json({ error: "Select an active Investigating Officer" });
  }
  const previousAssignee = db.users.find((user) => user.id === item.assignedTo);
  item.assignedTo = officer.id;
  item.assignmentUpdatedAt = now();
  item.assignmentUpdatedBy = req.user.id;
  audit(req, {
    action: "Reassign Case",
    caseId: item.id,
    document: "—",
    note: `Assigned to ${officer.name}; previously ${previousAssignee?.name || "Unassigned"}`,
  });
  // Notify newly assigned officer
  if (previousAssignee?.id !== officer.id) {
    db.notifications.unshift({
      id: `n${crypto.randomUUID()}`,
      userId: officer.id,
      title: "New Case Assigned",
      body: `You have been assigned to Case ${item.id}: ${item.title}.`,
      caseId: item.id,
      createdAt: now(),
      read: false,
    });
  }
    // Notify previous officer about reassignment
  if (previousAssignee?.id && previousAssignee.id !== officer.id) {
    db.notifications.unshift({
      id: `n${crypto.randomUUID()}`,
      userId: previousAssignee.id,
      title: "Case Reassigned",
      body: `Case ${item.id} has been reassigned to another Investigating Officer by the Supervisor.`,
      caseId: item.id,
      createdAt: now(),
      read: false,
    });
  }
  await persist();
  res.json({ case: enrichCase(item, db) });
});

// Assign Reviewer to a Case (Admin only)
app.post(
  "/api/cases/:id/reviewers",
  auth,
  requireRole("Admin"),
  async (req, res) => {
    const item = db.cases.find((c) => c.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: "Case not found" });
    }

    const reviewerId = req.body?.reviewerId;

    // Validate Reviewer
    const reviewer = db.users.find(
      (user) =>
        user.id === reviewerId &&
        user.role === "Read-only Reviewer" &&
        user.status === "Active"
    );

    if (!reviewer) {
      return res.status(400).json({
        error: "Select an active Reviewer",
      });
    }

    // Initialize Reviewer assignments
    db.caseReviewers = db.caseReviewers || [];

    // Prevent duplicate assignments
    const alreadyAssigned = db.caseReviewers.some(
      (assignment) =>
        assignment.caseId === item.id &&
        assignment.reviewerId === reviewer.id
    );

    if (alreadyAssigned) {
      return res.status(409).json({
        error: "Reviewer is already assigned to this case",
      });
    }

    // Create assignment
    const assignment = {
      id: crypto.randomUUID(),
      caseId: item.id,
      reviewerId: reviewer.id,
      assignedBy: req.user.id,
      assignedAt: now(),
    };

    db.caseReviewers.push(assignment);

    // Audit log
    audit(req, {
      action: "Assign Reviewer",
      caseId: item.id,
      document: "—",
      note: `Reviewer ${reviewer.name} assigned to case ${item.id}`,
    });

    await persist();

    res.status(201).json({
      message: "Reviewer assigned successfully",
      assignment,
    });
  }
);

// Remove Reviewer from a Case (Admin only)
app.delete(
  "/api/cases/:id/reviewers/:reviewerId",
  auth,
  requireRole("Admin"),
  async (req, res) => {
    const item = db.cases.find(
      (c) => c.id === req.params.id
    );

    if (!item) {
      return res.status(404).json({
        error: "Case not found",
      });
    }

    db.caseReviewers = db.caseReviewers || [];

    const index = db.caseReviewers.findIndex(
      (assignment) =>
        assignment.caseId === item.id &&
        assignment.reviewerId === req.params.reviewerId
    );

    if (index === -1) {
      return res.status(404).json({
        error: "Reviewer assignment not found",
      });
    }

    const removed = db.caseReviewers[index];

    db.caseReviewers.splice(index, 1);

    const reviewer = db.users.find(
      (user) => user.id === removed.reviewerId
    );

    audit(req, {
      action: "Remove Reviewer",
      caseId: item.id,
      document: "—",
      note: `Reviewer ${reviewer?.name || removed.reviewerId} removed from case ${item.id}`,
    });

    await persist();

    res.json({
      message: "Reviewer removed successfully",
    });
  }
);

// Get Reviewers assigned to a Case (Admin only)
app.get(
  "/api/cases/:id/reviewers",
  auth,
  requireRole("Admin"),
  (req, res) => {
    const item = db.cases.find((c) => c.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: "Case not found" });
    }

    const reviewers = (db.caseReviewers || [])
      .filter((assignment) => assignment.caseId === item.id)
      .map((assignment) => ({
        ...assignment,
        user: publicUser(
          db.users.find((u) => u.id === assignment.reviewerId),
          db.roleMatrix
        ),
      }))
      .filter((assignment) => assignment.user);

    res.json({ reviewers });
  }
);

app.post("/api/cases/:id/submit-review", auth, requireRole("Investigating Officer"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || item.assignedTo !== req.user.id) {
    return res.status(404).json({ error: "Assigned case not found" });
  }
  if (!["Active", "Needs Revision"].includes(item.status)) {
    return res.status(409).json({ error: "Only active or returned cases can be submitted for review" });
  }
  const status = req.body?.status;
  if (!["Pending Review", "On Hold"].includes(status)) {
    return res.status(400).json({ error: "Choose Pending Review or On Hold" });
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  item.status = status;
  delete item.operationalPause;
  item.submittedForReviewAt = now();
  item.submittedForReviewBy = req.user.id;
  item.submissionNote = note;
  audit(req, {
    action: "Submit for Review",
    caseId: item.id,
    document: "—",
    note: note || "No submission note provided",
  });
    notifyCaseUsers(
    item,
    [getAssignedSupervisorId(item)],
    "Case Submitted for Review",
    `Case ${item.id} has been submitted for supervisor review.`,
    req.user.id
  );
  await persist();
  res.json({ case: enrichCase(item, db) });
});

function isReviewPending(item) {
  return item.status === "Pending Closure"
    || item.status === "Pending Review"
    || (item.status === "On Hold" && item.operationalPause?.state !== "Paused");
}

function notifyCaseUsers(caseItem, recipientIds, title, body, actorId) {
  const recipients = [...new Set(recipientIds.filter(Boolean))]
    .filter((userId) => userId !== actorId);

  recipients.forEach((userId) => {
    db.notifications.unshift({
      id: `n${crypto.randomUUID()}`,
      userId,
      title,
      body,
      caseId: caseItem.id,
      createdAt: now(),
      read: false,
    });
  });
}
function getAssignedSupervisorId(caseItem) {
  const officer = db.users.find(
    (user) =>
      user.id === caseItem.assignedTo &&
      user.role === "Investigating Officer" &&
      user.status === "Active"
  );

  if (!officer?.supervisorId) return null;

  const supervisor = db.users.find(
    (user) =>
      user.id === officer.supervisorId &&
      user.role === "Supervisor" &&
      user.status === "Active"
  );

  return supervisor?.id || null;
}

app.post("/api/cases/:id/request-closure", auth, requireRole("Investigating Officer"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || item.assignedTo !== req.user.id) {
    return res.status(404).json({ error: "Assigned case not found" });
  }
  if (item.status !== "Active") {
    return res.status(409).json({ error: "Only an active assigned case can be submitted for closure" });
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  const timestamp = now();
  item.status = "Pending Closure";
  item.closureRequest = {
    requestedBy: req.user.id,
    requestedByName: req.user.name,
    requestedAt: timestamp,
    note,
  };
  audit(req, {
    action: "Request Case Closure",
    caseId: item.id,
    document: "—",
    note: note || "Officer requested final supervisor sign-off",
  });
    notifyCaseUsers(
    item,
    [getAssignedSupervisorId(item)],
    "Case Closure Requested",
    `Closure has been requested for Case ${item.id}.`,
    req.user.id
  );
  await persist();
  res.json({ case: enrichCase(item, db) });
});

app.post("/api/cases/:id/operational-status", auth, requireRole("Investigating Officer"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || item.assignedTo !== req.user.id) {
    return res.status(404).json({ error: "Assigned case not found" });
  }
  const action = req.body?.action;
  const timestamp = now();
  if (action === "pause") {
    if (item.status !== "Active") {
      return res.status(409).json({ error: "Only an active case can be paused" });
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) return res.status(400).json({ error: "Provide a reason for pausing the case" });
    const boundedReason = reason.slice(0, 2000);
    item.status = "On Hold";
    item.operationalPause = { state: "Paused", reason: boundedReason, changedBy: req.user.id, changedAt: timestamp };
    item.operationalHistory = [...(item.operationalHistory || []), {
      action: "Paused",
      reason: boundedReason,
      changedBy: req.user.id,
      changedByName: req.user.name,
      changedAt: timestamp,
    }];
    audit(req, { action: "Pause Case", caseId: item.id, document: "—", note: boundedReason });
  } else if (action === "resume") {
    if (item.status !== "On Hold" || item.operationalPause?.state !== "Paused") {
      return res.status(409).json({ error: "Only a case paused operationally can be resumed" });
    }
    item.status = "Active";
    item.operationalPause = { ...item.operationalPause, state: "Active", changedBy: req.user.id, changedAt: timestamp };
    item.operationalHistory = [...(item.operationalHistory || []), {
      action: "Resumed",
      reason: item.operationalPause.reason,
      changedBy: req.user.id,
      changedByName: req.user.name,
      changedAt: timestamp,
    }];
    audit(req, { action: "Resume Case", caseId: item.id, document: "—", note: item.operationalPause.reason });
  } else {
    return res.status(400).json({ error: "Choose pause or resume" });
  }
  
    const statusTitle = action === "pause"
    ? "Case Paused"
    : "Case Resumed";

  const statusMessage = action === "pause"
    ? `Case ${item.id} has been paused.`
    : `Case ${item.id} has been resumed.`;

  notifyCaseUsers(
    item,
    [getAssignedSupervisorId(item)],
    statusTitle,
    statusMessage,
    req.user.id
  );
  await persist();
  res.json({ case: enrichCase(item, db) });
});

app.post("/api/cases/:id/approve", auth, requireRole("Supervisor", "Admin"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || !canAccessCase(req.user, item, db.users)) {
    return res.status(404).json({ error: "Case not found" });
  }
  if (!isReviewPending(item)) {
    return res.status(409).json({ error: "Only cases awaiting review can be approved" });
  }
  const timestamp = now();
  item.status = item.status === "Pending Closure" ? "Completed" : "Active";
  item.lastReview = {
    action: item.status === "Completed" ? "Closure Approved" : "Approved",
    actorId: req.user.id,
    actorName: req.user.name,
    signature: req.user.name,
    timestamp,
  };
  item.reviewHistory = [...(item.reviewHistory || []), item.lastReview];
  audit(req, {
    action: "Approve Case",
    caseId: item.id,
    document: "—",
    signature: req.user.name,
    reviewTimestamp: timestamp,
  });
    notifyCaseUsers(
    item,
    [item.assignedTo],
    item.status === "Completed" ? "Case Closure Approved" : "Case Approved",
    item.status === "Completed"
      ? `Closure for Case ${item.id} has been approved.`
      : `Case ${item.id} has been approved by the Supervisor.`,
    req.user.id
  );
  await persist();
  res.json({ case: enrichCase(item, db) });
});

app.post("/api/cases/:id/reopen", auth, requireRole("Supervisor", "Admin"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);

  if (!item || !canAccessCase(req.user, item, db.users)) {
    return res.status(404).json({ error: "Case not found" });
  }

  if (item.status !== "Closed") {
    return res.status(409).json({ error: "Only closed cases can be reopened" });
  }

  const timestamp = now();

  item.status = "Active";
  item.reopenedAt = timestamp;
  item.reopenedBy = req.user.id;

  audit(req, {
    action: "Reopen Case",
    caseId: item.id,
    document: "—",
    note: "Closed case reopened by Supervisor/Admin",
  });

  notifyCaseUsers(
    item,
    [item.assignedTo],
    "Case Reopened",
    `Case ${item.id} has been reopened and is now Active.`,
    req.user.id
  );

  await persist();
  res.json({ case: enrichCase(item, db) });
});

app.post("/api/cases/:id/reject", auth, requireRole("Supervisor", "Admin"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);

  if (!item || !canAccessCase(req.user, item, db.users)) {
    return res.status(404).json({ error: "Case not found" });
  }

  if (!isReviewPending(item)) {
    return res.status(409).json({ error: "Only cases awaiting review can be rejected" });
  }

  const reason = typeof req.body?.reason === "string"
    ? req.body.reason.trim()
    : "";

  if (!reason) {
    return res.status(400).json({ error: "Provide a reason for rejecting this case" });
  }

  // Identify whether this is a closure rejection or investigation review rejection.
  const isClosureRejection = item.status === "Pending Closure";

  const timestamp = now();

  // Closure rejection returns the case to Active.
  // Investigation review rejection sends the case to Needs Revision.
  item.status = isClosureRejection ? "Active" : "Needs Revision";

  item.lastReview = {
    action: isClosureRejection ? "Closure Rejected" : "Rejected",
    actorId: req.user.id,
    actorName: req.user.name,
    signature: req.user.name,
    timestamp,
    reason: reason.slice(0, 2000),
  };

  item.reviewHistory = [...(item.reviewHistory || []), item.lastReview];

  audit(req, {
    action: isClosureRejection ? "Reject Closure" : "Reject Case",
    caseId: item.id,
    document: "—",
    signature: req.user.name,
    reviewTimestamp: timestamp,
    note: reason.slice(0, 2000),
  });

  notifyCaseUsers(
    item,
    [item.assignedTo],
    isClosureRejection ? "Closure Request Rejected" : "Case Review Rejected",
    isClosureRejection
      ? `Closure request for Case ${item.id} was rejected. Investigation can continue. Reason: ${reason.slice(0, 500)}`
      : `Case ${item.id} was rejected during investigation review and requires revision. Reason: ${reason.slice(0, 500)}`,
    req.user.id
  );

  await persist();

  res.json({ case: enrichCase(item, db) });
});

app.post("/api/cases/:id/return", auth, requireRole("Supervisor", "Admin"), async (req, res) => {
  const item = db.cases.find((c) => c.id === req.params.id);
  if (!item || !canAccessCase(req.user, item, db.users)) {
    return res.status(404).json({ error: "Case not found" });
  }
  if (!isReviewPending(item)) {
    return res.status(409).json({ error: "Only cases awaiting review can be returned for correction" });
  }
  const feedback = typeof req.body?.feedback === "string" ? req.body.feedback.trim() : "";
  if (!feedback) return res.status(400).json({ error: "Provide feedback for the requested correction" });
  const timestamp = now();
  item.status = "Needs Revision";
  item.lastReview = {
    action: "Returned for Correction",
    actorId: req.user.id,
    actorName: req.user.name,
    signature: req.user.name,
    timestamp,
    feedback: feedback.slice(0, 2000),
  };
  item.reviewHistory = [...(item.reviewHistory || []), item.lastReview];
  audit(req, {
    action: "Return for Correction",
    caseId: item.id,
    document: "—",
    signature: req.user.name,
    reviewTimestamp: timestamp,
    note: feedback.slice(0, 2000),
  });
    notifyCaseUsers(
    item,
    [item.assignedTo],
    "Case Returned for Correction",
    `Case ${item.id} was returned for correction. Feedback: ${feedback.slice(0, 500)}`,
    req.user.id
  );
  await persist();
  res.json({ case: enrichCase(item, db) });
});

app.get("/api/documents", auth, requirePerm("docs.view"), (req, res) => {
  const { q = "", caseId = "", type = "" } = req.query;

  // Build a Set for faster case access checks
  const visibleCaseIds = new Set(
    db.cases
      .filter((c) => canAccessCase(req.user, c, db.users))
      .map((c) => c.id)
  );

  // Build a Map for faster uploader lookup
  const uploaderMap = new Map(
    db.users.map((user) => [user.id, user.name])
  );

  // Retrieve and enrich visible documents
  let rows = db.documents
    .filter((doc) => visibleCaseIds.has(doc.caseId))
    .map((doc) => {
      const uploaderName = uploaderMap.get(doc.uploadedBy);

      return {
        ...doc,
        uploadedByName: uploaderName || "Unknown",
        uploadedOnLabel: prettyDate(doc.uploadedOn).split(",")[0],
        currentVersion: doc.versions?.[doc.versions.length - 1] || null,
      };
    });

  // Search documents
  if (q) {
    const search = String(q).toLowerCase();

    rows = rows.filter((doc) =>
      `${doc.name} ${doc.title || ""} ${doc.caseId}`
        .toLowerCase()
        .includes(search)
    );
  }

  // Apply filters
  if (caseId) {
    rows = rows.filter((doc) => doc.caseId === caseId);
  }

  if (type) {
    rows = rows.filter((doc) => doc.type === type);
  }

  res.json({ documents: rows });
});

app.get("/api/documents/:id", auth, requirePerm("docs.view"), async (req, res) => {
  const doc = db.documents.find((d) => d.id === req.params.id);
  const linked = doc && db.cases.find((c) => c.id === doc.caseId);
  if (!doc || !canAccessCase(req.user, linked, db.users)) return res.status(404).json({ error: "Document not found" });
  const version = doc.versions?.[doc.versions.length - 1];
  await recordCustodyEvent(req, { doc, action: "View", sha256: version?.sha256 });
  audit(req, { action: "View", caseId: doc.caseId, document: doc.name });
  res.json({
    document: {
  ...enrichDoc(doc, db),
  caseStatus: linked.status,
  custodyEvents: custodyForDocuments([doc.id]),
},
  });
});

app.get("/api/documents/:id/custody-recipients", auth, requirePerm("docs.upload"), (req, res) => {
  const doc = db.documents.find((item) => item.id === req.params.id);
  const linked = doc && db.cases.find((item) => item.id === doc.caseId);
  if (!doc || !canAccessCase(req.user, linked, db.users)) return res.status(404).json({ error: "Document not found" });
  const users = db.users
    .filter((user) => user.status === "Active" && canAccessCase(publicUser(user, db.roleMatrix), linked, db.users))
    .map(({ id, name, role }) => ({ id, name, role }));
  res.json({ users });
});

app.post("/api/documents/:id/custody-transfer", auth, requirePerm("docs.upload"), async (req, res) => {
  const doc = db.documents.find((item) => item.id === req.params.id);
  const linked = doc && db.cases.find((item) => item.id === doc.caseId);
  if (!doc || !canAccessCase(req.user, linked, db.users)) return res.status(404).json({ error: "Document not found" });
  const recipient = db.users.find((user) => user.id === req.body?.recipientId && user.status === "Active");
  if (!recipient || !canAccessCase(publicUser(recipient, db.roleMatrix), linked, db.users)) {
    return res.status(400).json({ error: "Choose an active user authorized for this case" });
  }
  const previousCustodian = db.users.find((user) => user.id === doc.currentCustodianId) || db.users.find((user) => user.id === doc.uploadedBy);
  const version = doc.versions?.[doc.versions.length - 1];
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
  doc.currentCustodianId = recipient.id;
  doc.custodyTransferredAt = now();
  await recordCustodyEvent(req, {
    doc,
    action: "Custody Transfer",
    sha256: version?.sha256,
    note: `Transferred custody from ${previousCustodian?.name || "Unknown"} to ${recipient.name}${note ? `: ${note}` : ""}`,
  });
  audit(req, {
    action: "Custody Transfer",
    caseId: doc.caseId,
    document: doc.name,
    note: `Transferred custody to ${recipient.name}`,
  });
  res.json({
    document: {
      ...enrichDoc(doc, db),
      custodyEvents: custodyForDocuments([doc.id]),
    },
  });
});

app.post(
  "/api/documents",
  auth,
  requirePerm("docs.upload"),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Choose a file to upload" });
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return res.status(400).json({ error: "Unsupported file type. Use PDF, DOC, DOCX, JPG, PNG, WEBM, WAV or TXT." });
    }
    const caseItem = db.cases.find((c) => c.id === req.body.caseId);
    if (!caseItem || !canAccessCase(req.user, caseItem, db.users)) {
      return res.status(400).json({ error: "Select a case you are authorized to access" });
    }
    if (["Completed", "Closed"].includes(caseItem.status)) {
  return res.status(403).json({
    error: "Cannot upload documents to a completed or closed case",
  });
}
    const captureSource = req.body.captureSource || "";
    if (!["", "camera", "audio", "transcript"].includes(captureSource)) {
      return res.status(400).json({ error: "Invalid evidence capture source" });
    }
    if (!captureSource && [".webm", ".wav", ".txt"].includes(ext)) {
      return res.status(400).json({ error: "Audio recordings and transcript derivatives must be submitted through their evidence workflows" });
    }
    if (captureSource === "camera" && ![".jpg", ".jpeg", ".png"].includes(ext)) {
      return res.status(400).json({ error: "Camera evidence must be an image file" });
    }
    if (captureSource === "audio" && ![".webm", ".wav"].includes(ext)) {
      return res.status(400).json({ error: "Audio evidence must be a WEBM or WAV file" });
    }
    let derivativeSource = null;
    if (captureSource === "transcript") {
      if (ext !== ".txt" || !req.body.derivativeOf) {
        return res.status(400).json({ error: "A transcript derivative must be a TXT file linked to an original audio document" });
      }
      derivativeSource = db.documents.find((item) => item.id === req.body.derivativeOf);
      const sourceVersion = derivativeSource?.versions?.[derivativeSource.versions.length - 1];
      const sourceExtension = path.extname(sourceVersion?.originalName || derivativeSource?.name || "").toLowerCase();
      if (
        !derivativeSource ||
        derivativeSource.caseId !== caseItem.id ||
        derivativeSource.isDerivative ||
        ![".webm", ".wav"].includes(sourceExtension)
      ) {
        return res.status(400).json({ error: "Transcript must be linked to an original audio recording in this case" });
      }
    } else if (req.body.derivativeOf) {
      return res.status(400).json({ error: "Only transcript documents can reference a derivative source" });
    }
    const sha256 = hashBuffer(file.buffer);
    const id = `d${Date.now()}-${crypto.randomUUID()}`;
    const stored = await storeMinioFile(
      caseItem.id,
      id,
      1,
      file.originalname,
      file.buffer,
      file.mimetype
    );

    const custodyAction = captureSource === "camera"
      ? "Camera Evidence Capture"
      : captureSource === "audio"
        ? "Audio Evidence Recording"
        : captureSource === "transcript"
          ? "Transcript Derivative"
          : "Upload";
    const doc = {
      id,
      name: file.originalname,
      title: req.body.title || file.originalname,
      description: req.body.description || "",
      type: req.body.type || "Investigation Report",
      caseId: caseItem.id,
      uploadedBy: req.user.id,
      uploadedOn: now(),
      originalSha256: sha256,
      ...(captureSource ? { captureSource } : {}),
      ...(["camera", "audio", "transcript"].includes(captureSource) || req.body.type === "Digital Evidence"
        ? { evidenceStatus: "Draft" }
        : {}),
      ...(captureSource === "transcript" ? { isDerivative: true, derivativeOf: derivativeSource.id } : {}),
      ...(captureSource === "audio" ? { derivativeDocumentIds: [] } : {}),
      currentCustodianId: req.user.id,
      size: `${(stored.size / 1024).toFixed(0)} KB`,
      encrypted: true,
      versions: [
  {
    version: "v1",
    originalName: file.originalname,
    uploadedBy: req.user.id,
    uploadedByName: req.user.name,
    date: now(),
    size: `${(stored.size / 1024).toFixed(0)} KB`,
    sha256,
    storageBackend: "minio",
    objectKey: stored.objectKey,
  },
],
    };
    db.documents.unshift(doc);
    if (derivativeSource) {
      derivativeSource.derivativeDocumentIds = derivativeSource.derivativeDocumentIds || [];
      derivativeSource.derivativeDocumentIds.push(doc.id);
      await recordCustodyEvent(req, {
        doc: derivativeSource,
        action: "Transcript Derivative",
        sha256,
        note: `Derivative document ${doc.id} created; original audio ${derivativeSource.id} was not changed`,
      });
    }
    await recordCustodyEvent(req, {
      doc,
      action: custodyAction,
      sha256,
      note: captureSource === "transcript" ? `Derivative of original audio ${derivativeSource.id}` : "",
    });
    audit(req, { action: custodyAction, caseId: doc.caseId, document: doc.name });
    // Notify relevant case members when an Investigating Officer uploads a document.
    if (req.user.role === "Investigating Officer") {
      const recipientIds = [
        ...new Set([
          caseItem.createdBy,
          caseItem.assignedTo,
        ].filter(Boolean)),
      ].filter((userId) => userId !== req.user.id);

      recipientIds.forEach((userId) => {
        db.notifications.unshift({
          id: `n${crypto.randomUUID()}`,
          userId,
          title: "New Document Uploaded",
          body: `A new document "${doc.title || doc.name}" has been uploaded to Case ${caseItem.id}.`,
          caseId: caseItem.id,
          createdAt: now(),
          read: false,
        });
      });
    }
    persist();
    res.status(201).json({ document: enrichDoc(doc, db) });
  }
);

app.delete("/api/documents/:id", auth, async (req, res) => {
  if (!["Investigating Officer", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Only the assigned Investigating Officer or an Administrator can discard draft evidence" });
  }
  const documentIndex = db.documents.findIndex((item) => item.id === req.params.id);
  const doc = documentIndex >= 0 ? db.documents[documentIndex] : null;
  const linked = doc && db.cases.find((item) => item.id === doc.caseId);
  if (!doc || !linked) return res.status(404).json({ error: "Evidence document not found" });
  if (["Completed", "Closed"].includes(linked.status)) {
      return res.status(409).json({
        error: "Documents belonging to completed cases cannot be deleted",
      });
    }
  if (req.user.role === "Investigating Officer" && linked.assignedTo !== req.user.id) {
    return res.status(403).json({ error: "You can only discard evidence from cases assigned to you" });
  }
  if (!canAccessCase(req.user, linked, db.users)) {
    return res.status(403).json({ error: "You are not authorized to access this case" });
  }
  const isEvidence = ["camera", "audio", "transcript"].includes(doc.captureSource) ||
    doc.isDerivative || doc.type === "Digital Evidence";
  if (!isEvidence) return res.status(403).json({ error: "Only evidence documents can be discarded here" });
  if (linked.status !== "Active" && doc.evidenceStatus !== "Draft") {
    return res.status(409).json({ error: "Only evidence in an active case or a pending draft can be discarded" });
  }
  if (doc.captureSource === "audio" && (doc.derivativeDocumentIds || []).some((id) =>
    db.documents.some((item) => item.id === id)
  )) {
    return res.status(409).json({ error: "Discard linked transcript derivatives before discarding the original audio" });
  }

  const storageRoot = path.resolve(STORAGE_DIR);
  const documentDirectory = path.resolve(storageRoot, doc.id);
  if (path.dirname(documentDirectory) !== storageRoot) {
    return res.status(400).json({ error: "Invalid evidence storage location" });
  }
  const stagedDirectory = path.join(storageRoot, `.discard-${crypto.randomUUID()}`);
  const minioPrefix = `cases/${doc.caseId}/documents/${doc.id}/`;
  const minioVersions = (doc.versions || []).filter(
      (item) => item.storageBackend === "minio"
    );

    if (
      minioVersions.some(
        (item) =>
          !item.objectKey ||
          !item.objectKey.startsWith(minioPrefix)
      )
    ) {
      return res.status(409).json({
        error: "Invalid MinIO storage metadata. Contact an Administrator.",
      });
    }

    const minioObjectKeys = [
      ...new Set(minioVersions.map((item) => item.objectKey)),
  ];
  const version = doc.versions?.[doc.versions.length - 1];
  const derivativeSource = doc.isDerivative && doc.derivativeOf
    ? db.documents.find((item) => item.id === doc.derivativeOf)
    : null;
  const previousDerivativeIds = derivativeSource?.derivativeDocumentIds
    ? [...derivativeSource.derivativeDocumentIds]
    : null;
  const event = Object.freeze({
    id: `custody-${crypto.randomUUID()}`,
    documentId: doc.id,
    document: doc.name,
    caseId: doc.caseId,
    handlerId: req.user.id,
    handlerName: req.user.name,
    role: req.user.role,
    timestamp: now(),
    action: "Draft Evidence Discarded",
    ipAddress: String(req.ipAddress || "127.0.0.1").split(",")[0].trim(),
    sha256: version?.sha256 || doc.originalSha256 || "",
    note: "Draft evidence file and record discarded at the request of an authorized user",
  });
  let directoryStaged = false;
  let documentRemoved = false;
  let eventAdded = false;
  try {
    if (fs.existsSync(documentDirectory)) {
      fs.renameSync(documentDirectory, stagedDirectory);
      directoryStaged = true;
    }
    db.documents.splice(documentIndex, 1);
    documentRemoved = true;
    if (derivativeSource) {
      derivativeSource.derivativeDocumentIds = (derivativeSource.derivativeDocumentIds || []).filter((id) => id !== doc.id);
    }
    db.custodyEvents = db.custodyEvents || [];
    db.custodyEvents.push(event);
    eventAdded = true;
    await persist();
  } catch (error) {
    if (documentRemoved) db.documents.splice(documentIndex, 0, doc);
    if (eventAdded) db.custodyEvents = (db.custodyEvents || []).filter((item) => item.id !== event.id);
    if (derivativeSource && previousDerivativeIds) derivativeSource.derivativeDocumentIds = previousDerivativeIds;
    if (directoryStaged) fs.renameSync(stagedDirectory, documentDirectory);
    console.error("Failed to discard draft evidence:", error);
    return res.status(500).json({ error: "Evidence could not be discarded. No record was removed." });
  }
    // Delete MinIO objects only after the database update succeeds.
  const minioCleanupResults = await Promise.allSettled(
    minioObjectKeys.map((key) => deleteFromMinio(key))
  );

  const failedMinioCleanup = minioCleanupResults.some(
    (result) => result.status === "rejected"
  );

  if (failedMinioCleanup) {
    console.error(
      "Evidence record was discarded, but some MinIO objects could not be deleted:",
      minioCleanupResults.filter((result) => result.status === "rejected")
    );
  }
  if (directoryStaged) {
    try {
      fs.rmSync(stagedDirectory, { recursive: true, force: false });
    } catch (error) {
      console.error("Evidence record was discarded but staged file cleanup failed:", error);
      return res.status(500).json({ error: "Evidence was removed from the case, but its stored file could not be fully cleaned up. Contact an Administrator." });
    }
  }
  audit(req, { action: "Draft Evidence Discarded", caseId: doc.caseId, document: doc.name });
  res.json({
  success: true,
  documentId: doc.id,
  storageCleanupPending: failedMinioCleanup,
});
});

app.post(
  "/api/documents/:id/versions",
  auth,
  requirePerm("docs.upload"),
  upload.single("file"),
  async (req, res) => {
    const doc = db.documents.find((d) => d.id === req.params.id);
    const linked = doc && db.cases.find((c) => c.id === doc.caseId);
    if (!doc || !canAccessCase(req.user, linked, db.users)) return res.status(404).json({ error: "Document not found" });
    if (["Completed", "Closed"].includes(linked.status)) {
      return res.status(409).json({
        error: "Cannot upload a new version to a completed case",
      });
    }
    if (doc.captureSource === "audio") {
      return res.status(403).json({ error: "Original audio evidence is immutable; upload a separate derivative document instead" });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a replacement file" });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return res.status(400).json({ error: "Unsupported file type. Use PDF, DOC, DOCX, JPG, PNG, WEBM, WAV or TXT." });
    }
    if ([".webm", ".wav"].includes(ext)) {
      return res.status(400).json({ error: "Audio recordings must be created through the protected audio evidence workflow" });
    }
    const n = doc.versions.length + 1;
    const sha256 = hashBuffer(req.file.buffer);
    const stored = await storeMinioFile(
      doc.caseId,
      doc.id,
      n,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );

    doc.versions.push({
      version: `v${n}`,
      originalName: req.file.originalname,
      uploadedBy: req.user.id,
      uploadedByName: req.user.name,
      date: now(),
      size: `${(stored.size / 1024).toFixed(0)} KB`,
      sha256,
      storageBackend: "minio",
      objectKey: stored.objectKey,
   });
   
    doc.name = req.file.originalname;
    doc.size = `${(stored.size / 1024).toFixed(0)} KB`;
    await recordCustodyEvent(req, { doc, action: "Version Update", sha256 });

        audit(req, {
          action: "Update",
          caseId: doc.caseId,
          document: doc.name,
        });

        // Notify the assigned Supervisor when an Officer uploads a new version.
        if (req.user.role === "Investigating Officer") {
          const supervisorId = getAssignedSupervisorId(linked);

          if (supervisorId) {
            db.notifications.unshift({
              id: `n${crypto.randomUUID()}`,
              userId: supervisorId,
              title: "New Document Version Uploaded",
              body: `A new version (${`v${n}`}) of "${doc.title || doc.name}" has been uploaded to Case ${linked.id}.`,
              caseId: linked.id,
              createdAt: now(),
              read: false,
            });
          }
        }

        persist();
        res.json({ document: enrichDoc(doc, db) });
  }
);

app.get("/api/documents/:id/file", auth, requirePerm("docs.view"), async (req, res) => {
  const doc = db.documents.find((d) => d.id === req.params.id);
  const linked = doc && db.cases.find((c) => c.id === doc.caseId);

  if (!doc || !canAccessCase(req.user, linked, db.users)) {
    return res.status(404).json({ error: "Document not found" });
  }

  const version = req.query.v
    ? doc.versions.find((v) => v.version === req.query.v)
    : doc.versions[doc.versions.length - 1];

  if (!version) {
    return res.status(404).json({ error: "Version not found" });
  }

  if (req.query.download === "1") {
    if (!can(req.user, "docs.download")) {
      return res.status(403).json({
        error: "Download is not permitted for your role",
      });
    }

    await recordCustodyEvent(req, {
      doc,
      action: "Download",
      sha256: version.sha256,
    });

    audit(req, {
      action: "Download",
      caseId: doc.caseId,
      document: doc.name,
    });

    res.attachment(version.originalName || doc.name);
  } else {
    await recordCustodyEvent(req, {
      doc,
      action: "View",
      sha256: version.sha256,
    });

    res.type(path.extname(version.originalName || doc.name));
  }

  try {
    const buffer = await readStoredDocument(doc, version);
    return res.send(buffer);
  } catch (error) {
    console.error("Document retrieval failed:", error);

    if (!res.headersSent) {
      return res.status(404).json({
        error: "Stored document could not be retrieved",
      });
    }
  }
});

app.post("/api/documents/:id/verify", auth, requirePerm("integrity.verify"), async (req, res) => {
  const doc = db.documents.find((d) => d.id === req.params.id);
  const linked = doc && db.cases.find((c) => c.id === doc.caseId);
  if (!doc || !canAccessCase(req.user, linked, db.users)) return res.status(404).json({ error: "Document not found" });
  const version = req.body?.version
    ? doc.versions.find((v) => v.version === req.body.version)
    : doc.versions[doc.versions.length - 1];
  if (!version) return res.status(404).json({ error: "Document version not found" });
  let buffer;

try {
  buffer = await readStoredDocument(doc, version);
} catch (error) {
  console.error("Integrity verification file retrieval failed:", error);

  return res.status(404).json({
    error: "Stored file could not be retrieved for verification",
  });
}

const calculated = hashBuffer(buffer);
  const match = calculated === version.sha256;
  const result = {
    documentId: doc.id,
    version: version.version,
    recorded: version.sha256,
    calculated,
    match,
    verifiedAt: now(),
    note: match
      ? "Current file matches the SHA-256 recorded at upload. This supports integrity checking; it does not independently prove original authorship."
      : "Mismatch detected. The stored file differs from the recorded hash and should be reviewed.",
  };
  doc.lastVerification = result;
  db.verifications = db.verifications || [];
  db.verifications.unshift({
    id: `vfy${Date.now()}`,
    userId: req.user.id,
    user: req.user.name,
    ...result,
    caseId: doc.caseId,
    document: doc.name,
  });
  await recordCustodyEvent(req, {
    doc,
    action: "Verification Check",
    sha256: calculated,
    note: match ? "INTEGRITY MATCH" : "HASH MISMATCH",
  });
    audit(req, {
    action: "Integrity Check",
    caseId: doc.caseId,
    document: doc.name,
    status: match ? "Success" : "Failure",
  });

  // Notify the assigned Supervisor when document integrity verification fails.
  if (!match) {
    const uploader = db.users.find(
      (user) => user.id === doc.uploadedBy
    );

    if (uploader?.role === "Investigating Officer" && uploader.supervisorId) {
      const supervisor = db.users.find(
        (user) =>
          user.id === uploader.supervisorId &&
          user.role === "Supervisor" &&
          user.status === "Active"
      );

      if (supervisor) {
        db.notifications.unshift({
          id: `n${crypto.randomUUID()}`,
          userId: supervisor.id,
          title: "Document Integrity Failure",
          body: `SHA-256 integrity verification failed for "${doc.title || doc.name}" (Version ${version.version}) in Case ${doc.caseId}. Please review the document.`,
          caseId: doc.caseId,
          createdAt: now(),
          read: false,
        });
      }
    }
  }

  persist();
  res.json(result);
});

app.post(
  "/api/integrity/compare",
  auth,
  requirePerm("integrity.verify"),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Choose a local file to verify" });
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return res.status(400).json({ error: "Unsupported file type. Use PDF, DOC, DOCX, JPG or PNG." });
    }
    const calculated = hashBuffer(file.buffer);
    const visibleCaseIds = new Set(
      db.cases.filter((item) => canAccessCase(req.user, item, db.users)).map((item) => item.id)
    );
    const matches = db.documents
      .filter((doc) => visibleCaseIds.has(doc.caseId))
      .flatMap((doc) => (doc.versions || [])
        .filter((version) => version.sha256 === calculated)
        .map((version) => ({ doc, version })));
    const timestamp = now();
    const result = {
      match: matches.length > 0,
      calculated,
      checkedAt: timestamp,
      fileName: path.basename(file.originalname),
      matches: matches.map(({ doc, version }) => ({
        documentId: doc.id,
        document: doc.name,
        caseId: doc.caseId,
        version: version.version,
        recorded: version.sha256,
      })),
      note: matches.length
        ? "VERIFIED / INTEGRITY MATCH: local file matches a registered document version."
        : "ALERT: TAMPERING DETECTED / HASH MISMATCH: local file did not match any registered document version in your authorized cases.",
    };
    for (const { doc } of matches) {
      await recordCustodyEvent(req, {
        doc,
        action: "Verification Check",
        sha256: calculated,
        note: `Local comparison: ${file.originalname} matched a registered version`,
      });
    }
    if (!matches.length) {
      db.custodyEvents = db.custodyEvents || [];
      db.custodyEvents.push(Object.freeze({
        id: `custody-${crypto.randomUUID()}`,
        documentId: null,
        document: path.basename(file.originalname),
        caseId: null,
        handlerId: req.user.id,
        handlerName: req.user.name,
        role: req.user.role,
        timestamp,
        action: "Verification Check",
        ipAddress: String(req.ipAddress || "127.0.0.1").split(",")[0].trim(),
        sha256: calculated,
        note: "Local comparison did not match a registered document version",
      }));
      await persist();
    }
    db.verifications = db.verifications || [];
    db.verifications.unshift({
      id: `vfy${Date.now()}`,
      userId: req.user.id,
      user: req.user.name,
      document: path.basename(file.originalname),
      calculated,
      match: result.match,
      verifiedAt: timestamp,
      matches: result.matches,
    });
    audit(req, {
      action: "Integrity Check",
      caseId: matches[0]?.doc.caseId || "—",
      document: path.basename(file.originalname),
      status: result.match ? "Success" : "Failure",
      note: result.note,
    });
    await persist();
    res.json(result);
  }
);

app.get("/api/verifications", auth, requirePerm("integrity.verify"), (req, res) => {
  const visibleCases = db.cases.filter((c) => canAccessCase(req.user, c, db.users)).map((c) => c.id);
  const rows = (db.verifications || [])
    .filter((v) => visibleCases.includes(v.caseId))
    .slice(0, 25)
    .map((v) => ({ ...v, verifiedAtLabel: prettyDate(v.verifiedAt) }));
  res.json({ verifications: rows });
});

app.get("/api/audit", auth, requirePerm("audit.view"), (req, res) => {
  const ownOnly = req.user.role !== "Admin";
  const visibleCaseIds = new Set(
    db.cases.filter((item) => canAccessCase(req.user, item, db.users)).map((item) => item.id)
  );
  let rows = db.audits.filter(
    (entry) =>
      !ownOnly ||
      entry.userId === req.user.id ||
      (entry.caseId && visibleCaseIds.has(entry.caseId))
  );
  const { q = "", action = "", from = "", to = "" } = req.query;
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter((a) => `${a.user} ${a.document} ${a.caseId}`.toLowerCase().includes(s));
  }
  if (action) rows = rows.filter((a) => a.action === action);
  if (from) rows = rows.filter((a) => a.timestamp >= from);
  if (to) rows = rows.filter((a) => a.timestamp <= to);
  res.json({
    audits: rows.map((a) => ({ ...a, timestampLabel: prettyDate(a.timestamp) })),
    limited: ownOnly,
  });
});

app.get(
  "/api/reports/:caseId",
  auth,
  requireAnyPerm("reports.view", "reports.generate"),
  (req, res) => {
    const item = db.cases.find((c) => c.id === req.params.caseId);

    if (!item || !canAccessCase(req.user, item, db.users)) {
      return res.status(404).json({ error: "Case not found" });
    }
    const reportType = req.query.type || "Complete Report";

if (reportType === "Complete Report") {
  const status = String(item.status || "").toLowerCase();

  if (!["complete", "completed", "closed"].includes(status)) {
    return res.status(403).json({
      error: "Complete Report is available only for Completed or Closed cases.",
    });
  }
}

    // Report generation is read-only.
    // Completed and Closed cases can also have reports generated.

    const include = {
      caseDetails: req.query.caseDetails !== "0",
      documentsList: req.query.documentsList !== "0",
      versionHistory: req.query.versionHistory !== "0",
      auditTrail: req.query.auditTrail !== "0",
    };

    const matchesDateRange = (timestamp) => {
      if (!timestamp) return false;

      const date = new Date(timestamp);

      if (Number.isNaN(date.getTime())) return false;

      if (req.query.from) {
        const from = new Date(req.query.from);
        if (!Number.isNaN(from.getTime()) && date < from) return false;
      }

      if (req.query.to) {
        const to = new Date(req.query.to);
        if (!Number.isNaN(to.getTime()) && date > to) return false;
      }

      return true;
    };

    // Case documents
    let docs = db.documents
      .filter((d) => d.caseId === item.id)
      .map((d) => enrichDoc(d, db));

    // Existing audit history
    let logs = db.audits.filter((a) => a.caseId === item.id);

    // Preserve existing date filters
    if (req.query.from) {
      docs = docs.filter((d) => matchesDateRange(d.uploadedOn));
      logs = logs.filter((a) => matchesDateRange(a.timestamp));
    }

    if (req.query.to) {
      docs = docs.filter((d) => matchesDateRange(d.uploadedOn));
      logs = logs.filter((a) => matchesDateRange(a.timestamp));
    }

    const documentIds = new Set(
      db.documents
        .filter((d) => d.caseId === item.id)
        .map((d) => d.id)
    );

    // Integrity verification history
    const verifications = (db.verifications || [])
      .filter((v) => v.caseId === item.id)
      .filter((v) => {
        if (!req.query.from && !req.query.to) return true;
        return matchesDateRange(v.verifiedAt);
      });

    // Digital evidence chain of custody
    const custodyEvents = (db.custodyEvents || [])
      .filter(
        (event) =>
          event.caseId === item.id ||
          documentIds.has(event.documentId)
      )
      .filter((event) => {
        if (!req.query.from && !req.query.to) return true;
        return matchesDateRange(event.timestamp);
      })
      .slice()
      .reverse();

    // Complete supervisor review history
    const reviewHistory = (item.reviewHistory || []).map((review) => ({
      ...review,
    }));

    // Assigned investigating officer and supervisor
    const assignedOfficer = db.users.find(
      (u) => u.id === item.assignedTo
    );

    const assignedSupervisor = assignedOfficer?.supervisorId
      ? db.users.find(
          (u) =>
            u.id === assignedOfficer.supervisorId &&
            u.role === "Supervisor"
        )
      : null;

    // Record report generation in the audit trail
    audit(req, {
      action: can(req.user, "reports.generate")
        ? "Generate Report"
        : "View Report",
      caseId: item.id,
      document: "Investigation Report",
    });

    res.json({
      generatedAt: prettyDate(),
      generatedAtISO: now(),

      type: req.query.type || "Complete Case File",

      preparedBy: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
      },

      case: enrichCase(item, db),

      assignedOfficer: assignedOfficer
        ? {
            id: assignedOfficer.id,
            name: assignedOfficer.name,
            role: assignedOfficer.role,
          }
        : null,

      assignedSupervisor: assignedSupervisor
        ? {
            id: assignedSupervisor.id,
            name: assignedSupervisor.name,
            role: assignedSupervisor.role,
          }
        : null,

      include,

      documents: include.documentsList ? docs : [],

      versions: include.versionHistory
        ? docs.flatMap((d) =>
            (d.versions || []).map((v) => ({
              ...v,
              file: d.name,
              documentId: d.id,
            }))
          )
        : [],

      audit: include.auditTrail
        ? logs.map((a) => ({
            ...a,
            timestampLabel: prettyDate(a.timestamp),
          }))
        : [],

      verifications,

      custodyEvents,

      reviewHistory,

      lastReview: item.lastReview || null,
    });
  }
);

app.get("/api/users", auth, requirePerm("admin.users"), (_req, res) => {
  res.json({
    users: db.users
      .filter((u) => u.status !== "Archived")
      .map((u) => publicUser(u, db.roleMatrix)),
  });
});

app.patch("/api/profile/avatar", auth, avatarUpload.single("avatar"), async (req, res, next) => {
  const user = db.users.find((item) => item.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User profile not found" });
  const previousAvatar = user.avatar;
  let nextAvatar = "";
  if (req.file) {
    try {
      const imageBytes = await fs.promises.readFile(req.file.path);
      const isPng = imageBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpeg = imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff;
      if ((req.file.mimetype === "image/png" && !isPng) || (req.file.mimetype === "image/jpeg" && !isJpeg)) {
        await fs.promises.unlink(req.file.path);
        return res.status(400).json({ error: "Upload a valid JPEG or PNG profile image" });
      }
      nextAvatar = `/api/uploads/avatars/${req.file.filename}`;
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch((cleanupError) => {
        if (cleanupError.code !== "ENOENT") console.error("Failed to clean up invalid avatar upload", cleanupError);
      });
      return next(error);
    }
  } else if (req.body?.avatar !== null && req.body?.avatar !== "") {
    return res.status(400).json({ error: "Choose a profile picture to upload" });
  }

  if (nextAvatar) user.avatar = nextAvatar;
  else delete user.avatar;
  try {
    await persist();
  } catch (error) {
    if (req.file) {
      user.avatar = previousAvatar;
      await fs.promises.unlink(req.file.path).catch((cleanupError) => {
        if (cleanupError.code !== "ENOENT") console.error("Failed to clean up unsaved avatar upload", cleanupError);
      });
    }
    return next(error);
  }

  if (previousAvatar && previousAvatar !== nextAvatar) {
    const storedAvatar = previousAvatar.match(/^\/api\/uploads\/avatars\/([A-Za-z0-9-]+\.(?:png|jpg))$/);
    if (storedAvatar) {
      await fs.promises.unlink(path.join(AVATAR_DIR, storedAvatar[1])).catch((error) => {
        if (error.code !== "ENOENT") console.error("Failed to remove previous profile picture", error);
      });
    }
  }
  return res.status(200).json({ user: publicUser(user, db.roleMatrix) });
});

app.post("/api/feedback", auth, async (req, res) => {
  const categories = ["Suggestion", "Bug/Issue", "Software Improvement"];
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!categories.includes(category)) return res.status(400).json({ error: "Choose a valid feedback category" });
  if (!subject || subject.length > 120) return res.status(400).json({ error: "Subject is required and must be 120 characters or fewer" });
  if (!description || description.length > 5000) return res.status(400).json({ error: "Description is required and must be 5,000 characters or fewer" });
  const entry = {
    id: `feedback-${crypto.randomUUID()}`,
    userId: req.user.id,
    senderName: req.user.name,
    role: req.user.role,
    category,
    subject,
    description,
    timestamp: now(),
    status: "New",
  };
  db.feedback.unshift(entry);
  await persist();
  res.status(201).json({ feedback: entry });
});

app.get("/api/feedback", auth, requireRole("Admin"), (_req, res) => {
  res.json({ feedback: db.feedback || [] });
});

app.get("/api/officers", auth, (req, res) => {
  if (!can(req.user, "cases.create") && !can(req.user, "cases.edit")) {
    return res.status(403).json({ error: "You do not have permission to view officer assignments" });
  }
  res.json({
    users: db.users
      .filter((u) => u.status === "Active" && u.role === "Investigating Officer")
      .map(({ id, name, role }) => ({ id, name, role })),
  });
});

app.get("/api/reviewers", auth, requireRole("Admin"), (req, res) => {
  res.json({
    users: db.users
      .filter(
        (u) =>
          u.status === "Active" &&
          u.role === "Read-only Reviewer"
      )
      .map(({ id, name, email, role, status }) => ({
        id,
        name,
        email,
        role,
        status,
      })),
  });
});

app.post("/api/users", auth, requirePerm("admin.users"), async (req, res) => {
  const { name, email, username, role, password, supervisorId } = req.body || {};

  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanUsername = typeof username === "string" ? username.trim().toLowerCase() : "";

  const selectedRole = ROLES.includes(role) ? role : "Read-only Reviewer";

  if (!cleanName || !cleanEmail || !cleanUsername || typeof password !== "string") {
    return res.status(400).json({ error: "Name, email, username and password are required" });
  }

  if (cleanName.length > 100 || cleanEmail.length > 254 || cleanUsername.length > 40) {
    return res.status(400).json({ error: "One or more fields exceed the maximum length" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  if (!/^[a-z0-9._-]+$/.test(cleanUsername)) {
    return res.status(400).json({
      error: "Username may contain letters, numbers, dots, hyphens and underscores"
    });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  if (db.users.some((u) => u.email.toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanUsername)) {
    return res.status(409).json({ error: "Email or username already exists" });
  }

  let assignedSupervisorId = null;

  if (selectedRole === "Investigating Officer") {
    const supervisor = db.users.find(
      (u) =>
        u.id === supervisorId &&
        u.role === "Supervisor" &&
        u.status === "Active"
    );

    if (!supervisor) {
      return res.status(400).json({
        error: "Please select an active Supervisor for this Investigating Officer"
      });
    }

    assignedSupervisorId = supervisor.id;
  }

  const user = {
    id: `u${Date.now()}`,
    name: cleanName,
    email: cleanEmail,
    username: cleanUsername,
    role: selectedRole,
    supervisorId: assignedSupervisorId,
    status: "Active",
    initials: cleanName
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    passwordHash: await bcrypt.hash(password, 10),
  };

  db.users.push(user);
  await persist();

  res.status(201).json({ user: publicUser(user, db.roleMatrix) });
});

app.patch("/api/users/:id", auth, requirePerm("admin.users"), async (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const nextRole = ROLES.includes(req.body.role)
    ? req.body.role
    : user.role;

  const nextSupervisorId = Object.prototype.hasOwnProperty.call(req.body, "supervisorId")
    ? req.body.supervisorId
    : user.supervisorId;

  if (nextRole === "Investigating Officer") {
    const supervisor = db.users.find(
      (u) =>
        u.id === nextSupervisorId &&
        u.role === "Supervisor" &&
        u.status === "Active"
    );

    if (!supervisor) {
      return res.status(400).json({
        error: "Please assign an active Supervisor to this Investigating Officer"
      });
    }

    user.supervisorId = supervisor.id;
  } else {
    user.supervisorId = null;
  }

  if (req.body.role && ROLES.includes(req.body.role)) {
    user.role = nextRole;
  }

  if (req.body.status) user.status = req.body.status;
  if (req.body.name) user.name = req.body.name;

  await persist();

  res.json({ user: publicUser(user, db.roleMatrix) });
});
// Archive user account
app.delete("/api/users/:id", auth, requireRole("Admin"), async (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id);

  if (!user || user.status === "Archived") {
    return res.status(404).json({ error: "User not found" });
  }

  // Prevent self-deletion
  if (user.id === req.user.id) {
    return res.status(400).json({
      error: "You cannot delete your own account",
    });
  }

  // Prevent deletion of the last active Admin
  if (user.role === "Admin" && user.status === "Active") {
    const activeAdmins = db.users.filter(
      (u) => u.role === "Admin" && u.status === "Active"
    );

    if (activeAdmins.length <= 1) {
      return res.status(400).json({
        error: "The last active Admin cannot be deleted",
      });
    }
  }

  // Prevent deletion of a Supervisor with active assigned officers
  if (user.role === "Supervisor") {
    const assignedOfficers = db.users.filter(
      (u) =>
        u.role === "Investigating Officer" &&
        u.status === "Active" &&
        u.supervisorId === user.id
    );

    if (assignedOfficers.length > 0) {
      return res.status(400).json({
        error: "Reassign this Supervisor's Investigating Officers before deleting the account",
      });
    }
  }

  // Prevent deletion of an officer assigned to an active case
  const activeCases = db.cases.filter(
    (c) => c.assignedTo === user.id && c.status === "Active"
  );

  if (activeCases.length > 0) {
    return res.status(400).json({
      error: "Reassign this user's active cases before deleting the account",
    });
  }

  // Archive instead of permanently deleting
  user.status = "Archived";

  audit(req, {
    action: "Admin Archived User",
    caseId: "—",
    document: "—",
    note: `Archived user account: ${user.name} (${user.username})`,
  });

  await persist();

  return res.json({
    message: "User account archived successfully",
  });
});

app.post("/api/users/:id/mfa-reset", auth, requireRole("Admin"), async (req, res) => {
  const user = db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  clearMfa(user);
  audit(req, {
    action: "Admin Reset MFA",
    caseId: "—",
    document: "—",
    note: `MFA reset for ${user.username}`,
  });
  await persist();
  res.json({ user: publicUser(user, db.roleMatrix) });
});

app.get("/api/roles", auth, requirePerm("admin.users"), (_req, res) => {
  res.json({ roles: ROLES, permissions: PERMISSIONS, matrix: effectiveRoleMatrix(db.roleMatrix) });
});

app.put("/api/roles", auth, requirePerm("admin.users"), (req, res) => {
  db.roleMatrix = { ...db.roleMatrix, ...req.body.matrix };
  persist();
  res.json({ matrix: db.roleMatrix });
});

app.get("/api/settings", auth, (req, res) => {
  res.json({
    settings: can(req.user, "admin.users") ? db.settings : null,
    profile: req.user,
  });
});

app.patch("/api/settings", auth, (req, res) => {
  if (!can(req.user, "admin.users")) {
    return res.status(403).json({ error: "You do not have permission to change system settings" });
  }
  db.settings = { ...db.settings, ...req.body.settings };
  persist();
  res.json({ settings: db.settings });
});

app.post("/api/profile/mfa/enroll", auth, async (req, res) => {
  const user = db.users.find((item) => item.id === req.user.id);
  const passwordOk = await bcrypt.compare(req.body?.password || "", user.passwordHash);
  if (!passwordOk) return res.status(400).json({ error: "Current password is incorrect" });
  if (user.mfa_enabled) return res.status(409).json({ error: "Multi-factor authentication is already enabled" });

  const secret = encodeBase32(crypto.randomBytes(20));
  const issuer = "SecureVault";
  const account = `${issuer}:${user.email}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  user.mfa_pending_secret = encryptMfaSecret(secret);
  user.mfa_pending_expires_at = Date.now() + 10 * 60 * 1000;
  await persist();
  audit(req, { action: "MFA Enrollment Started", caseId: "—", document: "—" });
  res.json({
    secret,
    otpauthUri: `otpauth://totp/${encodeURIComponent(account)}?${query.toString()}`,
    expiresAt: user.mfa_pending_expires_at,
  });
});

app.post("/api/profile/mfa/confirm", auth, async (req, res) => {
  const user = db.users.find((item) => item.id === req.user.id);
  if (!user.mfa_pending_secret || user.mfa_pending_expires_at < Date.now()) {
    delete user.mfa_pending_secret;
    delete user.mfa_pending_expires_at;
    await persist();
    return res.status(409).json({ error: "MFA setup expired. Start enrollment again." });
  }
  const secret = decryptMfaSecret(user.mfa_pending_secret);
  const counter = matchingTotpCounter(secret, req.body?.code);
  if (counter === null) return res.status(400).json({ error: "Invalid authenticator code" });

  const recoveryCodes = generateRecoveryCodes();
  user.mfa_enabled = true;
  user.mfa_secret = encryptMfaSecret(secret);
  user.mfa_last_counter = counter;
  user.mfa_recovery_codes = recoveryCodes.map(recoveryCodeHash);
  delete user.mfa_pending_secret;
  delete user.mfa_pending_expires_at;
  await persist();
  audit(req, { action: "MFA Enabled", caseId: "—", document: "—" });
  res.json({
    user: publicUser(user, db.roleMatrix),
    recoveryCodes,
  });
});

app.post("/api/profile/mfa/disable", auth, async (req, res) => {
  const user = db.users.find((item) => item.id === req.user.id);
  if (!user.mfa_enabled || !user.mfa_secret) {
    return res.status(409).json({ error: "Multi-factor authentication is not enabled" });
  }
  const passwordOk = await bcrypt.compare(req.body?.password || "", user.passwordHash);
  if (!passwordOk) return res.status(400).json({ error: "Current password is incorrect" });

  let validCode = false;
  const counter = matchingTotpCounter(
    decryptMfaSecret(user.mfa_secret),
    req.body?.code,
    Number.isInteger(user.mfa_last_counter) ? user.mfa_last_counter : -1
  );
  if (counter !== null) {
    user.mfa_last_counter = counter;
    validCode = true;
  } else {
    validCode = consumeRecoveryCode(user, req.body?.code);
  }
  if (!validCode) return res.status(400).json({ error: "Enter a valid authenticator or unused recovery code" });

  clearMfa(user);
  audit(req, { action: "MFA Disabled", caseId: "—", document: "—" });
  await persist();
  res.json({ user: publicUser(user, db.roleMatrix) });
});

app.patch("/api/profile/password", auth, async (req, res) => {
  const { current, password, confirm } = req.body || {};
  const user = db.users.find((u) => u.id === req.user.id);
  const ok = await bcrypt.compare(current || "", user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Current password is incorrect" });
  if (!password || password !== confirm || password.length < 8) {
    return res.status(400).json({ error: "New passwords must match and be at least 8 characters" });
  }
  user.passwordHash = await bcrypt.hash(password, 10);
  persist();
  res.json({ message: "Password changed" });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, product: "SecureVault", ps: "SIH26190" });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    const message = err.field === "avatar"
      ? "Profile pictures must be 5 MB or smaller"
      : "File exceeds the 50 MB limit";
    return res.status(400).json({ error: message });
  }
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

checkBucket()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SecureVault API listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MinIO connection failed:", error.message);
    process.exit(1);
  });;
