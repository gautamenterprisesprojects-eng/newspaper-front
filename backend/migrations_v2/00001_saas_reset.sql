-- Production 3NF SaaS Database Schema Migration (00001_saas_reset.sql)
-- Newspaper Generator Studio SaaS (Reset Implementation)
-- Minimalist, scalable architecture inspired by Canva/Figma for Newspaper Publishers.

SET timezone = 'UTC';
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Registration Access Requests (No public registration, only admin approval)
CREATE TABLE IF NOT EXISTS registration_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_name VARCHAR(200) NOT NULL,
    newspaper_name VARCHAR(255) NOT NULL,
    mobile VARCHAR(50) NOT NULL,
    email VARCHAR(200) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    publication_type VARCHAR(50) NOT NULL CHECK (publication_type IN ('Daily', 'Weekly')),
    rni_number VARCHAR(100) NULL,
    aadhar_doc VARCHAR(500) NULL,
    rni_doc VARCHAR(500) NULL,
    b_form_doc VARCHAR(500) NULL,
    message TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Ensure columns exist if migration runs on already initialized db
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS rni_number VARCHAR(100) NULL;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS aadhar_doc VARCHAR(500) NULL;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS rni_doc VARCHAR(500) NULL;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS b_form_doc VARCHAR(500) NULL;

