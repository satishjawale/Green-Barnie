# Arknex & BFMA Green Building dMRV Platform — Developer Onboarding & Linux / cPanel Maintenance Guide

## 1. Architecture Overview
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Recharts (responsive across desktop 1440px, tablet, and mobile 390px viewports).
- **Backend**: Node.js 22 + Express 4 (`server.ts`) serving REST APIs (`/api/v1/sync/*`, `/api/v1/stream/*`, `/api/v1/compliance/*`) and SPA static assets.
- **Multi-Tenant Data Isolation**:
  - Cloud workspace: Firestore subcollections isolated under `/tenants/{tenantId}/...` protected by hardened RBAC security rules (`firestore.rules`).
  - Linux / cPanel self-hosted deployment: Composite `(tenant_id, entity_id)` primary keys and foreign keys in MySQL 8.0 (`docs/cpanel-mysql-schema.sql`), ensuring every SQL query strictly scopes by `WHERE tenant_id = ?`.

## 2. Local Development Setup
```bash
npm install
cp .env.example .env
# Populate GEMINI_API_KEY and optional MySQL/Firebase credentials
npm run dev
# Runs on http://localhost:3000
```

### Verification & Testing
```bash
# Run pure dMRV, RBAC & sync validation unit tests
npx tsx --test src/utils/dmrv.test.ts

# Type-check and compile production bundle
npm run lint
npm run build
```

## 3. Linux & cPanel Deployment Runbook (with cPanel MySQL)
1. **Create MySQL Database in cPanel**:
   - Open **cPanel → MySQL Databases**, create database `arknex_dmrv` and user `arknex_app` with `SELECT, INSERT, UPDATE, DELETE` privileges (separate from migration admin user).
   - Import `docs/cpanel-mysql-schema.sql` via **phpMyAdmin** or SSH (`mysql -u arknex_admin -p arknex_dmrv < docs/cpanel-mysql-schema.sql`).
2. **Build & Upload Node.js Application**:
   - Build locally or in CI: `npm ci && npm run build`.
   - Upload project files (`server.ts`, `dist/`, `package.json`, `package-lock.json`, `src/utils/`, `src/types/`, `src/data/`) to `/home/<cpanel_user>/arknex-dmrv`.
3. **Configure cPanel Setup Node.js App (Phusion Passenger)**:
   - Node.js version: `20.x` or `22.x`.
   - Application mode: `Production`.
   - Application startup file: `server.ts` (or compiled `dist-server/server.js`).
   - Set Environment Variables in cPanel Node.js UI: `NODE_ENV=production`, `PORT=3000`, `MYSQL_HOST=127.0.0.1`, `MYSQL_DATABASE=arknex_dmrv`, `MYSQL_USER=arknex_app`, `MYSQL_PASSWORD=<secret>`, `GEMINI_API_KEY=<secret>`.
   - Click **Run NPM Install** and **Restart Application**.
4. **Reverse Proxy & TLS**:
   - Enable **AutoSSL / Let's Encrypt** in cPanel so all BMS API sync requests and browser sessions enforce HTTPS.

## 4. Third-Party BMS / ERP Data Sync API
All external integrations authenticate with a tenant-scoped `X-API-Key` header. Keys are verified using SHA-256 hashes and constant-time comparison (`crypto.timingSafeEqual`).

### Push Telemetry (`POST /api/v1/sync/ingest`)
```bash
curl -X POST https://your-domain.ae/api/v1/sync/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <TENANT_API_KEY>" \
  -d '{
    "assetId": "asset_dxb_marina_01",
    "assetName": "Marina Bay Grand Serviced Suites",
    "sourceType": "bms_trend",
    "quantity": 48200,
    "unit": "kWh",
    "period": "2026-11"
  }'
```

### Pull Verified Records (`GET /api/v1/sync/records`)
```bash
curl -X GET "https://your-domain.ae/api/v1/sync/records?scope=Scope%202&limit=50" \
  -H "X-API-Key: <TENANT_API_KEY>"
```

## 5. Agile Delivery & Maintenance Cadence
- **2-Week Sprints** aligned to the 24-month UAE GTM Roadmap (`Q4 2026 Pilot Prep` → `Q1 2027 Dubai` → `Q2 2027 RAK` → `Q3 2027 Fujairah` → `Q4 2027+ Scale`).
- **Definition of Done**: Automated unit tests passing, tenant isolation verified, P1–P5 stage lineage logged, and Arknex technical sign-off recorded prior to publishing energy-savings commitments.
