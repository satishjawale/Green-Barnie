import React, { useState } from 'react';
import { CheckSquare, Maximize2, Square, X } from 'lucide-react';
import {
  IMPLEMENTATION_ROADMAP,
  KEY_RISKS_REGISTER,
  MARKET_OPPORTUNITY_MATRIX,
} from '../data/seedData';
import type {
  BuildingAsset,
  PilotChecklistItem,
  ProductStage,
  Tenant,
} from '../types/domain';
import { STAGE_METADATA } from '../utils/dmrv';

interface GtmStrategyViewProps {
  tenant: Tenant;
  assets: BuildingAsset[];
  checklist: PilotChecklistItem[];
  onToggleChecklistItem: (id: string) => void;
}

const STAGES: ProductStage[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

export function GtmStrategyView({
  tenant,
  assets,
  checklist,
  onToggleChecklistItem,
}: GtmStrategyViewProps) {
  const [blueprintExpanded, setBlueprintExpanded] = useState(false);

  const completedCount = checklist.filter((c) => c.completed).length;
  const checklistPct =
    checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Strategic Partnership Workflow · {tenant.commercialModel}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Arknex &amp; BFMA Green Building GTM Blueprint
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Turn BFMA&apos;s existing 24/7 facility management customer base into a recurring green-compliance business with Arknex as the carbon-accounting and dMRV engine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBlueprintExpanded(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#114B33] bg-white border border-[#114B33]/30 rounded-lg hover:bg-emerald-50/50 transition-colors whitespace-nowrap shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Inspect Source Workflow Poster
        </button>
      </div>

      {/* UAE Regulatory Opportunity Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Federal Mandate</p>
          <p className="text-lg font-bold text-slate-900 mt-1">Decree-Law No. 11 (2024)</p>
          <p className="text-xs text-slate-600 mt-1">Mandatory Scope 1 &amp; 2 emissions reporting</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Non-Compliance Penalties</p>
          <p className="text-lg font-bold font-mono tabular-nums text-red-700 mt-1">
            AED 50k – 2.0M
          </p>
          <p className="text-xs text-slate-600 mt-1">Enforced for missing or unverified MRV</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Dubai Target</p>
          <p className="text-lg font-bold font-mono tabular-nums text-[#114B33] mt-1">
            30,000 Retrofits
          </p>
          <p className="text-xs text-slate-600 mt-1">Al Sa&apos;fat &amp; building retrofits by 2030</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Ras Al Khaimah Target</p>
          <p className="text-lg font-bold font-mono tabular-nums text-[#114B33] mt-1">
            3,000 Buildings
          </p>
          <p className="text-xs text-slate-600 mt-1">Barjeel &amp; Reem green rules by 2040</p>
        </div>
      </section>

      {/* Five-Stage Product Offering (P1-P5) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-900">
            Five-Stage Product Offering (P1 – P5)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active distribution of {tenant.name}&apos;s {assets.length} assets across commercial compliance stages
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {STAGES.map((code) => {
            const meta = STAGE_METADATA[code];
            const count = assets.filter((a) => a.stage === code).length;
            return (
              <div
                key={code}
                className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between bg-slate-50/40"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono font-bold text-[#114B33]">{code}</span>
                    <span className="text-xs text-slate-500">{meta.lead}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mt-2">{meta.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{meta.subtitle}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Tenant Assets</span>
                  <span className="font-mono tabular-nums font-bold text-slate-900">{count}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Two-Column: Interactive Pilot Initiation Checklist + 24-Month Roadmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Pilot Initiation Checklist
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Interactive readiness gate for 24-month Option A pilot launch
              </p>
            </div>
            <span className="text-sm font-mono tabular-nums font-bold text-[#114B33]">
              {completedCount}/{checklist.length} ({checklistPct}%)
            </span>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-5">
            <div
              className="h-full bg-[#114B33] transition-all duration-200"
              style={{ width: `${checklistPct}%` }}
            />
          </div>

          <ul className="divide-y divide-slate-100">
            {checklist.map((item) => (
              <li key={item.id} className="py-3">
                <button
                  type="button"
                  onClick={() => onToggleChecklistItem(item.id)}
                  className="w-full flex items-start gap-3 text-left group"
                >
                  {item.completed ? (
                    <CheckSquare className="w-4 h-4 text-[#114B33] mt-0.5 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 group-hover:text-slate-600 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        item.completed ? 'line-through text-slate-400' : 'text-slate-800'
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Owner: {item.owner} · Target: {item.targetQuarter}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">
            24-Month Geographic Rollout Roadmap
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-5">
            Phased emirate expansion across Dubai, Ras Al Khaimah, and Fujairah
          </p>

          <ol className="space-y-4">
            {IMPLEMENTATION_ROADMAP.map((step, idx) => (
              <li key={step.quarter} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                      idx === 0
                        ? 'bg-[#114B33] text-white'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {idx < IMPLEMENTATION_ROADMAP.length - 1 && (
                    <div className="w-px flex-1 bg-slate-200 my-1" />
                  )}
                </div>
                <div className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-[#114B33]">
                      {step.quarter}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{step.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Market Opportunity Matrix & Option A Commercial Terms + Risks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Target Markets &amp; Emirate Focus Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Highest initial opportunity: Hospitality and Industrial customers
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-3 px-6">Segment</th>
                  <th className="py-3 px-4">Dubai</th>
                  <th className="py-3 px-4">Ras Al Khaimah</th>
                  <th className="py-3 px-4">Fujairah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MARKET_OPPORTUNITY_MATRIX.map((row) => (
                  <tr key={row.segment}>
                    <td className="py-3 px-6 font-medium text-slate-900">{row.segment}</td>
                    {([row.dubai, row.rak, row.fujairah] as const).map((val, i) => (
                      <td key={i} className="py-3 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            val === 'High'
                              ? 'text-[#114B33]'
                              : val === 'Medium'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {val}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">
            Commercial Structure &amp; Key Risks
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Recommended pilot: Option A (BFMA prime contractor · Arknex sub-consultant · 24-month initial term)
          </p>
          <div className="space-y-3">
            {KEY_RISKS_REGISTER.map((item) => (
              <div key={item.risk} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">{item.risk}</span>
                  <span className="text-xs text-slate-500">Owner: {item.owner}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{item.mitigation}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Reference Source Document Preview */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Source Strategic Blueprint Reference
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Official Arknex &amp; BFMA Green Building GTM visual specification embedded for stakeholder alignment
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBlueprintExpanded(true)}
            className="text-xs font-medium text-[#114B33] hover:underline"
          >
            Open Full View
          </button>
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 max-h-96 flex items-center justify-center">
          <img
            src="/assets/aistudio/Arknex___BFMA_Green_Building_GTM_014dbd20.png"
            alt="Arknex and BFMA Green Building GTM Strategic Partnership Blueprint"
            referrerPolicy="no-referrer"
            className="w-full h-auto max-h-96 object-contain"
          />
        </div>
      </section>

      {blueprintExpanded && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Full Arknex and BFMA GTM Blueprint"
        >
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-900">
                Arknex &amp; BFMA Green Building GTM Blueprint
              </span>
              <button
                type="button"
                onClick={() => setBlueprintExpanded(false)}
                aria-label="Close blueprint viewer"
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 bg-slate-50">
              <img
                src="/assets/aistudio/Arknex___BFMA_Green_Building_GTM_014dbd20.png"
                alt="Full view of Arknex and BFMA Green Building GTM Strategic Partnership Blueprint"
                referrerPolicy="no-referrer"
                className="w-full h-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
