-- Production Additive-Only 3NF Schema Migration (00002_phase2_publisher_platform.sql)
-- Newspaper Automatic Composition Enterprise SaaS Platform (Phase 2)
-- MANDATE: Strictly 0 breaking changes to Phase 1 tables (organizations, users, wallets, generation_history).

SET timezone = 'UTC';
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Additive ENUM Type Declarations
DO $$ BEGIN
    CREATE TYPE license_tier AS ENUM ('BASIC', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE device_status AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE edition_type AS ENUM ('MORNING', 'EVENING', 'WEEKEND', 'DISTRICT', 'CITY', 'ELECTION', 'FESTIVAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE color_space AS ENUM ('CMYK_FOGRA39', 'CMYK_JAPAN_COLOR', 'RGB_DIGITAL', 'GRAYSCALE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT_PRESS_STOPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('OPEN', 'INVESTIGATING', 'AWAITING_PUBLISHER', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. License Management Table (Module 1)
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    license_key VARCHAR(100) UNIQUE NOT NULL,
    tier license_tier NOT NULL DEFAULT 'BASIC',
    start_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    max_devices INTEGER NOT NULL DEFAULT 2,
    max_concurrent_sessions INTEGER NOT NULL DEFAULT 1,
    monthly_generation_limit INTEGER NOT NULL DEFAULT 30,
    storage_limit_bytes BIGINT NOT NULL DEFAULT 21474836480, -- 20 GB default
    current_generation_count INTEGER DEFAULT 0,
    current_storage_used_bytes BIGINT DEFAULT 0,
    auto_renew_via_wallet BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_non_negative_usage CHECK (current_generation_count >= 0 AND current_storage_used_bytes >= 0)
);

-- 2. Device Security Tracking Table (Module 2)
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    browser VARCHAR(100) NOT NULL,
    operating_system VARCHAR(100) NOT NULL,
    ip_address INET NULL,
    country VARCHAR(100) DEFAULT 'India',
    city VARCHAR(100) DEFAULT 'New Delhi',
    timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
    status device_status NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_device_fp UNIQUE (user_id, device_fingerprint)
);

-- 3. Enterprise Team Roles & Newsroom Mapping (Module 3)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_role VARCHAR(50) NOT NULL CHECK (assigned_role IN ('OWNER', 'PUBLISHER', 'SUB_EDITOR', 'DESIGNER', 'REPORTER', 'ACCOUNTANT', 'VIEWER', 'ADMIN')),
    desk_department VARCHAR(100) DEFAULT 'General Publishing',
    can_authorize_publish BOOLEAN DEFAULT FALSE,
    invited_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_user_mapping UNIQUE (organization_id, user_id)
);

-- 4. Multi-Edition Newspaper Management (Module 4)
CREATE TABLE IF NOT EXISTS newspaper_editions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    newspaper_id UUID NOT NULL REFERENCES newspapers(id) ON DELETE CASCADE,
    edition_name VARCHAR(150) NOT NULL,
    edition_type edition_type NOT NULL DEFAULT 'MORNING',
    inherit_parent_ank BOOLEAN NOT NULL DEFAULT TRUE,
    custom_ank_number INTEGER NULL DEFAULT 1,
    custom_header_url TEXT NULL,
    custom_logo_url TEXT NULL,
    custom_footer_url TEXT NULL,
    default_page_count INTEGER NOT NULL DEFAULT 12,
    publication_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Reusable Studio Template Manager (Module 5)
CREATE TABLE IF NOT EXISTS studio_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_name VARCHAR(200) NOT NULL,
    edition_type edition_type NOT NULL DEFAULT 'MORNING',
    is_default BOOLEAN DEFAULT FALSE,
    geometry_rules JSONB NOT NULL DEFAULT '{"margins_mm": {"top": 12.5, "bottom": 12.5, "inner": 15.0, "outer": 12.5}, "columns": 8}'::jsonb,
    typography_rules JSONB NOT NULL DEFAULT '{"primary_font": "Noto Serif Devanagari", "headline_scale": 1.25}'::jsonb,
    watermark_config JSONB NOT NULL DEFAULT '{"text": "PROOF ONLY", "opacity": 0.15, "enabled": false}'::jsonb,
    color_scheme_hex JSONB NOT NULL DEFAULT '{"primary": "#8B0000", "accent": "#1B365D"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Cloud Asset & Advertisement Library (Modules 6 & 7)
CREATE TABLE IF NOT EXISTS cloud_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    folder_path VARCHAR(150) NOT NULL DEFAULT '/Mastheads',
    file_name VARCHAR(255) NOT NULL,
    r2_object_url TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) DEFAULT 'image/png',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS advertisements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_name VARCHAR(200) NOT NULL,
    campaign_title VARCHAR(200) NOT NULL,
    geometric_size VARCHAR(100) NOT NULL DEFAULT '8x4 Col cm',
    priority_level INTEGER DEFAULT 1,
    placement_count INTEGER DEFAULT 0,
    r2_artwork_url TEXT NOT NULL,
    start_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Professional Prepress & Print Settings (Module 8)
