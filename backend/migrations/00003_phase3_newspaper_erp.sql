-- Production Additive-Only 3NF Schema Migration (00003_phase3_newspaper_erp.sql)
-- Newspaper Automatic Composition Enterprise ERP & Editorial Platform (Phase 3)
-- MANDATE: Strictly 0 breaking changes to Phase 1 & Phase 2 tables (organizations, users, wallets, newspapers, licenses, etc.).

SET timezone = 'UTC';
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Additive ENUM Type Declarations for ERP Workflows
DO $$ BEGIN
    CREATE TYPE assignment_status AS ENUM ('DRAFT', 'ASSIGNED', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'PUBLISHED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE editorial_stage AS ENUM ('PENDING_SUB_EDITOR', 'PENDING_NEWS_EDITOR', 'PENDING_CHIEF_EDITOR', 'APPROVED_FOR_PAGE_PLANNER', 'REJECTED_NEEDS_REVISION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ad_type AS ENUM ('DISPLAY', 'CLASSIFIED', 'TENDER', 'GOVERNMENT', 'POLITICAL', 'FESTIVAL_SUPPLEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE press_state AS ENUM ('IDLE', 'PRINTING_ACTIVE', 'MAINTENANCE_OVERHAUL', 'FAULT_TRIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE invoice_type AS ENUM ('TAX_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PROFORMA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Multi-Company Holding Syndicate Architecture (Module 24)
CREATE TABLE IF NOT EXISTS holding_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    syndicate_name VARCHAR(255) UNIQUE NOT NULL,
    headquarters_city VARCHAR(150) DEFAULT 'New Delhi',
    central_gstin VARCHAR(25) NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS holding_subsidiaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    holding_id UUID NOT NULL REFERENCES holding_companies(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ownership_percentage DECIMAL(5,2) DEFAULT 100.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_syndicate UNIQUE (holding_id, organization_id)
);

-- 2. HR Management, Workforce Roster & Payroll Slips (Module 17)
CREATE TABLE IF NOT EXISTS hr_employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    designation VARCHAR(150) NOT NULL,
    department VARCHAR(100) DEFAULT 'Editorial News Desk',
    monthly_base_salary_inr DECIMAL(12,2) DEFAULT 45000.00,
    pan_tax_number VARCHAR(20) NULL,
    joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_payroll_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    billing_month VARCHAR(20) NOT NULL, -- e.g. "2026-08"
    gross_salary_inr DECIMAL(12,2) NOT NULL,
    tds_withheld_inr DECIMAL(12,2) DEFAULT 0.00,
    net_paid_inr DECIMAL(12,2) NOT NULL,
    disbursed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_employee_monthly_payroll UNIQUE (employee_id, billing_month)
);

-- 3. Newsroom Reporter Profile, Beats & Multi-Beat Mapping (Modules 1, 2 & 3)
CREATE TABLE IF NOT EXISTS reporters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id UUID UNIQUE NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    reporter_code VARCHAR(50) UNIQUE NOT NULL,
    photo_url TEXT NULL,
    assigned_bureau VARCHAR(150) DEFAULT 'New Delhi Headquarters',
    assigned_district VARCHAR(150) DEFAULT 'National Desk',
    contact_phone VARCHAR(50) NOT NULL,
    emergency_contact VARCHAR(150) NULL,
    performance_score INTEGER DEFAULT 100,
    articles_submitted INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    beat_name VARCHAR(100) NOT NULL,
    category VARCHAR(100) DEFAULT 'STANDARD', -- Politics, Crime, Sports, Election, Custom
    description TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_beat_name UNIQUE (organization_id, beat_name)
);

CREATE TABLE IF NOT EXISTS reporter_beat_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES reporters(id) ON DELETE CASCADE,
    beat_id UUID NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
    is_primary_beat BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_reporter_beat UNIQUE (reporter_id, beat_id)
);

