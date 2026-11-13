# SecureVault — SIH26190

Secure Digital Document Management System for Legal and Investigation Documents.

Ministry of Home Affairs / NCRB (Women Safety Division). Theme: Blockchain & Cybersecurity.

## Stack

- React (Vite) frontend
- Node.js + Express REST API
- JSON metadata store (swap-ready for PostgreSQL)
- Private local file storage (swap-ready for MinIO)
- SHA-256 integrity, version history, role-based permissions, audit trail

## Run

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:4000

## Pages

- Sign up: `/` or `/signup` (the first screen for unauthenticated visitors)
- Sign in and account recovery: `/login`, `/forgot-password`, `/reset-password`
- Workspace: `/` dashboard; `/cases` and `/cases/:id`; `/documents` and `/documents/:id`
- Document workflows: `/cases/new`, `/cases/:id/edit`, `/documents/upload`, `/documents/:id/versions`
- Security: `/security/integrity`, `/security/audit`
- Reports: `/reports`
- Administration: `/admin/users`, `/admin/roles`
- Account: `/settings`

New sign-ups are created as inactive Read-only Reviewers and must be activated by an administrator in User Management before they can sign in.

## Multi-factor authentication

Users can optionally enable authenticator-app TOTP from Profile & Settings. Setup keys are encrypted at rest; recovery codes are shown once and stored as hashes. Set strong, persistent `JWT_SECRET` and `MFA_ENCRYPTION_KEY` environment variables in production. Keep the MFA encryption key backed up and stable: changing it makes existing enrolled TOTP secrets unreadable.

## Demo accounts

Password for all: `password`

| Username | Role |
| --- | --- |
| chaitrali | Investigating Officer |
| rahul | Supervisor |
| admin | Admin |
| neha | Read-only Reviewer |

Officer upload path: Login → Dashboard → Cases → Case Documents → Upload → Preview / Integrity / Versions.
