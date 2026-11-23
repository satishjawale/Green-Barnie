import React, { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Play, RefreshCw } from 'lucide-react';
import type {
  BuildingAsset,
  DataSourceType,
  DmrvRecord,
  Tenant,
  TenantSyncKey,
  UserRole,
} from '../types/domain';
import { hasPermission } from '../utils/dmrv';

interface ApiSyncViewProps {
  tenant: Tenant;
  assets: BuildingAsset[];
  role: UserRole;
  onSyncedRecordReceived: (record: DmrvRecord) => void;
}

export function ApiSyncView({
  tenant,
  assets,
  role,
  onSyncedRecordReceived,
}: ApiSyncViewProps) {
  const canManageKeys = hasPermission(role, 'sync:manage_keys');

  const [syncKey, setSyncKey] = useState<TenantSyncKey | null>(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [revealKey, setRevealKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  // Live Test Payload State
  const [testSource, setTestSource] = useState<DataSourceType>('bms_trend');
  const [testQty, setTestQty] = useState('34800');
  const [testPeriod, setTestPeriod] = useState('2026-11');
  const [testing, setTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<{
    status: number;
    latencyMs: number;
    body: unknown;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadKey() {
      setLoadingKey(true);
      try {
        let res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenant.tenantId)}/sync-key`);
        if (res.status === 404) {
          await fetch('/api/v1/tenants/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tenant),
          });
          res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenant.tenantId)}/sync-key`);
        }
        if (res.ok && active) {
          const data = (await res.json()) as TenantSyncKey;
          setSyncKey(data);
        }
      } catch (err) {
        console.error('Failed to load tenant sync key:', err);
      } finally {
        if (active) setLoadingKey(false);
      }
    }
    loadKey();
    setTestResponse(null);
    return () => {
      active = false;
    };
  }, [tenant]);

  const handleRotateKey = async () => {
    if (!canManageKeys) return;
    setRotating(true);
    try {
      const res = await fetch(
        `/api/v1/tenants/${encodeURIComponent(tenant.tenantId)}/sync-key/rotate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Rotated BMS Gateway Key' }),
        }
      );
      if (res.ok) {
        const rotated = (await res.json()) as TenantSyncKey;
        setSyncKey(rotated);
        setRevealKey(true);
      }
    } finally {
      setRotating(false);
    }
  };

  const handleCopy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const sampleAsset = assets[0] ?? {
    assetId: `asset_${tenant.tenantId.slice(0, 12)}_01`,
    name: `${tenant.name} Main Building`,
  };

  const runLiveSyncTest = async () => {
    if (!syncKey) return;
    setTesting(true);
    const start = performance.now();
    try {
      const unitMap: Record<DataSourceType, string> = {
        utility_bill: 'kWh',
        bms_trend: 'kWh',
        fuel_log: 'Liters',
        waste_record: 'Tonnes',
      };
      const res = await fetch('/api/v1/sync/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': syncKey.apiKey,
        },
        body: JSON.stringify({
          assetId: sampleAsset.assetId,
          assetName: sampleAsset.name,
          sourceType: testSource,
          quantity: Number(testQty) || 34800,
          unit: unitMap[testSource],
          period: testPeriod,
        }),
      });
      const json = await res.json();
      setTestResponse({
        status: res.status,
        latencyMs: Math.round(performance.now() - start),
        body: json,
      });
      if (res.ok && json?.record) {
        onSyncedRecordReceived(json.record as DmrvRecord);
      }
    } catch (err) {
      setTestResponse({
        status: 500,
        latencyMs: Math.round(performance.now() - start),
        body: { error: err instanceof Error ? err.message : 'Request failed' },
      });
    } finally {
      setTesting(false);
    }
  };

  const curlSnippet = `curl -X POST "${window.location.origin}/api/v1/sync/ingest" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${revealKey && syncKey ? syncKey.apiKey : '<TENANT_SYNC_API_KEY>'}" \\
  -d '{
    "assetId": "${sampleAsset.assetId}",
    "assetName": "${sampleAsset.name}",
    "sourceType": "${testSource}",
    "quantity": ${Number(testQty) || 34800},
    "period": "${testPeriod}"
  }'`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-slate-500">
          Third-Party Data Synchronization API · Isolated to {tenant.tenantId}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
          BMS, Utility &amp; ERP Data Sync Console
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Connect third-party Building Management Systems (Siemens, Schneider, Honeywell), DEWA/EtihadWE billing feeds, and CAFM systems via tenant-scoped REST endpoints.
        </p>
      </div>

      {/* Tenant-Scoped API Key Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Tenant Sync Credential ({tenant.name})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified server-side with SHA-256 constant-time matching; rejects cross-tenant payload spoofing with HTTP 403.
            </p>
          </div>
          <button
            type="button"
            disabled={!canManageKeys || rotating}
            onClick={handleRotateKey}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
            Rotate API Key
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <div className="flex-1 font-mono text-xs text-slate-800 break-all">
            {loadingKey
              ? 'Loading tenant sync key...'
              : syncKey
              ? revealKey
                ? syncKey.apiKey
                : `${syncKey.apiKey.slice(0, 12)}••••••••••••••••••••••••••••`
              : 'Unavailable'}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!canManageKeys || !syncKey}
              onClick={() => setRevealKey((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40"
            >
              {revealKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {revealKey ? 'Mask' : 'Reveal'}
            </button>
            <button
              type="button"
              disabled={!canManageKeys || !syncKey}
              onClick={() => syncKey && handleCopy('key', syncKey.apiKey)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedField === 'key' ? 'Copied' : 'Copy Key'}
            </button>
          </div>
        </div>
      </section>

      {/* Live API Sync Test Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            Live Endpoint Tester (<span className="font-mono text-sm text-[#114B33]">POST /api/v1/sync/ingest</span>)
          </h2>
          <p className="text-xs text-slate-500">
            Executes a real authenticated HTTP request against the Node.js Express API, calculates UAE emissions, and streams the new record to the dashboard.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="sync-source" className="block text-xs font-medium text-slate-700 mb-1">
                Source Type
              </label>
              <select
                id="sync-source"
                value={testSource}
                onChange={(e) => setTestSource(e.target.value as DataSourceType)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="bms_trend">bms_trend</option>
                <option value="utility_bill">utility_bill</option>
                <option value="fuel_log">fuel_log</option>
                <option value="waste_record">waste_record</option>
              </select>
            </div>
            <div>
              <label htmlFor="sync-qty" className="block text-xs font-medium text-slate-700 mb-1">
                Quantity
              </label>
              <input
                id="sync-qty"
                type="number"
                value={testQty}
                onChange={(e) => setTestQty(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="sync-period" className="block text-xs font-medium text-slate-700 mb-1">
                Period
              </label>
              <input
                id="sync-period"
                type="month"
                value={testPeriod}
                onChange={(e) => setTestPeriod(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={testing || !syncKey}
            onClick={runLiveSyncTest}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] disabled:opacity-40 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {testing ? 'Sending Live Request...' : 'Run Live Sync Test'}
          </button>

          {testResponse && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
                <span
                  className={
                    testResponse.status >= 200 && testResponse.status < 300
                      ? 'text-emerald-700 font-semibold'
                      : 'text-red-700 font-semibold'
                  }
                >
                  HTTP {testResponse.status}
                </span>
                <span className="text-slate-500 tabular-nums">{testResponse.latencyMs} ms</span>
              </div>
              <pre className="p-3.5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto max-h-64">
                {JSON.stringify(testResponse.body, null, 2)}
              </pre>
            </div>
          )}
        </section>

        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Integration Example (cURL)
            </h2>
            <button
              type="button"
              onClick={() => handleCopy('curl', curlSnippet)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedField === 'curl' ? 'Copied' : 'Copy cURL'}
            </button>
          </div>
          <pre className="p-4 text-xs font-mono bg-slate-950 text-slate-100 rounded-lg overflow-x-auto leading-relaxed">
            {curlSnippet}
          </pre>

          <div className="pt-2 space-y-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">Available Synchronization Endpoints</p>
            <ul className="space-y-1.5 font-mono">
              <li>GET  /api/v1/sync/status — Schema &amp; emission factor contract</li>
              <li>POST /api/v1/sync/ingest — Push Utility/BMS/Fuel/Waste reading</li>
              <li>GET  /api/v1/sync/records — Pull verified tenant audit records</li>
              <li>GET  /api/v1/stream/:tenantId — Real-time Server-Sent Events feed</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