-- 4. Assignment Engine, Article Repository & 5-Stage Approval Workflows (Modules 4, 5 & 6)
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reporter_id UUID NOT NULL REFERENCES reporters(id) ON DELETE CASCADE,
    beat_id UUID NULL REFERENCES beats(id) ON DELETE SET NULL,
    headline VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(50) DEFAULT 'NORMAL', -- NORMAL, HIGH, URGENT_FRONT_PAGE
    target_district VARCHAR(100) NULL,
    deadline_timestamp TIMESTAMPTZ NOT NULL,
    status assignment_status NOT NULL DEFAULT 'ASSIGNED',
    rejection_reason TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES reporters(id) ON DELETE RESTRICT,
    assignment_id UUID NULL REFERENCES assignments(id) ON DELETE SET NULL,
    headline VARCHAR(255) NOT NULL,
    subheadline VARCHAR(255) NULL,
    body_text TEXT NOT NULL,
    target_language VARCHAR(50) DEFAULT 'HINDI_DEVANAGARI',
    seo_tags TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    word_count INTEGER DEFAULT 0,
    current_stage editorial_stage NOT NULL DEFAULT 'PENDING_SUB_EDITOR',
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS article_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    editor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revision_sequence SERIAL NOT NULL,
    headline_snapshot VARCHAR(255) NOT NULL,
    body_snapshot TEXT NOT NULL,
    diff_summary VARCHAR(255) DEFAULT 'Editorial desk layout & grammatical refinements',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS editorial_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stage_reviewed editorial_stage NOT NULL,
    action_taken VARCHAR(50) NOT NULL, -- APPROVED, REJECTED
    comments TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Professional DAM Photo Repository (Module 7)
CREATE TABLE IF NOT EXISTS dam_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    article_id UUID NULL REFERENCES articles(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    caption TEXT NULL,
    photographer_name VARCHAR(150) DEFAULT 'Staff Field Photographer',
    copyright_holder VARCHAR(200) DEFAULT 'In-House Publishing Syndicate',
    license_type VARCHAR(100) DEFAULT 'STAFF_EXCLUSIVE', -- WIRE_SYNDICATE, ONE_TIME_BUY
    r2_original_url TEXT NOT NULL, -- 300-600 DPI CMYK Prepress Master
    r2_compressed_url TEXT NOT NULL, -- sRGB ePaper Web Edition
    r2_thumbnail_url TEXT NOT NULL, -- 200x200 UI preview
    gps_coordinates VARCHAR(100) NULL, -- e.g. "28.6139° N, 77.2090° E"
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Commercial Advertisement Booking & Visual Page Planner Grid (Modules 8, 9 & 10)
CREATE TABLE IF NOT EXISTS ad_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_name VARCHAR(200) NOT NULL,
    agency_name VARCHAR(200) DEFAULT 'Direct Corporate Booking',
    ad_type ad_type NOT NULL DEFAULT 'DISPLAY',
    campaign_title VARCHAR(200) NOT NULL,
    requested_issue_date DATE NOT NULL,
    page_preference VARCHAR(100) DEFAULT 'ANY_INNER_PAGE', -- FRONT_PAGE_SOLUS, BACK_PAGE, PAGE_3
    width_columns INTEGER NOT NULL DEFAULT 4,
    height_cm DECIMAL(4,2) NOT NULL DEFAULT 20.00,
    total_col_cm DECIMAL(8,2) NOT NULL DEFAULT 80.00,
    gross_amount_inr DECIMAL(12,2) NOT NULL,
    gst_tax_inr DECIMAL(12,2) NOT NULL,
    net_payable_inr DECIMAL(12,2) NOT NULL,
    r2_artwork_url TEXT NOT NULL, -- PDF/X-1a Vector or 300 DPI CMYK PNG
    booking_status VARCHAR(50) DEFAULT 'CONFIRMED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_plan_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    edition_id UUID NOT NULL REFERENCES newspaper_editions(id) ON DELETE CASCADE,
    issue_date DATE NOT NULL,
    page_number INTEGER NOT NULL CHECK (page_number >= 1 AND page_number <= 48),
    slot_type VARCHAR(50) NOT NULL, -- ADVERT, ARTICLE_STORY, BREAKING_BOX, MASTHEAD_FIXED
    ad_booking_id UUID NULL REFERENCES ad_bookings(id) ON DELETE SET NULL,
    article_id UUID NULL REFERENCES articles(id) ON DELETE SET NULL,
    start_column INTEGER NOT NULL CHECK (start_column >= 1 AND start_column <= 8),
    start_height_cm DECIMAL(4,2) NOT NULL CHECK (start_height_cm >= 0.00 AND start_height_cm <= 54.00),
    width_columns INTEGER NOT NULL CHECK (width_columns >= 1),
    height_cm DECIMAL(4,2) NOT NULL CHECK (height_cm >= 1.00),
    is_locked BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Printing Press MIS, Consumable Supply Chain & Production Orders (Modules 11 & 12)
CREATE TABLE IF NOT EXISTS press_machines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    machine_name VARCHAR(200) NOT NULL,
    manufacturer VARCHAR(150) DEFAULT 'Manroland Cromaset High-Speed Web',
    max_copies_per_hour INTEGER DEFAULT 65000,
    current_state press_state NOT NULL DEFAULT 'IDLE',
    assigned_operator_shift VARCHAR(50) DEFAULT 'Night Graveyard Shift',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS press_consumables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL,
    item_name VARCHAR(200) NOT NULL, -- Newsprint Paper Reels (45 GSM), Offset Black Ink (K), CTP Plates
    unit_of_measure VARCHAR(50) NOT NULL, -- METRIC_TONS, KILOGRAMS, UNITS
    current_stock_val DECIMAL(12,2) NOT NULL DEFAULT 50.00,
    reorder_threshold DECIMAL(12,2) NOT NULL DEFAULT 10.00,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_consumable_code UNIQUE (organization_id, item_code)
);

