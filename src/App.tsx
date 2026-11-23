import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Building2,
  Compass,
  Kanban,
  LogIn,
  LogOut,
  Menu,
  Plus,
  PlugZap,
  Shield,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  SEED_ASSETS,
  SEED_DMRV_RECORDS,
  SEED_MEMBERS,
  SEED_PILOT_CHECKLIST,
  SEED_SPRINT_TASKS,
  SEED_TENANTS,
} from './data/seedData';
import type {
  BuildingAsset,
  CertificationTarget,
  DataSourceType,
  DmrvRecord,
  MeasurementUnit,
  OrganizationSide,
  PilotChecklistItem,
  PriorityLevel,
  ProductStage,
  SprintStatus,
  SprintTask,
  Tenant,
  TenantMember,
  UserRole,
} from './types/domain';
import {
  calculateEmissionsTco2e,
  computeLineageHash,
  filterByTenant,
  hasPermission,
  serializeToCsv,
} from './utils/dmrv';
import {
  db,
  doc,
  handleFirestoreError,
  OperationType,
  serverTimestamp,
  setDoc,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  updateDoc,
} from './lib/firebase';
import { OverviewDashboard } from './components/OverviewDashboard';
import { DmrvEngineView } from './components/DmrvEngineView';
import { GtmStrategyView } from './components/GtmStrategyView';
import { AgileSprintsView } from './components/AgileSprintsView';
import { TenantsRbacView } from './components/TenantsRbacView';
import { ApiSyncView } from './components/ApiSyncView';
import { ComplianceAdvisorView } from './components/ComplianceAdvisorView';
import { DeveloperDocsView } from './components/DeveloperDocsView';
import { NewTenantModal } from './components/NewTenantModal';

type NavTabId =
  | 'overview'
  | 'dmrv'
  | 'gtm'
  | 'sprints'
  | 'tenants'
  | 'sync'
  | 'advisor'
  | 'docs';

const NAV_ITEMS: Array<{
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'dmrv', label: 'dMRV Engine', icon: Activity },
  { id: 'gtm', label: 'GTM Strategy', icon: Compass },
  { id: 'sprints', label: 'Agile Sprints', icon: Kanban },
  { id: 'tenants', label: 'Tenants & RBAC', icon: Shield },
  { id: 'sync', label: 'API Sync', icon: PlugZap },
  { id: 'advisor', label: 'Compliance Advisor', icon: BrainCircuit },
  { id: 'docs', label: 'Docs & cPanel', icon: BookOpen },
];

