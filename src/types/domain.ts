export type Emirate =
  | 'Dubai'
  | 'Ras Al Khaimah'
  | 'Fujairah'
  | 'Abu Dhabi'
  | 'Sharjah';

export type MarketSegment =
  | 'Hospitality / Serviced Apartments'
  | 'Industrial / Logistics / Ports'
  | 'Residential Tower Associations'
  | 'Government / Semi-Government';

export type CommercialModel =
  | 'Option A: BFMA Prime / Arknex Sub'
  | 'Option B: Separate Contracts'
  | 'Option C: Joint Venture';

export type RolloutPhase =
  | 'Q4 2026 Pilot Prep'
  | 'Q1 2027 Dubai Launch'
  | 'Q2 2027 RAK Launch'
  | 'Q3 2027 Fujairah Launch'
  | 'Q4 2027+ Scale';

export type ProductStage = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type CertificationTarget =
  | 'LEED O+M'
  | "Al Sa'fat"
  | 'Barjeel'
  | 'MOCCAE MRV';

export type UserRole =
  | 'super_admin'
  | 'bfma_fm_manager'
  | 'arknex_auditor'
  | 'tenant_viewer';

export type OrganizationSide = 'Arknex' | 'BFMA' | 'Client';

export type DataSourceType =
  | 'utility_bill'
  | 'bms_trend'
  | 'fuel_log'
  | 'waste_record';

export type EmissionScope = 'Scope 1' | 'Scope 2' | 'Scope 3 Waste';

export type MeasurementUnit = 'kWh' | 'Liters' | 'Tonnes' | 'RT-hr';

export type ValidationStatus = 'validated' | 'pending_audit' | 'flagged';

export type SprintStatus = 'backlog' | 'in_progress' | 'audit_review' | 'done';

export type PriorityLevel = 'high' | 'medium' | 'low';

export interface Tenant {
  tenantId: string;
  name: string;
  emirate: Emirate;
  segment: MarketSegment;
  commercialModel: CommercialModel;
  rolloutPhase: RolloutPhase;
  activeBmsCount: number;
  ownerUid: string;
  status: 'active' | 'onboarding' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface TenantMember {
  uid: string;
  tenantId: string;
  displayName: string;
  email: string;
  role: UserRole;
  organization: OrganizationSide;
  status: 'active' | 'revoked';
  lastActive: string;
}

export interface BuildingAsset {
  assetId: string;
  tenantId: string;
  name: string;
  emirate: Emirate;
  gfaSqm: number;
  stage: ProductStage;
  certificationTarget: CertificationTarget;
  bmsConnected: boolean;
  baselineEmissionsTco2e: number;
  currentEmissionsTco2e: number;
  complianceScore: number;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface DmrvRecord {
  recordId: string;
  tenantId: string;
  assetId: string;
  assetName: string;
  sourceType: DataSourceType;
  scope: EmissionScope;
  quantity: number;
  unit: MeasurementUnit;
  emissionsTco2e: number;
  validationStatus: ValidationStatus;
  lineageHash: string;
  period: string; // YYYY-MM
  createdByUid: string;
  createdAt: string;
}

export interface SprintTask {
  taskId: string;
  tenantId: string;
  sprintName: string;
  title: string;
  stage: ProductStage;
  ownerTeam: 'BFMA' | 'Arknex' | 'Joint';
  status: SprintStatus;
  storyPoints: number;
  priority: PriorityLevel;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface PilotChecklistItem {
  id: string;
  label: string;
  owner: 'BFMA' | 'Arknex' | 'Joint';
  completed: boolean;
  targetQuarter: string;
}

export interface TenantSyncKey {
  keyId: string;
  tenantId: string;
  label: string;
  apiKey: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export type PermissionAction =
  | 'tenant:create'
  | 'tenant:manage_members'
  | 'asset:write'
  | 'dmrv:ingest'
  | 'dmrv:verify'
  | 'sprint:write'
  | 'report:export'
  | 'sync:manage_keys';