CREATE TABLE IF NOT EXISTS print_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES newspaper_editions(id) ON DELETE RESTRICT,
    machine_id UUID NULL REFERENCES press_machines(id) ON DELETE SET NULL,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    target_issue_date DATE NOT NULL,
    target_copies INTEGER NOT NULL DEFAULT 50000,
    start_time TIMESTAMPTZ NULL,
    completion_time TIMESTAMPTZ NULL,
    actual_copies_printed INTEGER DEFAULT 0,
    waste_copies_count INTEGER DEFAULT 0,
    net_billable_circulation INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'SCHEDULED', -- SCHEDULED, PRINTING, COMPLETED, FAULTED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Circulation Distribution ERP & Customer Subscriptions (Modules 13 & 14)
CREATE TABLE IF NOT EXISTS distribution_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    vendor_code VARCHAR(50) UNIQUE NOT NULL,
    vendor_name VARCHAR(200) NOT NULL,
    category VARCHAR(50) DEFAULT 'STREET_NEWSSTAND_DEALER', -- MASTER_AGENT, DISTRICT_DEALER, VENDOR
    contact_phone VARCHAR(50) NOT NULL,
    assigned_route_name VARCHAR(150) DEFAULT 'Route 4 - City Railway Hub Circuit',
    delivery_vehicle_no VARCHAR(50) DEFAULT 'DL-01-AB-1234 (Express Fleet)',
    daily_copy_quota INTEGER NOT NULL DEFAULT 500,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distribution_ledgers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES distribution_vendors(id) ON DELETE CASCADE,
    issue_date DATE NOT NULL,
    copies_dispatched INTEGER NOT NULL DEFAULT 0,
    unsold_copies_returned INTEGER DEFAULT 0,
    net_billed_copies INTEGER DEFAULT 0,
    amount_due_inr DECIMAL(10,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'DISPATCHED_PENDING_RETURN', -- DELIVERED, RECONCILED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vendor_daily_dispatch UNIQUE (vendor_id, issue_date)
);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscriber_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    delivery_address TEXT NOT NULL,
    pin_code VARCHAR(20) NOT NULL,
    subscription_type VARCHAR(50) DEFAULT 'PRINT_PLUS_DIGITAL_EPAPER', -- EPAPER_ONLY, PRINT_ONLY
    billing_cycle VARCHAR(50) DEFAULT 'ANNUAL_PREPAID',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE NOT NULL,
    is_paused BOOLEAN DEFAULT FALSE,
    pause_until_date DATE NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Statutory GST Invoicing & Finance Accounting (Modules 15 & 16)
CREATE TABLE IF NOT EXISTS erp_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    invoice_type invoice_type NOT NULL DEFAULT 'TAX_INVOICE',
    client_name VARCHAR(200) NOT NULL,
    client_gstin VARCHAR(25) NULL,
    target_module VARCHAR(50) NOT NULL DEFAULT 'ADVERTISEMENT', -- ADVERTISEMENT, CIRCULATION, PRINTING
    gross_amount_inr DECIMAL(12,2) NOT NULL,
    gst_tax_rate_pct DECIMAL(5,2) DEFAULT 5.00, -- 5% Indian Print Media GST
    tax_amount_inr DECIMAL(12,2) NOT NULL,
    total_payable_inr DECIMAL(12,2) NOT NULL,
    irn_hash_code VARCHAR(255) NULL, -- Electronic invoice government verified hash
    payment_status VARCHAR(50) DEFAULT 'PENDING_COLLECTION', -- PAID, OVERDUE, CREDIT_APPLIED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    due_date DATE NOT NULL
);