const NEXT_STAGE: Record<ProductStage, ProductStage> = {
  P1: 'P2',
  P2: 'P3',
  P3: 'P4',
  P4: 'P5',
  P5: 'P5',
};

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newTenantModalOpen, setNewTenantModalOpen] = useState(false);

  // Auth State (Firebase Google Login)
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Multi-Tenant Isolated Application State
  const [tenants, setTenants] = useState<Tenant[]>(SEED_TENANTS);
  const [activeTenantId, setActiveTenantId] = useState<string>(SEED_TENANTS[0].tenantId);
  const [members, setMembers] = useState<TenantMember[]>(SEED_MEMBERS);
  const [assets, setAssets] = useState<BuildingAsset[]>(SEED_ASSETS);
  const [records, setRecords] = useState<DmrvRecord[]>(SEED_DMRV_RECORDS);
  const [sprintTasks, setSprintTasks] = useState<SprintTask[]>(SEED_SPRINT_TASKS);
  const [checklist, setChecklist] = useState<PilotChecklistItem[]>(SEED_PILOT_CHECKLIST);

  // Active RBAC Role (defaults to super_admin in workspace; can be switched in RBAC panel)
  const [currentRole, setCurrentRole] = useState<UserRole>('super_admin');
  const [sseConnected, setSseConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 3500);
  };

  // Subscribe to Firebase Authentication
  useEffect(() => {
    const unsub = subscribeAuth((user) => {
      setAuthUser(user);
      if (user?.email === 'satish.jawale@gmail.com') {
        setCurrentRole('super_admin');
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to Real-Time Server-Sent Events Stream strictly scoped to activeTenantId
  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource(`/api/v1/stream/${encodeURIComponent(activeTenantId)}`);
      source.addEventListener('connected', () => {
        setSseConnected(true);
      });
      source.addEventListener('dmrv_ingested', (event) => {
        try {
          const incoming = JSON.parse((event as MessageEvent).data) as DmrvRecord;
          if (incoming.tenantId === activeTenantId) {
            setRecords((prev) => {
              if (prev.some((r) => r.recordId === incoming.recordId)) return prev;
              return [incoming, ...prev];
            });
          }
        } catch {
          // Ignore malformed stream frame
        }
      });
      source.onerror = () => {
        setSseConnected(false);
      };
    } catch {
      setSseConnected(false);
    }

    return () => {
      source?.close();
      setSseConnected(false);
    };
  }, [activeTenantId]);

  const activeTenant = useMemo(
    () => tenants.find((t) => t.tenantId === activeTenantId) ?? tenants[0],
    [tenants, activeTenantId]
  );

  // Strict Tenant-Isolated Projections
  const tenantAssets = useMemo(
    () => filterByTenant(assets, activeTenant.tenantId),
    [assets, activeTenant.tenantId]
  );
  const tenantRecords = useMemo(
    () => filterByTenant(records, activeTenant.tenantId),
    [records, activeTenant.tenantId]
  );
  const tenantTasks = useMemo(
    () => filterByTenant(sprintTasks, activeTenant.tenantId),
    [sprintTasks, activeTenant.tenantId]
  );
  const tenantMembers = useMemo(
    () => filterByTenant(members, activeTenant.tenantId),
    [members, activeTenant.tenantId]
  );

  // --- Auth Handlers ---
  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      const user = await signInWithGoogle();
      notify(`Signed in as ${user.displayName || user.email}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled';
      notify(`Authentication notice: ${msg}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutUser();
      notify('Signed out — returned to local workspace preview');
    } finally {
      setAuthBusy(false);
    }
  };

  // --- Tenant Creation (Multi-Tenancy) ---
  const handleCreateTenant = async (
    input: Omit<Tenant, 'ownerUid' | 'createdAt' | 'updatedAt'>
  ) => {
    const now = new Date().toISOString();
    const ownerUid = authUser?.uid ?? 'usr_satish_admin';
    const created: Tenant = {
      ...input,
      ownerUid,
      createdAt: now,
      updatedAt: now,
    };

    setTenants((prev) => [created, ...prev]);
    setMembers((prev) => [
      {
        uid: ownerUid,
        tenantId: created.tenantId,
        displayName: authUser?.displayName || 'Satish Jawale',
        email: authUser?.email || 'satish.jawale@gmail.com',
        role: 'super_admin',
        organization: 'Arknex',
        status: 'active',
        lastActive: now,
      },
      ...prev,
    ]);
    setActiveTenantId(created.tenantId);

    // Register isolated tenant in backend sync engine
    fetch('/api/v1/tenants/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created),
    }).catch((err) => console.warn('Sync registry warning:', err));

    // Persist to Cloud Firestore when authenticated
    if (authUser) {
      const tenantPath = `tenants/${created.tenantId}`;
      try {
        await setDoc(doc(db, 'tenants', created.tenantId), {
          ...created,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, tenantPath);
      }
    }

    notify(`Provisioned isolated tenant "${created.name}" (${created.tenantId})`);
  };

  // --- Asset Operations ---
  const handleAddAsset = async (input: {
    name: string;
    gfaSqm: number;
    certificationTarget: CertificationTarget;
    bmsConnected: boolean;
  }) => {
    const now = new Date().toISOString();
    const assetId = `asset_${Date.now().toString(36)}`;
    const newAsset: BuildingAsset = {
      assetId,
      tenantId: activeTenant.tenantId,
      name: input.name,
      emirate: activeTenant.emirate,
      gfaSqm: input.gfaSqm,
      stage: 'P1',
      certificationTarget: input.certificationTarget,
      bmsConnected: input.bmsConnected,
      baselineEmissionsTco2e: Math.round(input.gfaSqm * 0.055),
      currentEmissionsTco2e: Math.round(input.gfaSqm * 0.055),
      complianceScore: input.bmsConnected ? 72 : 55,
      createdByUid: authUser?.uid ?? 'usr_satish_admin',
      createdAt: now,
      updatedAt: now,
    };

    setAssets((prev) => [newAsset, ...prev]);

    if (authUser) {
      const path = `tenants/${activeTenant.tenantId}/assets/${assetId}`;
      try {
        await setDoc(doc(db, 'tenants', activeTenant.tenantId, 'assets', assetId), {
          ...newAsset,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }

    notify(`Onboarded "${newAsset.name}" into Stage P1`);
  };

  const handleAdvanceAssetStage = async (assetId: string) => {
    const target = assets.find((a) => a.assetId === assetId && a.tenantId === activeTenant.tenantId);
    if (!target) return;
    const nextStage = NEXT_STAGE[target.stage];
    const nextScore = Math.min(98, target.complianceScore + 7);
    const now = new Date().toISOString();

    setAssets((prev) =>
      prev.map((a) =>
        a.assetId === assetId
          ? { ...a, stage: nextStage, complianceScore: nextScore, updatedAt: now }
          : a
      )
    );

    if (authUser) {
      const path = `tenants/${activeTenant.tenantId}/assets/${assetId}`;
      try {
        await updateDoc(doc(db, 'tenants', activeTenant.tenantId, 'assets', assetId), {
          stage: nextStage,
          complianceScore: nextScore,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Cloud asset update skipped for local seed item:', path, err);
      }
    }

    notify(`Advanced "${target.name}" to Stage ${nextStage}`);
  };

  // --- dMRV Telemetry Operations ---
  const handleAddDmrvRecord = async (input: {
    assetId: string;
    assetName: string;
    sourceType: DataSourceType;
    quantity: number;
    unit: MeasurementUnit;
    period: string;
  }) => {
    const now = new Date().toISOString();
    const calc = calculateEmissionsTco2e(
      input.sourceType,
      input.quantity,
      activeTenant.emirate,
      input.unit
    );
    const recordId = `rec_${Date.now().toString(36)}`;
    const lineageHash = computeLineageHash({
      tenantId: activeTenant.tenantId,
      assetId: input.assetId,
      sourceType: input.sourceType,
      quantity: input.quantity,
      period: input.period,
      timestamp: now,
    });

    const created: DmrvRecord = {
      recordId,
      tenantId: activeTenant.tenantId,
      assetId: input.assetId,
      assetName: input.assetName,
      sourceType: input.sourceType,
      scope: calc.scope,
      quantity: input.quantity,
      unit: calc.resolvedUnit,
      emissionsTco2e: calc.emissionsTco2e,
      validationStatus: 'pending_audit',
      lineageHash,
      period: input.period,
      createdByUid: authUser?.uid ?? 'usr_satish_admin',
      createdAt: now,
    };

    setRecords((prev) => [created, ...prev]);

    if (authUser) {
      const path = `tenants/${activeTenant.tenantId}/dmrv_records/${recordId}`;
      try {
        await setDoc(doc(db, 'tenants', activeTenant.tenantId, 'dmrv_records', recordId), {
          ...created,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }

    notify(`Ingested ${created.emissionsTco2e.toFixed(2)} tCO₂e (${created.scope}) with lineage ${lineageHash.slice(0, 8)}`);
  };

  const handleUpdateValidationStatus = (
    recordId: string,
    validationStatus: DmrvRecord['validationStatus']
  ) => {
    setRecords((prev) =>
      prev.map((r) => (r.recordId === recordId ? { ...r, validationStatus } : r))
    );
    notify(`Record ${recordId} marked as ${validationStatus.replace('_', ' ')}`);
  };

  const handleSyncedRecordReceived = (record: DmrvRecord) => {
    setRecords((prev) => {
      if (prev.some((r) => r.recordId === record.recordId)) return prev;
      return [record, ...prev];
    });
    notify(`Third-Party Sync ingested ${record.emissionsTco2e.toFixed(2)} tCO₂e`);
  };

  // --- Agile Sprint Operations ---
  const handleAddSprintTask = (input: {
    sprintName: string;
    title: string;
    stage: ProductStage;
    ownerTeam: 'BFMA' | 'Arknex' | 'Joint';
    storyPoints: number;
    priority: PriorityLevel;
  }) => {
    const now = new Date().toISOString();
    const created: SprintTask = {
      taskId: `task_${Date.now().toString(36)}`,
      tenantId: activeTenant.tenantId,
      sprintName: input.sprintName,
      title: input.title,
      stage: input.stage,
      ownerTeam: input.ownerTeam,
      status: 'backlog',
      storyPoints: input.storyPoints,
      priority: input.priority,
      createdByUid: authUser?.uid ?? 'usr_satish_admin',
      createdAt: now,
      updatedAt: now,
    };
    setSprintTasks((prev) => [created, ...prev]);
    notify(`Added "${created.title}" to Sprint Backlog`);
  };

  const handleMoveSprintTask = (taskId: string, status: SprintStatus) => {
    setSprintTasks((prev) =>
      prev.map((t) =>
        t.taskId === taskId ? { ...t, status, updatedAt: new Date().toISOString() } : t
      )
    );
  };

  const handleDeleteSprintTask = (taskId: string) => {
    setSprintTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    notify('Removed sprint backlog item');
  };

  // --- RBAC Team Management ---
  const handleAddMember = (input: {
    displayName: string;
    email: string;
    role: UserRole;
    organization: OrganizationSide;
  }) => {
    const created: TenantMember = {
      uid: `usr_${Date.now().toString(36)}`,
      tenantId: activeTenant.tenantId,
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      organization: input.organization,
      status: 'active',
      lastActive: new Date().toISOString(),
    };
    setMembers((prev) => [created, ...prev]);
    notify(`Assigned ${created.displayName} to ${activeTenant.name}`);
  };

  const handleUpdateMemberRole = (uid: string, role: UserRole) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.uid === uid && m.tenantId === activeTenant.tenantId ? { ...m, role } : m
      )
    );
    notify('Updated team member RBAC role');
  };

  const handleToggleMemberStatus = (uid: string) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.uid === uid && m.tenantId === activeTenant.tenantId
          ? { ...m, status: m.status === 'active' ? 'revoked' : 'active' }
          : m
      )
    );
  };

  // --- Report Export Handlers ---
  const handleExportEmissionsCsv = () => {
    const csv = serializeToCsv(
      [
        'Record ID',
        'Tenant ID',
        'Asset Name',
        'Period',
        'Source Type',
        'Scope',
        'Quantity',
        'Unit',
        'Emissions (tCO2e)',
        'Audit Status',
        'SHA-256 Lineage Hash',
      ],
      tenantRecords.map((r) => [
        r.recordId,
        r.tenantId,
        r.assetName,
        r.period,
        r.sourceType,
        r.scope,
        r.quantity,
        r.unit,
        r.emissionsTco2e,
        r.validationStatus,
        r.lineageHash,
      ])
    );
    triggerDownload(`${activeTenant.tenantId}-dmrv-emissions-report.csv`, csv, 'text/csv;charset=utf-8');
    notify(`Exported ${tenantRecords.length} dMRV records to CSV`);
  };

  const handleExportMoccaeJson = () => {
    const payload = {
      schema: 'UAE-MOCCAE-DECREE-LAW-11-MRV-v1',
      exportedAt: new Date().toISOString(),
      tenant: {
        tenantId: activeTenant.tenantId,
        name: activeTenant.name,
        emirate: activeTenant.emirate,
        segment: activeTenant.segment,
        commercialModel: activeTenant.commercialModel,
      },
      assets: tenantAssets,
      dmrvLineageRecords: tenantRecords,
    };
    triggerDownload(
      `${activeTenant.tenantId}-moccae-mrv.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    notify('Exported MOCCAE MRV compliance JSON bundle');
  };

  const handleExportSprintCsv = () => {
    const csv = serializeToCsv(
      ['Task ID', 'Sprint', 'Title', 'Stage', 'Owner Team', 'Status', 'Story Points', 'Priority'],
      tenantTasks.map((t) => [
        t.taskId,
        t.sprintName,
        t.title,
        t.stage,
        t.ownerTeam,
        t.status,
        t.storyPoints,
        t.priority,
      ])
    );
    triggerDownload(`${activeTenant.tenantId}-agile-sprint-backlog.csv`, csv, 'text/csv;charset=utf-8');
    notify(`Exported ${tenantTasks.length} Agile sprint tasks to CSV`);
  };

  const handlePrintComplianceReport = () => {
    window.print();
  };

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#F6F8F7] text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F2922] text-slate-100 border-r border-emerald-950/60 no-print">
        <div className="h-14 px-5 flex items-center border-b border-white/10">
          <span className="font-display font-bold text-base tracking-tight text-white whitespace-nowrap">
            Arknex × BFMA
          </span>
        </div>

        <nav aria-label="Primary Workspace Navigation" className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white/12 text-white'
                    : 'text-emerald-100/75 hover:bg-white/6 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="text-xs text-emerald-100/70">
            <div className="font-medium text-white truncate">{activeTenant.name}</div>
            <div className="font-mono text-[11px] mt-0.5 truncate">{activeTenant.tenantId}</div>
          </div>
          {hasPermission(currentRole, 'tenant:create') && (
            <button
              type="button"
              onClick={() => setNewTenantModalOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0F2922] bg-[#E8B95B] rounded-lg hover:bg-[#dfb04d] transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Tenant
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-[#0F2922] text-white flex flex-col h-full z-10">
            <div className="h-14 px-5 flex items-center justify-between border-b border-white/10">
              <span className="font-display font-bold text-base">Arknex × BFMA</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 text-emerald-100 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg ${
                      isActive ? 'bg-white/15 text-white' : 'text-emerald-100/80 hover:bg-white/8'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setNewTenantModalOpen(true);
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-[#0F2922] bg-[#E8B95B] rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Provision New Tenant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (Strict 3-Zone Contract, compact 56px height for <15% mobile sticky cap) */}
        <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 no-print">
          {/* Zone 1: Mobile toggle + Breadcrumb */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm whitespace-nowrap">
              <span className="font-display font-bold text-slate-900 lg:hidden">
                Arknex × BFMA
              </span>
              <span className="hidden lg:inline text-slate-400">Workspace</span>
              <span className="hidden lg:inline text-slate-300" aria-hidden="true">/</span>
              <span className="font-medium text-slate-900">
                {activeNavMeta.label}
              </span>
            </div>
          </div>

          {/* Zone 2: Tenant Switcher */}
          <div className="flex-1 min-w-0 max-w-xs sm:max-w-sm">
            <label htmlFor="global-tenant-switcher" className="sr-only">
              Active Tenant Workspace
            </label>
            <select
              id="global-tenant-switcher"
              value={activeTenant.tenantId}
              onChange={(e) => {
                setActiveTenantId(e.target.value);
                const chosen = tenants.find((t) => t.tenantId === e.target.value);
                if (chosen) notify(`Switched isolated context to ${chosen.name}`);
              }}
              className="w-full px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-300 rounded-lg truncate focus:outline-none focus:ring-2 focus:ring-[#114B33]/30"
            >
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name} ({t.emirate})
                </option>
              ))}
            </select>
          </div>

          {/* Zone 3: Primary Account / Auth Action */}
          <div className="flex items-center gap-2 shrink-0">
            {authUser ? (
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#114B33] rounded-lg hover:bg-[#0D3B28] transition-colors whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Accessible Status Toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-lg shadow-lg border border-slate-700 max-w-sm no-print"
          >
            {toast}
          </div>
        )}

        {/* Active Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewDashboard
              tenant={activeTenant}
              assets={tenantAssets}
              records={tenantRecords}
              role={currentRole}
              sseConnected={sseConnected}
              onAdvanceAssetStage={handleAdvanceAssetStage}
              onExportCsv={handleExportEmissionsCsv}
              onExportJson={handleExportMoccaeJson}
              onPrintReport={handlePrintComplianceReport}
              onNavigate={(tab) => setActiveTab(tab as NavTabId)}
            />
          )}

          {activeTab === 'dmrv' && (
            <DmrvEngineView
              tenant={activeTenant}
              assets={tenantAssets}
              records={tenantRecords}
              role={currentRole}
              onAddRecord={handleAddDmrvRecord}
              onUpdateValidationStatus={handleUpdateValidationStatus}
              onAddAsset={handleAddAsset}
              onExportCsv={handleExportEmissionsCsv}
            />
          )}

          {activeTab === 'gtm' && (
            <GtmStrategyView
              tenant={activeTenant}
              assets={tenantAssets}
              checklist={checklist}
              onToggleChecklistItem={(id) =>
                setChecklist((prev) =>
                  prev.map((item) =>
                    item.id === id ? { ...item, completed: !item.completed } : item
                  )
                )
              }
            />
          )}

          {activeTab === 'sprints' && (
            <AgileSprintsView
              tenant={activeTenant}
              tasks={tenantTasks}
              role={currentRole}
              onAddTask={handleAddSprintTask}
              onMoveTask={handleMoveSprintTask}
              onDeleteTask={handleDeleteSprintTask}
              onExportSprintCsv={handleExportSprintCsv}
            />
          )}

          {activeTab === 'tenants' && (
            <TenantsRbacView
              tenants={tenants}
              activeTenantId={activeTenant.tenantId}
              members={tenantMembers}
              currentRole={currentRole}
              isAuthenticated={Boolean(authUser)}
              onSelectTenant={(id) => {
                setActiveTenantId(id);
                const chosen = tenants.find((t) => t.tenantId === id);
                if (chosen) notify(`Switched isolated context to ${chosen.name}`);
              }}
              onOpenNewTenantModal={() => setNewTenantModalOpen(true)}
              onChangeSimulatedRole={(r) => {
                setCurrentRole(r);
                notify(`Active RBAC role updated to ${r.replace(/_/g, ' ')}`);
              }}
              onAddMember={handleAddMember}
              onUpdateMemberRole={handleUpdateMemberRole}
              onToggleMemberStatus={handleToggleMemberStatus}
            />
          )}

          {activeTab === 'sync' && (
            <ApiSyncView
              tenant={activeTenant}
              assets={tenantAssets}
              role={currentRole}
              onSyncedRecordReceived={handleSyncedRecordReceived}
            />
          )}

          {activeTab === 'advisor' && (
            <ComplianceAdvisorView
              tenant={activeTenant}
              assets={tenantAssets}
              records={tenantRecords}
            />
          )}

          {activeTab === 'docs' && <DeveloperDocsView />}
        </main>
      </div>

      {/* New Tenant Onboarding Modal */}
      <NewTenantModal
        isOpen={newTenantModalOpen}
        onClose={() => setNewTenantModalOpen(false)}
        onCreate={handleCreateTenant}
      />
    </div>
  );
}
