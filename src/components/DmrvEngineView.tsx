import React, { useMemo, useState } from 'react';
import { Check, Download, Flag, Plus, Search } from 'lucide-react';
import type {
  BuildingAsset,
  CertificationTarget,
  DataSourceType,
  DmrvRecord,
  MeasurementUnit,
  Tenant,
  UserRole,
} from '../types/domain';
import { calculateEmissionsTco2e, hasPermission } from '../utils/dmrv';

interface DmrvEngineViewProps {
  tenant: Tenant;
  assets: BuildingAsset[];
  records: DmrvRecord[];
  role: UserRole;
  onAddRecord: (input: {
    assetId: string;
    assetName: string;
    sourceType: DataSourceType;
    quantity: number;
    unit: MeasurementUnit;
    period: string;
  }) => void;
  onUpdateValidationStatus: (recordId: string, status: DmrvRecord['validationStatus']) => void;
  onAddAsset: (input: {
    name: string;
    gfaSqm: number;
    certificationTarget: CertificationTarget;
    bmsConnected: boolean;
  }) => void;
  onExportCsv: () => void;
}

const SOURCE_LABELS: Record<DataSourceType, string> = {
  utility_bill: 'Utility Bill (DEWA/EtihadWE)',
  bms_trend: 'BMS Metered Trend',
  fuel_log: 'Fuel Log (Generators/HVAC)',
  waste_record: 'Waste Manifest Record',
};

const DEFAULT_UNITS: Record<DataSourceType, MeasurementUnit> = {
  utility_bill: 'kWh',
  bms_trend: 'kWh',
  fuel_log: 'Liters',
  waste_record: 'Tonnes',
};

