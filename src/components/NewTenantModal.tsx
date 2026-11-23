import React, { useState } from 'react';
import { X } from 'lucide-react';
import type {
  CommercialModel,
  Emirate,
  MarketSegment,
  RolloutPhase,
  Tenant,
} from '../types/domain';

interface NewTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (tenant: Omit<Tenant, 'ownerUid' | 'createdAt' | 'updatedAt'>) => void;
}

export function NewTenantModal({ isOpen, onClose, onCreate }: NewTenantModalProps) {
  const [name, setName] = useState('');
  const [emirate, setEmirate] = useState<Emirate>('Dubai');
  const [segment, setSegment] = useState<MarketSegment>('Hospitality / Serviced Apartments');
  const [commercialModel, setCommercialModel] = useState<CommercialModel>(
    'Option A: BFMA Prime / Arknex Sub'
  );
  const [rolloutPhase, setRolloutPhase] = useState<RolloutPhase>('Q1 2027 Dubai Launch');
  const [activeBmsCount, setActiveBmsCount] = useState('1');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      setError('Organization name must be at least 3 characters.');
      return;
    }
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    const tenantId = `tenant_${slug || 'org'}_${Date.now().toString(36).slice(-4)}`;
    const bmsNum = Math.max(0, Math.min(500, Number(activeBmsCount) || 0));

    onCreate({
      tenantId,
      name: trimmed,
      emirate,
      segment,
      commercialModel,
      rolloutPhase,
      activeBmsCount: bmsNum,
      status: 'active',
    });

    setName('');
    setActiveBmsCount('1');
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-tenant-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="new-tenant-title" className="text-lg font-bold text-slate-900">
              Provision New Tenant Workspace
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Creates an isolated tenant boundary, RBAC scope, and dedicated dMRV Sync API key.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="tenant-name-input" className="block text-sm font-medium text-slate-700 mb-1">
              Organization / Portfolio Name
            </label>
            <input
              id="tenant-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g., Jebel Ali Cold Chain Hub"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114B33]/30 focus:border-[#114B33]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tenant-emirate-select" className="block text-sm font-medium text-slate-700 mb-1">
                Primary Emirate
              </label>
              <select
                id="tenant-emirate-select"
                value={emirate}
                onChange={(e) => setEmirate(e.target.value as Emirate)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#114B33]/30 focus:border-[#114B33]"
              >
                <option value="Dubai">Dubai</option>
                <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                <option value="Fujairah">Fujairah</option>
                <option value="Abu Dhabi">Abu Dhabi</option>
                <option value="Sharjah">Sharjah</option>
              </select>
            </div>

            <div>
              <label htmlFor="tenant-bms-input" className="block text-sm font-medium text-slate-700 mb-1">
                Active BMS Sites
              </label>
              <input
                id="tenant-bms-input"
                type="number"
                min={0}
                max={500}
                value={activeBmsCount}
                onChange={(e) => setActiveBmsCount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#114B33]/30 focus:border-[#114B33]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="tenant-segment-select" className="block text-sm font-medium text-slate-700 mb-1">
              Target Market Segment
            </label>
            <select
              id="tenant-segment-select"
              value={segment}
              onChange={(e) => setSegment(e.target.value as MarketSegment)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#114B33]/30 focus:border-[#114B33]"
            >
              <option value="Hospitality / Serviced Apartments">Hospitality / Serviced Apartments</option>
              <option value="Industrial / Logistics / Ports">Industrial / Logistics / Ports</option>
              <option value="Residential Tower Associations">Residential Tower Associations</option>
              <option value="Government / Semi-Government">Government / Semi-Government</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tenant-commercial-select" className="block text-sm font-medium text-slate-700 mb-1">
                Commercial Structure
              </label>
              <select
                id="tenant-commercial-select"
                value={commercialModel}
                onChange={(e) => setCommercialModel(e.target.value as CommercialModel)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#114B33]/30 focus:border-[#114B33]"
              >
                <option value="Option A: BFMA Prime / Arknex Sub">Option A: BFMA Prime / Arknex Sub</option>
                <option value="Option B: Separate Contracts">Option B: Separate Contracts</option>
                <option value="Option C: Joint Venture">Option C: Joint Venture</option>
              </select>
            </div>

            <div>
              <label htmlFor="tenant-phase-select" className="block text-sm font-medium text-slate-700 mb-1">
                Rollout Phase
              </label>
              <select
                id="tenant-phase-select"
                value={rolloutPhase}
                onChange={(e) => setRolloutPhase(e.target.value as RolloutPhase)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#114B33]/30 focus:border-[#114B33]"
              >
                <option value="Q4 2026 Pilot Prep">Q4 2026 Pilot Prep</option>
                <option value="Q1 2027 Dubai Launch">Q1 2027 Dubai Launch</option>
                <option value="Q2 2027 RAK Launch">Q2 2027 RAK Launch</option>
                <option value="Q3 2027 Fujairah Launch">Q3 2027 Fujairah Launch</option>
                <option value="Q4 2027+ Scale">Q4 2027+ Scale</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] transition-colors"
            >
              Create Isolated Tenant
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
