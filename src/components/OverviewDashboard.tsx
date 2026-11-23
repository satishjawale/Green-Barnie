import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Download, FileJson, Printer } from 'lucide-react';
import type {
  BuildingAsset,
  DmrvRecord,
  ProductStage,
  Tenant,
  UserRole,
} from '../types/domain';
import {
  assessDecreeLawRisk,
  computeMonthlyReductionSeries,
  hasPermission,
  STAGE_METADATA,
} from '../utils/dmrv';

interface OverviewDashboardProps {
  tenant: Tenant;
  assets: BuildingAsset[];
  records: DmrvRecord[];
  role: UserRole;
  sseConnected: boolean;
  onAdvanceAssetStage: (assetId: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onPrintReport: () => void;
  onNavigate: (tab: string) => void;
}

const NEXT_STAGE: Record<ProductStage, ProductStage | null> = {
  P1: 'P2',
  P2: 'P3',
  P3: 'P4',
  P4: 'P5',
  P5: null,
};

export function OverviewDashboard({
  tenant,
  assets,
  records,
  role,
  sseConnected,
  onAdvanceAssetStage,
  onExportCsv,
  onExportJson,
  onPrintReport,
  onNavigate,
}: OverviewDashboardProps) {
  const canEditAssets = hasPermission(role, 'asset:write');
  const [reductionView, setReductionView] = useState<'monthly' | 'cumulative'>('monthly');

  const kpis = useMemo(() => {
    const totalScope1 = records
      .filter((r) => r.scope === 'Scope 1')
      .reduce((s, r) => s + r.emissionsTco2e, 0);
    const totalScope2 = records
      .filter((r) => r.scope === 'Scope 2')
      .reduce((s, r) => s + r.emissionsTco2e, 0);
    const totalWaste = records
      .filter((r) => r.scope === 'Scope 3 Waste')
      .reduce((s, r) => s + r.emissionsTco2e, 0);
    const totalMetered = totalScope1 + totalScope2 + totalWaste;

    const baselineTotal = assets.reduce((s, a) => s + a.baselineEmissionsTco2e, 0);
    const currentTotal = assets.reduce((s, a) => s + a.currentEmissionsTco2e, 0);
    const reductionPct =
      baselineTotal > 0 ? ((baselineTotal - currentTotal) / baselineTotal) * 100 : 0;

    const bmsConnectedCount = assets.filter((a) => a.bmsConnected).length;
    const risk = assessDecreeLawRisk(assets, records);

    return {
      totalMetered,
      totalScope1,
      totalScope2,
      reductionPct,
      bmsConnectedCount,
      risk,
    };
  }, [assets, records]);

  const trendData = useMemo(() => {
    const byPeriod = new Map<string, { period: string; scope1: number; scope2: number; waste: number }>();
    for (const r of records) {
      const key = r.period.slice(0, 7);
      const bucket = byPeriod.get(key) ?? { period: key, scope1: 0, scope2: 0, waste: 0 };
      if (r.scope === 'Scope 1') bucket.scope1 += r.emissionsTco2e;
      else if (r.scope === 'Scope 2') bucket.scope2 += r.emissionsTco2e;
      else bucket.waste += r.emissionsTco2e;
      byPeriod.set(key, bucket);
    }
    return Array.from(byPeriod.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((d) => ({
        ...d,
        scope1: Number(d.scope1.toFixed(2)),
        scope2: Number(d.scope2.toFixed(2)),
        waste: Number(d.waste.toFixed(2)),
      }));
  }, [records]);

  const sourceBreakdown = useMemo(() => {
    const labels: Record<DmrvRecord['sourceType'], string> = {
      utility_bill: 'Utility Bills',
      bms_trend: 'BMS Trends',
      fuel_log: 'Fuel Logs',
      waste_record: 'Waste Records',
    };
    const sums: Record<DmrvRecord['sourceType'], number> = {
      utility_bill: 0,
      bms_trend: 0,
      fuel_log: 0,
      waste_record: 0,
    };
    for (const r of records) {
      sums[r.sourceType] += r.emissionsTco2e;
    }
    return (Object.keys(sums) as Array<DmrvRecord['sourceType']>).map((key) => ({
      source: labels[key],
      tco2e: Number(sums[key].toFixed(2)),
    }));
  }, [records]);

  const monthlyReductionSeries = useMemo(
    () => computeMonthlyReductionSeries(assets, records),
    [assets, records]
  );

  const reductionSummary = useMemo(() => {
    if (monthlyReductionSeries.length === 0) {
      return { latestSaved: 0, cumulativeSaved: 0, monthlyBaseline: 0, latestPct: 0 };
    }
    const latest = monthlyReductionSeries[monthlyReductionSeries.length - 1];
    return {
      latestSaved: latest.reductionTco2e,
      cumulativeSaved: latest.cumulativeReductionTco2e,
      monthlyBaseline: latest.baselineTco2e,
      latestPct: latest.reductionPct,
    };
  }, [monthlyReductionSeries]);

  return (
    <div className="space-y-8">
      {/* Page Header & Report Export Controls */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">
            {tenant.emirate} · {tenant.segment} · {tenant.rolloutPhase}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
            {tenant.name}
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
            Real-time UAE Decree-Law No. 11 (2024) Scope 1 &amp; 2 compliance telemetry, P1–P5 building progression, and verified Arknex dMRV audit lineage.
          </p>
        </div>

        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0 no-print">
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <FileJson className="w-3.5 h-3.5" />
            MOCCAE JSON
          </button>
          <button
            type="button"
            onClick={onPrintReport}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            Print PDF
          </button>
        </div>
      </div>

      {/* 4-Column Executive KPI Strip */}
      <section aria-label="Portfolio Emissions Metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="truncate">Metered dMRV Emissions</span>
            {sseConnected && (
              <span className="inline-flex items-center gap-1 text-[#114B33] font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                Live
              </span>
            )}
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {kpis.totalMetered.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
            <span className="text-sm font-sans font-normal text-slate-500">tCO₂e</span>
          </p>
          <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
            S1: {kpis.totalScope1.toFixed(1)} · S2: {kpis.totalScope2.toFixed(1)} tCO₂e
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Portfolio Reduction vs Baseline</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#114B33] mt-2">
            {kpis.reductionPct > 0 ? `-${kpis.reductionPct.toFixed(1)}%` : '0.0%'}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Across {assets.length} tracked assets · {kpis.bmsConnectedCount} BMS active
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Decree-Law No. 11 Readiness</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {kpis.risk.readinessPct}%
            </p>
            <span
              className={`text-xs font-medium ${
                kpis.risk.riskLevel === 'Low'
                  ? 'text-emerald-700'
                  : kpis.risk.riskLevel === 'Moderate'
                  ? 'text-amber-700'
                  : 'text-red-700'
              }`}
            >
              {kpis.risk.riskLevel} Penalty Risk
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
            Est. exposure band: AED {kpis.risk.estimatedExposureAed.toLocaleString()}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Verified Lineage Coverage</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {kpis.risk.validatedRatioPct}%
          </p>
          <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
            {records.filter((r) => r.validationStatus === 'validated').length} of {records.length} records audited
          </p>
        </div>
      </section>

      {/* Real-Time Data Visualizations */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Scope 1 &amp; Scope 2 Emissions Trajectory
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Monthly verified tCO₂e aggregated from BFMA field telemetry and utility invoices
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dmrv')}
              className="text-xs font-medium text-[#114B33] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 no-print"
            >
              Ingest Data
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {trendData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-lg p-6">
              <p className="text-sm font-medium text-slate-700">No telemetry records ingested yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Log a Utility Bill, BMS Trend, or Fuel Log in the dMRV Engine or via the Third-Party Sync API to populate emissions curves.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('dmrv')}
                className="mt-4 px-3.5 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28]"
              >
                Log First Telemetry Record
              </button>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scope2Fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#114B33" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#114B33" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="scope1Fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#B4832C" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#B4832C" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="scope2"
                    name="Scope 2 (Grid & BMS tCO₂e)"
                    stroke="#114B33"
                    strokeWidth={2}
                    fill="url(#scope2Fill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="scope1"
                    name="Scope 1 (Fuel tCO₂e)"
                    stroke="#B4832C"
                    strokeWidth={2}
                    fill="url(#scope1Fill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">
            BFMA Capture Streams (tCO₂e)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Emissions distribution across Utility, BMS, Fuel, and Waste feeds
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceBreakdown} layout="vertical" margin={{ top: 4, right: 16, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="source"
                  type="category"
                  width={106}
                  tick={{ fontSize: 12, fill: '#334155' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="tco2e" name="Emissions (tCO₂e)" fill="#166534" radius={[0, 6, 6, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Monthly Carbon Emission Reductions Trend Line Graph (Per Tenant) */}
      <section
        aria-label="Monthly Carbon Emission Reductions Trend"
        data-testid="monthly-reduction-chart-section"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Monthly Carbon Emission Reductions (tCO₂e)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Measured abatement vs. monthly baseline run-rate ({reductionSummary.monthlyBaseline.toLocaleString()} tCO₂e/mo) for {tenant.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
              <span>
                Latest:{' '}
                <strong className="text-[#114B33]">
                  {reductionSummary.latestSaved.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} tCO₂e
                </strong>{' '}
                ({reductionSummary.latestPct}%)
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>
                Cumulative:{' '}
                <strong className="text-slate-900">
                  {reductionSummary.cumulativeSaved.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} tCO₂e
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg no-print">
              <button
                type="button"
                onClick={() => setReductionView('monthly')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  reductionView === 'monthly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly Saved
              </button>
              <button
                type="button"
                onClick={() => setReductionView('cumulative')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  reductionView === 'cumulative'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cumulative Trend
              </button>
            </div>
          </div>
        </div>

        {monthlyReductionSeries.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-lg p-6">
            <p className="text-sm font-medium text-slate-700">
              No monthly reduction history available for {tenant.name} yet
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Ingest monthly utility bills or BMS trends in the dMRV Engine to track emission reductions against your building portfolio baseline.
            </p>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthlyReductionSeries}
                margin={{ top: 10, right: 20, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  unit=" t"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: unknown, name: unknown) => [
                    `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tCO₂e`,
                    String(name),
                  ]}
                />
                {reductionView === 'monthly' && reductionSummary.monthlyBaseline > 0 && (
                  <ReferenceLine
                    y={reductionSummary.monthlyBaseline}
                    stroke="#94A3B8"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Monthly Baseline',
                      position: 'insideTopRight',
                      fill: '#64748B',
                      fontSize: 11,
                    }}
                  />
                )}
                {reductionView === 'monthly' ? (
                  <>
                    <Line
                      type="monotone"
                      dataKey="reductionTco2e"
                      name="Monthly Reduction Saved"
                      stroke="#114B33"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#114B33', strokeWidth: 2, stroke: '#FFFFFF' }}
                      activeDot={{ r: 6, fill: '#114B33' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualTco2e"
                      name="Actual Metered Emissions"
                      stroke="#B4832C"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 3, fill: '#B4832C' }}
                    />
                  </>
                ) : (
                  <Line
                    type="monotone"
                    dataKey="cumulativeReductionTco2e"
                    name="Cumulative Emissions Avoided"
                    stroke="#114B33"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#114B33', strokeWidth: 2, stroke: '#FFFFFF' }}
                    activeDot={{ r: 6, fill: '#114B33' }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Building Portfolio Table Across P1-P5 Stages */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Tenant Building Assets &amp; P1–P5 Progression
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly isolated to tenant ID <span className="font-mono text-slate-700">{tenant.tenantId}</span> · Commercial model: {tenant.commercialModel}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Compliance Outputs: Emirate Code · MOCCAE MRV · LEED Record · Lender KPIs
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              No building assets onboarded in this isolated tenant workspace yet.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Start by nominating pilot assets (including at least one with active BMS) in the dMRV Engine or GTM Pipeline.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('dmrv')}
              className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28]"
            >
              Onboard First Asset
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Building Asset</th>
                  <th className="py-3 px-4">Product Stage</th>
                  <th className="py-3 px-4">Target Standard</th>
                  <th className="py-3 px-4">BMS Telemetry</th>
                  <th className="py-3 px-4 text-right">Current tCO₂e</th>
                  <th className="py-3 px-4 text-right">Readiness</th>
                  <th className="py-3 px-6 text-right no-print">Workflow Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {assets.map((asset) => {
                  const stageMeta = STAGE_METADATA[asset.stage];
                  const next = NEXT_STAGE[asset.stage];
                  return (
                    <tr key={asset.assetId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-slate-900">{asset.name}</div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {asset.emirate} · {asset.gfaSqm.toLocaleString()} m²
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">
                          {stageMeta.code} · {stageMeta.title}
                        </div>
                        <div className="text-xs text-slate-500">Lead: {stageMeta.lead}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">{asset.certificationTarget}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-medium ${
                            asset.bmsConnected ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {asset.bmsConnected ? 'Active BMS' : 'Manual Invoices'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                        {asset.currentEmissionsTco2e.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {asset.complianceScore}%
                      </td>
                      <td className="py-3.5 px-6 text-right no-print">
                        {next ? (
                          <button
                            type="button"
                            disabled={!canEditAssets}
                            onClick={() => onAdvanceAssetStage(asset.assetId)}
                            title={
                              canEditAssets
                                ? `Advance ${asset.name} to ${next}`
                                : 'Requires BFMA FM Manager or Super Admin role'
                            }
                            className="px-3 py-1.5 text-xs font-medium text-[#114B33] border border-[#114B33]/30 rounded-lg hover:bg-[#114B33] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                          >
                            Advance to {next}
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-emerald-700">
                            Sustained P5
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
