import type {
  BuildingAsset,
  DataSourceType,
  DmrvRecord,
  Emirate,
  EmissionScope,
  MeasurementUnit,
  PermissionAction,
  ProductStage,
  UserRole,
} from '../types/domain';

/**
 * UAE Grid & Fuel Emission Factors aligned to UAE MOCCAE & DEWA/EtihadWE benchmarks.
 * Expressed in metric tonnes CO2e per input unit.
 */
export const UAE_EMISSION_FACTORS: Record<DataSourceType, { scope: EmissionScope; defaultUnit: MeasurementUnit; factorPerUnit: number }> = {
  utility_bill: { scope: 'Scope 2', defaultUnit: 'kWh', factorPerUnit: 0.000404 }, // 0.404 kgCO2e/kWh (DEWA/UAE grid avg)
  bms_trend: { scope: 'Scope 2', defaultUnit: 'kWh', factorPerUnit: 0.000404 },    // Chilled water / BMS metered kWh
  fuel_log: { scope: 'Scope 1', defaultUnit: 'Liters', factorPerUnit: 0.00268 },  // Diesel backup generator / boiler
  waste_record: { scope: 'Scope 3 Waste', defaultUnit: 'Tonnes', factorPerUnit: 0.58 }, // Municipal landfill mix
};

export const EMIRATE_GRID_MODIFIER: Record<Emirate, number> = {
  Dubai: 0.96,            // DEWA Mohammed bin Rashid Solar Park clean grid mix
  'Ras Al Khaimah': 1.04, // EtihadWE northern emirates grid factor
  Fujairah: 1.05,
  'Abu Dhabi': 0.94,      // EWEC nuclear + solar mix
  Sharjah: 1.02,
};

export const STAGE_METADATA: Record<
  ProductStage,
  { code: ProductStage; title: string; subtitle: string; lead: 'Arknex' | 'BFMA + Arknex' | 'Joint' }
> = {
  P1: {
    code: 'P1',
    title: 'Green Compliance Check',
    subtitle: 'Initial assessment & gap analysis',
    lead: 'Arknex',
  },
  P2: {
    code: 'P2',
    title: 'Green Certification',
    subtitle: "LEED / Al Sa'fat / Barjeel",
    lead: 'Arknex',
  },
  P3: {
    code: 'P3',
    title: 'Annual MRV Reporting',
    subtitle: 'Emissions measurement, reporting & verification',
    lead: 'Arknex',
  },
  P4: {
    code: 'P4',
    title: 'Physical Optimization',
    subtitle: 'Energy-efficiency upgrades (lighting, solar, HVAC)',
    lead: 'BFMA + Arknex',
  },
  P5: {
    code: 'P5',
    title: 'Sustained FM Program',
    subtitle: 'Ongoing monitoring, compliance & performance improvement',
    lead: 'Joint',
  },
};

export const ROLE_PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  super_admin: [
    'tenant:create',
    'tenant:manage_members',
    'asset:write',
    'dmrv:ingest',
    'dmrv:verify',
    'sprint:write',
    'report:export',
    'sync:manage_keys',
  ],
  bfma_fm_manager: [
    'asset:write',
    'dmrv:ingest',
    'sprint:write',
    'report:export',
    'sync:manage_keys',
  ],
  arknex_auditor: [
    'dmrv:ingest',
    'dmrv:verify',
    'sprint:write',
    'report:export',
  ],
  tenant_viewer: [
    'report:export',
  ],
};

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export function calculateEmissionsTco2e(
  sourceType: DataSourceType,
  quantity: number,
  emirate: Emirate = 'Dubai',
  unit?: MeasurementUnit
): { emissionsTco2e: number; scope: EmissionScope; resolvedUnit: MeasurementUnit } {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive finite number');
  }
  const spec = UAE_EMISSION_FACTORS[sourceType];
  const resolvedUnit = unit ?? spec.defaultUnit;
  let effectiveQty = quantity;

  // Convert refrigeration ton-hours (RT-hr) to approximate kWh electric input (COP ~4.4 -> 0.8 kWh/RT-hr)
  if (resolvedUnit === 'RT-hr') {
    effectiveQty = quantity * 0.8;
  }

  const modifier = spec.scope === 'Scope 2' ? (EMIRATE_GRID_MODIFIER[emirate] ?? 1.0) : 1.0;
  const raw = effectiveQty * spec.factorPerUnit * modifier;
  return {
    emissionsTco2e: Math.round(raw * 1000) / 1000,
    scope: spec.scope,
    resolvedUnit,
  };
}

/**
 * Deterministic lightweight hex fingerprint for dMRV audit lineage (browser + Node safe).
 */
export function computeLineageHash(input: {
  tenantId: string;
  assetId: string;
  sourceType: string;
  quantity: number;
  period: string;
  timestamp: string;
}): string {
  const payload = `${input.tenantId}|${input.assetId}|${input.sourceType}|${input.quantity}|${input.period}|${input.timestamp}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const partA = (h1 >>> 0).toString(16).padStart(8, '0');
  const partB = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${partA}${partB}${(partA + partB).split('').reverse().join('')}`;
}

/**
 * Evaluates UAE Decree-Law No. 11 (2024) compliance penalty risk band (AED 50,000 - 2,000,000).
 */
