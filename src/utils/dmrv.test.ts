import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessDecreeLawRisk,
  calculateEmissionsTco2e,
  computeLineageHash,
  computeMonthlyReductionSeries,
  filterByTenant,
  hasPermission,
  serializeToCsv,
  validateSyncPayload,
} from './dmrv';
import type { BuildingAsset, DmrvRecord } from '../types/domain';

test('calculateEmissionsTco2e computes Dubai Scope 2 electricity accurately', () => {
  const result = calculateEmissionsTco2e('utility_bill', 100000, 'Dubai');
  assert.equal(result.scope, 'Scope 2');
  assert.equal(result.resolvedUnit, 'kWh');
  // 100,000 * 0.000404 * 0.96 = 38.784
  assert.equal(result.emissionsTco2e, 38.784);
});

test('calculateEmissionsTco2e converts RT-hr cooling units cleanly', () => {
  const result = calculateEmissionsTco2e('bms_trend', 10000, 'Ras Al Khaimah', 'RT-hr');
  assert.equal(result.scope, 'Scope 2');
  assert.equal(result.resolvedUnit, 'RT-hr');
  // 10,000 * 0.8 * 0.000404 * 1.04 = 3.36128 -> 3.361
  assert.equal(result.emissionsTco2e, 3.361);
});

test('calculateEmissionsTco2e computes Scope 1 diesel fuel independently of emirate grid', () => {
  const dubai = calculateEmissionsTco2e('fuel_log', 5000, 'Dubai');
  const fujairah = calculateEmissionsTco2e('fuel_log', 5000, 'Fujairah');
  assert.equal(dubai.scope, 'Scope 1');
  assert.equal(dubai.emissionsTco2e, 13.4);
  assert.equal(dubai.emissionsTco2e, fujairah.emissionsTco2e);
});

test('calculateEmissionsTco2e rejects non-positive quantities', () => {
  assert.throws(() => calculateEmissionsTco2e('utility_bill', 0, 'Dubai'));
  assert.throws(() => calculateEmissionsTco2e('fuel_log', -42, 'Dubai'));
});

test('filterByTenant enforces strict tenant data isolation', () => {
  const mixed = [
    { tenantId: 'tenant_dubai_01', id: 'a' },
    { tenantId: 'tenant_rak_02', id: 'b' },
    { tenantId: 'tenant_dubai_01', id: 'c' },
  ];
  const isolated = filterByTenant(mixed, 'tenant_dubai_01');
  assert.equal(isolated.length, 2);
  assert.deepEqual(
    isolated.map((x) => x.id),
    ['a', 'c']
  );
});

test('hasPermission enforces RBAC role boundaries', () => {
  assert.equal(hasPermission('super_admin', 'tenant:create'), true);
  assert.equal(hasPermission('bfma_fm_manager', 'dmrv:ingest'), true);
  assert.equal(hasPermission('bfma_fm_manager', 'dmrv:verify'), false);
  assert.equal(hasPermission('arknex_auditor', 'dmrv:verify'), true);
  assert.equal(hasPermission('tenant_viewer', 'dmrv:ingest'), false);
  assert.equal(hasPermission('tenant_viewer', 'report:export'), true);
});

