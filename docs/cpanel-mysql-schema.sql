-- ============================================================================
-- Arknex & BFMA Green Building GTM & Digital MRV (dMRV) Platform
-- Production Multi-Tenant Schema for Linux + cPanel MySQL 8.0+
-- Enforces strict tenant_id isolation, RBAC, P1-P5 assets, dMRV lineage,
-- Agile sprint management, and Third-Party Sync API keys.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Multi-Tenant Organizations (Root Isolation Boundary)
CREATE TABLE IF NOT EXISTS `tenants` (
  `tenant_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `emirate` ENUM('Dubai', 'Ras Al Khaimah', 'Fujairah', 'Abu Dhabi', 'Sharjah') NOT NULL,
  `segment` ENUM(
    'Hospitality / Serviced Apartments',
    'Industrial / Logistics / Ports',
    'Residential Tower Associations',
    'Government / Semi-Government'
  ) NOT NULL,
  `commercial_model` VARCHAR(80) NOT NULL DEFAULT 'Option A: BFMA Prime / Arknex Sub',
  `rollout_phase` VARCHAR(64) NOT NULL DEFAULT 'Q1 2027 Dubai Launch',
  `active_bms_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('active', 'onboarding', 'archived') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`),
  INDEX `idx_tenants_emirate_status` (`emirate`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Users & Authentication Identity
CREATE TABLE IF NOT EXISTS `users` (
  `user_id` VARCHAR(128) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `password_hash` VARCHAR(255) NULL COMMENT 'Argon2id/scrypt hash for standalone Linux auth; NULL for OAuth/SSO',
  `is_platform_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tenant-Scoped RBAC Memberships
CREATE TABLE IF NOT EXISTS `tenant_members` (
  `tenant_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `role` ENUM('super_admin', 'bfma_fm_manager', 'arknex_auditor', 'tenant_viewer') NOT NULL,
  `organization` ENUM('Arknex', 'BFMA', 'Client') NOT NULL,
  `status` ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `user_id`),
  INDEX `idx_member_user` (`user_id`, `status`),
  CONSTRAINT `fk_tm_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Building Portfolio Assets (P1-P5 Five-Stage Offering)
CREATE TABLE IF NOT EXISTS `building_assets` (
  `asset_id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(140) NOT NULL,
  `emirate` VARCHAR(64) NOT NULL,
  `gfa_sqm` DECIMAL(12, 2) NOT NULL,
  `stage` ENUM('P1', 'P2', 'P3', 'P4', 'P5') NOT NULL DEFAULT 'P1',
  `certification_target` ENUM('LEED O+M', 'Al Sa''fat', 'Barjeel', 'MOCCAE MRV') NOT NULL,
  `bms_connected` TINYINT(1) NOT NULL DEFAULT 0,
  `baseline_emissions_tco2e` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `current_emissions_tco2e` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `compliance_score` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_by_uid` VARCHAR(128) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `asset_id`),
  INDEX `idx_assets_stage` (`tenant_id`, `stage`),
  CONSTRAINT `fk_asset_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Arknex dMRV Telemetry & Immutable Emissions Lineage
CREATE TABLE IF NOT EXISTS `dmrv_records` (
  `record_id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `asset_id` VARCHAR(64) NOT NULL,
  `source_type` ENUM('utility_bill', 'bms_trend', 'fuel_log', 'waste_record') NOT NULL,
  `scope` ENUM('Scope 1', 'Scope 2', 'Scope 3 Waste') NOT NULL,
  `quantity` DECIMAL(14, 3) NOT NULL,
  `unit` ENUM('kWh', 'Liters', 'Tonnes', 'RT-hr') NOT NULL,
  `emissions_tco2e` DECIMAL(12, 4) NOT NULL,
  `validation_status` ENUM('validated', 'pending_audit', 'flagged') NOT NULL DEFAULT 'pending_audit',
  `lineage_hash` CHAR(64) NOT NULL COMMENT 'SHA-256 tamper-evident audit hash',
  `reporting_period` VARCHAR(10) NOT NULL COMMENT 'YYYY-MM',
  `created_by_uid` VARCHAR(128) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `record_id`),
  INDEX `idx_dmrv_period` (`tenant_id`, `reporting_period`, `scope`),
  INDEX `idx_dmrv_asset` (`tenant_id`, `asset_id`),
  CONSTRAINT `fk_dmrv_asset` FOREIGN KEY (`tenant_id`, `asset_id`)
    REFERENCES `building_assets` (`tenant_id`, `asset_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Agile Methodology — Sprint Tasks & Feature Backlog
CREATE TABLE IF NOT EXISTS `sprint_tasks` (
  `task_id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `sprint_name` VARCHAR(80) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `stage` ENUM('P1', 'P2', 'P3', 'P4', 'P5') NOT NULL,
  `owner_team` ENUM('BFMA', 'Arknex', 'Joint') NOT NULL,
  `status` ENUM('backlog', 'in_progress', 'audit_review', 'done') NOT NULL DEFAULT 'backlog',
  `story_points` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `priority` ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
  `created_by_uid` VARCHAR(128) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `task_id`),
  INDEX `idx_sprint_status` (`tenant_id`, `sprint_name`, `status`),
  CONSTRAINT `fk_sprint_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Third-Party Data Sync API Keys (Tenant-Scoped, SHA-256 Hashed)
CREATE TABLE IF NOT EXISTS `tenant_sync_keys` (
  `key_id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `label` VARCHAR(80) NOT NULL,
  `key_prefix` VARCHAR(16) NOT NULL,
  `key_hash` CHAR(64) NOT NULL,
  `scopes` VARCHAR(120) NOT NULL DEFAULT 'dmrv:write,dmrv:read',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_used_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `key_id`),
  UNIQUE KEY `uq_sync_key_hash` (`key_hash`),
  CONSTRAINT `fk_synckey_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
