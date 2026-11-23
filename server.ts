import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  SEED_ASSETS,
  SEED_DMRV_RECORDS,
  SEED_TENANTS,
} from './src/data/seedData.ts';
import type {
  BuildingAsset,
  DmrvRecord,
  Emirate,
  Tenant,
} from './src/types/domain.ts';
import {
  calculateEmissionsTco2e,
  UAE_EMISSION_FACTORS,
  validateSyncPayload,
} from './src/utils/dmrv.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// --- Server-Side Tenant-Isolated Sync Store ---
interface StoredSyncKey {
  keyId: string;
  tenantId: string;
  label: string;
  rawKey: string;
  keyHash: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

const tenantsMap = new Map<string, Tenant>();
const assetsByTenant = new Map<string, BuildingAsset[]>();
const dmrvByTenant = new Map<string, DmrvRecord[]>();
const syncKeysByTenant = new Map<string, StoredSyncKey>();
const sseClientsByTenant = new Map<string, Set<Response>>();

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createTenantSyncKey(tenantId: string, label = 'Primary BMS / ERP Gateway'): StoredSyncKey {
  const rawKey = `ak_live_${crypto.randomBytes(20).toString('hex')}`;
  const entry: StoredSyncKey = {
    keyId: `key_${crypto.randomBytes(6).toString('hex')}`,
    tenantId,
    label,
    rawKey,
    keyHash: sha256Hex(rawKey),
    scopes: ['dmrv:write', 'dmrv:read'],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  syncKeysByTenant.set(tenantId, entry);
  return entry;
}

function ensureTenantStore(tenant: Tenant) {
  if (!tenantsMap.has(tenant.tenantId)) {
    tenantsMap.set(tenant.tenantId, tenant);
  }
  if (!assetsByTenant.has(tenant.tenantId)) {
    assetsByTenant.set(tenant.tenantId, []);
  }
  if (!dmrvByTenant.has(tenant.tenantId)) {
    dmrvByTenant.set(tenant.tenantId, []);
  }
  if (!syncKeysByTenant.has(tenant.tenantId)) {
    createTenantSyncKey(tenant.tenantId);
  }
}

// Seed initial UAE GTM portfolios
for (const tenant of SEED_TENANTS) {
  ensureTenantStore(tenant);
}
for (const asset of SEED_ASSETS) {
  const list = assetsByTenant.get(asset.tenantId) ?? [];
  list.push(asset);
  assetsByTenant.set(asset.tenantId, list);
}
for (const rec of SEED_DMRV_RECORDS) {
  const list = dmrvByTenant.get(rec.tenantId) ?? [];
  list.push(rec);
  dmrvByTenant.set(rec.tenantId, list);
}

function findSyncKeyByHeader(headerKey: string | undefined): StoredSyncKey | null {
  if (!headerKey || typeof headerKey !== 'string' || headerKey.length > 200) {
    return null;
  }
  const incomingHashBuf = Buffer.from(sha256Hex(headerKey.trim()), 'hex');
  for (const keyRecord of syncKeysByTenant.values()) {
    const storedHashBuf = Buffer.from(keyRecord.keyHash, 'hex');
    if (
      storedHashBuf.length === incomingHashBuf.length &&
      crypto.timingSafeEqual(storedHashBuf, incomingHashBuf)
    ) {
      return keyRecord;
    }
  }
  return null;
}

function broadcastTenantEvent(tenantId: string, eventName: string, payload: unknown) {
  const clients = sseClientsByTenant.get(tenantId);
  if (!clients || clients.size === 0) return;
  const serialized = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(serialized);
    } catch {
      clients.delete(res);
    }
  }
}