-- 2. Core Publishers & Admin Accounts
CREATE TABLE IF NOT EXISTS publishers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'PUBLISHER' CHECK (role IN ('PUBLISHER', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Publisher Profiles & Cloudflare R2 Header Paths
CREATE TABLE IF NOT EXISTS publisher_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID UNIQUE NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    publisher_name VARCHAR(255) NOT NULL,
    newspaper_name VARCHAR(255) NOT NULL,
    publication_type VARCHAR(50) NOT NULL DEFAULT 'Daily',
    number_of_editions INTEGER NOT NULL DEFAULT 1,
    default_page_count VARCHAR(20) NOT NULL DEFAULT '8',
    address TEXT NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(100) NULL,
    mobile VARCHAR(50) NULL,
    email VARCHAR(200) NULL,
    logo_url TEXT NULL,
    front_page_header_url TEXT NULL,
    remaining_page_header_url TEXT NULL,
    page_section_config JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE publisher_profiles ADD COLUMN IF NOT EXISTS page_section_config JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Publisher Digital Wallets
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID UNIQUE NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    balance_inr DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Wallet Transaction Ledger
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    txn_type VARCHAR(50) NOT NULL CHECK (txn_type IN ('CREDIT', 'DEBIT', 'REFUND', 'RECHARGE', 'GENERATION_CHARGE')),
    amount_inr DECIMAL(12,2) NOT NULL,
    balance_after_inr DECIMAL(12,2) NOT NULL,
    description TEXT NOT NULL,
    ref_id VARCHAR(100) NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Razorpay Payment Gateway History
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    razorpay_order_id VARCHAR(150) UNIQUE NOT NULL,
    razorpay_payment_id VARCHAR(150) NULL,
    razorpay_signature VARCHAR(255) NULL,
    amount_inr DECIMAL(12,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Generated Newspaper PDF Archive
CREATE TABLE IF NOT EXISTS generated_pdfs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    issue_number_ank VARCHAR(100) NOT NULL, -- Full publisher control, manual entry allowed
    publication_date DATE NOT NULL,
    page_count INTEGER NOT NULL,
    cost_inr DECIMAL(10,2) NOT NULL,
    rate_per_page_inr DECIMAL(10,2) NOT NULL,
    pdf_url TEXT NOT NULL,
    front_page_header_url TEXT NULL,
    remaining_page_header_url TEXT NULL,
    page_section_config JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('PROCESSING', 'SUCCESS', 'FAILED')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE generated_pdfs ADD COLUMN IF NOT EXISTS front_page_header_url TEXT NULL;
ALTER TABLE generated_pdfs ADD COLUMN IF NOT EXISTS remaining_page_header_url TEXT NULL;
ALTER TABLE generated_pdfs ADD COLUMN IF NOT EXISTS page_section_config JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 8. Login Audit Logs
CREATE TABLE IF NOT EXISTS login_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(150) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    user_agent TEXT NULL,
    status VARCHAR(50) NOT NULL,
    login_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Dynamic Application Settings
CREATE TABLE IF NOT EXISTS application_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_req_status ON registration_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_username ON publishers(username, is_active);
CREATE INDEX IF NOT EXISTS idx_wallet_pub ON wallets(publisher_id);
CREATE INDEX IF NOT EXISTS idx_txn_pub_date ON wallet_transactions(publisher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_pub_date ON generated_pdfs(publisher_id, publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_time ON login_logs(login_time DESC);

-- Bootstrap Default Settings
INSERT INTO application_settings (key, value, description) VALUES
('per_page_cost', '50', 'Configurable INR charge per newspaper page generation'),
('application_name', 'Newspaper Generator Studio', 'Platform title for public styling'),
('support_email', 'support@newspaper-studio.in', 'Direct admin recovery & contact email'),
('maintenance_mode', 'false', 'Toggle lock for generation engine updates'),
('razorpay_key_id', 'rzp_test_publisher_mock_2026', 'Razorpay Live Key ID for wallet recharge'),
('razorpay_secret', 'mock_secret_8910xxxx', 'Razorpay Live Key Secret'),
('r2_bucket_name', 'newspaper-publisher-masters', 'Cloudflare R2 storage bucket for mastheads and PDFs'),
('r2_endpoint', 'https://r2.cloud.cloudflare.com/newspaper-studio', 'Cloudflare R2 endpoint URI')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Bootstrap Demo Admin & Publisher Credentials for Instant Testing
DO $$
DECLARE
    admin_id UUID := uuid_generate_v4();
    demo_pub_id UUID := uuid_generate_v4();
    demo_wallet_id UUID := uuid_generate_v4();
BEGIN
    -- 1. Insert Admin Account (username: admin, password: KingR@123)
    INSERT INTO publishers (id, username, password_hash, role, is_active)
    VALUES (admin_id, 'admin', '$2a$10$AxZaPluXYsBxQLMIcbonuOOjgCYYvZFCYmxQvdweiSJUc1qGIuEte', 'ADMIN', TRUE)
    ON CONFLICT (username) DO NOTHING;

    -- 2. Insert Demo Publisher (username: publisher1, password: KingR@123)
    INSERT INTO publishers (id, username, password_hash, role, is_active)
    VALUES (demo_pub_id, 'publisher1', '$2a$10$AxZaPluXYsBxQLMIcbonuOOjgCYYvZFCYmxQvdweiSJUc1qGIuEte', 'PUBLISHER', TRUE)
    ON CONFLICT (username) DO NOTHING;

    -- Repair databases seeded by an earlier revision of this file, which stored a
    -- placeholder string in password_hash that bcrypt can never match. Only rows
    -- still carrying that exact placeholder are touched, so any password a
    -- publisher has since set is preserved.
    UPDATE publishers
    SET password_hash = '$2a$10$AxZaPluXYsBxQLMIcbonuOOjgCYYvZFCYmxQvdweiSJUc1qGIuEte'
    WHERE password_hash = '$2a$10$7Q9.e1B6Xh/N5Z.K8sKCOuO3M7hSXYJvI0oXvYl0M1jLwZ7N6yT1m';

    -- Retrieve ID if already existing
    SELECT id INTO demo_pub_id FROM publishers WHERE username = 'publisher1' LIMIT 1;

    IF demo_pub_id IS NOT NULL THEN
        -- Seed Publisher Profile
        INSERT INTO publisher_profiles (publisher_id, publisher_name, newspaper_name, publication_type, number_of_editions, default_page_count, address, city, state, mobile, email, logo_url, front_page_header_url, remaining_page_header_url, page_section_config, is_setup_completed)
        VALUES (
            demo_pub_id, 'Rajeshwar Bhargava', 'The Delhi Tribune (Daily)', 'Daily', 1, '8', 
            'B-142, Bahadur Shah Zafar Marg', 'New Delhi', 'Delhi', '+91 98110-33491', 'editor@delhitribune.in', 
            'https://r2.newspaper-studio.in/logos/delhi-tribune-logo.png',
            'https://r2.newspaper-studio.in/headers/delhi-tribune-front-master.pdf',
            'https://r2.newspaper-studio.in/headers/delhi-tribune-inside-header.pdf',
            '[
                {"page_number":1,"section":"Front Page","header_type":"front","notes":"Lead page with main masthead"},
                {"page_number":2,"section":"Sports","header_type":"inside","notes":"Sports section starts here"},
                {"page_number":3,"section":"City","header_type":"inside","notes":"Local city coverage"},
                {"page_number":4,"section":"Editorial","header_type":"inside","notes":"Opinion and editorial page"},
                {"page_number":5,"section":"Business","header_type":"inside","notes":"Markets and commerce"},
                {"page_number":6,"section":"Nation","header_type":"inside","notes":"National news"},
                {"page_number":7,"section":"Entertainment","header_type":"inside","notes":"Culture and cinema"},
                {"page_number":8,"section":"Classifieds","header_type":"inside","notes":"Ads and notices"}
            ]'::jsonb,
            TRUE
        )
        ON CONFLICT (publisher_id) DO NOTHING;

        -- The INSERT above does nothing when the profile row already exists, so a
        -- profile created before this seed (or by the wizard) keeps the column
        -- default of '[]' and reports zero page sections. Backfill only those
        -- rows; a publisher who has configured their own layout is left alone.
        UPDATE publisher_profiles
        SET page_section_config = '[
                {"page_number":1,"section":"Front Page","header_type":"front","notes":"Lead page with main masthead"},
                {"page_number":2,"section":"Sports","header_type":"inside","notes":"Sports section starts here"},
                {"page_number":3,"section":"City","header_type":"inside","notes":"Local city coverage"},
                {"page_number":4,"section":"Editorial","header_type":"inside","notes":"Opinion and editorial page"},
                {"page_number":5,"section":"Business","header_type":"inside","notes":"Markets and commerce"},
                {"page_number":6,"section":"Nation","header_type":"inside","notes":"National news"},
                {"page_number":7,"section":"Entertainment","header_type":"inside","notes":"Culture and cinema"},
                {"page_number":8,"section":"Classifieds","header_type":"inside","notes":"Ads and notices"}
            ]'::jsonb
        WHERE publisher_id = demo_pub_id
          AND page_section_config = '[]'::jsonb;

        -- Seed Wallet with ₹2,150 balance as per prompt example!
        INSERT INTO wallets (id, publisher_id, balance_inr)
        VALUES (demo_wallet_id, demo_pub_id, 2150.00)
        ON CONFLICT (publisher_id) DO UPDATE SET balance_inr = 2150.00;

        SELECT id INTO demo_wallet_id FROM wallets WHERE publisher_id = demo_pub_id LIMIT 1;

        -- Seed Initial Recharge Ledger Entry
        INSERT INTO wallet_transactions (wallet_id, publisher_id, txn_type, amount_inr, balance_after_inr, description, ref_id)
        VALUES (demo_wallet_id, demo_pub_id, 'RECHARGE', 2500.00, 2500.00, 'Initial Razorpay online wallet credit recharge', 'pay_rzp_mock_init_891')
        ON CONFLICT DO NOTHING;

        -- Seed 5 Previous Generated PDF Issues for testing
        INSERT INTO generated_pdfs (publisher_id, issue_number_ank, publication_date, page_count, cost_inr, rate_per_page_inr, pdf_url, status, created_at)
        VALUES
            (demo_pub_id, 'Ank 121', CURRENT_DATE - INTERVAL '4 days', 8, 400.00, 50.00, 'https://r2.newspaper-studio.in/pdfs/tribune-issue-121-final.pdf', 'SUCCESS', NOW() - INTERVAL '4 days'),
            (demo_pub_id, 'Ank 122', CURRENT_DATE - INTERVAL '3 days', 8, 400.00, 50.00, 'https://r2.newspaper-studio.in/pdfs/tribune-issue-122-final.pdf', 'SUCCESS', NOW() - INTERVAL '3 days'),
            (demo_pub_id, 'Ank 123 (Special)', CURRENT_DATE - INTERVAL '2 days', 12, 600.00, 50.00, 'https://r2.newspaper-studio.in/pdfs/tribune-issue-123-final.pdf', 'SUCCESS', NOW() - INTERVAL '2 days'),
            (demo_pub_id, 'Ank 124', CURRENT_DATE - INTERVAL '1 day', 8, 400.00, 50.00, 'https://r2.newspaper-studio.in/pdfs/tribune-issue-124-final.pdf', 'SUCCESS', NOW() - INTERVAL '1 day'),
            (demo_pub_id, 'Ank 125', CURRENT_DATE, 8, 400.00, 50.00, 'https://r2.newspaper-studio.in/pdfs/tribune-issue-125-final.pdf', 'SUCCESS', NOW() - INTERVAL '2 hours')
        ON CONFLICT DO NOTHING;

        -- Record latest generation debit in ledger
        INSERT INTO wallet_transactions (wallet_id, publisher_id, txn_type, amount_inr, balance_after_inr, description, ref_id)
        VALUES (demo_wallet_id, demo_pub_id, 'GENERATION_CHARGE', -350.00, 2150.00, 'Newspaper generation deduction for Ank 125 (8 Pages)', 'pdf_issue_125')
        ON CONFLICT DO NOTHING;
    END IF;

    -- 3. Insert Demo Pending Registration Access Request
    INSERT INTO registration_requests (owner_name, newspaper_name, mobile, email, city, state, publication_type, rni_number, aadhar_doc, rni_doc, b_form_doc, message, status)
    VALUES ('Suresh Sharma', 'Rajasthan Bharat News', '+91 94140-88214', 'suresh@rajasthan-bharat.in', 'Jaipur', 'Rajasthan', 'Daily', 'RAJENG/2018/74892', 'r2-cdn://verification/aadhar/suresh_sharma_aadhar.pdf', 'r2-cdn://verification/rni/rajasthan_bharat_rni_cert.pdf', 'r2-cdn://verification/bform/rajasthan_bharat_b_form.pdf', 'We publish 25,000 copies across Jaipur and Udaipur. Looking for automated composition access.', 'PENDING')
    ON CONFLICT DO NOTHING;
END $$;