export function assessDecreeLawRisk(assets: BuildingAsset[], records: DmrvRecord[]): {
  riskLevel: 'Low' | 'Moderate' | 'High';
  estimatedExposureAed: number;
  readinessPct: number;
  validatedRatioPct: number;
} {
  if (assets.length === 0) {
    return {
      riskLevel: 'Moderate',
      estimatedExposureAed: 150000,
      readinessPct: 0,
      validatedRatioPct: 0,
    };
  }

  const avgCompliance =
    assets.reduce((sum, a) => sum + a.complianceScore, 0) / assets.length;
  const validatedCount = records.filter((r) => r.validationStatus === 'validated').length;
  const validatedRatio = records.length > 0 ? (validatedCount / records.length) * 100 : 0;

  const readinessPct = Math.round(avgCompliance * 0.65 + validatedRatio * 0.35);

  if (readinessPct >= 82) {
    return {
      riskLevel: 'Low',
      estimatedExposureAed: 50000,
      readinessPct,
      validatedRatioPct: Math.round(validatedRatio),
    };
  }
  if (readinessPct >= 60) {
    return {
      riskLevel: 'Moderate',
      estimatedExposureAed: 450000,
      readinessPct,
      validatedRatioPct: Math.round(validatedRatio),
    };
  }
  return {
    riskLevel: 'High',
    estimatedExposureAed: 1450000,
    readinessPct,
    validatedRatioPct: Math.round(validatedRatio),
  };
}

/**
 * Strictly isolates any tenant-scoped record collection to a single tenantId.
 */
export function filterByTenant<T extends { tenantId: string }>(
  items: T[],
  tenantId: string
): T[] {
  return items.filter((item) => item.tenantId === tenantId);
}

/**
 * Validates and sanitizes an incoming third-party sync payload.
 */
export function validateSyncPayload(body: unknown): {
  valid: boolean;
  error?: string;
  data?: {
    assetId: string;
    assetName: string;
    sourceType: DataSourceType;
    quantity: number;
    unit?: MeasurementUnit;
    period: string;
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Payload must be a JSON object.' };
  }
  const obj = body as Record<string, unknown>;
  const assetId = typeof obj.assetId === 'string' ? obj.assetId.trim() : '';
  const assetName = typeof obj.assetName === 'string' ? obj.assetName.trim() : '';
  const sourceType = obj.sourceType as DataSourceType;
  const quantity = Number(obj.quantity);
  const period = typeof obj.period === 'string' ? obj.period.trim() : '';
  const unit = obj.unit as MeasurementUnit | undefined;

  if (!/^[a-zA-Z0-9_-]{2,128}$/.test(assetId)) {
    return { valid: false, error: 'Invalid assetId format (alphanumeric, hyphens, underscores only).' };
  }
  if (assetName.length < 2 || assetName.length > 140) {
    return { valid: false, error: 'assetName must be between 2 and 140 characters.' };
  }
  if (!['utility_bill', 'bms_trend', 'fuel_log', 'waste_record'].includes(sourceType)) {
    return { valid: false, error: 'sourceType must be utility_bill, bms_trend, fuel_log, or waste_record.' };
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) {
    return { valid: false, error: 'quantity must be a positive number.' };
  }
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period)) {
    return { valid: false, error: 'period must use YYYY-MM or YYYY-MM-DD format.' };
  }
  if (unit && !['kWh', 'Liters', 'Tonnes', 'RT-hr'].includes(unit)) {
    return { valid: false, error: 'Unsupported unit.' };
  }

  return {
    valid: true,
    data: { assetId, assetName, sourceType, quantity, unit, period },
  };
}

/**
 * Generates RFC 4180 compliant CSV string with formula-injection protection.
 */
export function serializeToCsv(headers: string[], rows: Array<Array<string | number | boolean>>): string {
  const escapeCell = (val: string | number | boolean): string => {
    let str = String(val ?? '');
    // Neutralize CSV formula injection in spreadsheet tools
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  return lines.join('\n');
}

export interface MonthlyReductionPoint {
  period: string;
  baselineTco2e: number;
  actualTco2e: number;
  reductionTco2e: number;
  cumulativeReductionTco2e: number;
  reductionPct: number;
}

/**
 * Computes monthly and cumulative carbon emission reductions (tCO2e) for a tenant
 * by comparing monthly metered dMRV totals against the tenant portfolio's monthly
 * baseline run-rate (annual baseline / 12).
 */
export function computeMonthlyReductionSeries(
  assets: BuildingAsset[],
  records: DmrvRecord[]
): MonthlyReductionPoint[] {
  if (records.length === 0) return [];

  const annualBaseline = assets.reduce((sum, asset) => sum + asset.baselineEmissionsTco2e, 0);
  const byPeriod = new Map<string, number>();

  for (const record of records) {
    const periodKey = record.period.slice(0, 7);
    byPeriod.set(periodKey, (byPeriod.get(periodKey) ?? 0) + record.emissionsTco2e);
  }

  const sortedPeriods = Array.from(byPeriod.keys()).sort((a, b) => a.localeCompare(b));
  const fallbackBaseline = byPeriod.get(sortedPeriods[0]) ?? 0;
  const monthlyBaseline =
    annualBaseline > 0 ? Math.round((annualBaseline / 12) * 100) / 100 : Math.round(fallbackBaseline * 100) / 100;

  let cumulative = 0;

  return sortedPeriods.map((period) => {
    const actualTco2e = Math.round((byPeriod.get(period) ?? 0) * 100) / 100;
    const rawDelta = monthlyBaseline - actualTco2e;
    const reductionTco2e = Math.round(Math.max(0, rawDelta) * 100) / 100;
    cumulative = Math.round((cumulative + reductionTco2e) * 100) / 100;
    const reductionPct =
      monthlyBaseline > 0
        ? Math.round((reductionTco2e / monthlyBaseline) * 1000) / 10
        : 0;

    return {
      period,
      baselineTco2e: monthlyBaseline,
      actualTco2e,
      reductionTco2e,
      cumulativeReductionTco2e: cumulative,
      reductionPct,
    };
  });
}