// --- Express Application ---
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Health & Sync Contract Endpoint
app.get('/api/v1/sync/status', (_req: Request, res: Response) => {
  res.json({
    service: 'Arknex & BFMA Green Building dMRV Sync API',
    version: '1.0.0',
    isolationMode: 'Strict tenant_id scoped API keys',
    supportedSources: Object.keys(UAE_EMISSION_FACTORS),
    complianceOutputs: ['Emirate Code', 'MOCCAE MRV', 'LEED Record', 'Lender KPIs'],
    timestamp: new Date().toISOString(),
  });
});

// Register / ensure tenant in server sync registry (called when user creates a new tenant in UI)
app.post('/api/v1/tenants/register', (req: Request, res: Response) => {
  const body = req.body as Partial<Tenant>;
  if (
    !body ||
    typeof body.tenantId !== 'string' ||
    !/^[a-zA-Z0-9_-]{2,128}$/.test(body.tenantId) ||
    typeof body.name !== 'string' ||
    body.name.trim().length < 2
  ) {
    res.status(400).json({ error: 'Valid tenantId and name are required.' });
    return;
  }

  const tenant: Tenant = {
    tenantId: body.tenantId,
    name: body.name.trim().slice(0, 120),
    emirate: (body.emirate as Emirate) || 'Dubai',
    segment: body.segment || 'Hospitality / Serviced Apartments',
    commercialModel: body.commercialModel || 'Option A: BFMA Prime / Arknex Sub',
    rolloutPhase: body.rolloutPhase || 'Q1 2027 Dubai Launch',
    activeBmsCount: Number(body.activeBmsCount) || 0,
    ownerUid: typeof body.ownerUid === 'string' ? body.ownerUid : 'workspace_user',
    status: body.status || 'active',
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ensureTenantStore(tenant);
  const key = syncKeysByTenant.get(tenant.tenantId)!;
  res.status(201).json({
    tenantId: tenant.tenantId,
    syncKey: {
      keyId: key.keyId,
      tenantId: key.tenantId,
      label: key.label,
      apiKey: key.rawKey,
      scopes: key.scopes,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
    },
  });
});

// Get active tenant sync key metadata for Console
app.get('/api/v1/tenants/:tenantId/sync-key', (req: Request, res: Response) => {
  const tenantId = req.params.tenantId;
  if (!/^[a-zA-Z0-9_-]{2,128}$/.test(tenantId)) {
    res.status(400).json({ error: 'Invalid tenantId.' });
    return;
  }
  const key = syncKeysByTenant.get(tenantId);
  if (!key) {
    res.status(404).json({ error: 'Tenant not found in sync registry.' });
    return;
  }
  res.json({
    keyId: key.keyId,
    tenantId: key.tenantId,
    label: key.label,
    apiKey: key.rawKey,
    scopes: key.scopes,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  });
});

// Rotate tenant sync API key
app.post('/api/v1/tenants/:tenantId/sync-key/rotate', (req: Request, res: Response) => {
  const tenantId = req.params.tenantId;
  if (!/^[a-zA-Z0-9_-]{2,128}$/.test(tenantId) || !tenantsMap.has(tenantId)) {
    res.status(404).json({ error: 'Tenant not found.' });
    return;
  }
  const label =
    typeof req.body?.label === 'string' && req.body.label.trim().length > 1
      ? req.body.label.trim().slice(0, 80)
      : 'Rotated BMS / ERP Gateway';
  const rotated = createTenantSyncKey(tenantId, label);
  res.json({
    keyId: rotated.keyId,
    tenantId: rotated.tenantId,
    label: rotated.label,
    apiKey: rotated.rawKey,
    scopes: rotated.scopes,
    createdAt: rotated.createdAt,
    lastUsedAt: rotated.lastUsedAt,
  });
});

// Third-Party Data Sync Ingestion Endpoint (Strict Tenant Isolation via API Key)
app.post('/api/v1/sync/ingest', (req: Request, res: Response) => {
  const apiKey = req.header('x-api-key');
  const keyRecord = findSyncKeyByHeader(apiKey);
  if (!keyRecord) {
    res.status(401).json({
      error: 'Unauthorized: Provide a valid tenant-scoped X-API-Key header.',
    });
    return;
  }

  // Enforce strict tenant isolation: reject cross-tenant payload spoofing
  if (
    typeof req.body?.tenantId === 'string' &&
    req.body.tenantId.trim() !== '' &&
    req.body.tenantId.trim() !== keyRecord.tenantId
  ) {
    res.status(403).json({
      error: 'Forbidden: Payload tenantId does not match the authenticated API key tenant boundary.',
    });
    return;
  }

  const parsed = validateSyncPayload(req.body);
  if (!parsed.valid || !parsed.data) {
    res.status(400).json({ error: parsed.error || 'Invalid telemetry payload.' });
    return;
  }

  const tenant = tenantsMap.get(keyRecord.tenantId);
  const emirate: Emirate = tenant?.emirate ?? 'Dubai';
  const calc = calculateEmissionsTco2e(
    parsed.data.sourceType,
    parsed.data.quantity,
    emirate,
    parsed.data.unit
  );

  const nowIso = new Date().toISOString();
  const recordId = `sync_${crypto.randomBytes(6).toString('hex')}`;
  const lineageHash = sha256Hex(
    `${keyRecord.tenantId}|${parsed.data.assetId}|${parsed.data.sourceType}|${parsed.data.quantity}|${parsed.data.period}|${nowIso}`
  );

  const newRecord: DmrvRecord = {
    recordId,
    tenantId: keyRecord.tenantId,
    assetId: parsed.data.assetId,
    assetName: parsed.data.assetName,
    sourceType: parsed.data.sourceType,
    scope: calc.scope,
    quantity: parsed.data.quantity,
    unit: calc.resolvedUnit,
    emissionsTco2e: calc.emissionsTco2e,
    validationStatus: 'validated',
    lineageHash,
    period: parsed.data.period,
    createdByUid: `api_sync:${keyRecord.keyId}`,
    createdAt: nowIso,
  };

  keyRecord.lastUsedAt = nowIso;
  const list = dmrvByTenant.get(keyRecord.tenantId) ?? [];
  list.unshift(newRecord);
  dmrvByTenant.set(keyRecord.tenantId, list);

  broadcastTenantEvent(keyRecord.tenantId, 'dmrv_ingested', newRecord);

  res.status(201).json({
    status: 'ingested',
    tenantId: keyRecord.tenantId,
    pipeline: ['1. Validated schema & units', '2. Calculated UAE Scope emissions', '3. Stored SHA-256 lineage'],
    record: newRecord,
  });
});

// Third-Party Data Sync Pull Endpoint (Strict Tenant Isolation)
app.get('/api/v1/sync/records', (req: Request, res: Response) => {
  const apiKey = req.header('x-api-key');
  const keyRecord = findSyncKeyByHeader(apiKey);
  if (!keyRecord) {
    res.status(401).json({
      error: 'Unauthorized: Provide a valid tenant-scoped X-API-Key header.',
    });
    return;
  }

  keyRecord.lastUsedAt = new Date().toISOString();
  const scopeFilter = typeof req.query.scope === 'string' ? req.query.scope : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  let records = dmrvByTenant.get(keyRecord.tenantId) ?? [];
  if (scopeFilter) {
    records = records.filter((r) => r.scope === scopeFilter);
  }

  res.json({
    tenantId: keyRecord.tenantId,
    count: Math.min(records.length, limit),
    records: records.slice(0, limit),
  });
});

// Real-Time Server-Sent Events Stream (Scoped to Tenant)
app.get('/api/v1/stream/:tenantId', (req: Request, res: Response) => {
  const tenantId = req.params.tenantId;
  if (!/^[a-zA-Z0-9_-]{2,128}$/.test(tenantId)) {
    res.status(400).json({ error: 'Invalid tenantId.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let set = sseClientsByTenant.get(tenantId);
  if (!set) {
    set = new Set();
    sseClientsByTenant.set(tenantId, set);
  }
  set.add(res);

  res.write(
    `event: connected\ndata: ${JSON.stringify({ tenantId, connectedAt: new Date().toISOString() })}\n\n`
  );

  const keepAlive = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    set?.delete(res);
  });
});

// Deep-Thinking UAE Emissions & Decree-Law No. 11 Compliance Advisor (gemini-4-carbon + ThinkingLevel.HIGH)
app.post('/api/v1/compliance/analyze', async (req: Request, res: Response) => {
  const { tenantName, emirate, segment, question, assetsSummary, emissionsSummary } =
    (req.body ?? {}) as Record<string, unknown>;

  if (typeof question !== 'string' || question.trim().length < 5 || question.length > 2000) {
    res.status(400).json({ error: 'Please provide a compliance query between 5 and 2000 characters.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(503).json({
      error:
        'Gemini API key is not configured for deep-thinking analysis. Please select or add a billing-enabled API key in Settings > Secrets to run gemini-4-carbon high-thinking queries.',
      code: 'API_KEY_MISSING',
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = `You are the senior carbon accounting and UAE green-building compliance advisor for the Arknex & BFMA Strategic Partnership.
Ground every recommendation in:
- UAE Federal Decree-Law No. 11 (2024) on the Reduction of Climate Change Effects (mandatory Scope 1 & 2 MRV, penalties AED 50,000–2,000,000).
- Dubai (Al Sa'fat, 30,000 building retrofits by 2030, DEWA clean grid), Ras Al Khaimah (Barjeel, 3,000 buildings by 2040), and Fujairah BMS compliance requirements.
- The Arknex & BFMA Five-Stage Product Offering: P1 Green Compliance Check, P2 Green Certification (LEED / Al Sa'fat / Barjeel), P3 Annual MRV Reporting, P4 Physical Optimization (Lighting/Solar/HVAC — never guarantee energy savings without Arknex technical sign-off), and P5 Sustained FM Program.
- Option A commercial structure (BFMA prime contractor; Arknex technical sub-consultant).
Be rigorous, structured, quantitative, and cite concrete stage actions, risk mitigations, and audit evidence needed for MOCCAE MRV, Emirate Code, LEED, and Lender KPIs. Keep the response concise and structured with clear headings.`;

    const prompt = `Active Tenant Portfolio Context:
- Organization: ${String(tenantName || 'UAE Portfolio Tenant').slice(0, 120)}
- Emirate: ${String(emirate || 'Dubai').slice(0, 60)}
- Market Segment: ${String(segment || 'Commercial').slice(0, 100)}
- Assets Summary: ${JSON.stringify(assetsSummary ?? []).slice(0, 2500)}
- Recent Emissions Summary: ${JSON.stringify(emissionsSummary ?? {}).slice(0, 1500)}

User Compliance Query:
${question.trim()}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-carbon',
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    res.json({
      analysis: response.text ?? '',
      model: 'gemini-4-carbon',
      thinkingLevel: 'HIGH',
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Compliance advisor error:', message);

    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      res.status(429).json({
        error:
          'Quota limit reached for gemini-4-carbon (high-thinking paid model). Upgrade to a paid tier or select a billing-enabled API key in Settings > Secrets.',
        code: 'RESOURCE_EXHAUSTED',
      });
      return;
    }

    if (message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
      res.status(403).json({
        error:
          'API key permission denied or invalid for gemini-4-carbon. Please verify your API key in Settings > Secrets.',
        code: 'PERMISSION_DENIED',
      });
      return;
    }

    res.status(502).json({
      error: `Unable to complete compliance analysis: ${message}`,
      code: 'UPSTREAM_ERROR',
    });
  }
});

// --- Mount Vite Dev Middleware or Static Production Build ---
async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Arknex & BFMA Green Building dMRV server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
