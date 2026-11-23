import React, { useState } from 'react';
import { Check, Plus, ShieldCheck, UserPlus, X } from 'lucide-react';
import type {
  OrganizationSide,
  PermissionAction,
  Tenant,
  TenantMember,
  UserRole,
} from '../types/domain';
import { hasPermission } from '../utils/dmrv';

interface TenantsRbacViewProps {
  tenants: Tenant[];
  activeTenantId: string;
  members: TenantMember[];
  currentRole: UserRole;
  isAuthenticated: boolean;
  onSelectTenant: (tenantId: string) => void;
  onOpenNewTenantModal: () => void;
  onChangeSimulatedRole: (role: UserRole) => void;
  onAddMember: (input: {
    displayName: string;
    email: string;
    role: UserRole;
    organization: OrganizationSide;
  }) => void;
  onUpdateMemberRole: (uid: string, role: UserRole) => void;
  onToggleMemberStatus: (uid: string) => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  bfma_fm_manager: 'BFMA FM Manager',
  arknex_auditor: 'Arknex Carbon Auditor',
  tenant_viewer: 'Tenant Viewer',
};

const ALL_ACTIONS: Array<{ action: PermissionAction; label: string }> = [
  { action: 'tenant:create', label: 'Provision new isolated tenants' },
  { action: 'tenant:manage_members', label: 'Assign & revoke tenant RBAC roles' },
  { action: 'asset:write', label: 'Onboard buildings & advance P1–P5 stage' },
  { action: 'dmrv:ingest', label: 'Ingest Utility, BMS, Fuel & Waste data' },
  { action: 'dmrv:verify', label: 'Verify or flag dMRV audit lineage' },
  { action: 'sprint:write', label: 'Create & move Agile sprint tasks' },
  { action: 'sync:manage_keys', label: 'View & rotate Third-Party Sync API keys' },
  { action: 'report:export', label: 'Export CSV, MOCCAE JSON & PDF reports' },
];

export function TenantsRbacView({
  tenants,
  activeTenantId,
  members,
  currentRole,
  isAuthenticated,
  onSelectTenant,
  onOpenNewTenantModal,
  onChangeSimulatedRole,
  onAddMember,
  onUpdateMemberRole,
  onToggleMemberStatus,
}: TenantsRbacViewProps) {
  const canCreateTenant = hasPermission(currentRole, 'tenant:create');
  const canManageMembers = hasPermission(currentRole, 'tenant:manage_members');

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('bfma_fm_manager');
  const [organization, setOrganization] = useState<OrganizationSide>('BFMA');
  const [inviteError, setInviteError] = useState('');

  const activeTenant = tenants.find((t) => t.tenantId === activeTenantId) ?? tenants[0];

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMembers) {
      setInviteError('Only Super Admin users can assign tenant memberships.');
      return;
    }
    if (displayName.trim().length < 2 || !email.includes('@')) {
      setInviteError('Enter a valid name and work email address.');
      return;
    }
    onAddMember({
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      role: inviteRole,
      organization,
    });
    setDisplayName('');
    setEmail('');
    setInviteError('');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Multi-Tenancy &amp; Zero-Trust Isolation
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Tenants &amp; Role-Based Access Control (RBAC)
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Provision isolated tenant instances with dedicated <span className="font-mono text-slate-800">tenant_id</span> boundaries, team permissions, and audit accountability.
          </p>
        </div>

        <button
          type="button"
          disabled={!canCreateTenant}
          onClick={onOpenNewTenantModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Provision New Tenant
        </button>
      </div>

      {/* Role Context & RBAC Preview Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#114B33] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Active Session Role: {ROLE_LABELS[currentRole]}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAuthenticated
                ? 'Enforced by Firebase Authentication and tenant-scoped Firestore security rules.'
                : 'Preview workspace mode — switch roles below to test live RBAC guardrails across every view.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="rbac-role-switcher" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Active Role:
          </label>
          <select
            id="rbac-role-switcher"
            value={currentRole}
            onChange={(e) => onChangeSimulatedRole(e.target.value as UserRole)}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-900"
          >
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Multi-Tenant Directory */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Provisioned Tenant Instances ({tenants.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Switching tenants isolates all KPIs, building assets, dMRV records, Agile sprints, and Sync API keys
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-6">Tenant Organization</th>
                <th className="py-3 px-4">Isolation Key</th>
                <th className="py-3 px-4">Emirate &amp; Segment</th>
                <th className="py-3 px-4">Rollout Phase</th>
                <th className="py-3 px-6 text-right">Workspace Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => {
                const isActive = t.tenantId === activeTenantId;
                return (
                  <tr
                    key={t.tenantId}
                    className={isActive ? 'bg-emerald-50/40' : 'hover:bg-slate-50/60'}
                  >
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.commercialModel}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">{t.tenantId}</td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800">{t.emirate}</div>
                      <div className="text-xs text-slate-500">{t.segment}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700">{t.rolloutPhase}</td>
                    <td className="py-3.5 px-6 text-right">
                      {isActive ? (
                        <span className="text-xs font-semibold text-[#114B33]">Active Workspace</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectTenant(t.tenantId)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-white transition-colors"
                        >
                          Switch Tenant
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Tenant Members & Invite Form */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Team Members — {activeTenant.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Revoking a member synchronously terminates access to all assets and dMRV subcollections
          </p>
        </div>

        <form onSubmit={handleInvite} className="p-6 bg-slate-50/50 border-b border-slate-200 space-y-3">
          {inviteError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {inviteError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              type="text"
              aria-label="Member full name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Full name"
              className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            />
            <input
              type="email"
              aria-label="Member email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Work email"
              className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            />
            <select
              aria-label="Member organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value as OrganizationSide)}
              className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="BFMA">BFMA</option>
              <option value="Arknex">Arknex</option>
              <option value="Client">Client</option>
            </select>
            <select
              aria-label="Assigned RBAC role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!canManageMembers}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Assign Member
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-6">User</th>
                <th className="py-3 px-4">Organization</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Access State</th>
                <th className="py-3 px-6 text-right">Governance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={`${m.tenantId}_${m.uid}`}>
                  <td className="py-3.5 px-6">
                    <div className="font-medium text-slate-900">{m.displayName}</div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">{m.organization}</td>
                  <td className="py-3.5 px-4">
                    <select
                      aria-label={`Change role for ${m.displayName}`}
                      disabled={!canManageMembers}
                      value={m.role}
                      onChange={(e) => onUpdateMemberRole(m.uid, e.target.value as UserRole)}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white disabled:opacity-60"
                    >
                      {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`text-xs font-medium ${
                        m.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {m.status === 'active' ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      type="button"
                      disabled={!canManageMembers}
                      onClick={() => onToggleMemberStatus(m.uid)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
                    >
                      {m.status === 'active' ? 'Revoke Access' : 'Restore Access'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* RBAC Permission Matrix */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Role-Based Access Control (RBAC) Permission Matrix
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-6">Capability</th>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <th key={r} className="py-3 px-4 text-center">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ALL_ACTIONS.map(({ action, label }) => (
                <tr key={action}>
                  <td className="py-3 px-6 text-slate-800">{label}</td>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => {
                    const allowed = hasPermission(r, action);
                    return (
                      <td key={r} className="py-3 px-4 text-center">
                        {allowed ? (
                          <Check className="w-4 h-4 text-[#114B33] mx-auto" aria-label="Allowed" />
                        ) : (
                          <X className="w-4 h-4 text-slate-300 mx-auto" aria-label="Denied" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