test('assessDecreeLawRisk scales penalty exposure by compliance readiness', () => {
  const highReadyAssets: BuildingAsset[] = [
    {
      assetId: 'a1',
      tenantId: 't1',
      name: 'Tower A',
      emirate: 'Dubai',
      gfaSqm: 25000,
      stage: 'P4',
      certificationTarget: 'LEED O+M',
      bmsConnected: true,
      baselineEmissionsTco2e: 1200,
      currentEmissionsTco2e: 980,
      complianceScore: 90,
      createdByUid: 'u1',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];
  const validatedRecs: DmrvRecord[] = [
    {
      recordId: 'r1',
      tenantId: 't1',
      assetId: 'a1',
      assetName: 'Tower A',
      sourceType: 'utility_bill',
      scope: 'Scope 2',
      quantity: 50000,
      unit: 'kWh',
      emissionsTco2e: 19.392,
      validationStatus: 'validated',
      lineageHash: 'abcdef0123456789',
      period: '2026-11',
      createdByUid: 'u1',
      createdAt: '2026-11-01T00:00:00Z',
    },
  ];
  const lowRisk = assessDecreeLawRisk(highReadyAssets, validatedRecs);
  assert.equal(lowRisk.riskLevel, 'Low');
  assert.equal(lowRisk.estimatedExposureAed, 50000);

  const poorAsset = [{ ...highReadyAssets[0], complianceScore: 38 }];
  const flaggedRec = [{ ...validatedRecs[0], validationStatus: 'flagged' as const }];
  const highRisk = assessDecreeLawRisk(poorAsset, flaggedRec);
  assert.equal(highRisk.riskLevel, 'High');
  assert.equal(highRisk.estimatedExposureAed, 1450000);
});

test('validateSyncPayload accepts clean payloads and blocks malformed/injection inputs', () => {
  const ok = validateSyncPayload({
    assetId: 'asset_dxb_marina_01',
    assetName: 'Marina Bay Grand Suites',
    sourceType: 'bms_trend',
    quantity: 48200,
    unit: 'kWh',
    period: '2026-11',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.data?.quantity, 48200);

  const badId = validateSyncPayload({
    assetId: '../etc/passwd',
    assetName: 'Test',
    sourceType: 'bms_trend',
    quantity: 100,
    period: '2026-11',
  });
  assert.equal(badId.valid, false);

  const badQty = validateSyncPayload({
    assetId: 'asset_01',
    assetName: 'Test Asset',
    sourceType: 'fuel_log',
    quantity: -10,
    period: '2026-11',
  });
  assert.equal(badQty.valid, false);
});

test('serializeToCsv prevents spreadsheet formula injection and escapes commas', () => {
  const csv = serializeToCsv(
    ['Asset', 'Formula', 'Notes'],
    [['Tower, East', '=CMD|calc', 'Line "quoted"']]
  );
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Asset,Formula,Notes');
  assert.equal(lines[1], '"Tower, East",\'=CMD|calc,"Line ""quoted"""');
});

test('computeLineageHash returns deterministic 32-char hex digest', () => {
  const hash1 = computeLineageHash({
    tenantId: 'tenant_dubai_01',
    assetId: 'asset_01',
    sourceType: 'utility_bill',
    quantity: 25000,
    period: '2026-11',
    timestamp: '2026-11-22T09:00:00Z',
  });
  const hash2 = computeLineageHash({
    tenantId: 'tenant_dubai_01',
    assetId: 'asset_01',
    sourceType: 'utility_bill',
    quantity: 25000,
    period: '2026-11',
    timestamp: '2026-11-22T09:00:00Z',
  });
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[a-f0-9]{32}$/);
});

test('computeMonthlyReductionSeries computes monthly and cumulative tCO2e reductions against annual baseline/12', () => {
  const assets: BuildingAsset[] = [
    {
      assetId: 'a1',
      tenantId: 't1',
      name: 'Hotel A',
      emirate: 'Dubai',
      gfaSqm: 20000,
      stage: 'P3',
      certificationTarget: 'LEED O+M',
      bmsConnected: true,
      baselineEmissionsTco2e: 2400, // 200 tCO2e/month baseline
      currentEmissionsTco2e: 1800,
      complianceScore: 85,
      createdByUid: 'u1',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    },
  ];
  const records: DmrvRecord[] = [
    {
      recordId: 'r1',
      tenantId: 't1',
      assetId: 'a1',
      assetName: 'Hotel A',
      sourceType: 'utility_bill',
      scope: 'Scope 2',
      quantity: 300000,
      unit: 'kWh',
      emissionsTco2e: 150,
      validationStatus: 'validated',
      lineageHash: 'aaaa1111bbbb2222',
      period: '2026-08',
      createdByUid: 'u1',
      createdAt: '2026-09-01T00:00:00Z',
    },
    {
      recordId: 'r2',
      tenantId: 't1',
      assetId: 'a1',
      assetName: 'Hotel A',
      sourceType: 'bms_trend',
      scope: 'Scope 2',
      quantity: 250000,
      unit: 'kWh',
      emissionsTco2e: 120,
      validationStatus: 'validated',
      lineageHash: 'cccc3333dddd4444',
      period: '2026-09',
      createdByUid: 'u1',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  const series = computeMonthlyReductionSeries(assets, records);
  assert.equal(series.length, 2);
  assert.equal(series[0].period, '2026-08');
  assert.equal(series[0].baselineTco2e, 200);
  assert.equal(series[0].reductionTco2e, 50);
  assert.equal(series[0].cumulativeReductionTco2e, 50);
  assert.equal(series[0].reductionPct, 25);

  assert.equal(series[1].period, '2026-09');
  assert.equal(series[1].reductionTco2e, 80);
  assert.equal(series[1].cumulativeReductionTco2e, 130);
  assert.equal(series[1].reductionPct, 40);
});

test('computeMonthlyReductionSeries clamps negative reductions to zero and handles empty records', () => {
  assert.deepEqual(computeMonthlyReductionSeries([], []), []);
  const asset: BuildingAsset = {
    assetId: 'a1',
    tenantId: 't1',
    name: 'Depot B',
    emirate: 'Ras Al Khaimah',
    gfaSqm: 10000,
    stage: 'P1',
    certificationTarget: 'Barjeel',
    bmsConnected: false,
    baselineEmissionsTco2e: 1200, // 100/mo
    currentEmissionsTco2e: 1300,
    complianceScore: 50,
    createdByUid: 'u1',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const spikeRecord: DmrvRecord = {
    recordId: 'r_spike',
    tenantId: 't1',
    assetId: 'a1',
    assetName: 'Depot B',
    sourceType: 'fuel_log',
    scope: 'Scope 1',
    quantity: 50000,
    unit: 'Liters',
    emissionsTco2e: 134,
    validationStatus: 'pending_audit',
    lineageHash: 'eeee5555ffff6666',
    period: '2026-11',
    createdByUid: 'u1',
    createdAt: '2026-11-10T00:00:00Z',
  };
  const series = computeMonthlyReductionSeries([asset], [spikeRecord]);
  assert.equal(series[0].reductionTco2e, 0);
  assert.equal(series[0].cumulativeReductionTco2e, 0);
  assert.equal(series[0].reductionPct, 0);
});