-- 10. Public ePaper Reader CMS & Compliance Vaults (Modules 19, 20, 22, 23, 27 & 28)
CREATE TABLE IF NOT EXISTS public_cms_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL, -- e.g. "about-us", "rni-statutory-declaration", "advertise-with-us"
    page_title VARCHAR(200) NOT NULL,
    content_html TEXT NOT NULL,
    seo_meta_json JSONB DEFAULT '{"title":"Daily Times ePaper","schema_type":"NewsArticle"}'::jsonb,
    is_published BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_cms_slug UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS compliance_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doc_title VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'RNI_REGISTRATION', -- RNI_CERT, GST_REG, UNION_LABOR_CONTRACT
    r2_file_url TEXT NOT NULL,
    digital_signature_hash VARCHAR(255) NOT NULL, -- Cryptographic tamper-evident hash
    expiry_date DATE NULL, -- For automated 30-day early warning alarms
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_name VARCHAR(200) NOT NULL,
    report_category VARCHAR(100) DEFAULT 'FINANCE_GST_MONTHLY_AUDIT',
    cron_expression VARCHAR(100) DEFAULT '0 1 * * *', -- Daily at 1:00 AM
    output_format VARCHAR(20) DEFAULT 'XLSX_EXCEL', -- PDF, XLSX, CSV
    recipient_email VARCHAR(200) NOT NULL,
    last_run_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rule_title VARCHAR(200) NOT NULL,
    event_trigger VARCHAR(100) NOT NULL, -- LOW_CONSUMABLE_INVENTORY, OVERDUE_ASSIGNMENT, AD_EXPIRING
    condition_json JSONB NOT NULL,
    action_type VARCHAR(100) NOT NULL, -- NOTIFY_SLACK_SMS, CREATE_DEVOPS_INCIDENT, WEBHOOK_EXT
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance & GIN Trigram Indexes for Universal Sub-Second Search (Module 26 Support)
CREATE INDEX IF NOT EXISTS idx_reporters_org_status ON reporters(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_reporter_status ON assignments(reporter_id, status);
CREATE INDEX IF NOT EXISTS idx_articles_stage_lang ON articles(current_stage, target_language);
CREATE INDEX IF NOT EXISTS idx_ad_bookings_issue_status ON ad_bookings(requested_issue_date, booking_status);
CREATE INDEX IF NOT EXISTS idx_page_plan_slots_edition_page ON page_plan_slots(edition_id, issue_date, page_number);
CREATE INDEX IF NOT EXISTS idx_print_orders_edition_date ON print_orders(edition_id, target_issue_date);
CREATE INDEX IF NOT EXISTS idx_distribution_ledgers_date_status ON distribution_ledgers(issue_date, status);
CREATE INDEX IF NOT EXISTS idx_erp_invoices_status_due ON erp_invoices(payment_status, due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_expiry ON compliance_documents(expiry_date);

-- GIN Trigram Search Indexes for Millisecond Universal Discovery Queries (Deliverable #26)
CREATE INDEX IF NOT EXISTS idx_trgm_articles_headline_body ON articles USING GIN (headline gin_trgm_ops, body_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_dam_photos_title_caption ON dam_photos USING GIN (title gin_trgm_ops, caption gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_ad_bookings_client_campaign ON ad_bookings USING GIN (client_name gin_trgm_ops, campaign_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_erp_invoices_number_client ON erp_invoices USING GIN (invoice_number gin_trgm_ops, client_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_hr_employees_name_code ON hr_employees USING GIN (full_name gin_trgm_ops, employee_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_customer_sub_name_pin ON customer_subscriptions USING GIN (full_name gin_trgm_ops, pin_code gin_trgm_ops);

-- Bootstrap Default Newspaper ERP Demo Records for Super Admin HQ
DO $$
DECLARE
    demo_org_id UUID;
    demo_holding_id UUID;
    demo_emp_id UUID;
    demo_rep_id UUID;
    demo_beat_id UUID;
    demo_ed_id UUID;
BEGIN
    SELECT id INTO demo_org_id FROM organizations WHERE org_name = 'Enterprise Publishing HQ' LIMIT 1;
    SELECT id INTO demo_ed_id FROM newspaper_editions WHERE edition_name LIKE '%Morning%' LIMIT 1;
    
    IF demo_org_id IS NOT NULL THEN
        -- Seed Holding Syndicate
        INSERT INTO holding_companies (syndicate_name, headquarters_city, central_gstin)
        VALUES ('National Newspaper Conglomerate Ltd', 'New Delhi', '07AACCN9999Q1ZM')
        ON CONFLICT (syndicate_name) DO NOTHING;
        
        SELECT id INTO demo_holding_id FROM holding_companies WHERE syndicate_name = 'National Newspaper Conglomerate Ltd' LIMIT 1;
        IF demo_holding_id IS NOT NULL THEN
            INSERT INTO holding_subsidiaries (holding_id, organization_id, ownership_percentage)
            VALUES (demo_holding_id, demo_org_id, 100.00)
            ON CONFLICT (holding_id, organization_id) DO NOTHING;
        END IF;

        -- Seed HR Employee & Reporter Profile
        INSERT INTO hr_employees (organization_id, employee_code, full_name, designation, department, monthly_base_salary_inr)
        VALUES (demo_org_id, 'EMP-2026-HQ01', 'Rajeshwar Bhargava', 'Senior Special Correspondent', 'Investigative Newsroom', 85000.00)
        ON CONFLICT (employee_code) DO NOTHING;
        
        SELECT id INTO demo_emp_id FROM hr_employees WHERE employee_code = 'EMP-2026-HQ01' LIMIT 1;
        IF demo_emp_id IS NOT NULL THEN
            INSERT INTO reporters (organization_id, employee_id, reporter_code, assigned_bureau, contact_phone, performance_score)
            VALUES (demo_org_id, demo_emp_id, 'REP-PUNE-001', 'Pune Metropolitan Bureau', '+91 98765-43210', 145)
            ON CONFLICT (employee_id) DO NOTHING;
        END IF;

        -- Seed Standard Beats
        INSERT INTO beats (organization_id, beat_name, category, description)
        VALUES 
            (demo_org_id, 'National Election Tracker', 'ELECTION', 'Rapid breaking cover on state assembly elections & public polling'),
            (demo_org_id, 'Economic Union Budget', 'BUSINESS', 'Analyses of Finance Ministry economic measures & corporate GDP policy')
        ON CONFLICT (organization_id, beat_name) DO NOTHING;

        -- Seed Warehouse Consumables Inventory
        INSERT INTO press_consumables (organization_id, item_code, item_name, unit_of_measure, current_stock_val, reorder_threshold)
        VALUES
            (demo_org_id, 'PAPER_REEL_45GSM', 'Standard High-Speed Newsprint Rolls (45 GSM)', 'METRIC_TONS', 28.40, 5.00),
            (demo_org_id, 'INK_OFFSET_BLACK_K', 'Prepress High-Density Web Black Ink Drum', 'KILOGRAMS', 640.00, 250.00),
            (demo_org_id, 'CTP_THERMAL_PLATE', 'Aluminum Thermal Offset Lithography Plates', 'UNITS', 420.00, 80.00)
        ON CONFLICT (organization_id, item_code) DO UPDATE SET updated_at = NOW();

        -- Seed Press Machine Profile
        INSERT INTO press_machines (organization_id, machine_name, manufacturer, max_copies_per_hour, current_state)
        VALUES (demo_org_id, 'Tower 1 - Goss Community Web Press', 'Goss International & Manroland', 65000, 'PRINTING_ACTIVE')
        ON CONFLICT DO NOTHING;

        -- Seed Distribution Master Dealer & Customer Subscription
        INSERT INTO distribution_vendors (organization_id, vendor_code, vendor_name, category, contact_phone, assigned_route_name, daily_copy_quota)
        VALUES (demo_org_id, 'VEND-PUNE-CENTRAL', 'Shree Shivam Newsstand & Railway Hub Agency', 'MASTER_AGENT', '+91 98230-11223', 'Route 4 - Railway Station Hub Circuit', 1250)
        ON CONFLICT (vendor_code) DO NOTHING;

        INSERT INTO customer_subscriptions (organization_id, subscriber_code, full_name, delivery_address, pin_code, subscription_type, expiry_date)
        VALUES (demo_org_id, 'SUB-VIP-00921', 'Dr. Anand Deshmukh', 'Flat 402, Lotus Residency, Deccan Gymkhana, Pune', '411004', 'PRINT_PLUS_DIGITAL_EPAPER', NOW() + INTERVAL '1 year')
        ON CONFLICT (subscriber_code) DO NOTHING;

        -- Seed Pre-Configured Automation Rules
        INSERT INTO automation_rules (organization_id, rule_title, event_trigger, condition_json, action_type)
        VALUES 
            (demo_org_id, 'Automatic Reorder Alert for Paper Reels', 'LOW_CONSUMABLE_INVENTORY', '{"consumable_code":"PAPER_REEL_45GSM", "threshold_mt": 5.0}'::jsonb, 'NOTIFY_SLACK_SMS'),
            (demo_org_id, 'Immediate News Editor Alarm for Overdue Lead Stories', 'OVERDUE_ASSIGNMENT', '{"priority":"URGENT_FRONT_PAGE", "overdue_minutes": 30}'::jsonb, 'CREATE_DEVOPS_INCIDENT')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
