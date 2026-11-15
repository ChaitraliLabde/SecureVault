-- =========================================
-- SECUREVAULT DATABASE SCHEMA
-- PostgreSQL / Neon
-- =========================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    username TEXT,
    role TEXT,
    status TEXT,
    data JSONB NOT NULL
);

-- 2. CASES
CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    assigned_to TEXT REFERENCES users(id),
    created_by TEXT REFERENCES users(id),
    status TEXT,
    created_on TIMESTAMPTZ,
    data JSONB NOT NULL
);

-- 3. DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT REFERENCES cases(id),
    uploaded_by TEXT REFERENCES users(id),
    name TEXT,
    document_type TEXT,
    uploaded_on TIMESTAMPTZ,
    original_sha256 TEXT,
    data JSONB NOT NULL
);

-- 4. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    case_id TEXT,
    audit_timestamp TIMESTAMPTZ,
    action TEXT,
    data JSONB NOT NULL
);

-- 5. PASSWORD RESET TOKENS
CREATE TABLE IF NOT EXISTS reset_tokens (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL
);

-- 6. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    data JSONB NOT NULL
);

-- 7. ROLE PERMISSIONS
CREATE TABLE IF NOT EXISTS role_matrix (
    role TEXT PRIMARY KEY,
    permissions JSONB NOT NULL
);

-- 8. APPLICATION SETTINGS
CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value JSONB NOT NULL
);

-- 9. DOCUMENT VERIFICATIONS
CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    document_id TEXT REFERENCES documents(id),
    case_id TEXT REFERENCES cases(id),
    verified_at TIMESTAMPTZ,
    data JSONB NOT NULL
);

-- 10. CHAIN OF CUSTODY EVENTS
CREATE TABLE IF NOT EXISTS custody_events (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    case_id TEXT REFERENCES cases(id),
    handler_id TEXT REFERENCES users(id),
    event_timestamp TIMESTAMPTZ,
    data JSONB NOT NULL
);

-- 11. FEEDBACK
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    data JSONB NOT NULL
);

-- =========================================
-- INDEXES
-- =========================================

CREATE INDEX IF NOT EXISTS idx_cases_assigned
ON cases(assigned_to);

CREATE INDEX IF NOT EXISTS idx_documents_case
ON documents(case_id);

CREATE INDEX IF NOT EXISTS idx_documents_uploader
ON documents(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_audits_user
ON audits(user_id);

CREATE INDEX IF NOT EXISTS idx_audits_case
ON audits(case_id);

CREATE INDEX IF NOT EXISTS idx_verifications_document
ON verifications(document_id);

CREATE INDEX IF NOT EXISTS idx_custody_document
ON custody_events(document_id);

-- CASE REVIEWER ASSIGNMENTS
CREATE TABLE IF NOT EXISTS case_reviewers (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_case_reviewer UNIQUE (case_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_case_reviewers_case
ON case_reviewers(case_id);

CREATE INDEX IF NOT EXISTS idx_case_reviewers_reviewer
ON case_reviewers(reviewer_id);
