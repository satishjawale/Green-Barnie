# Security Specification — Arknex & BFMA Multi-Tenant dMRV Platform

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every building asset, dMRV telemetry record, and Agile sprint task lives under `/tenants/{tenantId}/...` and carries an immutable `tenantId` matching the parent path variable.
2. **Master Gate Membership**: Subcollection access under `/tenants/{tenantId}/...` requires an active membership document at `/tenants/{tenantId}/members/{request.auth.uid}` with `status == 'active'`, or verified platform admin status. Revoking membership immediately revokes all subcollection access.
3. **PII Isolation**: User emails are stored strictly under `/users/{uid}/private/profile`, readable and writable only by the authenticated owner or verified platform admin. No blanket `isSignedIn()` reads exist anywhere.
4. **Role-Based Access Control (RBAC)**:
   - `super_admin`: Full cross-tenant governance and member role management.
   - `bfma_fm_manager`: Can manage tenant assets, ingest dMRV data, and manage Agile sprint tasks within their assigned tenant.
   - `arknex_auditor`: Can verify/flag dMRV records and review Agile audit tasks within their assigned tenant.
   - `tenant_viewer`: Read-only access to their assigned tenant's assets, dMRV records, and sprint progress.
5. **Immutable Audit Lineage**: `DmrvRecord` fields (`tenantId`, `assetId`, `quantity`, `emissionsTco2e`, `lineageHash`, `createdByUid`, `createdAt`) cannot be modified after creation; only `validationStatus` may transition by an `arknex_auditor` or `super_admin` before terminal archival.
6. **Temporal & Schema Integrity**: All `createdAt`/`updatedAt` timestamps must match `request.time`, all string lengths are strictly bounded, all IDs match `^[a-zA-Z0-9_\-]+$`, and no shadow fields are permitted (`hasOnly` + `hasAll`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-Tenant Read**: Member of `tenant_dubai_01` attempts `get` on `/tenants/tenant_rak_02/dmrv_records/rec_1`.
2. **Self-Privilege Escalation**: `tenant_viewer` updates `/tenants/tenant_dubai_01/members/{uid}` to set `role: "super_admin"`.
3. **Shadow Field Injection**: Valid `bfma_fm_manager` creates a `BuildingAsset` with extra ghost field `isApprovedByMinister: true`.
4. **Email Spoofing (Unverified)**: Request with `token.email == "satish.jawale@gmail.com"` and `email_verified: false` attempts admin write.
5. **PII Blanket Read**: Authenticated User B attempts `get` on `/users/userA/private/profile`.
6. **Orphaned Record Injection**: Creating a `DmrvRecord` under `/tenants/nonexistent_tenant/dmrv_records/rec_x`.
7. **ID Poisoning (Denial of Wallet)**: Creating an asset with a 1,500-character document ID containing invalid symbols (`../drop`).
8. **Identity Spoofing**: User A creates a `SprintTask` with `createdByUid: "userB"`.
9. **Timestamp Backdating**: Creating a `DmrvRecord` with client-forged `createdAt` instead of `request.time`.
10. **Immutable Field Tampering**: Updating a `DmrvRecord` to alter `emissionsTco2e` or `lineageHash`.
11. **Terminal State Violation**: Updating an `archived` Tenant as a non-admin user.
12. **Unauthorized List Scraping**: Non-member attempting `list` on `/tenants` or `/tenants/{tenantId}/assets`.
