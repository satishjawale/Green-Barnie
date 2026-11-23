import React, { useState } from 'react';
import { Send } from 'lucide-react';
import type { BuildingAsset, DmrvRecord, Tenant } from '../types/domain';

interface ComplianceAdvisorViewProps {
  tenant: Tenant;
  assets: BuildingAsset[];
  records: DmrvRecord[];
}

const PRESET_QUERIES = [
  'Model our UAE Decree-Law No. 11 (2024) penalty exposure and sequence P1 to P4 actions across our buildings to reach >90% MOCCAE MRV readiness before Q1 2027.',
  "Compare Al Sa'fat, Barjeel, and LEED O+M audit evidence requirements for our current portfolio and identify gaps in our BMS vs manual utility feeds.",
  'Design an Option A (BFMA prime / Arknex sub-consultant) lighting, HVAC, and solar retrofit plan with risk mitigations so no unverified energy savings guarantees are made.',
];

export function ComplianceAdvisorView({
  tenant,
  assets,
  records,
}: ComplianceAdvisorViewProps) {
  const [question, setQuestion] = useState(PRESET_QUERIES[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    analysis: string;
    model: string;
    thinkingLevel: string;
    generatedAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 5) return;
    setLoading(true);
    setError(null);

    try {
      const totalScope1 = records
        .filter((r) => r.scope === 'Scope 1')
        .reduce((s, r) => s + r.emissionsTco2e, 0);
      const totalScope2 = records
        .filter((r) => r.scope === 'Scope 2')
        .reduce((s, r) => s + r.emissionsTco2e, 0);

      const res = await fetch('/api/v1/compliance/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName: tenant.name,
          emirate: tenant.emirate,
          segment: tenant.segment,
          question: question.trim(),
          assetsSummary: assets.map((a) => ({
            name: a.name,
            stage: a.stage,
            certificationTarget: a.certificationTarget,
            bmsConnected: a.bmsConnected,
            complianceScore: a.complianceScore,
            baselineTco2e: a.baselineEmissionsTco2e,
            currentTco2e: a.currentEmissionsTco2e,
          })),
          emissionsSummary: {
            recordCount: records.length,
            totalScope1Tco2e: Number(totalScope1.toFixed(2)),
            totalScope2Tco2e: Number(totalScope2.toFixed(2)),
            validatedCount: records.filter((r) => r.validationStatus === 'validated').length,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Unable to run compliance reasoning query.');
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error calling compliance engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-slate-500">
          Deep-Thinking Emissions Strategy · High Reasoning Mode
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
          Decree-Law No. 11 &amp; Carbon Audit Advisor
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Run complex multi-asset compliance modeling, retrofit sequencing, and regulatory gap analysis grounded in {tenant.name}&apos;s live telemetry.
        </p>
      </div>

      {/* Prompt Form */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">
            Complex Regulatory Scenarios
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_QUERIES.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuestion(preset)}
                className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50/50 hover:border-[#114B33]/30 text-slate-700 transition-colors"
              >
                Scenario {idx + 1}: {preset.slice(0, 68)}…
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAnalyze} className="space-y-4">
          <div>
            <label htmlFor="compliance-query-input" className="block text-xs font-medium text-slate-700 mb-1.5">
              Compliance &amp; Decarbonization Query (grounded with {assets.length} assets and {records.length} dMRV records)
            </label>
            <textarea
              id="compliance-query-input"
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a complex UAE regulatory, carbon accounting, or retrofit planning question..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114B33]/30 focus:border-[#114B33]"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Engine: High-Thinking Compliance Reasoning (<span className="font-mono">gemini-4-carbon</span>)
            </p>
            <button
              type="submit"
              disabled={loading || question.trim().length < 5}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              {loading ? 'Running Deep Analysis...' : 'Run Compliance Analysis'}
            </button>
          </div>
        </form>
      </section>

      {/* Error State */}
      {error && (
        <section
          role="alert"
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900"
        >
          <h2 className="font-semibold text-amber-950">Deep-Thinking Analysis Unavailable</h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">{error}</p>
        </section>
      )}

      {/* Analysis Result */}
      {result && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Advisory Memorandum — {tenant.name}
            </h2>
            <span className="text-xs font-mono text-slate-500">
              {result.model} · Thinking: {result.thinkingLevel}
            </span>
          </div>
          <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {result.analysis}
          </div>
        </section>
      )}
    </div>
  );
}
