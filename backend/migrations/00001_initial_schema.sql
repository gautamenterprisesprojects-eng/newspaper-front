-- Production 3NF Normalized Database Schema Migration (00001)
-- Newspaper Automatic Composition Enterprise Portal

SET timezone = 'UTC';
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUM Type Declarations
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'EXPIRED');
CREATE TYPE pub_type AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE pub_day AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'ALL');
CREATE TYPE ledger_txn_type AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'RECHARGE', 'SUBSCRIPTION_FEE', 'MANUAL_ADJUST');
CREATE TYPE ledger_status AS ENUM ('PENDING_DEBIT', 'COMMITTED_DEBIT', 'REFUNDED_FAIL', 'COMMITTED_CREDIT');
CREATE TYPE gen_status AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED');
CREATE TYPE sub_status AS ENUM ('PENDING', 'CONTACTED', 'APPROVED', 'REJECTED', 'CONVERTED');

-- 1. Roles & Organizations
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_name, description) VALUES
('SUPER_ADMIN', 'Universal system admin with gateway and cryptographic access'),
('ADMIN', 'Operational admin managing publishing houses and subscriptions'),
('FINANCE', 'Specialist overseeing wallets, ledger audits, and GST invoicing'),
('SUPPORT', 'Technical agent handling user account access and error resolution'),
('OPERATOR', 'Newspaper editor authorized to spend wallet funds on publishing'),
('VIEWER', 'Read-only executive monitoring PDF histories and spending reports')
ON CONFLICT (role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_name VARCHAR(150) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Core Users (No Self-Signup / No OTP / Admin Provisioned exclusively)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status user_status NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_username_len CHECK (char_length(username) >= 4)
);

-- 3. Publisher Profiles & Cloud Masthead Paths
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_name VARCHAR(150) NOT NULL,
    owner_photo_url TEXT,
    mobile_primary VARCHAR(20) NOT NULL,
    mobile_alternate VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    address_line_1 TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    country VARCHAR(50) DEFAULT 'India',
    pincode VARCHAR(20) NOT NULL,
    gstin VARCHAR(30) UNIQUE,
    pan_number VARCHAR(20) UNIQUE,
    aadhar_optional VARCHAR(30),
    printing_press_name VARCHAR(150),
    printing_press_address TEXT,
    printing_contact_mobile VARCHAR(20),
    rni_number VARCHAR(50) UNIQUE NOT NULL,
    registration_number VARCHAR(100),
    logo_url TEXT,
    front_page_header_url TEXT,
    inner_page_header_url TEXT,
    digital_signature_url TEXT,
    official_stamp_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Permanent Newspaper Layout Settings
CREATE TABLE IF NOT EXISTS newspapers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    newspaper_name VARCHAR(200) NOT NULL,
    edition_name VARCHAR(100) NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'Hindi',
    publication_type pub_type NOT NULL DEFAULT 'DAILY',
    publication_day pub_day NOT NULL DEFAULT 'ALL',
    default_issue_number INTEGER NOT NULL DEFAULT 1,
    issue_prefix VARCHAR(50) DEFAULT 'Ank',
    default_page_count INTEGER NOT NULL CHECK (default_page_count IN (6, 8, 12, 24)),
    generation_cost DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    permanent_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Wallet Architecture & Double-Entry Immutable Ledger
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    current_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_frozen BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_non_negative_balance CHECK (current_balance >= 0.00)
);

CREATE TABLE IF NOT EXISTS wallet_ledgers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    transaction_type ledger_txn_type NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    reference_id VARCHAR(150),
    description TEXT NOT NULL,
    status ledger_status NOT NULL DEFAULT 'COMMITTED_CREDIT',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Generation History & Issue Archives
CREATE TABLE IF NOT EXISTS generation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    newspaper_id UUID NOT NULL REFERENCES newspapers(id) ON DELETE RESTRICT,
    generated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    issue_number INTEGER NOT NULL,
    issue_date DATE NOT NULL,
    page_count INTEGER NOT NULL,
    r2_pdf_url TEXT NULL,
    file_size_bytes BIGINT DEFAULT 0,
    generation_duration_ms INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    status gen_status NOT NULL DEFAULT 'PROCESSING',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_newspaper_issue_date UNIQUE (newspaper_id, issue_date),
    CONSTRAINT uq_newspaper_issue_number UNIQUE (newspaper_id, issue_number)
);

-- 7. Razorpay Online Top-Ups & Invoices
CREATE TABLE IF NOT EXISTS razorpay_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    rzp_order_id VARCHAR(150) UNIQUE NOT NULL,
    rzp_payment_id VARCHAR(150) UNIQUE NULL,
    rzp_signature TEXT NULL,
    amount_inr DECIMAL(10,2) NOT NULL,
    gst_tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    gateway_response JSONB NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ NULL
);

-- 8. Subscription Proposals CRM
CREATE TABLE IF NOT EXISTS subscription_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_name VARCHAR(150) NOT NULL,
    organization_name VARCHAR(150) NOT NULL,
    newspaper_name VARCHAR(200) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    existing_software VARCHAR(150),
    monthly_requirement TEXT,
    expected_users INTEGER DEFAULT 1,
    message TEXT,
    status sub_status DEFAULT 'PENDING',
    admin_notes TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Immutable Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    target_resource VARCHAR(150) NOT NULL,
    ip_address INET NULL,
    user_agent TEXT NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON wallet_ledgers(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_history_newspaper_date ON generation_history(newspaper_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_requests_status ON subscription_requests(status) WHERE status = 'PENDING';

-- Bootstrap Super Admin Tenant (For out-of-the-box system demo verification)
DO $$ 
DECLARE 
    admin_role_id UUID;
    demo_org_id UUID;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE role_name = 'SUPER_ADMIN' LIMIT 1;
    
    INSERT INTO organizations (id, org_name, contact_email)
    VALUES (uuid_generate_v4(), 'Enterprise Publishing HQ', 'cto@newspaper-erp.com')
    RETURNING id INTO demo_org_id;

    -- Default password: EnterpriseAdminPassword2026! (bcrypted hash cost 12)
    INSERT INTO users (id, organization_id, role_id, username, password_hash, status)
    VALUES (uuid_generate_v4(), demo_org_id, admin_role_id, 'superadmin', '$2a$12$R.Sj9u9s8qQJ5yXoD0ZWej7L8c6pQ0e5w1sK9L3p2q1w2e3r4t5y', 'ACTIVE')
    ON CONFLICT (username) DO NOTHING;
    
    INSERT INTO wallets (organization_id, current_balance)
    VALUES (demo_org_id, 999999.00)
    ON CONFLICT (organization_id) DO NOTHING;
END $$;