export function DmrvEngineView({
  tenant,
  assets,
  records,
  role,
  onAddRecord,
  onUpdateValidationStatus,
  onAddAsset,
  onExportCsv,
}: DmrvEngineViewProps) {
  const canIngest = hasPermission(role, 'dmrv:ingest');
  const canVerify = hasPermission(role, 'dmrv:verify');
  const canAddAsset = hasPermission(role, 'asset:write');

  // Record Ingestion Form State
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0]?.assetId ?? '');
  const [sourceType, setSourceType] = useState<DataSourceType>('bms_trend');
  const [quantity, setQuantity] = useState('42500');
  const [unit, setUnit] = useState<MeasurementUnit>('kWh');
  const [period, setPeriod] = useState('2026-11');
  const [formError, setFormError] = useState('');

  // Quick Onboard Asset State
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetGfa, setNewAssetGfa] = useState('24000');
  const [newAssetCert, setNewAssetCert] = useState<CertificationTarget>('LEED O+M');
  const [newAssetBms, setNewAssetBms] = useState(true);

  // Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DmrvRecord['validationStatus']>('all');

  const resolvedAssetId =
    assets.some((a) => a.assetId === selectedAssetId) ? selectedAssetId : assets[0]?.assetId ?? '';

  const previewCalc = useMemo(() => {
    const num = Number(quantity);
    if (!Number.isFinite(num) || num <= 0) return null;
    try {
      return calculateEmissionsTco2e(sourceType, num, tenant.emirate, unit);
    } catch {
      return null;
    }
  }, [sourceType, quantity, tenant.emirate, unit]);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (statusFilter !== 'all' && rec.validationStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          rec.assetName.toLowerCase().includes(q) ||
          rec.lineageHash.toLowerCase().includes(q) ||
          rec.period.toLowerCase().includes(q) ||
          rec.scope.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, searchQuery, statusFilter]);

  const handleIngestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canIngest) {
      setFormError('Your current role does not permit ingesting dMRV readings.');
      return;
    }
    const asset = assets.find((a) => a.assetId === resolvedAssetId);
    if (!asset) {
      setFormError('Please onboard at least one building asset before logging telemetry.');
      return;
    }
    const qtyNum = Number(quantity);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be a positive number.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setFormError('Reporting period must match YYYY-MM format.');
      return;
    }

    onAddRecord({
      assetId: asset.assetId,
      assetName: asset.name,
      sourceType,
      quantity: qtyNum,
      unit,
      period,
    });
    setFormError('');
  };

  const handleAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newAssetName.trim();
    if (trimmed.length < 2) return;
    onAddAsset({
      name: trimmed,
      gfaSqm: Math.max(500, Number(newAssetGfa) || 15000),
      certificationTarget: newAssetCert,
      bmsConnected: newAssetBms,
    });
    setNewAssetName('');
    setShowAssetForm(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Arknex dMRV Engine · Tenant {tenant.tenantId}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Digital MRV Telemetry &amp; Audit Lineage
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Ingest BFMA utility bills, BMS trends, fuel logs, and waste records through the 3-stage validation pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canAddAsset && (
            <button
              type="button"
              onClick={() => setShowAssetForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {showAssetForm ? 'Hide Asset Form' : 'Onboard Building Asset'}
            </button>
          )}
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Audit Ledger
          </button>
        </div>
      </div>

      {/* 3-Step Arknex dMRV Architecture Flow */}
      <section aria-label="dMRV Pipeline Steps" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-mono text-[#114B33] font-semibold">01. Validate Data</p>
          <p className="text-sm font-medium text-slate-900 mt-1">
            Schema, Unit &amp; Tenant Boundary Gate
          </p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Checks positive metered quantities, reporting periods, and isolates records strictly to {tenant.name}.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-mono text-[#114B33] font-semibold">02. Calculate Emissions</p>
          <p className="text-sm font-medium text-slate-900 mt-1">
            UAE Emirate Grid &amp; Fuel Factors
          </p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Applies {tenant.emirate} Scope 2 grid modifiers and Scope 1 combustion coefficients aligned to Decree-Law No. 11.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-mono text-[#114B33] font-semibold">03. Store Lineage &amp; Audit</p>
          <p className="text-sm font-medium text-slate-900 mt-1">
            Immutable SHA-256 Evidence Chain
          </p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Generates tamper-evident hashes feeding Emirate Code, MOCCAE MRV, LEED O+M, and Lender KPI exports.
          </p>
        </div>
      </section>

      {/* Optional Onboard Building Asset Drawer */}
      {showAssetForm && canAddAsset && (
        <form
          onSubmit={handleAssetSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Onboard New Building Asset ({tenant.emirate})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="new-asset-name" className="block text-xs font-medium text-slate-700 mb-1">
                Building Name
              </label>
              <input
                id="new-asset-name"
                type="text"
                required
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                placeholder="e.g., Marina Walk Residences Tower C"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114B33]/30"
              />
            </div>
            <div>
              <label htmlFor="new-asset-gfa" className="block text-xs font-medium text-slate-700 mb-1">
                Gross Floor Area (m²)
              </label>
              <input
                id="new-asset-gfa"
                type="number"
                min={500}
                value={newAssetGfa}
                onChange={(e) => setNewAssetGfa(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114B33]/30"
              />
            </div>
            <div>
              <label htmlFor="new-asset-cert" className="block text-xs font-medium text-slate-700 mb-1">
                Certification Track
              </label>
              <select
                id="new-asset-cert"
                value={newAssetCert}
                onChange={(e) => setNewAssetCert(e.target.value as CertificationTarget)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="LEED O+M">LEED O+M</option>
                <option value="Al Sa'fat">Al Sa&apos;fat</option>
                <option value="Barjeel">Barjeel</option>
                <option value="MOCCAE MRV">MOCCAE MRV</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newAssetBms}
                onChange={(e) => setNewAssetBms(e.target.checked)}
                className="rounded border-slate-300 text-[#114B33] focus:ring-[#114B33]"
              />
              Active BMS / Automated Meter Gateway Connected
            </label>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28]"
            >
              Add Asset to Stage P1
            </button>
          </div>
        </form>
      )}

      {/* Telemetry Ingestion Form */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Log BFMA Operational Telemetry Reading
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Calculates Scope 1 / 2 emissions instantly and appends a SHA-256 verified lineage entry.
            </p>
          </div>
          {!canIngest && (
            <span className="text-xs font-medium text-amber-700">
              Read-only role ({role}): switch to BFMA FM Manager or Super Admin to ingest
            </span>
          )}
        </div>

        <form onSubmit={handleIngestSubmit} className="space-y-4">
          {formError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <label htmlFor="dmrv-asset-select" className="block text-xs font-medium text-slate-700 mb-1">
                Building Asset
              </label>
              <select
                id="dmrv-asset-select"
                value={resolvedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                disabled={assets.length === 0}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {assets.length === 0 ? (
                  <option value="">No assets available — onboard one above</option>
                ) : (
                  assets.map((a) => (
                    <option key={a.assetId} value={a.assetId}>
                      {a.name} ({a.stage})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="dmrv-source-select" className="block text-xs font-medium text-slate-700 mb-1">
                Capture Stream
              </label>
              <select
                id="dmrv-source-select"
                value={sourceType}
                onChange={(e) => {
                  const nextSource = e.target.value as DataSourceType;
                  setSourceType(nextSource);
                  setUnit(DEFAULT_UNITS[nextSource]);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(Object.keys(SOURCE_LABELS) as DataSourceType[]).map((key) => (
                  <option key={key} value={key}>
                    {SOURCE_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="dmrv-quantity-input" className="block text-xs font-medium text-slate-700 mb-1">
                Metered Quantity ({unit})
              </label>
              <div className="flex gap-1.5">
                <input
                  id="dmrv-quantity-input"
                  type="number"
                  step="any"
                  min={0.01}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                />
                <select
                  aria-label="Measurement unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
                  className="px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                >
                  <option value="kWh">kWh</option>
                  <option value="RT-hr">RT-hr</option>
                  <option value="Liters">Liters</option>
                  <option value="Tonnes">Tonnes</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="dmrv-period-input" className="block text-xs font-medium text-slate-700 mb-1">
                Reporting Period
              </label>
              <input
                id="dmrv-period-input"
                type="month"
                required
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-600">
              {previewCalc ? (
                <span>
                  Computed output:{' '}
                  <strong className="font-mono tabular-nums text-slate-900">
                    {previewCalc.emissionsTco2e.toFixed(3)} tCO₂e
                  </strong>{' '}
                  · {previewCalc.scope} ({tenant.emirate} emission factor)
                </span>
              ) : (
                <span>Enter a positive quantity to preview calculated emissions.</span>
              )}
            </div>
            <button
              type="submit"
              disabled={!canIngest || assets.length === 0}
              className="px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              Ingest &amp; Compute Lineage
            </button>
          </div>
        </form>
      </section>

      {/* Immutable Audit & Lineage Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search dMRV records"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by building, period, scope, or lineage hash..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114B33]/30"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto">
            {(['all', 'validated', 'pending_audit', 'flagged'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all'
                  ? 'All'
                  : tab === 'validated'
                  ? 'Validated'
                  : tab === 'pending_audit'
                  ? 'Pending Audit'
                  : 'Flagged'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Period &amp; Asset</th>
                <th className="py-3 px-4">Source / Scope</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4 text-right">Emissions (tCO₂e)</th>
                <th className="py-3 px-4">Lineage Hash</th>
                <th className="py-3 px-4">Audit State</th>
                <th className="py-3 px-6 text-right">Auditor Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No dMRV telemetry records match your current filter.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => (
                  <tr key={rec.recordId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900">{rec.assetName}</div>
                      <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                        {rec.period} · {rec.recordId}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800">{SOURCE_LABELS[rec.sourceType]}</div>
                      <div className="text-xs text-slate-500">{rec.scope}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                      {rec.quantity.toLocaleString()} {rec.unit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {rec.emissionsTco2e.toFixed(3)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      {rec.lineageHash.slice(0, 12)}…
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-medium ${
                          rec.validationStatus === 'validated'
                            ? 'text-emerald-700'
                            : rec.validationStatus === 'pending_audit'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {rec.validationStatus === 'validated'
                          ? 'Validated'
                          : rec.validationStatus === 'pending_audit'
                          ? 'Pending Audit'
                          : 'Flagged'}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {rec.validationStatus !== 'validated' && (
                          <button
                            type="button"
                            disabled={!canVerify}
                            onClick={() => onUpdateValidationStatus(rec.recordId, 'validated')}
                            aria-label={`Validate record ${rec.recordId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-300 rounded-md hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Check className="w-3 h-3" />
                            Verify
                          </button>
                        )}
                        {rec.validationStatus !== 'flagged' && (
                          <button
                            type="button"
                            disabled={!canVerify}
                            onClick={() => onUpdateValidationStatus(rec.recordId, 'flagged')}
                            aria-label={`Flag record ${rec.recordId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Flag className="w-3 h-3" />
                            Flag
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
