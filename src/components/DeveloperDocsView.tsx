import React, { useState } from 'react';
import { Copy, Download } from 'lucide-react';

const CPANEL_MYSQL_SQL = `-- Arknex & BFMA Multi-Tenant Schema for Linux + cPanel MySQL 8.0+
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  emirate ENUM('Dubai','Ras Al Khaimah','Fujairah','Abu Dhabi','Sharjah') NOT NULL,
  segment VARCHAR(80) NOT NULL,
  commercial_model VARCHAR(80) NOT NULL DEFAULT 'Option A: BFMA Prime / Arknex Sub',
  rollout_phase VARCHAR(64) NOT NULL,
  status ENUM('active','onboarding','archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_members (
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  role ENUM('super_admin','bfma_fm_manager','arknex_auditor','tenant_viewer') NOT NULL,
  organization ENUM('Arknex','BFMA','Client') NOT NULL,
  status ENUM('active','revoked') NOT NULL DEFAULT 'active',
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS building_assets (
  asset_id VARCHAR(64) NOT NULL,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(140) NOT NULL,
  stage ENUM('P1','P2','P3','P4','P5') NOT NULL DEFAULT 'P1',
  certification_target VARCHAR(32) NOT NULL,
  bms_connected TINYINT(1) NOT NULL DEFAULT 0,
  baseline_emissions_tco2e DECIMAL(12,3) NOT NULL DEFAULT 0,
  current_emissions_tco2e DECIMAL(12,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, asset_id),
  CONSTRAINT fk_asset_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dmrv_records (
  record_id VARCHAR(64) NOT NULL,
  tenant_id VARCHAR(64) NOT NULL,
  asset_id VARCHAR(64) NOT NULL,
  source_type ENUM('utility_bill','bms_trend','fuel_log','waste_record') NOT NULL,
  scope ENUM('Scope 1','Scope 2','Scope 3 Waste') NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit VARCHAR(16) NOT NULL,
  emissions_tco2e DECIMAL(12,4) NOT NULL,
  validation_status ENUM('validated','pending_audit','flagged') NOT NULL DEFAULT 'pending_audit',
  lineage_hash CHAR(64) NOT NULL,
  reporting_period VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, record_id),
  INDEX idx_dmrv_tenant_period (tenant_id, reporting_period),
  CONSTRAINT fk_dmrv_asset FOREIGN KEY (tenant_id, asset_id)
    REFERENCES building_assets(tenant_id, asset_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

const CPANEL_DEPLOY_STEPS = [
  {
    step: '01. Provision cPanel MySQL Database & Least-Privilege User',
    detail:
      'In cPanel -> MySQL Databases, create database arknex_dmrv and two users: arknex_admin (schema migrations only) and arknex_app (SELECT, INSERT, UPDATE, DELETE only). Import docs/cpanel-mysql-schema.sql via phpMyAdmin or SSH.',
  },
  {
    step: '02. Build React Production Bundle on Linux',
    detail:
      'Run npm ci && npm run lint && npm run build to generate the optimized static client in dist/ alongside the Express API server (server.ts).',
  },
  {
    step: '03. Configure cPanel Setup Node.js App (Phusion Passenger)',
    detail:
      'Select Node.js 20.x/22.x, set Application Mode to Production, startup file to server.ts (or compiled server.js), and inject MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, and GEMINI_API_KEY via cPanel environment variables.',
  },
  {
    step: '04. Enforce HTTPS TLS & Backup Automation',
    detail:
      'Enable AutoSSL in cPanel for encrypted browser sessions and BMS API calls. Schedule daily mysqldump cron backups partitioned per tenant_id with 30-day off-server retention.',
  },
];

type DocTab = 'architecture' | 'cpanel' | 'mysql' | 'agile';

export function DeveloperDocsView() {
  const [activeDoc, setActiveDoc] = useState<DocTab>('cpanel');
  const [copied, setCopied] = useState(false);

  const handleCopySql = () => {
    navigator.clipboard?.writeText(CPANEL_MYSQL_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadSql = () => {
    const blob = new Blob([CPANEL_MYSQL_SQL], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arknex-bfma-cpanel-mysql-schema.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-slate-500">
          Engineering Onboarding &amp; Operations Playbook
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
          Developer Documentation, Linux &amp; cPanel MySQL Guide
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Complete setup, multi-tenant database isolation schema, Linux/cPanel deployment instructions, and Agile maintenance standards.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {(
          [
            { id: 'cpanel', label: 'Linux & cPanel Deployment' },
            { id: 'mysql', label: 'cPanel MySQL Schema' },
            { id: 'architecture', label: 'Architecture & Onboarding' },
            { id: 'agile', label: 'Agile & Maintenance' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveDoc(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeDoc === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeDoc === 'cpanel' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Linux &amp; cPanel Production Deployment Runbook
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compatible with CloudLinux / AlmaLinux cPanel Node.js Selector (Passenger) and standard Ubuntu VPS with PM2 + Nginx
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CPANEL_DEPLOY_STEPS.map((item) => (
              <div key={item.step} className="border border-slate-200 rounded-lg p-4 bg-slate-50/40">
                <h3 className="text-sm font-semibold text-[#114B33]">{item.step}</h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Required Linux Environment Variables (.env)
            </h3>
            <pre className="p-4 text-xs font-mono bg-slate-950 text-slate-100 rounded-lg overflow-x-auto">
{`NODE_ENV=production
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=arknex_dmrv
MYSQL_USER=arknex_app
MYSQL_PASSWORD=<configure_in_cpanel_env>
GEMINI_API_KEY=<configure_in_secrets>`}
            </pre>
          </div>
        </section>
      )}

      {activeDoc === 'mysql' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Multi-Tenant cPanel MySQL 8.0 DDL Schema
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Composite <span className="font-mono">(tenant_id, entity_id)</span> primary and foreign keys prevent cross-tenant joins at the engine level
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Copied SQL' : 'Copy SQL'}
              </button>
              <button
                type="button"
                onClick={handleDownloadSql}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28]"
              >
                <Download className="w-3.5 h-3.5" />
                Download .sql File
              </button>
            </div>
          </div>
          <pre className="p-4 text-xs font-mono bg-slate-950 text-slate-100 rounded-lg overflow-x-auto max-h-[480px] leading-relaxed">
            {CPANEL_MYSQL_SQL}
          </pre>
        </section>
      )}

      {activeDoc === 'architecture' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">
            Developer Onboarding &amp; Stack Architecture
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Frontend Layer</h3>
              <p className="leading-relaxed">
                React 19 + TypeScript + Tailwind CSS v4 + Recharts. Pure emissions &amp; RBAC math lives in{' '}
                <span className="font-mono text-slate-800">src/utils/dmrv.ts</span> with deterministic{' '}
                <span className="font-mono text-slate-800">node:test</span> unit coverage.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Node.js API Layer</h3>
              <p className="leading-relaxed">
                Express 4 in <span className="font-mono text-slate-800">server.ts</span> exposes tenant-scoped{' '}
                <span className="font-mono text-slate-800">/api/v1/sync/*</span> endpoints, real-time SSE telemetry streams, and server-side compliance reasoning.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Auth &amp; Isolation</h3>
              <p className="leading-relaxed">
                Cloud workspace enforces Firebase Authentication + hardened Firestore subcollection rules (<span className="font-mono text-slate-800">firestore.rules</span>). Self-hosted Linux uses composite MySQL tenant partitioning.
              </p>
            </div>
          </div>
          <pre className="p-4 text-xs font-mono bg-slate-950 text-slate-100 rounded-lg overflow-x-auto">
{`# Local Developer Onboarding Commands
npm install
npx tsx --test src/utils/dmrv.test.ts   # Run pure logic unit tests
npm run lint                            # TypeScript strict check
npm run dev                             # Full-stack Express + Vite on :3000
npm run build && npm start              # Production Linux build & serve`}
          </pre>
        </section>
      )}

      {activeDoc === 'agile' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">
            Agile Methodology &amp; Maintenance Governance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
            <div className="border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">2-Week Sprint Cadence</h3>
              <p>Sprint Planning aligns BFMA site engineers and Arknex carbon auditors around upcoming emirate milestones (Q4 2026 Pilot Prep → Q1 2027 Dubai → Q2 2027 RAK → Q3 2027 Fujairah).</p>
              <p>Every sprint card links directly to a product stage (P1–P5) and Fibonacci story points so velocity tracks commercial delivery.</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Definition of Done &amp; Release Checklist</h3>
              <p>1. Unit tests pass for UAE emission factors and tenant filtering.</p>
              <p>2. Security rules and API key isolation verified with zero cross-tenant leaks.</p>
              <p>3. CSV, MOCCAE JSON, and Print PDF exports validated on target browser &amp; mobile viewports.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
