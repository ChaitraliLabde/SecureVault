import dotenv from "dotenv";
import pg from "pg";
import fs from "fs";
import path from "path";

dotenv.config({ path: "server/.env" });

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const DB_PATH = path.join("server", "data", "db.json");

function dateValue(value) {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
}

function jsonValue(value) {
    return JSON.stringify(value ?? null);
}

async function migrate() {
    const client = await pool.connect();

    try {
        console.log("\nStarting SecureVault data migration...\n");

        // Read existing JSON database
        const db = JSON.parse(
            fs.readFileSync(DB_PATH, "utf8")
        );

        await client.query("BEGIN");

        // =====================================
        // 1. USERS
        // =====================================

        for (const u of db.users || []) {
            await client.query(
                `INSERT INTO users
                (id, email, username, role, status, data)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    username = EXCLUDED.username,
                    role = EXCLUDED.role,
                    status = EXCLUDED.status,
                    data = EXCLUDED.data`,
                [
                    String(u.id),
                    u.email ?? null,
                    u.username ?? null,
                    u.role ?? null,
                    u.status ?? null,
                    jsonValue(u)
                ]
            );
        }

        console.log("Users migrated:", db.users?.length || 0);

        // =====================================
        // 2. CASES
        // =====================================

        for (const c of db.cases || []) {
            await client.query(
                `INSERT INTO cases
                (id, assigned_to, created_by, status, created_on, data)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    assigned_to = EXCLUDED.assigned_to,
                    created_by = EXCLUDED.created_by,
                    status = EXCLUDED.status,
                    created_on = EXCLUDED.created_on,
                    data = EXCLUDED.data`,
                [
                    String(c.id),
                    c.assignedTo ?? null,
                    c.createdBy ?? null,
                    c.status ?? null,
                    dateValue(c.createdOn),
                    jsonValue(c)
                ]
            );
        }

        console.log("Cases migrated:", db.cases?.length || 0);

        // =====================================
        // 3. DOCUMENTS
        // =====================================

        for (const d of db.documents || []) {
            await client.query(
                `INSERT INTO documents
                (id, case_id, uploaded_by, name,
                 document_type, uploaded_on, original_sha256, data)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    case_id = EXCLUDED.case_id,
                    uploaded_by = EXCLUDED.uploaded_by,
                    name = EXCLUDED.name,
                    document_type = EXCLUDED.document_type,
                    uploaded_on = EXCLUDED.uploaded_on,
                    original_sha256 = EXCLUDED.original_sha256,
                    data = EXCLUDED.data`,
                [
                    String(d.id),
                    d.caseId ?? null,
                    d.uploadedBy ?? null,
                    d.name ?? null,
                    d.type ?? null,
                    dateValue(d.uploadedOn),
                    d.originalSha256 ?? null,
                    jsonValue(d)
                ]
            );
        }

        console.log("Documents migrated:", db.documents?.length || 0);

        // =====================================
        // 4. AUDIT LOGS
        // =====================================

        for (const a of db.audits || []) {
            await client.query(
                `INSERT INTO audits
                (id, user_id, case_id, audit_timestamp, action, data)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    case_id = EXCLUDED.case_id,
                    audit_timestamp = EXCLUDED.audit_timestamp,
                    action = EXCLUDED.action,
                    data = EXCLUDED.data`,
                [
                    String(a.id),
                    a.userId ?? null,
                    a.caseId ?? null,
                    dateValue(a.timestamp),
                    a.action ?? null,
                    jsonValue(a)
                ]
            );
        }

        console.log("Audit logs migrated:", db.audits?.length || 0);

        // =====================================
        // 5. RESET TOKENS
        // =====================================

        for (const r of db.resetTokens || []) {
            await client.query(
                `INSERT INTO reset_tokens (id, data)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    data = EXCLUDED.data`,
                [String(r.id), jsonValue(r)]
            );
        }

        console.log("Reset tokens migrated:", db.resetTokens?.length || 0);

        // =====================================
        // 6. NOTIFICATIONS
        // =====================================

        for (const n of db.notifications || []) {
            await client.query(
                `INSERT INTO notifications (id, case_id, data)
                VALUES ($1, $2, $3::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    case_id = EXCLUDED.case_id,
                    data = EXCLUDED.data`,
                [
                    String(n.id),
                    n.caseId ?? null,
                    jsonValue(n)
                ]
            );
        }

        console.log("Notifications migrated:", db.notifications?.length || 0);

        // =====================================
        // 7. ROLE MATRIX
        // =====================================

        for (const [role, permissions] of Object.entries(db.roleMatrix || {})) {
            await client.query(
                `INSERT INTO role_matrix (role, permissions)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (role) DO UPDATE SET
                    permissions = EXCLUDED.permissions`,
                [role, jsonValue(permissions)]
            );
        }

        console.log("Role permissions migrated.");

        // =====================================
        // 8. SETTINGS
        // =====================================

        for (const [key, value] of Object.entries(db.settings || {})) {
            await client.query(
                `INSERT INTO app_settings (setting_key, setting_value)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (setting_key) DO UPDATE SET
                    setting_value = EXCLUDED.setting_value`,
                [key, jsonValue(value)]
            );
        }

        console.log("Application settings migrated.");

        // =====================================
        // 9. VERIFICATIONS
        // =====================================

        for (const v of db.verifications || []) {
            await client.query(
                `INSERT INTO verifications
                (id, user_id, document_id, case_id, verified_at, data)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    document_id = EXCLUDED.document_id,
                    case_id = EXCLUDED.case_id,
                    verified_at = EXCLUDED.verified_at,
                    data = EXCLUDED.data`,
                [
                    String(v.id),
                    v.userId ?? null,
                    v.documentId ?? null,
                    v.caseId ?? null,
                    dateValue(v.verifiedAt),
                    jsonValue(v)
                ]
            );
        }

        console.log("Verifications migrated:", db.verifications?.length || 0);

        // =====================================
        // 10. CHAIN OF CUSTODY
        // =====================================

        for (const e of db.custodyEvents || []) {
            await client.query(
                `INSERT INTO custody_events
                (id, document_id, case_id, handler_id,
                 event_timestamp, data)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    document_id = EXCLUDED.document_id,
                    case_id = EXCLUDED.case_id,
                    handler_id = EXCLUDED.handler_id,
                    event_timestamp = EXCLUDED.event_timestamp,
                    data = EXCLUDED.data`,
                [
                    String(e.id),
                    e.documentId ?? null,
                    e.caseId ?? null,
                    e.handlerId ?? null,
                    dateValue(e.timestamp),
                    jsonValue(e)
                ]
            );
        }

        console.log("Custody events migrated:", db.custodyEvents?.length || 0);

        // =====================================
        // 11. FEEDBACK
        // =====================================

        for (const f of db.feedback || []) {
            await client.query(
                `INSERT INTO feedback (id, user_id, data)
                VALUES ($1, $2, $3::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    data = EXCLUDED.data`,
                [
                    String(f.id),
                    f.userId ?? null,
                    jsonValue(f)
                ]
            );
        }

        console.log("Feedback migrated:", db.feedback?.length || 0);

        // Commit migration
        await client.query("COMMIT");

        console.log("\n==================================");
        console.log("SECUREVAULT MIGRATION SUCCESSFUL!");
        console.log("==================================\n");

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("\nMigration failed!");
        console.error(error.message);
        console.log("All changes in this migration were rolled back.");

    } finally {
        client.release();
        await pool.end();
    }
}

migrate();