-- Production Additive-Only 3NF Schema Migration (00004_phase4_ecosystem_integrations.sql)
-- Newspaper Automatic Composition Enterprise Publishing Ecosystem & Integration Platform (Phase 4)
-- MANDATE: Strictly 0 breaking changes to Phase 1, Phase 2 & Phase 3 tables (organizations, users, wallets, newspapers, articles, ad_bookings, etc.).

SET timezone = 'UTC';
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Additive ENUM Type Declarations for Phase 4 Integration Workflows
DO $$ BEGIN
    CREATE TYPE webhook_event_type AS ENUM (
        'pdf_generated', 'payment_success', 'wallet_recharge', 'subscription_expiry', 
        'article_published', 'advertisement_approved', 'delivery_retry', 'print_order_completed', 'consumable_deficit_alert'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE crm_pipeline_stage AS ENUM ('PROSPECTING', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'RATE_NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE procurement_status AS ENUM ('DRAFT_PR', 'PENDING_VENDOR_COMPARE', 'PENDING_CFO_APPROVAL', 'APPROVED_PO_ISSUED', 'RECEIVED_VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE dlq_status AS ENUM ('PENDING', 'DELIVERED_SUCCESS', 'RETRYING', 'DLQ_FAILED', 'REPLAYED_RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Public Developer Platform, API Gateway & Usage Billing (Modules 1, 2 & 19)
CREATE TABLE IF NOT EXISTS api_client_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    developer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_name VARCHAR(200) NOT NULL,
    api_key_hash VARCHAR(255) UNIQUE NOT NULL, -- Bcrypt / SHA-256 secure hash
    client_id VARCHAR(100) UNIQUE NOT NULL,    -- OAuth2 Client ID
    client_secret_hash VARCHAR(255) NOT NULL,  -- OAuth2 Secret Hash
    scopes TEXT[] DEFAULT '{"epaper:read", "webhook:receive"}'::text[],
    environment VARCHAR(20) DEFAULT 'SANDBOX', -- SANDBOX, PRODUCTION
    rate_limit_rpm INTEGER DEFAULT 1200,       -- Requests per minute Token Bucket Quota
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_usage_meters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_credential_id UUID NULL REFERENCES api_client_credentials(id) ON DELETE SET NULL,
    billing_month VARCHAR(20) NOT NULL, -- e.g. "2026-08"
    total_api_requests BIGINT DEFAULT 0,
    newspaper_generations_count INTEGER DEFAULT 0,
    pages_rendered_count INTEGER DEFAULT 0,
    storage_consumed_mb DECIMAL(12,2) DEFAULT 0.00,
    bandwidth_egress_gb DECIMAL(12,2) DEFAULT 0.00,
    active_seat_licenses INTEGER DEFAULT 1,
    overage_charges_inr DECIMAL(12,2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_monthly_usage UNIQUE (organization_id, billing_month)
);

-- 2. Outgoing Webhook Engine & Dead Letter Queue Replay Vaults (Modules 3 & 17)
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    endpoint_url TEXT NOT NULL,
    secret_signing_key VARCHAR(150) NOT NULL, -- Used for HMAC SHA-256 header signing (X-Newspaper-Signature)
    subscribed_events webhook_event_type[] NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type webhook_event_type NOT NULL,
    payload_json JSONB NOT NULL,
    http_status_code INTEGER NULL,
    error_message TEXT NULL,
    attempt_number INTEGER DEFAULT 1,
    delivery_status dlq_status NOT NULL DEFAULT 'PENDING',
    next_retry_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_store_dlq (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain_event_name VARCHAR(150) NOT NULL, -- e.g. "article.published", "consumable.reorder_triggered"
    entity_id UUID NOT NULL,
    payload_snapshot JSONB NOT NULL,
    status dlq_status NOT NULL DEFAULT 'PENDING',
    failure_reason TEXT NULL,
    processed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Enterprise Connectors & Digital Cold Storage Archives (Modules 4 & 13)
CREATE TABLE IF NOT EXISTS enterprise_connectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL, -- GOOGLE_DRIVE, ONEDRIVE, DROPBOX, AWS_S3, CLOUDFLARE_R2, SFTP
    connection_name VARCHAR(150) NOT NULL,
    auth_config_encrypted JSONB NOT NULL, -- Encrypted access tokens & bucket secrets
    sync_direction VARCHAR(20) DEFAULT 'BIDIRECTIONAL', -- INBOUND_PULL, OUTBOUND_PUSH, BIDIRECTIONAL
    last_sync_at TIMESTAMPTZ NULL,
    status VARCHAR(50) DEFAULT 'CONNECTED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cold_storage_archives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    newspaper_edition_id UUID NULL REFERENCES newspaper_editions(id) ON DELETE SET NULL,
    archive_title VARCHAR(255) NOT NULL,
    storage_tier VARCHAR(50) NOT NULL DEFAULT 'AWS_S3_GLACIER_DEEP_ARCHIVE', -- HOT_R2, WARM_S3_IA, COLD_GLACIER
    file_size_bytes BIGINT NOT NULL,
    r2_or_glacier_uri TEXT NOT NULL,
    sha256_checksum VARCHAR(255) NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Digital Subscriptions, Coupons & Enterprise CRM (Modules 7 & 8)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_code VARCHAR(100) UNIQUE NOT NULL,
    plan_name VARCHAR(200) NOT NULL, -- e.g. "Annual Institutional Campus Pass", "Family Pro Bundle (4 Seats)"
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'ANNUAL', -- MONTHLY, QUARTERLY, ANNUAL
    price_inr DECIMAL(10,2) NOT NULL,
    max_seat_count INTEGER DEFAULT 1,
    ip_range_whitelist TEXT[] DEFAULT '{}', -- For university campus library authentication
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    promo_code VARCHAR(50) UNIQUE NOT NULL, -- e.g. "DIWALI2026", "FREEDOM50"
    discount_type VARCHAR(20) DEFAULT 'PERCENTAGE', -- PERCENTAGE, FLAT_DEDUCTION
    discount_val DECIMAL(8,2) NOT NULL DEFAULT 20.00,
    min_spend_inr DECIMAL(10,2) DEFAULT 0.00,
    max_redemptions INTEGER DEFAULT 1000,
    current_redemptions INTEGER DEFAULT 0,
    expiry_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_customer_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    account_manager_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    agency_or_client_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(200) NOT NULL,
    contact_phone VARCHAR(50) NOT NULL,
    contact_email VARCHAR(200) NOT NULL,
    pipeline_stage crm_pipeline_stage NOT NULL DEFAULT 'PROSPECTING',
    estimated_annual_deal_inr DECIMAL(14,2) DEFAULT 500000.00,
    contract_renewal_date DATE NULL, -- For 45-day early warning renewal alarms
    notes_summary TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_meeting_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES crm_customer_leads(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    interaction_type VARCHAR(50) DEFAULT 'IN_PERSON_MEETING', -- TELEPHONE, VIDEO_CALL, EMAIL_PITCH
    meeting_subject VARCHAR(200) NOT NULL,
    detailed_notes TEXT NOT NULL,
    next_followup_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. External Stakeholder Portals & Enterprise Procurement (Modules 9, 10, 11 & 12)
CREATE TABLE IF NOT EXISTS advertiser_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    advertiser_code VARCHAR(100) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    statutory_gstin VARCHAR(25) UNIQUE NOT NULL,
    authorized_email VARCHAR(200) NOT NULL,
    portal_access_token VARCHAR(255) NOT NULL,
    total_ad_spend_inr DECIMAL(14,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS printing_vendor_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    print_order_id UUID NOT NULL REFERENCES print_orders(id) ON DELETE CASCADE,
    vendor_organization_name VARCHAR(255) NOT NULL,
    vendor_contact_phone VARCHAR(50) NOT NULL,
    prepress_r2_master_url TEXT NOT NULL, -- Presigned CMYK CTP Plate Master
    target_copies INTEGER NOT NULL,
    accepted_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    reported_waste_copies INTEGER DEFAULT 0,
    quality_audit_grade VARCHAR(20) DEFAULT 'A_PLUS_FOGRA_VERIFIED',
    status VARCHAR(50) DEFAULT 'DISPATCHED_TO_VENDOR',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    po_number VARCHAR(100) UNIQUE NOT NULL,
    supplier_name VARCHAR(255) NOT NULL, -- e.g. "Hindustan Newsprint Mills Ltd"
    item_code VARCHAR(100) NOT NULL,     -- e.g. "PAPER_REEL_45GSM", "INK_OFFSET_BLACK_K"
    quantity_ordered DECIMAL(12,2) NOT NULL,
    unit_price_inr DECIMAL(12,2) NOT NULL,
    total_po_val_inr DECIMAL(14,2) NOT NULL,
    delivery_due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'ORDER_ISSUED_PENDING_DELIVERY', -- ACKNOWLEDGED, DELIVERED_RECEIPT_OK
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS procurement_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    item_code VARCHAR(100) NOT NULL,
    requested_quantity DECIMAL(12,2) NOT NULL,
    estimated_cost_inr DECIMAL(14,2) NOT NULL,
    status procurement_status NOT NULL DEFAULT 'DRAFT_PR',
    cfo_approval_notes TEXT NULL,
    linked_po_id UUID NULL REFERENCES supplier_purchase_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Business Intelligence 2.0 KPI Warehouse, Plugin SDK & SIEM Security (Modules 22, 23, 24 & 26)
CREATE TABLE IF NOT EXISTS bi_kpi_warehousing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    daily_gross_ad_revenue_inr DECIMAL(12,2) DEFAULT 0.00,
    daily_circulation_sales_inr DECIMAL(12,2) DEFAULT 0.00,
    daily_epaper_active_readers INTEGER DEFAULT 0,
    newsroom_words_published INTEGER DEFAULT 0,
    press_machine_spoilage_pct DECIMAL(5,2) DEFAULT 1.05,
    api_gateway_requests_total BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_kpi_date UNIQUE (organization_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS plugin_manifests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id VARCHAR(150) UNIQUE NOT NULL, -- e.g. "com.syndicate.ai.devanagari-ocr-pro"
    plugin_name VARCHAR(200) NOT NULL,
    author_name VARCHAR(150) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    description TEXT NOT NULL,
    permissions_requested TEXT[] NOT NULL,
    sandbox_webhook_entrypoint TEXT NOT NULL,
    is_verified_marketplace BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS installed_tenant_plugins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plugin_manifest_id UUID NOT NULL REFERENCES plugin_manifests(id) ON DELETE CASCADE,
    installed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    custom_config_json JSONB DEFAULT '{}'::jsonb,
    is_enabled BOOLEAN DEFAULT TRUE,
    installed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_installed_plugin UNIQUE (organization_id, plugin_manifest_id)
);

CREATE TABLE IF NOT EXISTS siem_audit_streams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    action_event VARCHAR(150) NOT NULL, -- LOGIN_ATTEMPT, API_KEY_GENERATED, THREAT_BRUTE_FORCE_BLOCKED
    client_ip VARCHAR(50) NOT NULL,
    user_agent TEXT NULL,
    severity VARCHAR(20) DEFAULT 'INFO', -- INFO, WARNING, CRITICAL_SECURITY_INCIDENT
    metadata_json JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance & Universal Search Indexes for Phase 4 Ecosystem Integration
CREATE INDEX IF NOT EXISTS idx_api_client_creds_org ON api_client_credentials(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status_retry ON webhook_delivery_logs(delivery_status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_event_dlq_status ON event_store_dlq(status, domain_event_name);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage_renewal ON crm_customer_leads(pipeline_stage, contract_renewal_date);
CREATE INDEX IF NOT EXISTS idx_supplier_po_status_due ON supplier_purchase_orders(status, delivery_due_date);
CREATE INDEX IF NOT EXISTS idx_bi_kpi_org_date ON bi_kpi_warehousing(organization_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_siem_audit_org_severity ON siem_audit_streams(organization_id, severity, recorded_at);

-- GIN Trigram Search Indexes for Universal Discovery Queries (Deliverable #14)
CREATE INDEX IF NOT EXISTS idx_trgm_crm_leads_agency ON crm_customer_leads USING GIN (agency_or_client_name gin_trgm_ops, contact_person gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_advertiser_profiles_name ON advertiser_profiles USING GIN (company_name gin_trgm_ops, statutory_gstin gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_supplier_po_number ON supplier_purchase_orders USING GIN (po_number gin_trgm_ops, supplier_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_plugin_manifests_name ON plugin_manifests USING GIN (plugin_name gin_trgm_ops, description gin_trgm_ops);

-- Bootstrap Default Newspaper Ecosystem & Marketplace Records for Super Admin HQ
DO $$
DECLARE
    demo_org_id UUID;
    demo_user_id UUID;
    demo_plugin_id UUID;
    demo_print_order_id UUID;
BEGIN
    SELECT id INTO demo_org_id FROM organizations WHERE org_name = 'Enterprise Publishing HQ' LIMIT 1;
    SELECT id INTO demo_user_id FROM users WHERE username LIKE '%admin%' OR id IS NOT NULL LIMIT 1;
    SELECT id INTO demo_print_order_id FROM print_orders LIMIT 1;
    
    IF demo_org_id IS NOT NULL AND demo_user_id IS NOT NULL THEN
        -- Seed API Client Credential
        INSERT INTO api_client_credentials (organization_id, developer_user_id, client_name, api_key_hash, client_id, client_secret_hash, environment)
        VALUES (demo_org_id, demo_user_id, 'National News Aggregator Pro Engine', 'np_live_mock_hash_8910xxxx', 'client_id_media_syndicate_01', 'mock_secret_hash_9999', 'PRODUCTION')
        ON CONFLICT DO NOTHING;

        -- Seed Subscription Plans & Coupon Engine
        INSERT INTO subscription_plans (organization_id, plan_code, plan_name, billing_interval, price_inr, max_seat_count)
        VALUES 
            (demo_org_id, 'PLAN-UNIV-CAMPUS-2026', 'Institutional Campus Library Access (IP-Auth)', 'ANNUAL', 45000.00, 500),
            (demo_org_id, 'PLAN-FAMILY-BUNDLE', 'Family Digital ePaper Pass (4 Shared Reader Seats)', 'ANNUAL', 1499.00, 4)
        ON CONFLICT (plan_code) DO NOTHING;

        INSERT INTO subscription_coupons (organization_id, promo_code, discount_type, discount_val, min_spend_inr, expiry_date)
        VALUES (demo_org_id, 'DIWALI2026', 'PERCENTAGE', 30.00, 499.00, NOW() + INTERVAL '3 months')
        ON CONFLICT (promo_code) DO NOTHING;

        -- Seed Enterprise CRM Lead & Renewal Warning
        INSERT INTO crm_customer_leads (organization_id, account_manager_user_id, agency_or_client_name, contact_person, contact_phone, contact_email, pipeline_stage, estimated_annual_deal_inr, contract_renewal_date)
        VALUES (demo_org_id, demo_user_id, 'Ogilvy Advertising & Corporate Media Ltd', 'Siddharth Mehta (Media VP)', '+91 98100-22446', 'mehta.s@ogilvy-media-demo.in', 'CLOSED_WON', 4500000.00, CURRENT_DATE + INTERVAL '25 days')
        ON CONFLICT DO NOTHING;

        -- Seed Advertiser KYC Profile
        INSERT INTO advertiser_profiles (organization_id, advertiser_code, company_name, statutory_gstin, authorized_email, portal_access_token)
        VALUES (demo_org_id, 'ADV-TATA-MOTORS-HQ', 'Tata Motors Corporate Marketing Division', '27AAACT2727Q1Z4', 'media.buying@tatamotors.demo', 'tok_adv_tata_sec_891')
        ON CONFLICT (advertiser_code) DO NOTHING;

        -- Seed Supplier Purchase Order
        INSERT INTO supplier_purchase_orders (organization_id, po_number, supplier_name, item_code, quantity_ordered, unit_price_inr, total_po_val_inr, delivery_due_date, status)
        VALUES (demo_org_id, 'PO-2026-PAPER-991', 'Hindustan Newsprint Paper Mills & Logistics Ltd', 'PAPER_REEL_45GSM', 50.00, 68000.00, 3400000.00, CURRENT_DATE + INTERVAL '5 days', 'ORDER_ISSUED_PENDING_DELIVERY')
        ON CONFLICT (po_number) DO NOTHING;

        -- Seed Marketplace Plugin Manifest & Tenant Installation
        INSERT INTO plugin_manifests (plugin_id, plugin_name, author_name, version, description, permissions_requested, sandbox_webhook_entrypoint)
        VALUES ('com.syndicate.ai.devanagari-ocr', 'Devanagari OCR & Headline Assistant Pro', 'National Media Labs', '1.4.0', 'Real-time Hindi & Marathi grammatical spellcheck, headline generation, and photo scan OCR.', '{"editorial:read", "ai_extension:execute"}'::text[], 'https://plugins.media-labs.com/webhook/execute')
        ON CONFLICT (plugin_id) DO NOTHING;

        SELECT id INTO demo_plugin_id FROM plugin_manifests WHERE plugin_id = 'com.syndicate.ai.devanagari-ocr' LIMIT 1;
        IF demo_plugin_id IS NOT NULL THEN
            INSERT INTO installed_tenant_plugins (organization_id, plugin_manifest_id, installed_by_user_id)
            VALUES (demo_org_id, demo_plugin_id, demo_user_id)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Seed BI 2.0 KPI Warehouse Snapshot
        INSERT INTO bi_kpi_warehousing (organization_id, snapshot_date, daily_gross_ad_revenue_inr, daily_circulation_sales_inr, daily_epaper_active_readers, newsroom_words_published, press_machine_spoilage_pct, api_gateway_requests_total)
        VALUES (demo_org_id, CURRENT_DATE, 185000.00, 64200.00, 14250, 42800, 1.07, 184290)
        ON CONFLICT (organization_id, snapshot_date) DO UPDATE SET daily_epaper_active_readers = 14250;

        -- Seed SIEM Security Threat Audit
        INSERT INTO siem_audit_streams (organization_id, actor_user_id, action_event, client_ip, severity, metadata_json)
        VALUES (demo_org_id, demo_user_id, 'API_GATEWAY_CREDENTIALS_VERIFIED', '192.168.1.104', 'INFO', '{"client_id":"client_id_media_syndicate_01", "scopes_granted":["epaper:read", "webhook:receive"]}'::jsonb)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