CREATE TABLE IF NOT EXISTS print_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    color_profile color_space NOT NULL DEFAULT 'CMYK_FOGRA39',
    bleed_tolerance_mm DECIMAL(4,2) NOT NULL DEFAULT 3.00,
    embed_crop_marks BOOLEAN NOT NULL DEFAULT TRUE,
    embed_color_bars BOOLEAN NOT NULL DEFAULT TRUE,
    pdf_standard VARCHAR(50) NOT NULL DEFAULT 'PDF/X-1a',
    target_image_dpi INTEGER NOT NULL DEFAULT 300,
    compression_level VARCHAR(50) DEFAULT 'LOSSLESS_PREPRESS',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Immutable Parent-Child PDF Versioning (Module 11)
CREATE TABLE IF NOT EXISTS pdf_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    generation_history_id UUID NOT NULL REFERENCES generation_history(id) ON DELETE CASCADE,
    newspaper_id UUID NOT NULL REFERENCES newspapers(id) ON DELETE RESTRICT,
    edition_id UUID NULL REFERENCES newspaper_editions(id) ON DELETE SET NULL,
    issue_number INTEGER NOT NULL,
    version_sequence INTEGER NOT NULL DEFAULT 1,
    r2_pdf_url TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    is_active_master BOOLEAN NOT NULL DEFAULT TRUE,
    commit_notes TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_history_version_sequence UNIQUE (generation_history_id, version_sequence)
);

-- 9. Internal Notifications & Support Center Tickets (Modules 15 & 16)
CREATE TABLE IF NOT EXISTS system_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'SYSTEM_ALERT',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    ticket_number SERIAL UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'PREPRESS_CMYK',
    priority ticket_priority NOT NULL DEFAULT 'MEDIUM',
    status ticket_status NOT NULL DEFAULT 'OPEN',
    assigned_staff_name VARCHAR(150) NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    sender_name VARCHAR(150) NOT NULL,
    is_admin_reply BOOLEAN DEFAULT FALSE,
    message_text TEXT NOT NULL,
    attachment_r2_url TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. White-Label Ready Domain Configuration (Module 24) & Feature Flags (Module 23)
CREATE TABLE IF NOT EXISTS white_label_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    custom_domain VARCHAR(255) UNIQUE NOT NULL,
    brand_name VARCHAR(200) NOT NULL,
    brand_logo_url TEXT NULL,
    brand_favicon_url TEXT NULL,
    primary_theme_color VARCHAR(20) DEFAULT '#4F46E5',
    custom_smtp_sender VARCHAR(255) NULL,
    cname_verified BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_key VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    is_globally_enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    target_license_tier license_tier NULL,
    whitelisted_org_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance & Full-Text Search Indexes (Module 17 Support)
CREATE INDEX IF NOT EXISTS idx_licenses_org ON licenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_status ON user_devices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_org_folder ON cloud_assets(organization_id, folder_path);
CREATE INDEX IF NOT EXISTS idx_ads_expiry_status ON advertisements(expiry_date, status);
CREATE INDEX IF NOT EXISTS idx_pdf_versions_history ON pdf_versions(generation_history_id, version_sequence DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON system_notifications(user_id, is_read);

-- GIN Trigram Search Indexes for Millisecond Search Queries
CREATE INDEX IF NOT EXISTS idx_trgm_assets_name ON cloud_assets USING GIN (file_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_ads_client ON advertisements USING GIN (client_name gin_trgm_ops, campaign_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_tickets_subject ON support_tickets USING GIN (subject gin_trgm_ops);

-- Bootstrap Default Enterprise License for Super Admin Demo Org
DO $$
DECLARE
    demo_org_id UUID;
BEGIN
    SELECT id INTO demo_org_id FROM organizations WHERE org_name = 'Enterprise Publishing HQ' LIMIT 1;
    IF demo_org_id IS NOT NULL THEN
        INSERT INTO licenses (organization_id, license_key, tier, start_date, expiry_date, max_devices, max_concurrent_sessions, monthly_generation_limit, storage_limit_bytes)
        VALUES (demo_org_id, 'NP-ENT-2026-HQ00-DEMO-XXXX', 'ENTERPRISE', NOW(), NOW() + INTERVAL '10 years', 99, 99, 9999, 1099511627776)
        ON CONFLICT (license_key) DO NOTHING;

        INSERT INTO print_settings (organization_id, color_profile, bleed_tolerance_mm, embed_crop_marks, target_image_dpi)
        VALUES (demo_org_id, 'CMYK_FOGRA39', 3.00, TRUE, 300)
        ON CONFLICT (organization_id) DO NOTHING;

        INSERT INTO white_label_configs (organization_id, custom_domain, brand_name, primary_theme_color, cname_verified)
        VALUES (demo_org_id, 'portal.newspaper-erp.com', 'Newspaper Publishing ERP', '#4F46E5', TRUE)
        ON CONFLICT (custom_domain) DO NOTHING;
    END IF;
END $$;
